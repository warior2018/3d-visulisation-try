// ============================================================
//  Вода (как в Minecraft): отдельный слой мира поверх блоков — вода не блок (сквозь неё ходят, стреляют, ставят
//  блоки: поставил блок в воду — вода в этой клетке пропала).
//    ИСТОЧНИК (level 0, source) — стоит сам. Текучая вода — level 1…7 (7 — последняя, самая мелкая).
//    Растекается раз в STEP с: под клеткой пусто — вода падает (fall: столб «полной» воды, как источник по силе),
//    иначе — в стороны (level + 1, до 7). Кто не питается (нет источника выше по течению) — сохнет.
//    Падающая вода внизу снова растекается (как от источника), но сама источником не становится.
//  world.water: has / at / sources / setSource / tick(dt) / blockChanged(x, y, z) / version (рендеру).
//  Сохраняются только источники: текучая вода растекается заново при загрузке.
// ============================================================

export const WATER = {
  step: 0.25, //    раз во сколько с вода делает шаг (как в Minecraft — 5 тиков)
  maxLevel: 7, //   дальше стольких клеток по ровному не течёт
  minY: -64, //     ниже не падает (бездна под островами)
  perStep: 4000, // больше клеток за шаг не считаем (огромный разлив — растечётся за несколько шагов)
};

const key = (x, y, z) => `${x},${y},${z}`;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Water {
  // world — VoxelWorld (его isSolid)
  constructor(world) {
    this.world = world;
    this.cells = new Map(); // key -> { x, y, z, level, fall, source }
    this.pending = new Set(); // клетки, которые надо пересчитать на следующем шаге
    this.acc = 0;
    this.version = 0;
  }

  has(x, y, z) {
    return this.cells.has(key(x, y, z));
  }

  at(x, y, z) {
    return this.cells.get(key(x, y, z)) || null;
  }

  get size() {
    return this.cells.size;
  }

  // Высота воды в клетке (0…1): источник и падающая — почти полная, текучая — тем ниже, чем дальше от источника
  height(c) {
    if (!c) return 0;
    if (c.source || c.fall) return 0.9;
    return Math.max(0.12, 0.9 * (1 - c.level / (WATER.maxLevel + 1)));
  }

  free(x, y, z) {
    return !this.world.isSolid(x, y, z);
  }

  set(x, y, z, level, fall, source = false) {
    const k = key(x, y, z), was = this.cells.get(k);
    if (was && was.level === level && was.fall === fall && was.source === source) return;
    this.cells.set(k, { x, y, z, level, fall, source });
    this.version++;
    this.mark(x, y, z);
  }

  del(x, y, z) {
    if (this.cells.delete(key(x, y, z))) {
      this.version++;
      this.mark(x, y, z);
    }
  }

  // Пересчитать клетку и соседей на следующем шаге
  mark(x, y, z) {
    this.pending.add(key(x, y, z));
    this.pending.add(key(x, y - 1, z));
    this.pending.add(key(x, y + 1, z));
    for (const [dx, dz] of SIDES) this.pending.add(key(x + dx, y, z + dz));
  }

  // Источник (генерация мира, загрузка)
  setSource(x, y, z) {
    if (!this.free(x, y, z)) return;
    this.set(x, y, z, 0, false, true);
  }

  // Блок поставили / убрали: в клетке блока воды больше нет, соседи пересчитаются (убрали — потечёт в дыру)
  blockChanged(x, y, z) {
    if (!this.free(x, y, z)) this.cells.delete(key(x, y, z)) && this.version++;
    this.mark(x, y, z);
  }

  clear() {
    this.cells.clear();
    this.pending.clear();
    this.version++;
  }

  // Какой должна быть клетка (без источника): падает сверху — полная падающая; иначе — от соседей по бокам
  // (сильнейший: источник / падающая на опоре — 0, текучая — её level) + 1; никто не питает — null (сохнет)
  want(x, y, z) {
    const up = this.at(x, y + 1, z);
    if (up) return { level: 0, fall: true };
    let best = Infinity;
    for (const [dx, dz] of SIDES) {
      const n = this.at(x + dx, y, z + dz);
      if (!n) continue;
      // соседа питает его опора: текучая вода растекается, только если под ней не пусто (иначе она падает)
      if (this.free(x + dx, y - 1, z + dz) && !this.at(x + dx, y - 1, z + dz)?.source) continue;
      const lv = n.source || n.fall ? 0 : n.level;
      if (lv < best) best = lv;
    }
    if (best + 1 > WATER.maxLevel) return null;
    return { level: best + 1, fall: false };
  }

  // Каждый тик мира: раз в WATER.step — шаг растекания
  tick(dt) {
    if (!this.pending.size) return;
    this.acc += dt;
    if (this.acc < WATER.step) return;
    this.acc = 0;
    const list = [...this.pending].slice(0, WATER.perStep);
    for (const k of list) this.pending.delete(k);
    for (const k of list) {
      const [x, y, z] = k.split(",").map(Number);
      if (y < WATER.minY) continue;
      const c = this.cells.get(k);
      if (!this.free(x, y, z)) {
        if (c) this.del(x, y, z);
        continue;
      }
      if (c?.source) {
        this.flow(c);
        continue;
      }
      const w = this.want(x, y, z);
      if (!w) {
        if (c) this.del(x, y, z);
        continue;
      }
      if (!c || c.level !== w.level || c.fall !== w.fall) this.set(x, y, z, w.level, w.fall);
      this.flow(this.cells.get(k));
    }
  }

  // Клетка c течёт дальше: под ней пусто — вниз; иначе — в стороны (если ещё не последняя)
  flow(c) {
    if (!c) return;
    const { x, y, z } = c;
    if (this.free(x, y - 1, z)) {
      if (y - 1 >= WATER.minY && !this.at(x, y - 1, z)) this.pending.add(key(x, y - 1, z));
      // над пустотой (и под ней не источник) — только вниз, в стороны не растекается
      if (!this.at(x, y - 1, z)?.source) return;
    }
    const lv = c.source || c.fall ? 0 : c.level;
    if (lv + 1 > WATER.maxLevel) return;
    for (const [dx, dz] of SIDES) {
      const nx = x + dx, nz = z + dz;
      if (!this.free(nx, y, nz)) continue;
      const n = this.at(nx, y, nz);
      if (!n || (!n.source && !n.fall && n.level > lv + 1)) this.pending.add(key(nx, y, nz));
    }
  }

  // Сохранение: только источники
  sourcesJSON() {
    const out = [];
    for (const c of this.cells.values()) if (c.source) out.push([c.x, c.y, c.z]);
    return out;
  }

  loadSources(list) {
    this.clear();
    for (const p of Array.isArray(list) ? list : []) if (Array.isArray(p) && p.length === 3 && p.every(Number.isInteger)) this.setSource(p[0], p[1], p[2]);
  }
}
