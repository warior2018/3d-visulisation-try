// ============================================================
//  Чанки мира для рисования: что из куска видно и попадает ли кусок в кадр. Чистые функции —
//  рисовальщик (gpu-renderer.js) зовёт их, автотесты проверяют без видеокарты.
//
//    exposedCubes(world, chunk, out) — данные кубиков чанка, у которых открыта хоть одна грань
//        (x, y, z, r, g, b на кубик — как ждёт шейдер); кубики, закрытые со всех сторон, не рисуем:
//        внутри холма их тысячи, а видно только кожу. Вернёт { data, count } (data может быть новым,
//        если out не хватило)
//    exposedFaces(world, chunk, out) — то же, но ПО ГРАНЯМ: 6 списков (+X, −X, +Y, −Y, +Z, −Z — порядок граней
//        кубика у рисовальщика), в каждом — кубики, у которых открыта эта грань. Рисуем 6 вершин на грань, а
//        не 36 на кубик: на ровной земле у кубика открыт только верх — в 6 раз меньше треугольников.
//        Вернёт { data, starts[6], counts[6], total }
//    facesFacing(view, chunk) — какие из 6 списков вообще могут быть видны (грань +X видна только тому, кто
//        правее неё): у куска справа от камеры его грани +X — все спиной, их и не рисуем
//    chunkInView(view, chunk) — попадает ли кусок в кадр: не дальше дымки и не за спиной / сбоку
//        view — viewOf(camera, aspect, maxDist): заранее посчитанное направление взгляда и угол обзора
// ============================================================

import { CHUNK, HALF, HALF_TOP, isHalf } from "../world/voxel-world.js";

// x, y, z, r, g, b (цвет × небо в середине грани — для простого шейдера), небо в 4 углах грани, лампы в 4 углах,
// небо в середине (шейдер посложнее делит на него: чистый цвет). Углы — в шейдере плавно по грани
export const FLOATS_PER_CUBE = 15;

// Освещение «как в Minecraft» (chunkLight ниже): у каждой видимой грани — свет неба и ламп в 4 углах (плавно
// по грани; на слабых настройках — один на грань). Небо растекается по воздуху от открытых мест: под деревом —
// почти светло, в глубине пещеры — LIGHT.minSky. Лампы светят по воздуху, сквозь стены — нет. Шейдер складывает:
// цвет × (небо × день + лампы + свет у героя). Тень от солнца (world.sun) — на весь блок, как раньше.
// minSky — небо в глубине пещеры (почти темно); skyReach — на сколько шагов по воздуху растекается свет неба;
// leaf — сколько света пропускает слой листвы (leaves — цвета листвы: r × 65536 + g × 256 + b);
// smooth — плавный свет: 4 угла грани (среднее клеток вокруг угла), false — один на грань (слабые настройки)
// under — свет снизу под островом (открыто в пустоту)
export const LIGHT = { minSky: 0.12, ao: 0.07, shadow: 0.82, under: 0.6, shadowRange: 18, rays: 2, skyReach: 6, leaf: 0.8, leaves: [70 * 65536 + 140 * 256 + 60], smooth: true };

// Доля тени у верха кубика 0…1: 4 луча к солнцу из четырёх точек грани (мягкий край: у края тени — частично)
// Лучей — LIGHT.rays по стороне (1 — один луч, 2 — 4, 3 — 9: мягче край; качество графики)
export function shadowAmount(world, x, y, z, sun, range = LIGHT.shadowRange) {
  if (!sun || sun.y <= 0.05) return 0;
  const n = Math.max(1, Math.min(3, LIGHT.rays | 0));
  let hit = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (rayBlocked(world, x, y, z, x + (i + 0.5) / n, y + 1.01, z + (j + 0.5) / n, sun, range)) hit++;
  }
  return hit / (n * n);
}

// Есть ли блок на луче от (x, y, z) к солнцу (sun — направление, y > 0): шаги по полблока
export function inShadow(world, x, y, z, sun, range = LIGHT.shadowRange) {
  if (!sun || sun.y <= 0.05) return false;
  return rayBlocked(world, x, y, z, x + 0.5, y + 1.01, z + 0.5, sun, range);
}

function rayBlocked(world, x, y, z, px, py, pz, sun, range) {
  for (let t = 0.75; t <= range; t += 0.75) {
    const cx = Math.floor(px + sun.x * t), cy = Math.floor(py + sun.y * t), cz = Math.floor(pz + sun.z * t);
    if (cy > world.maxY) return false; // выше всех блоков — свободно
    if ((cx !== x || cz !== z || cy !== y) && world.has(cx, cy, cz)) return true;
  }
  return false;
}

// Свет ламп в клетке: ближе к лампе — ярче (power × (1 − расстояние / radius)²), берём самую яркую. lights —
// список светящихся блоков рядом (world.lightsNear). Сама лампа — 1
export function blockLightAt(world, x, y, z, lights) {
  if (!lights) return 0;
  let best = 0;
  for (const b of lights) {
    const e = world.emitterOf(b);
    if (!e) continue;
    if (b.x === x && b.y === y && b.z === z) return 1;
    const d = Math.hypot(b.x - x, b.y - y, b.z - z);
    if (d >= e.radius) continue;
    const k = 1 - d / e.radius;
    best = Math.max(best, e.power * k * k);
  }
  return Math.min(1, best);
}

// ---------- Свет «как в Minecraft»: растекается по воздуху ----------
// Для куска (с запасом M клеток вокруг) — сетка клеток воздуха: небо 0…1 и свет ламп 0…1.
//   небо: клетка «открыта», если над ней нет непрозрачных блоков (листва — пропускает LIGHT.leaf за слой);
//         от открытых клеток свет растекается по воздуху и слабеет на 1 / skyReach за шаг (стена его не пускает):
//         под деревом / навесом (небо в паре шагов сбоку) — почти светло, в глубине пещеры — LIGHT.minSky.
//   лампы: от каждой лампы (world.lightsNear) — по воздуху на radius шагов: power × (1 − шаги / radius)².
//          Сквозь стену не светит (путь — по воздуху, не по прямой).
// Полублок свет пропускает. Сетка внутри куска сохраняется в chunk.light — по ней светятся модели (lightOf).
// Что в клетке — без объектов: запись палитры мира ({ color, surface }) или null. Мир без палитры — get()
const cellOf = (world) => (world.idAt ? (x, y, z) => world.pal[world.idAt(x, y, z)] || null : (x, y, z) => world.get?.(x, y, z) ?? (world.has(x, y, z) ? { color: [0, 0, 0] } : null));
const isLeaf = (b) => !!LIGHT.leaves && LIGHT.leaves.includes(b.color[0] * 65536 + b.color[1] * 256 + b.color[2]);
const opaque = (b) => !!b && !isHalf(b) && !isLeaf(b);

export function chunkLight(world, chunk) {
  const R = LIGHT.skyReach, L = R * 4; // уровни неба: 0…L, шаг — 4 (четверть — для листвы)
  const lamps = world.lightsNear?.(chunk.cx, chunk.cz, 1) || [];
  let M = R;
  for (const b of lamps) M = Math.max(M, Math.ceil(world.emitterOf(b)?.radius ?? 0));
  const x0 = chunk.cx * CHUNK - M, z0 = chunk.cz * CHUNK - M, sx = CHUNK + 2 * M, sz = sx;
  const y0 = chunk.minY - 2, y1 = chunk.maxY + 2, sy = y1 - y0 + 1;
  const n = sx * sy * sz;
  const solid = new Uint8Array(n), sky = new Uint8Array(n), lamp = new Float32Array(n);
  const idx = (x, y, z) => ((y - y0) * sz + (z - z0)) * sx + (x - x0);
  // столбики: выше самого верхнего непрозрачного — открыто; листва над клеткой — слабее
  const queue = new Int32Array(n * 2);
  let qh = 0, qt = 0;
  const cellAt = cellOf(world);
  for (let x = x0; x < x0 + sx; x++) for (let z = z0; z < z0 + sz; z++) {
    let leaves = 0, open = true;
    for (let y = Math.max(world.maxY, y1); y >= y0; y--) {
      const b = cellAt(x, y, z);
      if (y <= y1) {
        const i = idx(x, y, z);
        if (opaque(b)) solid[i] = 1;
        else if (open) sky[i] = Math.max(0, Math.round(L * LIGHT.leaf ** leaves));
      }
      if (b && isLeaf(b)) leaves++;
      else if (opaque(b)) open = false;
      if (!open && y < y0) break;
    }
  }
  // снизу: воздух под островом, открытый вниз (до низа куска или ≥ 10 клеток воздуха) — светлее (LIGHT.under; пещеры ниже 10 — нет)
  const under = Math.round(L * LIGHT.under);
  for (let x = x0; x < x0 + sx; x++) for (let z = z0; z < z0 + sz; z++) {
    let run = 0, bottom = true;
    for (let y = y0; y <= y1; y++) {
      const i = idx(x, y, z);
      if (solid[i]) { run = 0; bottom = false; continue; }
      run++;
      if ((bottom || run >= 10) && sky[i] < under) sky[i] = under;
    }
  }
  // растекание неба: от открытых клеток, у которых рядом есть закрытый воздух
  const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const inBox = (x, y, z) => x >= x0 && x < x0 + sx && z >= z0 && z < z0 + sz && y >= y0 && y <= y1;
  for (let i = 0; i < n; i++) if (sky[i] > 4) queue[qt++] = i;
  const xyz = (i) => { const x = i % sx, r = (i - x) / sx, z = r % sz; return [x + x0, (r - z) / sz + y0, z + z0]; };
  while (qh < qt) {
    const i = queue[qh++], v = sky[i] - 4;
    if (v <= 0) continue;
    const [x, y, z] = xyz(i);
    for (const [dx, dy, dz] of N6) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (!inBox(X, Y, Z)) continue;
      const j = idx(X, Y, Z);
      if (solid[j] || sky[j] >= v) continue;
      sky[j] = v;
      if (qt < queue.length) queue[qt++] = j;
    }
  }
  // лампы: по воздуху от каждой
  for (const b of lamps) {
    const e = world.emitterOf(b);
    if (!e || !inBox(b.x, b.y, b.z)) continue;
    const r = e.radius, dist = new Map();
    let front = [[b.x, b.y, b.z]];
    dist.set(idx(b.x, b.y, b.z), 0);
    for (let d = 1; d < r && front.length; d++) {
      const next = [];
      const k = e.power * (1 - d / r) ** 2;
      for (const [x, y, z] of front) for (const [dx, dy, dz] of N6) {
        const X = x + dx, Y = y + dy, Z = z + dz;
        if (!inBox(X, Y, Z)) continue;
        const j = idx(X, Y, Z);
        if (solid[j] || dist.has(j)) continue;
        dist.set(j, d);
        if (k > lamp[j]) lamp[j] = k;
        next.push([X, Y, Z]);
      }
      front = next;
    }
  }
  const skyOf = (i) => LIGHT.minSky + (1 - LIGHT.minSky) * Math.min(1, sky[i] / L);
  const grid = { x0, y0, z0, sx, sy, sz, idx, inBox, solid, skyOf, lamp };
  // в кусок — сетка его клеток (для моделей: lightOf); 0…255
  const cx0 = chunk.cx * CHUNK, cz0 = chunk.cz * CHUNK;
  const keep = { x0: cx0, z0: cz0, y0, sy, sky: new Uint8Array(CHUNK * CHUNK * sy), lamp: new Uint8Array(CHUNK * CHUNK * sy) };
  for (let y = y0; y <= y1; y++) for (let z = cz0; z < cz0 + CHUNK; z++) for (let x = cx0; x < cx0 + CHUNK; x++) {
    const i = idx(x, y, z), o = ((y - y0) * CHUNK + (z - cz0)) * CHUNK + (x - cx0);
    keep.sky[o] = Math.round(skyOf(i) * 255);
    keep.lamp[o] = Math.round(Math.min(1, lamp[i]) * 255);
  }
  chunk.light = keep;
  return grid;
}

// Свет в клетке (модели, рука): небо (с днём / ночью умножит шейдер — здесь без него) + лампы. 0…1+.
// Сетка куска есть — из неё; нет (кусок ещё не собран) — открыто ли небо над клеткой
export function lightAt(world, x, y, z) {
  const c = world.chunkAt?.(x, z), g = c?.light;
  if (g) {
    if (y > g.y0 + g.sy - 1) return { sky: 1, lamp: 0 };
    const yy = Math.max(g.y0, y), o = ((yy - g.y0) * CHUNK + (z - g.z0)) * CHUNK + (x - g.x0);
    return { sky: g.sky[o] / 255, lamp: g.lamp[o] / 255 };
  }
  const top = world.topBlock(x, z);
  return { sky: !top || top.y < y ? 1 : LIGHT.minSky, lamp: 0 };
}

// Один свет 0…1+ (модели темнеют под крышей): небо + лампы
export function lightOf(world, x, y, z) {
  const l = lightAt(world, x, y, z);
  return l.sky + l.lamp;
}

// light — запекать освещение (false — как раньше: чистый цвет)
export function exposedCubes(world, chunk, out = null, light = false) {
  let data = out && out.length >= chunk.blocks.size * FLOATS_PER_CUBE ? out : new Float32Array(Math.max(64, chunk.blocks.size) * FLOATS_PER_CUBE);
  let n = 0;
  for (const b of chunk.blocks) {
    const { x, y, z } = b;
    // закрыт со всех 6 сторон (снизу — блок или пол мира) — не видно
    if (world.has(x + 1, y, z) && world.has(x - 1, y, z) && world.has(x, y, z + 1) && world.has(x, y, z - 1) && world.has(x, y + 1, z) && world.isSolid(x, y - 1, z)) continue;
    const i = n * FLOATS_PER_CUBE;
    const k = light ? lightOf(world, x, y + 1, z) / 255 : 1 / 255;
    data[i] = x;
    data[i + 1] = y;
    data[i + 2] = z;
    data[i + 3] = b.color[0] * k;
    data[i + 4] = b.color[1] * k;
    data[i + 5] = b.color[2] * k;
    for (let k2 = 6; k2 < 14; k2++) data[i + k2] = k2 < 10 ? 1 : 0;
    data[i + 14] = 1;
    n++;
  }
  return { data, count: n };
}

// Грани в порядке рисовальщика (gpu-renderer.js → buildCubeMesh): +X, −X, +Y, −Y, +Z, −Z
export const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export function exposedFaces(world, chunk, out = null, light = false) {
  // открытые грани каждого кубика — сначала посчитать (сколько всего), потом разложить по 6 спискам
  const counts = [0, 0, 0, 0, 0, 0];
  const list = [];
  const cellAt = cellOf(world);
  for (const b of chunk.blocks) {
    const { x, y, z } = b;
    let mask = 0;
    // полублок (HALF) закрывает соседу только свою половину: целому блоку грань рядом с ним — видна
    // (полублок сверху — HALF_TOP — так же: закрывает только свою половину; одинаковые половинки закрывают друг друга)
    const half = b.surface === HALF, top = b.surface === HALF_TOP;
    const shut = (bx, by, bz) => { const n = cellAt(bx, by, bz); return !!n && (!isHalf(n) || n.surface === b.surface); };
    if (!shut(x + 1, y, z)) mask |= 1;
    if (!shut(x - 1, y, z)) mask |= 2;
    if (half || !world.has(x, y + 1, z) || cellAt(x, y + 1, z)?.surface === HALF_TOP) mask |= 4; // верх полублока виден всегда; над нами полублок сверху — зазор
    if (top || !world.isSolid(x, y - 1, z) || cellAt(x, y - 1, z)?.surface === HALF) mask |= 8; // снизу — блок или пол (полублок низ не закрывает: зазор); низ полублока сверху — виден всегда
    if (!shut(x, y, z + 1)) mask |= 16;
    if (!shut(x, y, z - 1)) mask |= 32;
    if (!mask) continue;
    for (let f = 0; f < 6; f++) if (mask & (1 << f)) counts[f]++;
    list.push(b, mask);
  }
  const total = counts.reduce((a, c) => a + c, 0);
  const data = out && out.length >= total * FLOATS_PER_CUBE ? out : new Float32Array(Math.max(64, total) * FLOATS_PER_CUBE);
  const starts = [0, 0, 0, 0, 0, 0];
  for (let f = 1; f < 6; f++) starts[f] = starts[f - 1] + counts[f - 1];
  const at = [...starts];
  const g = light ? chunkLight(world, chunk) : null;
  // свет клетки перед гранью: [небо, лампы]; твёрдая / вне сетки — null
  const cell = (x, y, z) => {
    if (!g.inBox(x, y, z)) return null;
    const i = g.idx(x, y, z);
    return g.solid[i] ? null : [g.skyOf(i), g.lamp[i]];
  };
  // оси грани (как в шейдере): u, v — по каким осям идут углы
  const AX = [[[0, 0, 1], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]]];
  const SKY = [0, 0, 0, 0], LAMP = [0, 0, 0, 0];
  for (let i = 0; i < list.length; i += 2) {
    const b = list[i], mask = list[i + 1];
    const half = b.surface === HALF, top = b.surface === HALF_TOP, emit = light && world.emitterOf?.(b);
    let shade = 1; // тень от солнца (простые тени): на весь блок
    if (g && world.sun) {
      const up = cell(b.x, half ? b.y : b.y + 1, b.z);
      if (up && up[0] > 0.5) shade = 1 - (1 - LIGHT.shadow) * shadowAmount(world, b.x, b.y, b.z, world.sun);
    }
    for (let f = 0; f < 6; f++) {
      if (!(mask & (1 << f))) continue;
      const [nx, ny, nz] = FACES[f];
      // клетка перед гранью (у полублока верх — в своей клетке)
      const fx = b.x + nx, fy = (half && f === 2) || (top && f === 3) ? b.y : b.y + ny, fz = b.z + nz; // (низ полублока сверху — тоже в своей клетке)
      let center = 1;
      if (!g) { SKY.fill(1); LAMP.fill(0); }
      else {
        const c0 = cell(fx, fy, fz) || [LIGHT.minSky, 0];
        center = c0[0];
        if (!LIGHT.smooth) { SKY.fill(c0[0]); LAMP.fill(c0[1]); }
        else {
          const [t1, t2] = AX[f];
          for (let k = 0; k < 4; k++) {
            const su = k & 1 ? 1 : -1, sv = k & 2 ? 1 : -1;
            const A = c0, B = cell(fx + t1[0] * su, fy + t1[1] * su, fz + t1[2] * su), C = cell(fx + t2[0] * sv, fy + t2[1] * sv, fz + t2[2] * sv);
            const D = B || C ? cell(fx + t1[0] * su + t2[0] * sv, fy + t1[1] * su + t2[1] * sv, fz + t1[2] * su + t2[2] * sv) : null;
            let s1 = 0, l1 = 0, cnt = 0;
            for (const q of [A, B, C, D]) if (q) { s1 += q[0]; l1 += q[1]; cnt++; }
            const occl = 4 - cnt; // углы у стен — чуть темнее (AO)
            SKY[k] = (s1 / cnt) * (1 - LIGHT.ao * occl);
            LAMP[k] = l1 / cnt;
          }
        }
        if (emit) LAMP.fill(1); // сама лампа светится
      }
      const sc = Math.max(LIGHT.minSky, center * shade);
      const o = at[f]++ * FLOATS_PER_CUBE;
      data[o] = b.x; data[o + 1] = half ? b.y + 0.25 : top ? b.y + 0.75 : b.y; data[o + 2] = b.z; // +0.25 / +0.75 — метка полублока снизу / сверху (шейдер)
      data[o + 3] = (b.color[0] / 255) * sc; data[o + 4] = (b.color[1] / 255) * sc; data[o + 5] = (b.color[2] / 255) * sc;
      for (let k = 0; k < 4; k++) { data[o + 6 + k] = SKY[k] * shade; data[o + 10 + k] = LAMP[k]; }
      data[o + 14] = sc;
    }
  }
  return { data, starts, counts, total };
}

// Какие списки граней куска могут быть повёрнуты к камере (битовая маска: 1 — +X ... 32 — −Z).
// Грань +X кубика x лежит в плоскости x + 1 и видна, только если камера правее: у куска [x0, x0 + 16) все
// такие плоскости не левее x0 + 1 — камера левее x0 + 1 не видит ни одной. Остальные — так же
export function facesFacing(v, chunk) {
  const x0 = chunk.cx * CHUNK, z0 = chunk.cz * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  let m = 0;
  if (v.x > x0 + 1) m |= 1;
  if (v.x < x1 - 1) m |= 2;
  if (v.y > chunk.minY + 1) m |= 4;
  if (v.y < chunk.maxY) m |= 8;
  if (v.z > z0 + 1) m |= 16;
  if (v.z < z1 - 1) m |= 32;
  return m;
}

// Камера -> то, что нужно для отсечения кусков (раз в кадр). maxDist — дальше по горизонтали не рисуем
// (там всё уже растворилось в дымке)
export function viewOf(camera, aspect, maxDist, out = {}) {
  const cp = Math.cos(camera.pitch);
  out.x = camera.position.x;
  out.y = camera.position.y;
  out.z = camera.position.z;
  out.fx = Math.sin(camera.yaw) * cp;
  out.fy = Math.sin(camera.pitch);
  out.fz = Math.cos(camera.yaw) * cp;
  // угол от центра кадра до его угла (по диагонали) — конус, в который влезает весь кадр
  const t = Math.tan(camera.fov / 2);
  const half = Math.atan(t * Math.sqrt(1 + aspect * aspect));
  out.sin = Math.sin(half);
  out.cos = Math.cos(half);
  out.maxDist = maxDist;
  return out;
}

export function chunkInView(v, chunk) {
  if (chunk.maxY < chunk.minY) return false; // пустой
  const h = (chunk.maxY - chunk.minY + 1) / 2;
  const cx = chunk.cx * CHUNK + CHUNK / 2, cz = chunk.cz * CHUNK + CHUNK / 2, cy = chunk.minY + h;
  const r = Math.sqrt(CHUNK * CHUNK / 2 + h * h); // шар, в который влезает кусок
  const dx = cx - v.x, dy = cy - v.y, dz = cz - v.z;
  // далеко по горизонтали (ближняя точка куска дальше дымки)
  if (Math.hypot(dx, dz) - CHUNK * 0.7072 > v.maxDist) return false;
  // конус взгляда против шара: d — вдоль взгляда, side — вбок от оси
  const d = dx * v.fx + dy * v.fy + dz * v.fz;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 <= r * r) return true; // камера внутри куска
  const side = Math.sqrt(Math.max(0, len2 - d * d));
  return side * v.cos - d * v.sin <= r;
}
