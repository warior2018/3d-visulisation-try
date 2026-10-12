// ============================================================
//  Поиск пути (pathfinder) — часть ИИ движка (engine/ai). Существо не идёт «в лоб» на цель,
//  а ищет дорогу по клеткам мира: обходит столбы и стены, запрыгивает
//  на ступеньку в 1 блок, спрыгивает вниз.
//
//  Мир для поиска — та же функция isSolid(x, y, z), что и у физики.
//
//  1. findPath — алгоритм A* («A-звезда»). Идём от старта во все стороны,
//     но сначала проверяем клетки, которые ближе к цели (по прямой).
//     Так находим кратчайший путь, не перебирая весь мир.
//  2. Navigator — «штурман» одного существа: держит найденный путь,
//     пересчитывает его, когда цель ушла или существо застряло,
//     и каждый кадр говорит, куда идти и когда прыгать.
//
//    const nav = new Navigator({ isSolid, version: () => world.version });
//    const step = nav.update(e, target.position, dt); // { x, z, jump, done } | null
// ============================================================

// 8 направлений: 4 прямых и 4 диагональных
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Можно ли стоять в клетке (x, y, z): под ногами твёрдо, а на высоту тела — пусто
export function canStand(isSolid, x, y, z, height = 2) {
  if (!isSolid(x, y - 1, z)) return false;
  for (let k = 0; k < height; k++) if (isSolid(x, y + k, z)) return false;
  return true;
}

// Свободно ли место для тела (не обязательно с опорой — для прыжков и падений)
function free(isSolid, x, y, z, height) {
  for (let k = 0; k < height; k++) if (isSolid(x, y + k, z)) return false;
  return true;
}

// На какой высоте можно стоять в столбике (x, z) рядом с y: сначала сам y,
// потом ниже (до maxDrop). null — нигде.
export function standY(isSolid, x, y, z, { height = 2, maxDrop = 4 } = {}) {
  for (let d = 0; d <= maxDrop; d++) if (canStand(isSolid, x, y - d, z, height)) return y - d;
  return null;
}

// Куда можно шагнуть из клетки (x, y, z) — соседи с их «ценой» (длина шага)
function neighbors(isSolid, x, y, z, { height, maxStep, maxDrop }) {
  const out = [];
  for (const [dx, dz] of DIRS) {
    const nx = x + dx;
    const nz = z + dz;
    const diagonal = dx !== 0 && dz !== 0;
    if (diagonal) {
      // По диагонали — только по ровному и если оба «угла» свободны (не срезаем угол стены)
      if (!free(isSolid, x + dx, y, z, height) || !free(isSolid, x, y, z + dz, height)) continue;
      if (canStand(isSolid, nx, y, nz, height)) out.push([nx, y, nz, Math.SQRT2]);
      continue;
    }
    // Ровно
    if (canStand(isSolid, nx, y, nz, height)) {
      out.push([nx, y, nz, 1]);
      continue;
    }
    // Вверх (прыжок): над головой должно быть место, чтобы подпрыгнуть
    let found = false;
    for (let up = 1; up <= maxStep; up++) {
      if (!free(isSolid, x, y + height, z, up)) break; // потолок над нами — не подпрыгнуть
      if (canStand(isSolid, nx, y + up, nz, height)) {
        out.push([nx, y + up, nz, 1 + up]); // прыжок «дороже» шага: без нужды не прыгаем
        found = true;
        break;
      }
    }
    if (found) continue;
    // Вниз (спрыгнуть): впереди пусто на высоту тела, ниже — пол
    if (!free(isSolid, nx, y, nz, height)) continue;
    for (let down = 1; down <= maxDrop; down++) {
      if (canStand(isSolid, nx, y - down, nz, height)) {
        out.push([nx, y - down, nz, 1 + down * 0.5]);
        break;
      }
      if (isSolid(nx, y - down, nz)) break;
    }
  }
  return out;
}

// Простая «куча» (приоритетная очередь): всегда быстро отдаёт клетку с наименьшей оценкой
class Heap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Оценка «сколько ещё идти» — по прямой с диагоналями (не больше настоящего пути)
function estimate(x, y, z, g) {
  const dx = Math.abs(x - g[0]);
  const dz = Math.abs(z - g[2]);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(y - g[1]) * 0.5;
}

// A*: путь от клетки start до клетки goal ([x, y, z] — клетка, где стоят ноги).
// Возвращает { path: [[x, y, z], ...], complete } или null, если старт негодный.
// Не дошли до цели (стена кругом, цель на столбе) — путь до самой близкой к ней клетки, complete: false.
// maxNodes — сколько клеток проверить самое большее (чтобы не думать вечно).
export function findPath(isSolid, start, goal, { height = 2, maxStep = 1, maxDrop = 4, maxNodes = 1200 } = {}) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const opts = { height, maxStep, maxDrop };
  const open = new Heap();
  const nodes = new Map(); // ключ клетки -> { x, y, z, g, parent, closed }
  const first = { x: start[0], y: start[1], z: start[2], g: 0, parent: null, closed: false };
  first.h = estimate(first.x, first.y, first.z, goal);
  first.f = first.h;
  nodes.set(key(first.x, first.y, first.z), first);
  open.push(first);
  let best = first; // ближайшая к цели клетка — на случай, если до цели не дойти
  let checked = 0;

  while (open.size && checked < maxNodes) {
    const n = open.pop();
    if (n.closed) continue; // устаревшая запись в куче
    n.closed = true;
    checked++;
    if (n.x === goal[0] && n.y === goal[1] && n.z === goal[2]) return { path: unwind(n), complete: true };
    if (n.h < best.h || (n.h === best.h && n.g < best.g)) best = n;
    for (const [x, y, z, cost] of neighbors(isSolid, n.x, n.y, n.z, opts)) {
      const k = key(x, y, z);
      const g = n.g + cost;
      let m = nodes.get(k);
      if (m && (m.closed || m.g <= g)) continue;
      if (!m) {
        m = { x, y, z, h: estimate(x, y, z, goal), closed: false };
        nodes.set(k, m);
      }
      m.g = g;
      m.f = g + m.h;
      m.parent = n;
      open.push(m);
    }
  }
  return { path: unwind(best), complete: false };
}

function unwind(n) {
  const path = [];
  for (let c = n; c; c = c.parent) path.push([c.x, c.y, c.z]);
  return path.reverse();
}

// Сгладить путь: если от точки A до точки C можно пройти по прямой (на одном уровне,
// без стен и ям) — точку B между ними выкидываем. Иначе существо шло бы «лесенкой».
export function smoothPath(isSolid, path, { height = 2, radius = 0.3 } = {}) {
  if (path.length <= 2) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !straight(isSolid, path[i], path[j], height, radius)) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

// Можно ли пройти по прямой от клетки a до клетки b: тот же уровень, по пути везде можно стоять
function straight(isSolid, a, b, height, radius) {
  if (a[1] !== b[1]) return false;
  const ax = a[0] + 0.5, az = a[2] + 0.5;
  const bx = b[0] + 0.5, bz = b[2] + 0.5;
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / 0.2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    // Проверяем углы «коробки» существа, а не только центр — чтобы не цеплять стены плечом
    for (const [ox, oz] of [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
      if (!canStand(isSolid, Math.floor(x + ox), a[1], Math.floor(z + oz), height)) return false;
    }
  }
  return true;
}

// ---------- Штурман одного существа ----------
export class Navigator {
  // version() — необязательно: число, которое меняется, когда меняется мир (поставили или убрали блок);
  // тогда путь сразу пересчитывается, а не когда существо упрётся в новый блок
  constructor({ isSolid, version = null, height = 2, maxStep = 1, maxDrop = 4, maxNodes = 1200, repath = 0.6, reach = 0.35 } = {}) {
    this.isSolid = isSolid;
    this.version = version;
    this.seenVersion = version?.();
    this.opts = { height, maxStep, maxDrop, maxNodes };
    this.repath = repath; // как часто (сек) пересчитывать путь, если цель движется
    this.reach = reach; //   насколько близко подойти к точке пути, чтобы взять следующую
    this.path = null; //     точки пути [[x, y, z], ...]; index — к какой идём сейчас
    this.index = 0;
    this.complete = false; // путь ведёт к самой цели (false — только поближе к ней)
    this.timer = Math.random() * repath; // разные существа думают в разные кадры
    this.goalCell = null;
    this.stuck = 0; //     сколько секунд почти не двигаемся
    this.lastPos = null;
  }

  // Клетка, где стоят ноги (если в прыжке или падает — ищем пол под ним)
  cellOf(p) {
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const y = Math.floor(p.y + 0.05);
    return [x, standY(this.isSolid, x, y, z, { height: this.opts.height, maxDrop: 8 }) ?? y, z];
  }

  // Пересчитать путь от сущности до точки
  plan(e, goal) {
    const start = this.cellOf(e.position);
    this.goalCell = this.cellOf(goal);
    const r = findPath(this.isSolid, start, this.goalCell, this.opts);
    this.complete = r.complete;
    this.path = smoothPath(this.isSolid, r.path, { height: this.opts.height, radius: e.radius });
    this.index = this.path.length > 1 ? 1 : 0; // точка 0 — где стоим сейчас
    this.timer = this.repath;
    this.stuck = 0;
  }

  // Каждый кадр. Возвращает, куда идти: { x, z } — точка в мире, jump — пора прыгать,
  // done — пришли (или ближе не подойти). null — пути нет совсем.
  update(e, goal, dt) {
    this.timer -= dt;
    const goalCell = this.cellOf(goal);
    const moved = !this.goalCell || goalCell.some((v, k) => v !== this.goalCell[k]);
    const changed = this.version && this.version() !== this.seenVersion;
    if (changed) this.seenVersion = this.version();
    if (!this.path || changed || (moved && this.timer <= 0) || this.stuck > 0.8) this.plan(e, goal);

    // Застряли (толкучка, кто-то поставил блок) — скоро пересчитаем
    const p = e.position;
    if (this.lastPos) {
      const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      this.stuck = d < 0.3 * dt ? this.stuck + dt : 0;
    }
    this.lastPos = { x: p.x, z: p.z };

    const path = this.path;
    if (!path?.length) return null;
    // Дошли до точки — берём следующую
    while (this.index < path.length - 1) {
      const [x, y, z] = path[this.index];
      const close = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) < this.reach;
      if (!close || Math.floor(p.y + 0.05) < y) break;
      this.index++;
    }
    const [x, y, z] = path[this.index];
    const tx = x + 0.5;
    const tz = z + 0.5;
    const last = this.index === path.length - 1;
    const dist = Math.hypot(tx - p.x, tz - p.z);
    // Следующая точка выше ног и мы уже рядом — прыгаем
    const jump = y > Math.floor(p.y + 0.05) && dist < 1.4;
    const done = last && dist < this.reach;
    if (done) this.stuck = 0; // стоим, потому что пришли, — это не «застряли»
    return { x: tx, z: tz, jump, done, complete: this.complete };
  }

  reset() {
    this.path = null;
  }
}
