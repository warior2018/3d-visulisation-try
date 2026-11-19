// ============================================================
//  Что из мира вообще может быть видно — чтобы не рисовать куски, спрятанные за горой или толщей земли.
//  Куски мира (чанки 16 × 16 во всю высоту) делим по высоте на секции 16 × 16 × 16. При сборке куска
//  (sectionInfo) для каждой секции считаем:
//    · связность — через какие её стороны можно пройти по воздуху к каким (заливка воздуха внутри секции):
//      conn[f] — битовая маска сторон, куда можно попасть, войдя через сторону f;
//    · full — секция целиком из непрозрачных блоков (непрозрачная стена — заслоняет всё за собой).
//  Каждый кадр (visibleColumns):
//    1) заливка от секции камеры по секциям — только через открытые проходы и не «назад, к камере» (как
//       в Minecraft): в пещере видны только связанные с ней полости, поверхность над головой отсекается;
//    2) у дошедших кусков — лучи от камеры к углам и середине куска по сетке секций: все упёрлись в сплошную
//       секцию (гора, толща острова) — кусок не рисуем.
//  Стороны — как у граней (chunk-mesh.js → FACES): 0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z; противоположная — f ^ 1.
//  Секции выше и ниже блоков куска и несобранные куски — воздух (всё открыто).
// ============================================================

import { CHUNK, isHalf } from "../world/voxel-world.js";
import { LIGHT } from "./chunk-mesh.js";

const S = CHUNK; // сторона секции = ширине куска
const ALL = 63; //  все 6 сторон
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const chunkKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const secOf = (y) => Math.floor(y / S);

// Непрозрачный ли блок: полублок и листва — пропускают взгляд
const isLeaf = (b) => !!LIGHT.leaves && LIGHT.leaves.includes(b.color[0] * 65536 + b.color[1] * 256 + b.color[2]);
const blocks = (b) => !!b && !isHalf(b) && !isLeaf(b);

// Секции куска (при сборке): { base — номер нижней секции, list: [{ conn: Uint8Array(6), full }] }
export function sectionInfo(world, chunk) {
  if (chunk.maxY < chunk.minY) return null;
  const base = secOf(chunk.minY), top = secOf(chunk.maxY);
  const x0 = chunk.cx * S, z0 = chunk.cz * S;
  const seen = new Uint8Array(S * S * S), queue = new Int16Array(S * S * S);
  // непрозрачные клетки — по секциям, из блоков самого куска (без опроса каждой клетки мира)
  const solids = [], counts = [];
  for (let sy = base; sy <= top; sy++) {
    solids.push(new Uint8Array(S * S * S));
    counts.push(0);
  }
  for (const b of chunk.blocks) {
    if (!blocks(b)) continue;
    const k = secOf(b.y) - base;
    solids[k][((b.y - (k + base) * S) * S + (b.z - z0)) * S + (b.x - x0)] = 1;
    counts[k]++;
  }
  const list = [];
  for (let sy = base; sy <= top; sy++) {
    const solid = solids[sy - base], count = counts[sy - base];
    const conn = new Uint8Array(6);
    if (count === 0) conn.fill(ALL);
    else if (count < S * S * S) {
      seen.fill(0);
      for (let start = 0; start < S * S * S; start++) {
        if (solid[start] || seen[start]) continue;
        // заливка одной полости: какие стороны секции она задевает
        let head = 0, tail = 0, faces = 0;
        queue[tail++] = start;
        seen[start] = 1;
        while (head < tail) {
          const i = queue[head++], x = i % S, z = ((i - x) / S) % S, y = (i - x - z * S) / (S * S);
          if (x === S - 1) faces |= 1;
          if (x === 0) faces |= 2;
          if (y === S - 1) faces |= 4;
          if (y === 0) faces |= 8;
          if (z === S - 1) faces |= 16;
          if (z === 0) faces |= 32;
          if (x < S - 1) tail = step(i + 1, solid, seen, queue, tail);
          if (x > 0) tail = step(i - 1, solid, seen, queue, tail);
          if (z < S - 1) tail = step(i + S, solid, seen, queue, tail);
          if (z > 0) tail = step(i - S, solid, seen, queue, tail);
          if (y < S - 1) tail = step(i + S * S, solid, seen, queue, tail);
          if (y > 0) tail = step(i - S * S, solid, seen, queue, tail);
        }
        for (let f = 0; f < 6; f++) if (faces & (1 << f)) conn[f] |= faces;
      }
    }
    list.push({ conn, full: count === S * S * S });
  }
  return { base, list };
}

function step(j, solid, seen, queue, tail) {
  if (solid[j] || seen[j]) return tail;
  seen[j] = 1;
  queue[tail++] = j;
  return tail;
}

// Видимые куски (Set ключей chunkKey) с камеры p. infoOf(chunk) — sectionInfo этого куска или null (не собран).
// maxDist — дальность прорисовки (м): дальше заливка не идёт
export function visibleColumns(world, p, maxDist, infoOf, out = new Set()) {
  out.clear();
  const sec = (cx, sy, cz) => {
    const c = world.chunks.get(chunkKey(cx, cz));
    const info = c && infoOf(c);
    if (!info) return null;
    return info.list[sy - info.base] || null;
  };
  const yLo = secOf(world.minY ?? 0) - 1, yHi = secOf(world.maxY ?? 0) + 1;
  const reach = maxDist + S;
  // 1) заливка по секциям
  const c0 = { x: secOf(p.x), y: Math.max(yLo, Math.min(yHi, secOf(p.y))), z: secOf(p.z) };
  const seen = new Set();
  const key = (x, y, z) => ((x + 4096) * 8192 + (z + 4096)) * 512 + (y + 256);
  const q = [[c0.x, c0.y, c0.z, -1, 0]]; // секция, через какую сторону вошли (−1 — камера), какие направления уже были
  seen.add(key(c0.x, c0.y, c0.z));
  const startOpen = cameraFaces(world, p, sec(c0.x, c0.y, c0.z)); // из секции камеры — только из её полости
  for (let h = 0; h < q.length; h++) {
    const [x, y, z, from, dirs] = q[h];
    out.add(chunkKey(x, z));
    const s = sec(x, y, z);
    const open = from < 0 ? startOpen : !s ? ALL : s.conn[from];
    for (let d = 0; d < 6; d++) {
      if (dirs & (1 << (d ^ 1))) continue; //   назад, к камере — нет
      if (!(open & (1 << d))) continue; //       с этой стороны секции туда воздуха нет
      const [dx, dy, dz] = DIRS[d], nx = x + dx, ny = y + dy, nz = z + dz;
      if (ny < yLo || ny > yHi) continue;
      if (Math.hypot((nx + 0.5) * S - p.x, (nz + 0.5) * S - p.z) > reach) continue;
      const k = key(nx, ny, nz);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny, nz, d ^ 1, dirs | (1 << d)]);
    }
  }
  // 2) заслонено сплошными секциями: лучи к 8 углам (чуть внутрь) и к середине куска — все упёрлись — не видно
  const full = (x, y, z) => !!sec(x, y, z)?.full;
  for (const k of out) {
    const c = world.chunks.get(k);
    if (!c || c.maxY < c.minY) continue;
    const xa = c.cx * S + 0.5, xb = c.cx * S + S - 0.5, za = c.cz * S + 0.5, zb = c.cz * S + S - 0.5, ya = c.minY + 0.5, yb = c.maxY + 0.5;
    let seenAny = !blocked(p, (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2, full);
    for (let i = 0; i < 8 && !seenAny; i++) seenAny = !blocked(p, i & 1 ? xb : xa, i & 2 ? yb : ya, i & 4 ? zb : za, full);
    if (!seenAny) out.delete(k);
  }
  return out;
}

// Какие стороны своей секции задевает полость, где стоит камера (заливка воздуха от клетки камеры внутри
// секции). Секция — воздух (или не собрана) — все; камера в блоке (прошла сквозь стену) — тоже все
function cameraFaces(world, p, s) {
  if (!s || s.conn.every((m) => m === ALL)) return ALL;
  const x0 = Math.floor(p.x / S) * S, y0 = Math.floor(p.y / S) * S, z0 = Math.floor(p.z / S) * S;
  const cx = Math.floor(p.x) - x0, cy = Math.floor(p.y) - y0, cz = Math.floor(p.z) - z0;
  const solidAt = (x, y, z) => blocks(world.idAt ? world.pal[world.idAt(x0 + x, y0 + y, z0 + z)] : world.get(x0 + x, y0 + y, z0 + z));
  if (solidAt(cx, cy, cz)) return ALL;
  const seen = new Uint8Array(S * S * S), queue = [cx + S * (cz + S * cy)];
  seen[queue[0]] = 1;
  let faces = 0;
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h], x = i % S, z = ((i - x) / S) % S, y = (i - x - z * S) / (S * S);
    if (x === S - 1) faces |= 1;
    if (x === 0) faces |= 2;
    if (y === S - 1) faces |= 4;
    if (y === 0) faces |= 8;
    if (z === S - 1) faces |= 16;
    if (z === 0) faces |= 32;
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= S || ny >= S || nz >= S) continue;
      const j = nx + S * (nz + S * ny);
      if (seen[j] || solidAt(nx, ny, nz)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return faces;
}

// Луч от p к (tx, ty, tz) по сетке секций (Amanatides–Woo): проходит ли через сплошную секцию (кроме своей
// и секции цели)
function blocked(p, tx, ty, tz, full) {
  let x = secOf(p.x), y = secOf(p.y), z = secOf(p.z);
  const ex = secOf(tx), ey = secOf(ty), ez = secOf(tz);
  const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z;
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const inv = (d) => (d === 0 ? Infinity : Math.abs(S / d));
  const tdx = inv(dx), tdy = inv(dy), tdz = inv(dz);
  const first = (pos, cell, s, d) => (d === 0 ? Infinity : Math.abs(((s > 0 ? (cell + 1) * S : cell * S) - pos) / d));
  let tmx = first(p.x, x, sx, dx), tmy = first(p.y, y, sy, dy), tmz = first(p.z, z, sz, dz);
  for (let n = 0; n < 256; n++) {
    if (tmx <= tmy && tmx <= tmz) { if (tmx > 1) return false; x += sx; tmx += tdx; }
    else if (tmy <= tmz) { if (tmy > 1) return false; y += sy; tmy += tdy; }
    else { if (tmz > 1) return false; z += sz; tmz += tdz; }
    if (x === ex && y === ey && z === ez) return false;
    if (full(x, y, z)) return true;
  }
  return false;
}
