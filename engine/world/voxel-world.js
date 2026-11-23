// ============================================================
//  Мир из кубиков 1×1×1 — возможность движка. Игра решает, нужен ли он ей
//  и какие в нём бывают блоки (цвета, палитра — это уже игра).
//
//  Клетка (x, y, z) занимает пространство от x до x+1 и т. д.
//
//  Хранение: мир поделён на куски (чанки) 16 × 16 клеток по X и Z. В куске — массив чисел Uint16Array на
//  каждую клетку (по высоте — только там, где у куска есть блоки; растёт, когда ставят выше / ниже): 0 —
//  пусто, иначе номер в палитре мира (цвет + поверхность). Клетка — 2 байта вместо отдельного объекта на блок
//  (≈ 120 байт): мир в памяти в десятки раз меньше, а «есть ли тут блок» — просто число из массива.
//  Снаружи — как раньше: get() отдаёт блок { x, y, z, color, surface? } (новый объект: хранить можно, менять —
//  нет смысла), chunk.blocks и world.blocks — перебор блоков и size. Горячим местам (сборка граней, свет) —
//  idAt() и pal[id] без объектов.
// ============================================================

// Чанки — куски мира CHUNK × CHUNK клеток по X и Z (во всю высоту). Каждый чанк знает свою version: поставили /
// сломали блок — растёт version только у него (и у соседа, если блок на краю: у соседа поменялись открытые
// грани). Рисовальщик пересобирает только изменившиеся чанки, сохранение — пишет только их
export const CHUNK = 16;
const AREA = CHUNK * CHUNK;
const chunkKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
export const chunkOf = (v) => Math.floor(v / CHUNK); // координата клетки -> номер чанка
const colKey = (x, z) => (x + 524288) * 1048576 + (z + 524288); // столбик (x, z) — для tops

// Полублок: блок с поверхностью HALF — нижняя половина клетки (0.5 м). Хранится и передаётся как поверхность
export const HALF = "half";
// Полублок сверху (align — верх): верхняя половина клетки (потолок ступенькой). Снизу под ним — полклетки пусто
export const HALF_TOP = "half-top";
// Четверть и три четверти — так же: снизу (QUARTER — 0.25 м, THREE_Q — 0.75 м) и сверху (…_TOP)
export const QUARTER = "quarter";
export const QUARTER_TOP = "quarter-top";
export const THREE_Q = "three-q";
export const THREE_Q_TOP = "three-q-top";
// Неполные блоки: какую часть клетки по высоте занимают (lo…hi от низа клетки) и метка для рисовальщика (code:
// y кубика + code / 16 — шейдер по ней сжимает кубик; 4 и 12 — как раньше у полублоков: +0.25 / +0.75)
export const SHAPES = {
  [HALF]: { lo: 0, hi: 0.5, code: 4 }, [HALF_TOP]: { lo: 0.5, hi: 1, code: 12 },
  [QUARTER]: { lo: 0, hi: 0.25, code: 2 }, [QUARTER_TOP]: { lo: 0.75, hi: 1, code: 10 },
  [THREE_Q]: { lo: 0, hi: 0.75, code: 6 }, [THREE_Q_TOP]: { lo: 0.25, hi: 1, code: 14 },
};
export const shapeOf = (surface) => (surface && SHAPES[surface]) || null;
// Неполный ли блок (полублок, четверть, три четверти — снизу или сверху)
export const isHalf = (b) => !!b && !!shapeOf(b.surface);

import { Water } from "./water.js";

// Лава (world.lava): шаг растекания — раз в step с (вода — 0.25), дальше maxLevel клеток по ровному не течёт
export const LAVA_FLOW = { step: 1, maxLevel: 3 };

// Блоки куска — для перебора (for…of: { x, y, z, color, surface? }) и счёта (size)
class ChunkBlocks {
  constructor(chunk) {
    this.chunk = chunk;
  }

  get size() {
    return this.chunk.count;
  }

  *[Symbol.iterator]() {
    const c = this.chunk, cells = c.cells, pal = c.world.pal, x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
    if (!cells) return;
    for (let i = 0; i < cells.length; i++) {
      const id = cells[i];
      if (!id) continue;
      const lx = i % CHUNK, lz = ((i - lx) / CHUNK) % CHUNK, ly = (i - lx - lz * CHUNK) / AREA;
      yield makeBlock(x0 + lx, c.y0 + ly, z0 + lz, pal[id]);
    }
  }
}

// Блок-объект для тех, кто спрашивает get() / перебирает (в мире хранятся только номера палитры)
const makeBlock = (x, y, z, p) => (p.surface ? { x, y, z, color: p.color, surface: p.surface } : { x, y, z, color: p.color });

export class Chunk {
  constructor(cx, cz, world = null) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.world = world;
    this.cells = null; //  Uint16Array: клетки ((y − y0) · 16 + lz) · 16 + lx — номер палитры, 0 — пусто
    this.y0 = 0; //        высота нижнего слоя массива
    this.h = 0; //         сколько слоёв в массиве
    this.count = 0; //     сколько блоков
    this.blocks = new ChunkBlocks(this); // перебор блоков куска и size
    this.version = 0; //       растёт при любом изменении (своём или открытых граней на краю) — рисовальщику
    this.edits = 0; //         растёт, только когда поменялись блоки самого куска — сохранению
    this.minY = Infinity; //   по высоте — где блоки (для отсечения: за кадром ли кусок); только растут
    this.maxY = -Infinity;
  }

  // Номер палитры в клетке (x, y, z мира; клетка — в этом куске)
  id(x, y, z) {
    const ly = y - this.y0;
    if (ly < 0 || ly >= this.h) return 0; // (пустой кусок: h = 0)
    return this.cells[(ly << 8) | ((z & 15) << 4) | (x & 15)];
  }

  // Записать номер (массив растёт по высоте, если клетка за его краем — с запасом 8 слоёв)
  setId(x, y, z, id) {
    if (!this.cells || y < this.y0 || y >= this.y0 + this.h) {
      if (!id) return;
      const lo = this.cells ? Math.min(this.y0, y - 8) : y - 8, hi = this.cells ? Math.max(this.y0 + this.h, y + 9) : y + 9;
      const cells = new Uint16Array((hi - lo) * AREA);
      if (this.cells) cells.set(this.cells, (this.y0 - lo) * AREA);
      this.cells = cells;
      this.y0 = lo;
      this.h = hi - lo;
    }
    this.cells[((y - this.y0) * CHUNK + (z - this.cz * CHUNK)) * CHUNK + (x - this.cx * CHUNK)] = id;
  }
}

// Все блоки мира — для перебора (values()) и счёта (size): как раньше Map, только без get / set
class WorldBlocks {
  constructor(world) {
    this.world = world;
  }

  get size() {
    let n = 0;
    for (const c of this.world.chunks.values()) n += c.count;
    return n;
  }

  *values() {
    for (const c of this.world.chunks.values()) yield* c.blocks;
  }

  [Symbol.iterator]() {
    return this.values();
  }
}

export class VoxelWorld {
  constructor() {
    this.blocks = new WorldBlocks(this); // перебор всех блоков и size (хранятся — в кусках: Chunk.cells)
    // Палитра: номер -> { color, surface, key }; 0 — пусто. palIndex: "r,g,b|поверхность" -> номер
    this.pal = [null];
    this.palIndex = new Map();
    // Неразрушимые: блоки с такой поверхностью remove не убирает (стены арены). Поверхность передаётся по сети
    // вместе с блоком — у гостя то же правило
    this.unbreakable = new Set();
    // Верхний блок столбика (x, z) (или null) — запоминаем: миникарта спрашивает сотни столбиков на каждую
    // перерисовку, а искать сверху вниз — до maxY обращений на столбик. Поставили / сломали — поправляем
    this.tops = new Map();
    this.chunks = new Map(); // chunkKey(cx, cz) -> Chunk
    this.lastChunk = null; //   последний спрошенный кусок (физика спрашивает соседние клетки подряд)
    this.floor = true; //       true — ниже y = 0 сплошной пол; false — пусто (летающие острова: падаем в бездну)
    // onChange(x, y, z, block | null) — поставили (block) или сломали (null) блок: сеть рассылает изменения.
    // Загрузка и clear() его не зовут
    this.onChange = null;
    this.quiet = false; // true — изменения не сообщать (применяем чужие: из сети)
    this.version = 0; //   растёт при каждом изменении — рендерер по нему понимает, что пора обновиться
    this.surfaces = 0; // сколько блоков с особой поверхностью (нет ни одного — физике не нужно их искать)
    // Светящиеся блоки (факел, лампа): цвет «r,g,b» -> { power 0…1, radius блоков } — setEmitters. Такие блоки
    // светят вокруг (chunk-mesh.js → blockLightAt), ночью — тоже. lights — где они: chunkKey -> Map(клетка -> блок)
    this.emitters = new Map();
    this.lights = new Map();
    this.lightCount = 0;
    this.minY = 0; //  самый низкий блок (не выше 0): поиск верхнего блока столбика идёт до него
    this.water = new Water(this); // вода — свой слой поверх блоков (engine/world/water.js)
    // лава — такой же слой (вулкан): течёт медленнее (шаг LAVA_FLOW.step с) и недалеко (maxLevel клеток)
    this.lava = new Water(this, LAVA_FLOW);
    this.maxY = 0; //  самый высокий блок (миникарте — откуда искать верхний блок столбика)
  }

  // Номер палитры для цвета и поверхности (нет такого — заводим)
  palId(color, surface = null) {
    const k = `${color[0]},${color[1]},${color[2]}|${surface || ""}`;
    let id = this.palIndex.get(k);
    if (id === undefined) {
      id = this.pal.length;
      if (id > 65535) throw new Error("палитра мира переполнена");
      this.pal.push({ color: [color[0], color[1], color[2]], surface: surface || null, shape: shapeOf(surface), emit: this.emitters.get(`${color[0]},${color[1]},${color[2]}`) || null });
      this.palIndex.set(k, id);
    }
    return id;
  }

  // Чанк по номеру (cx, cz); create — завести, если ещё нет. Чанк без блоков не удаляется (version помнит,
  // что он менялся — сохранению надо убрать его файл)
  chunk(cx, cz, create = false) {
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (!c && create) this.chunks.set(k, (c = new Chunk(cx, cz, this)));
    return c || null;
  }

  // Кусок клетки (x, z) — с памятью последнего (без поиска в Map, если спрашивают рядом)
  chunkOfCell(x, z) {
    const cx = x >> 4, cz = z >> 4, l = this.lastChunk; // >> 4 — то же, что floor(x / 16), для целых
    if (l !== null && l.cx === cx && l.cz === cz) return l; // (выгрузили / очистили — lastChunk сбрасывается)
    const c = this.chunks.get(chunkKey(cx, cz)) || null;
    if (c) this.lastChunk = c;
    return c;
  }

  // Номер палитры в клетке (0 — пусто). Для горячих мест: без объектов
  idAt(x, y, z) {
    const c = this.chunkOfCell(x, z);
    return c ? c.id(x, y, z) : 0;
  }

  // Какие цвета светятся: [{ color: [r, g, b], power: 0…1, radius }]. Уже стоящие блоки этих цветов — тоже
  setEmitters(list = []) {
    this.emitters = new Map(list.map((e) => [e.color.join(","), { power: e.power ?? 1, radius: e.radius ?? 7 }]));
    for (const p of this.pal) if (p) p.emit = this.emitters.get(p.color.join(",")) || null;
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
    if (!set) this.lights.set(ck, (set = new Map()));
    const k = colKey(b.x, b.z) * 4096 + b.y;
    if (set.has(k)) return;
    set.set(k, b);
    this.lightCount++;
    if (bumpAround) this.bumpLight(b);
  }

  removeLight(b) {
    const ck = chunkKey(chunkOf(b.x), chunkOf(b.z));
    const set = this.lights.get(ck);
    if (set?.delete(colKey(b.x, b.z) * 4096 + b.y)) {
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
      if (set) for (const b of set.values()) out.push(b);
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
    return this.idAt(x, y, z) !== 0;
  }

  // Блок в клетке ({ x, y, z, color, surface? }) или null
  get(x, y, z) {
    const id = this.idAt(x, y, z);
    return id ? makeBlock(x, y, z, this.pal[id]) : null;
  }

  // Верхний блок столбика (x, z) — что видно сверху (для миникарты). null — пусто
  topBlock(x, z) {
    const k = colKey(x, z);
    const known = this.tops.get(k);
    if (known !== undefined) return known;
    let top = null;
    const c = this.chunkOfCell(x, z);
    if (c?.cells) for (let y = c.y0 + c.h - 1; y >= c.y0 && !top; y--) top = c.id(x, y, z) ? this.get(x, y, z) : null;
    this.tops.set(k, top);
    return top;
  }

  // Высота поверхности столбика: где стоять (над верхним кубиком). 0 — пусто (пол мира)
  surfaceY(x, z) {
    const b = this.topBlock(Math.floor(x), Math.floor(z));
    return b ? b.y + (shapeOf(b.surface)?.hi ?? 1) : 0;
  }

  // Поверхность клетки: "slip" и т. п. или null (обычная, пустая клетка, пол)
  surfaceAt(x, y, z) {
    const id = this.idAt(x, y, z);
    return id ? this.pal[id].surface : null;
  }

  // Твёрдая ли клетка: блок или пол (всё, что ниже y = 0). Это спрашивает физика.
  // Высота верха клетки от её низа: 1 — целый блок (и неполный сверху), 0.25 / 0.5 / 0.75 — неполный снизу, 0 — пусто
  cellTop(x, y, z) {
    const id = this.idAt(x, y, z);
    if (!id) return y < 0 && this.floor ? 1 : 0;
    return this.pal[id].shape?.hi ?? 1;
  }

  // Высота низа клетки от её низа: у неполного сверху — 0.25 / 0.5 / 0.75 (под ним пусто), иначе 0
  cellBottom(x, y, z) {
    const id = this.idAt(x, y, z);
    return id ? this.pal[id].shape?.lo ?? 0 : 0;
  }

  // Ступенька-полублок в пустую клетку над целым блоком, если рядом (4 соседа) — уступ в 1 блок, по которому
  // можно пройти (над соседом 2 клетки пусто). Цвет — блока снизу. Вернёт, поставили ли
  halfStep(x, y, z) {
    if (this.has(x, y, z)) return false;
    const below = this.get(x, y - 1, z);
    if (!below || isHalf(below)) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.get(x + dx, y, z + dz);
      if (n && !isHalf(n) && !this.has(x + dx, y + 1, z + dz) && !this.has(x + dx, y + 2, z + dz)) return this.place(x, y, z, below.color, HALF);
    }
    return false;
  }

  // Потолок ступенькой (зеркально halfStep): пустая клетка под целым блоком, а рядом (4 соседа) потолок на блок
  // ниже — над проходом (под соседом 2 клетки пусто). Ставит полублок сверху; цвет — блока над ним
  halfStepTop(x, y, z) {
    if (this.has(x, y, z)) return false;
    const above = this.get(x, y + 1, z);
    if (!above || isHalf(above)) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.get(x + dx, y, z + dz);
      if (n && !isHalf(n) && !this.has(x + dx, y - 1, z + dz) && !this.has(x + dx, y - 2, z + dz)) return this.place(x, y, z, above.color, HALF_TOP);
    }
    return false;
  }

  isSolid(x, y, z) {
    return (y < 0 && this.floor) || this.idAt(x, y, z) !== 0;
  }

  // surface — особая поверхность блока (null — обычная): "slip" — скользкая, на ней не устоять (физика:
  // Physics surfaceAt), как скаты и карнизы в Overwatch. Сохраняется вместе с блоком
  place(x, y, z, color, surface = null) {
    if (this.has(x, y, z)) return false;
    const id = this.palId(color, surface);
    if (surface) this.surfaces++;
    const c = this.chunkAt(x, z, true);
    c.setId(x, y, z, id);
    c.count++;
    if (y < c.minY) c.minY = y;
    if (y > c.maxY) c.maxY = y;
    if (y < this.minY) this.minY = y;
    this.touch(x, y, z);
    const p = this.pal[id];
    const b = this.onChange || p.emit ? makeBlock(x, y, z, p) : null;
    if (p.emit && this.emitters.size) this.addLight(b);
    if (y > this.maxY) this.maxY = y;
    if (this.onChange && !this.quiet) this.onChange(x, y, z, b);
    if (this.water.size) this.water.blockChanged(x, y, z); // в клетке блока воды нет
    if (this.lava.size) this.lava.blockChanged(x, y, z);
    const k = colKey(x, z), top = this.tops.get(k);
    if (top !== undefined && (!top || y > top.y)) this.tops.set(k, b || makeBlock(x, y, z, p)); // стал верхним (не знали — узнаем при спросе)
    this.version++;
    return true;
  }

  // Убрать блок. Вернёт true, если убрали (нет блока или неразрушимый — false)
  remove(x, y, z) {
    const c = this.chunkOfCell(x, z), id = c ? c.id(x, y, z) : 0;
    if (!id) return false;
    const p = this.pal[id];
    if (p.surface && this.unbreakable.has(p.surface)) return false;
    c.setId(x, y, z, 0);
    c.count--;
    if (p.surface) this.surfaces--;
    if (this.lightCount && p.emit) this.removeLight({ x, y, z, color: p.color });
    this.touch(x, y, z);
    if (this.onChange && !this.quiet) this.onChange(x, y, z, null);
    if (this.water.size) this.water.blockChanged(x, y, z); // убрали — вода потечёт в дыру
    if (this.lava.size) this.lava.blockChanged(x, y, z);
    this.version++;
    const k = colKey(x, z);
    if (this.tops.get(k)?.y === y) this.tops.delete(k); // сломали верхний — найдём новый при спросе
    return true;
  }

  // Выгрузить кусок из памяти (подгрузка мира по частям: ChunkStore.stream). Блоки куска уходят из мира;
  // у соседей открываются грани на границе (их пересоберут). Сохранить кусок до этого — забота того, кто выгружает
  unloadChunk(c) {
    if (this.chunks.get(c.key) !== c) return false;
    for (const b of c.blocks) {
      if (b.surface) this.surfaces--;
      if (this.lightCount && this.emitterOf(b)) this.removeLight(b);
      this.tops.delete(colKey(b.x, b.z));
    }
    this.chunks.delete(c.key);
    if (this.lastChunk === c) this.lastChunk = null;
    this.bump(c.cx - 1, c.cz);
    this.bump(c.cx + 1, c.cz);
    this.bump(c.cx, c.cz - 1);
    this.bump(c.cx, c.cz + 1);
    this.version++;
    return true;
  }

  clear() {
    this.chunks.clear();
    this.lastChunk = null;
    this.lights.clear();
    this.lightCount = 0;
    this.surfaces = 0;
    this.tops.clear();
    this.water.clear();
    this.lava.clear();
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
