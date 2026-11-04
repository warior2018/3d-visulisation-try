// ============================================================
//  Мир из кубиков 1×1×1 — возможность движка. Игра решает, нужен ли он ей
//  и какие в нём бывают блоки (цвета, палитра — это уже игра).
//
//  Клетка (x, y, z) занимает пространство от x до x+1 и т. д.
//  Блоки хранятся в Map по числовому ключу клетки (key) — так мгновенно видно, занята ли клетка.
// ============================================================

// Ключ клетки — ОДНО ЧИСЛО, а не строка "x,y,z": физика и поиск пути спрашивают «твёрдо ли тут» сотни тысяч
// раз в секунду, и каждая строка — новый мусор для сборщика (паузы-рывки в нашествие). Число собирается из
// x, z (±524 288 блоков) и y (−2048…2047) без пересечений и точно помещается в double (2^52)
const key = (x, y, z) => ((x + 524288) * 1048576 + (z + 524288)) * 4096 + (y + 2048);

// Чанки — куски мира CHUNK × CHUNK клеток по X и Z (во всю высоту). Блоки лежат и в общем Map (быстро спросить
// «есть ли тут блок»), и в своём чанке (быстро перебрать кусок). Каждый чанк знает свою version: поставили /
// сломали блок — растёт version только у него (и у соседа, если блок на краю: у соседа поменялись открытые
// грани). Рисовальщик пересобирает только изменившиеся чанки, сохранение — пишет только их
export const CHUNK = 16;
const chunkKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
export const chunkOf = (v) => Math.floor(v / CHUNK); // координата клетки -> номер чанка

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = new Set(); // блоки этого куска (те же объекты, что в world.blocks)
    this.version = 0; //       растёт при любом изменении (своём или открытых граней на краю) — рисовальщику
    this.edits = 0; //         растёт, только когда поменялись блоки самого куска — сохранению
    this.minY = Infinity; //   по высоте — где блоки (для отсечения: за кадром ли кусок); только растут
    this.maxY = -Infinity;
  }
}

export class VoxelWorld {
  constructor() {
    this.blocks = new Map(); // key(x, y, z) -> { x, y, z, color: [r, g, b] }
    // Верхний блок столбика (x, z) (или null) — запоминаем: миникарта спрашивает сотни столбиков на каждую
    // перерисовку, а искать сверху вниз — до maxY обращений на столбик. Поставили / сломали — поправляем
    this.tops = new Map();
    this.chunks = new Map(); // chunkKey(cx, cz) -> Chunk
    this.floor = true; //       true — ниже y = 0 сплошной пол; false — пусто (летающие острова: падаем в бездну)
    // onChange(x, y, z, block | null) — поставили (block) или сломали (null) блок: сеть рассылает изменения.
    // Загрузка и clear() его не зовут
    this.onChange = null;
    this.quiet = false; // true — изменения не сообщать (применяем чужие: из сети)
    this.version = 0;
    this.surfaces = 0; // сколько блоков с особой поверхностью (нет ни одного — физике не нужно их искать)
    // Светящиеся блоки (факел, лампа): цвет «r,g,b» -> { power 0…1, radius блоков } — setEmitters. Такие блоки
    // светят вокруг (chunk-mesh.js → blockLightAt), ночью — тоже. lights — где они: chunkKey -> Set(блок)
    this.emitters = new Map();
    this.lights = new Map();
    this.lightCount = 0;
    this.maxY = 0; //  самый высокий блок (миникарте — откуда искать верхний блок столбика) // растёт при каждом изменении — рендерер по нему понимает, что пора обновиться
  }

  // Чанк по номеру (cx, cz); create — завести, если ещё нет. Чанк без блоков не удаляется (version помнит,
  // что он менялся — сохранению надо убрать его файл)
  chunk(cx, cz, create = false) {
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (!c && create) this.chunks.set(k, (c = new Chunk(cx, cz)));
    return c || null;
  }

  // Какие цвета светятся: [{ color: [r, g, b], power: 0…1, radius }]. Уже стоящие блоки этих цветов — тоже
  setEmitters(list = []) {
    this.emitters = new Map(list.map((e) => [e.color.join(","), { power: e.power ?? 1, radius: e.radius ?? 7 }]));
    this.lights.clear();
    this.lightCount = 0;
    for (const b of this.blocks.values()) if (this.emitterOf(b)) this.addLight(b, false);
    for (const c of this.chunks.values()) c.version++;
    this.version++;
  }

  emitterOf(b) {
    return this.emitters.size ? this.emitters.get(b.color.join(",")) || null : null;
  }

  addLight(b, bumpAround = true) {
    const ck = chunkKey(chunkOf(b.x), chunkOf(b.z));
    let set = this.lights.get(ck);
    if (!set) this.lights.set(ck, (set = new Set()));
    set.add(b);
    this.lightCount++;
    if (bumpAround) this.bumpLight(b);
  }

  removeLight(b) {
    const ck = chunkKey(chunkOf(b.x), chunkOf(b.z));
    const set = this.lights.get(ck);
    if (set?.delete(b)) {
      this.lightCount--;
      if (!set.size) this.lights.delete(ck);
      this.bumpLight(b);
    }
  }

  // Свет дошёл до соседних чанков — их пересобрать
  bumpLight(b) {
    const r = Math.ceil((this.emitterOf(b)?.radius ?? 7) / CHUNK);
    const cx = chunkOf(b.x), cz = chunkOf(b.z);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx || dz) this.bump(cx + dx, cz + dz);
  }

  // Светящиеся блоки около чанка (cx, cz) — в пределах r чанков
  lightsNear(cx, cz, r = 1) {
    if (!this.lightCount) return null;
    const out = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const set = this.lights.get(chunkKey(cx + dx, cz + dz));
      if (set) for (const b of set) out.push(b);
    }
    return out.length ? out : null;
  }

  // Чанк, в котором клетка (x, z)
  chunkAt(x, z, create = false) {
    return this.chunk(chunkOf(x), chunkOf(z), create);
  }

  // Блок (x, y, z) поменялся: его чанк — новая version; блок на краю чанка — и соседний (там открылась
  // или закрылась грань)
  touch(x, y, z) {
    const cx = chunkOf(x), cz = chunkOf(z);
    const own = this.chunk(cx, cz, true);
    own.version++;
    own.edits++;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0) this.bump(cx - 1, cz);
    if (lx === CHUNK - 1) this.bump(cx + 1, cz);
    if (lz === 0) this.bump(cx, cz - 1);
    if (lz === CHUNK - 1) this.bump(cx, cz + 1);
  }

  bump(cx, cz) {
    const c = this.chunk(cx, cz);
    if (c) c.version++;
  }

  has(x, y, z) {
    return this.blocks.has(key(x, y, z));
  }

  // Блок в клетке ({ x, y, z, color... }) или null
  get(x, y, z) {
    return this.blocks.get(key(x, y, z)) || null;
  }

  // Верхний блок столбика (x, z) — что видно сверху (для миникарты). null — пусто
  topBlock(x, z) {
    const k = (x + 524288) * 1048576 + (z + 524288);
    const known = this.tops.get(k);
    if (known !== undefined) return known;
    let top = null;
    for (let y = this.maxY; y >= 0 && !top; y--) top = this.blocks.get(key(x, y, z)) || null;
    this.tops.set(k, top);
    return top;
  }

  // Высота поверхности столбика: где стоять (над верхним кубиком). 0 — пусто (пол мира)
  surfaceY(x, z) {
    const b = this.topBlock(Math.floor(x), Math.floor(z));
    return b ? b.y + 1 : 0;
  }

  // Поверхность клетки: "slip" и т. п. или null (обычная, пустая клетка, пол)
  surfaceAt(x, y, z) {
    return this.blocks.get(key(x, y, z))?.surface || null;
  }

  // Твёрдая ли клетка: блок или пол (всё, что ниже y = 0). Это спрашивает физика.
  isSolid(x, y, z) {
    return (y < 0 && this.floor) || this.blocks.has(key(x, y, z));
  }

  // surface — особая поверхность блока (null — обычная): "slip" — скользкая, на ней не устоять (физика:
  // Physics surfaceAt), как скаты и карнизы в Overwatch. Сохраняется вместе с блоком
  place(x, y, z, color, surface = null) {
    if (this.has(x, y, z)) return false;
    const b = { x, y, z, color: [...color] };
    if (surface) {
      b.surface = surface;
      this.surfaces++;
    }
    this.blocks.set(key(x, y, z), b);
    const c = this.chunkAt(x, z, true);
    c.blocks.add(b);
    if (y < c.minY) c.minY = y;
    if (y > c.maxY) c.maxY = y;
    this.touch(x, y, z);
    if (this.emitters.size && this.emitterOf(b)) this.addLight(b);
    if (y > this.maxY) this.maxY = y;
    if (this.onChange && !this.quiet) this.onChange(x, y, z, b);
    const k = (x + 524288) * 1048576 + (z + 524288), top = this.tops.get(k);
    if (top !== undefined && (!top || y > top.y)) this.tops.set(k, b); // стал верхним (не знали — узнаем при спросе)
    this.version++;
    return true;
  }

  remove(x, y, z) {
    const b = this.blocks.get(key(x, y, z));
    const removed = this.blocks.delete(key(x, y, z));
    if (removed) {
      if (b.surface) this.surfaces--;
      if (this.lightCount && this.emitterOf(b)) this.removeLight(b);
      this.chunkAt(x, z)?.blocks.delete(b);
      this.touch(x, y, z);
      if (this.onChange && !this.quiet) this.onChange(x, y, z, null);
      this.version++;
      const k = (x + 524288) * 1048576 + (z + 524288);
      if (this.tops.get(k)?.y === y) this.tops.delete(k); // сломали верхний — найдём новый при спросе
    }
    return removed;
  }

  // Выгрузить кусок из памяти (подгрузка мира по частям: ChunkStore.stream). Блоки куска уходят из мира;
  // у соседей открываются грани на границе (их пересоберут). Сохранить кусок до этого — забота того, кто выгружает
  unloadChunk(c) {
    if (this.chunks.get(c.key) !== c) return false;
    for (const b of c.blocks) {
      this.blocks.delete(key(b.x, b.y, b.z));
      if (b.surface) this.surfaces--;
      if (this.lightCount && this.emitterOf(b)) this.removeLight(b);
      this.tops.delete((b.x + 524288) * 1048576 + (b.z + 524288));
    }
    this.chunks.delete(c.key);
    this.bump(c.cx - 1, c.cz);
    this.bump(c.cx + 1, c.cz);
    this.bump(c.cx, c.cz - 1);
    this.bump(c.cx, c.cz + 1);
    this.version++;
    return true;
  }

  clear() {
    this.blocks.clear();
    this.chunks.clear();
    this.lights.clear();
    this.lightCount = 0;
    this.surfaces = 0;
    this.tops.clear();
    this.version++;
  }

  // Луч по клеткам (алгоритм DDA — «digital differential analyzer»).
  // Идём от клетки к клетке ровно вдоль луча и на каждом шаге знаем,
  // через какую грань перешли. Пол (y < 0) считаем сплошным.
  //
  // Возвращает { block, place, t } или null:
  //   block — клетка с кубиком, в который попали (null, если попали в пол)
  //   place — соседняя клетка со стороны луча: туда можно поставить новый кубик
  //   t     — расстояние по лучу до попадания (камере 3-го лица — чтобы не залезть в стену)
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    // Сколько пути по лучу нужно пройти, чтобы пересечь одну клетку по каждой оси
    const deltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const deltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const deltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    // Сколько пути до первой границы клетки по каждой оси
    const first = (pos, cell, step, delta) =>
      step > 0 ? (cell + 1 - pos) * delta : step < 0 ? (pos - cell) * delta : Infinity;
    let tMaxX = first(origin.x, x, stepX, deltaX);
    let tMaxY = first(origin.y, y, stepY, deltaY);
    let tMaxZ = first(origin.z, z, stepZ, deltaZ);

    let t = 0;
    let normal = [0, 0, 0];
    while (t <= maxDist) {
      // Шаг в ту соседнюю клетку, до границы которой ближе всего
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += deltaX; normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += deltaY; normal = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += deltaZ; normal = [0, 0, -stepZ];
      }
      if (t > maxDist) break;

      const place = { x: x + normal[0], y: y + normal[1], z: z + normal[2] };
      if (y < 0 && this.floor) return { block: null, place, t }; // упёрлись в пол
      if (y < -256) return null; //                           бездна (пола нет) — дальше нечего искать
      if (this.has(x, y, z)) return { block: { x, y, z }, place, t };
    }
    return null;
  }

  // ---------- Сохранение: мир -> обычный объект для JSON и обратно ----------

  toJSON() {
    return [...this.blocks.values()].map((b) => (b.surface ? { x: b.x, y: b.y, z: b.z, color: b.color, surface: b.surface } : { x: b.x, y: b.y, z: b.z, color: b.color }));
  }

  loadFrom(list) {
    this.clear();
    const quiet = this.quiet;
    this.quiet = true;
    for (const b of list) {
      const ok = [b.x, b.y, b.z].every(Number.isInteger) && Array.isArray(b.color) && b.color.length === 3;
      if (ok) this.place(b.x, b.y, b.z, b.color, typeof b.surface === "string" ? b.surface : null);
    }
    this.quiet = quiet;
  }
}
