// ============================================================
//  Пещеры (CAVES): в новом мире под островами — комнаты, соединённые туннелями 3 × 3, и проходы наверх.
//  Могут выходить за край острова — тогда там просто дыра в пустоту. В потолке — лампы (светятся).
//  В комнатах: сундук (с шансом; у сундука бывает охрана) или босс (редко; с сундуком не вместе).
//  Пока герой рядом, в комнатах появляются мобы. Комнаты и что в них уже было — в сохранении мира
//  (worldgen.caves). Сундук — та же модель, что на дальнем острове (tools/make-chest.js).
// ============================================================

import { CAVES, LIGHTS, MOB_MIX, SPAWN, ELITE, ISLANDS, FLOATING, CHEST_TIERS, CAVE_CHEST_TIERS, pickChestTier } from "../config.js";
import { Vec3, HALF } from "../../../engine/index.js";
import { mobGrowth, CREATURES } from "../creatures.js";
import { pickWeighted } from "./shared.js";

const between = (rnd, [a, b]) => a + Math.floor(rnd() * (b - a + 1));

export class CavesPart {
  // ---------- Генерация (новый мир) ----------
  generateCaves(rnd = Math.random) {
    const C = CAVES, T = this.terrain;
    if (!T) return;
    const rooms = [];
    for (const disc of T.discs) {
      // комнаты — под главным островом и под островом с логовом тролля (вход в пещеры — только через логово)
      const lairHere = T.lairs.some((l) => Math.hypot(l.x - disc.x, l.z - disc.z) < disc.r);
      const n = disc.main ? between(rnd, C.rooms) : lairHere && rnd() < C.islandRoom ? 1 : 0;
      for (let k = 0, tries = 0; k < n && tries < 40; tries++) {
        const w = between(rnd, C.size.w), d = between(rnd, C.size.d), h = between(rnd, C.size.h);
        // глубина: пол на depth ниже травы острова, но не ниже C.floor; конус под островом к низу сужается —
        // глубокую комнату ставим ближе к оси острова (в конус), мелкую — где угодно
        const lift = disc.lift || 0;
        const floor = Math.max(C.floor, lift - between(rnd, C.depth));
        const bottom = FLOATING.bottom, D = lift - bottom;
        const cone = D > 0 ? Math.max(0, 1 - Math.pow(Math.max(0, lift - floor) / D, 1 / 1.6)) : 1; // доля радиуса конуса на этой глубине
        const room = Math.max(w, d) / 2 + 1;
        const maxR = Math.max(0, disc.r * Math.min(0.75, cone) - room);
        const a = rnd() * Math.PI * 2, r = rnd() * maxR;
        const cx = Math.round(disc.x + Math.sin(a) * r), cz = Math.round(disc.z + Math.cos(a) * r);
        if (disc.main && Math.hypot(cx, cz) < C.keepClear && lift - floor < 12) continue; // не под местом появления (неглубоко)
        // по плану пересекаются — между ними по высоте не меньше высоты комнаты + 4 блока скалы (не одна над другой)
        if (rooms.some((o) => Math.abs(o.x - cx) < (o.w + w) / 2 + 4 && Math.abs(o.z - cz) < (o.d + d) / 2 + 4 && Math.abs(o.y - floor) < Math.max(o.h, h) + 4)) continue;
        rooms.push({ x: cx, z: cz, y: floor, w, d, h, kind: "plain", disc: T.discs.indexOf(disc), ledge: rnd() < C.ledge ? Math.floor(rnd() * 4) : -1 });
        k++;
      }
    }
    if (!rooms.length) return;
    // что в комнате: босс (редко) или сундук (с охраной — иногда); вместе — нельзя
    for (const room of rooms) {
      if (rnd() < C.boss) room.kind = "boss";
      else if (rnd() < C.chest) {
        room.kind = "chest";
        room.guard = rnd() < C.guard ? (rnd() < 0.5 ? "elites" : "miniboss") : null;
      }
    }
    // форма: простые комнаты — коробка / купол / с ямой (CAVES.shapes); с сундуком и боссом — коробка или купол
    for (const room of rooms) {
      const w = { ...C.shapes };
      if (room.kind !== "plain") delete w.trap;
      room.shape = pickWeighted(w);
    }
    this.genRooms = rooms; // туннели обходят комнаты (pathHits)
    this.genPaths = []; //   все точки проходов (repairPaths)
    for (const room of rooms) this.carveRoom(room);
    // Туннели: каждую комнату — к ближайшей уже соединённой (дерево), острова — тоже (туннель через пустоту — дыра)
    const linked = [rooms[0]];
    for (const room of rooms.slice(1)) {
      const near = linked.reduce((a, b) => (Math.hypot(b.x - room.x, b.z - room.z) < Math.hypot(a.x - room.x, a.z - room.z) ? b : a));
      if (room.disc === near.disc || rnd() < C.bridgeIslands) this.carveTunnel(near, room);
      linked.push(room);
    }
    // Логово тролля — всегда соединено с пещерами: ход из задней стены зала (напротив входа-коридора) к ближайшей комнате
    const reached = new Set();
    for (const lair of T.lairs) {
      const t = lair.tunnel;
      const bx = t ? t.x0 - t.x1 : 1, bz = t ? t.z0 - t.z1 : 0, bl = Math.hypot(bx, bz) || 1;
      const back = { x: Math.round(lair.x + (bx / bl) * (lair.r - 1)), z: Math.round(lair.z + (bz / bl) * (lair.r - 1)), y: lair.y };
      const near = rooms.reduce((a, b) => (Math.hypot(b.x - back.x, b.z - back.z) < Math.hypot(a.x - back.x, a.z - back.z) ? b : a));
      this.carveTunnel(back, near);
      reached.add(near.disc);
    }
    // Вход в пещеры — один: через логово тролля. Логова нет — один проход наверх из комнаты главного острова,
    // не ближе exitFrom × радиуса острова к центру (дальняя от центра, если такой нет)
    const main = T.discs.find((d) => d.main);
    const lairOnMain = T.lairs.some((l) => main && Math.hypot(l.x - main.x, l.z - main.z) < main.r);
    // логово на маленьком острове — до комнат главного из него не дойти (между островами пустота): тогда у
    // главного острова тоже один вход
    if (!lairOnMain) {
      const R = main?.r || 50;
      const own = rooms.filter((r) => T.discs[r.disc] === main);
      const far = own.filter((r) => Math.hypot(r.x - main.x, r.z - main.z) >= C.exitFrom * R);
      const room = far.length ? far[Math.floor(rnd() * far.length)] : own.reduce((a, b) => (Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) ? b : a), own[0]);
      if (room) this.carveExit(room, rnd);
    }
    // все комнаты — одной сетью (комнаты одного острова и так связаны; под островом логова — через логово)
    this.repairPaths(rooms);
    for (const room of rooms) if (room.kind === "chest") room.chest = { x: room.x - 1, y: room.y, z: room.z, opened: false, tier: pickChestTier(CAVE_CHEST_TIERS, rnd) };
    this.caves = { rooms };
    this.engine.log(`пещеры: ${rooms.length} комнат — ${rooms.filter((r) => r.kind === "chest").length} с сундуком, ${rooms.filter((r) => r.kind === "boss").length} с боссом`);
  }

  // Лампа в потолке прохода — только в скале: над проходом пусто (вышел за конус острова, в воздух) — лампы нет
  caveLamp(x, y, z) {
    if (!this.world.has(x, y, z)) return;
    this.world.remove(x, y, z);
    this.world.place(x, y, z, LIGHTS.lamp.color);
  }

  // Комната: форма room.shape — "box" (коробка, бывает уступ), "dome" (купол: пол плоский, стены и свод —
  // скруглённые), "trap" (коробка, поперёк середины — яма 2 блока шириной с шипами на дне: перепрыгнуть)
  carveRoom(r) {
    const x0 = r.x - Math.floor(r.w / 2), z0 = r.z - Math.floor(r.d / 2);
    const shape = r.shape || "box";
    for (let i = 0; i < r.w; i++) for (let k = 0; k < r.d; k++) for (let j = 0; j < r.h; j++) {
      if (shape === "dome") {
        const dx = (i + 0.5 - r.w / 2) / (r.w / 2), dz = (k + 0.5 - r.d / 2) / (r.d / 2), dy = (j + 0.5) / r.h;
        if (dx * dx + dz * dz > 1.05 || (j > 0 && dx * dx + dz * dz + dy * dy > 1.15)) continue; // пол — весь круг
      }
      this.world.remove(x0 + i, r.y + j, z0 + k);
    }
    if (shape === "trap") this.carvePit(r, x0, z0);
    // уступ: вдоль одной стены (ledge — какой) — возвышение в 2 блока шириной в треть комнаты, со ступенькой
    // (полублок) к нему: внутри комнаты свои уровни. Только у коробки
    if (shape === "box" && r.ledge >= 0 && r.h >= 5) {
      const along = r.ledge < 2; // вдоль x или z
      const depth = Math.max(2, Math.floor((along ? r.d : r.w) / 3));
      for (let i = 0; i < r.w; i++) for (let k = 0; k < r.d; k++) {
        const t = r.ledge === 0 ? k : r.ledge === 1 ? r.d - 1 - k : r.ledge === 2 ? i : r.w - 1 - i; // от стены уступа
        if (t >= depth + 1) continue;
        const stone = [128, 124, 120];
        if (t < depth) for (let j = 0; j < 2; j++) this.world.place(x0 + i, r.y + j, z0 + k, stone);
        else if ((along ? i : k) % 3 === 1) { // ступеньки к уступу: блок + полублок
          this.world.place(x0 + i, r.y, z0 + k, stone);
          this.world.place(x0 + i, r.y + 1, z0 + k, stone, HALF);
        }
      }
    }
    // лампы в потолке: по углам-внутри и в центре (купол — у центра: углы — в скале)
    const lamps = shape === "dome"
      ? [[Math.floor(r.w / 2), Math.floor(r.d / 2)], [Math.floor(r.w / 2) - 2, Math.floor(r.d / 2)], [Math.floor(r.w / 2) + 2, Math.floor(r.d / 2)]]
      : [[1, 1], [r.w - 2, 1], [1, r.d - 2], [r.w - 2, r.d - 2], [Math.floor(r.w / 2), Math.floor(r.d / 2)]];
    for (const [i, k] of lamps) {
      let y = r.y + r.h; // свод над этой клеткой (у купола — ниже)
      for (let j = r.y + 1; j <= r.y + r.h + 2; j++) if (this.world.has(x0 + i, j, z0 + k)) { y = j; break; }
      this.caveLamp(x0 + i, y, z0 + k);
    }
  }

  // Яма с шипами поперёк середины комнаты-ловушки: 2 клетки шириной (вдоль длинной стороны), 2 вглубь, на дне —
  // шипы (полублоки CAVES.pit.color: наступил — урон, updateCaves). С одного края — ступенька наверх
  carvePit(r, x0, z0) {
    const P = CAVES.pit, alongX = r.w >= r.d; // яма поперёк длинной стороны
    const len = alongX ? r.w : r.d, cross = alongX ? r.d : r.w, mid = Math.floor(len / 2) - 1;
    for (let a = mid; a < mid + P.width; a++) for (let c = 0; c < cross; c++) {
      const x = alongX ? x0 + a : x0 + c, z = alongX ? z0 + c : z0 + a;
      for (let j = 1; j <= P.depth; j++) this.world.remove(x, r.y - j, z);
      if (c === 0) this.world.place(x, r.y - P.depth, z, [96, 92, 90]); // ступенька: выбраться
      else this.world.place(x, r.y - P.depth, z, P.color, HALF);
    }
    r.pit = alongX ? { x0: x0 + mid, x1: x0 + mid + P.width, z0, z1: z0 + cross } : { x0, x1: x0 + cross, z0: z0 + mid, z1: z0 + mid + P.width };
  }

  // Шипы в ямах: герой на дне ямы — урон CAVES.pit.damage макс. HP раз в every с
  updatePits(dt) {
    const p = this.player, P = CAVES.pit;
    if (!p?.alive) return;
    this.pitTimer = Math.max(0, (this.pitTimer || 0) - dt);
    for (const room of this.caves.rooms) {
      const t = room.pit;
      if (!t || p.position.x < t.x0 || p.position.x >= t.x1 || p.position.z < t.z0 || p.position.z >= t.z1) continue;
      if (p.position.y > room.y - P.depth + 0.6 || !p.onGround || this.pitTimer > 0) continue;
      this.pitTimer = P.every;
      p.damage(Math.max(1, Math.round(p.stats.maxHp * P.damage)));
      this.engine.sound.play("hurt");
      this.engine.log(`шипы в яме: -${Math.round(p.stats.maxHp * P.damage)} HP`);
    }
  }

  // Задевает ли путь pts ([x, y, z]) чужую комнату (не из skip): первая такая или null
  pathHits(pts, skip) {
    for (const [x, y, z] of pts) {
      for (const o of this.genRooms || []) {
        if (skip.includes(o)) continue;
        if (Math.abs(x - o.x) <= o.w / 2 + 2 && Math.abs(z - o.z) <= o.d / 2 + 2 && y + 3 >= o.y - 1 && y <= o.y + o.h + 1) return o;
      }
    }
    return null;
  }

  // Проходит ли путь вплотную над / под уже прорытым проходом (ближе 2 клеток по плану и на 1–3 блока выше / ниже):
  // там кисть одного выбивает пол другому — уступы в 2 блока. На одном уровне — можно (просто развилка)
  pathCrosses(pts) {
    const all = this.genPaths;
    if (!all?.length) return false;
    const idx = (this.genIndex ||= new Map());
    if (this.genIndexed !== all.length) { // досчитать новые проходы
      for (let i = this.genIndexed || 0; i < all.length; i++) for (const [x, y, z] of all[i]) {
        const k = x + "," + z;
        (idx.get(k) || idx.set(k, []).get(k)).push(y);
      }
      this.genIndexed = all.length;
    }
    for (const [x, y, z] of pts) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const ys = idx.get(x + dx + "," + (z + dz));
      if (ys?.some((o) => Math.abs(o - y) >= 1 && Math.abs(o - y) <= 3)) return true;
    }
    return false;
  }

  // Клетки ломаной от a до b (сначала по x — xFirst, иначе по z); крутой перепад — петля сбоку (набрать длину):
  // уклон slope блока на клетку (CAVES.slope: 0.5–1 — 1–2 блока на 2 клетки). Вернёт [[x, y, z], ...]
  tunnelPath(a, b, xFirst, slope) {
    const cells = [];
    const walk = (x, z, tx, tz) => {
      const sx = Math.sign(tx - x), sz = Math.sign(tz - z);
      while (x !== tx) { x += sx; cells.push([x, z]); }
      while (z !== tz) { z += sz; cells.push([x, z]); }
    };
    cells.push([a.x, a.z]);
    if (xFirst) { walk(a.x, a.z, b.x, a.z); walk(b.x, a.z, b.x, b.z); } else { walk(a.x, a.z, a.x, b.z); walk(a.x, b.z, b.x, b.z); }
    const need = Math.ceil(Math.abs(b.y - a.y) / slope) + 1;
    if (cells.length < need) {
      // петля из середины: вбок на D, вдоль на 4 (между ходами — стенка в 1 блок), назад на D
      const m = Math.floor(cells.length / 2), [mx, mz] = cells[m], [nx, nz] = cells[Math.min(cells.length - 1, m + 1)];
      const ux = Math.sign(nx - mx), uz = Math.sign(nz - mz); // куда шёл ход
      const px = uz !== 0 ? 1 : 0, pz = ux !== 0 ? 1 : 0; //     вбок
      const D = Math.ceil((need - cells.length) / 2) + 2;
      const loop = [];
      let x = mx, z = mz;
      for (let t = 0; t < D; t++) { x += px; z += pz; loop.push([x, z]); }
      for (let t = 0; t < 4; t++) { x += ux || 0; z += uz || 0; loop.push([x, z]); }
      for (let t = 0; t < D; t++) { x -= px; z -= pz; loop.push([x, z]); }
      const rest = cells.slice(m + 1).filter(([cx, cz]) => Math.abs(cx - mx) * Math.abs(ux || 0) + Math.abs(cz - mz) * Math.abs(uz || 0) > 4);
      cells.splice(m + 1, cells.length, ...loop, ...rest);
    }
    const n = cells.length;
    return cells.map(([x, z], i) => [x, Math.round(a.y + ((b.y - a.y) * i) / Math.max(1, n - 1)), z]);
  }

  // Туннель 3 × 3 от a до b: из двух ломаных (x потом z / z потом x) — та, что не задевает чужие комнаты; обе
  // задевают — ход до первой задетой комнаты и от неё дальше (комнату не прорезаем). Подъёмы — полублоками
  carveTunnel(a, b, depth = 0) {
    const slope = CAVES.slope[0] + Math.random() * (CAVES.slope[1] - CAVES.slope[0]);
    const skip = [a, b];
    const paths = [true, false].map((xf) => this.tunnelPath(a, b, xf, slope));
    let pts = paths.find((p) => !this.pathHits(p, skip) && !this.pathCrosses(p)) || paths.find((p) => !this.pathHits(p, skip));
    if (!pts) {
      const via = this.pathHits(paths[0], skip);
      if (via && depth < 3) {
        this.carveTunnel(a, via, depth + 1);
        this.carveTunnel(via, b, depth + 1);
        return;
      }
      pts = paths[0];
    }
    this.carvePath(pts);
  }

  // Вырезать проход 3 × 3 × 3 по точкам pts ([x, y, z] — где ноги). Кисть нижней точки не трогает пол соседней
  // точки повыше (в клетке, где стоит точка пути, не убираем ниже её y) — иначе пол «проваливался» и рядом
  // получался уступ в 2 блока. Потом — лампы и подъёмы полублоками
  carvePath(pts) {
    this.genPaths?.push(pts);
    const own = new Map(); // клетка пути → самый низкий y точки в ней
    for (const [x, y, z] of pts) {
      const k = x + "," + z;
      own.set(k, Math.min(own.get(k) ?? Infinity, y));
    }
    pts.forEach(([x, y, z], i) => {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const low = own.get(x + dx + "," + (z + dz)) ?? -Infinity;
        for (let j = 0; j < 3; j++) if (y + j >= low) this.world.remove(x + dx, y + j, z + dz);
      }
      if (i % CAVES.lampEvery === 0) this.caveLamp(x, y + 3, z);
    });
    this.halfSteps(pts);
  }

  // После всех проходов: другой проход (ниже, наискосок) мог выбить пол у точки пути — вернуть его (камень под
  // ногами), если там не идёт чей-то проход ниже (его высоту не трогаем) и это не яма-ловушка комнаты. Потом —
  // заново подъёмы полублоками
  repairPaths(rooms) {
    const all = (this.genPaths || []).flat(), at = new Map();
    for (const [x, y, z] of all) (at.get(x + "," + z) || at.set(x + "," + z, []).get(x + "," + z)).push(y);
    const inPit = (x, z) => rooms.some((r) => r.pit && x >= r.pit.x0 && x < r.pit.x1 && z >= r.pit.z0 && z < r.pit.z1);
    let fixed = 0;
    for (const [x, y, z] of all) {
      if (this.world.has(x, y - 1, z) || inPit(x, z)) continue;
      if (at.get(x + "," + z).some((o) => o < y && o > y - 3)) continue; // чужой проход ниже вплотную — не закрываем (2 блока над ним — оставим)
      if (this.world.place(x, y - 1, z, [118, 112, 108])) fixed++;
    }
    this.caveNiches(rooms, all);
    for (const pts of this.genPaths || []) this.halfSteps(pts);
    if (fixed) this.engine.log(`пещеры: пол проходов поправлен в ${fixed} клетках`);
    this.genPaths = null;
    this.genIndex = null;
    this.genIndexed = 0;
  }

  // Разнообразие: стены и потолок пещер (блок у пустоты пещеры) с шансом CAVES.niche выбиты — ниши, неровности.
  // Пол не трогаем (над ним пусто — по нему ходят), лампы — тоже; насквозь наружу не пробиваем (за блоком — скала)
  caveNiches(rooms, pts) {
    const W = this.world, cells = new Set();
    const add = (x, y, z) => cells.add(x + "," + y + "," + z);
    for (const r of rooms) {
      const x0 = r.x - Math.floor(r.w / 2) - 1, z0 = r.z - Math.floor(r.d / 2) - 1;
      for (let i = 0; i < r.w + 2; i++) for (let k = 0; k < r.d + 2; k++) for (let j = 0; j <= r.h; j++) add(x0 + i, r.y + j, z0 + k);
    }
    for (const [x, y, z] of pts) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let j = 0; j <= 3; j++) add(x + dx, y + j, z + dz);
    const lamp = (b) => !!W.emitterOf?.(b);
    let n = 0;
    for (const key of cells) {
      const [x, y, z] = key.split(",").map(Number);
      const b = W.get(x, y, z);
      if (!b || lamp(b) || !W.has(x, y - 1, z) && !W.has(x, y + 1, z)) continue;
      if (!W.has(x, y + 1, z)) continue; // пол (над ним пусто) — не трогаем
      // у пустоты пещеры: сбоку (стена) — за блоком с той стороны скала; снизу (потолок) — над ним скала
      let open = null;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) if (!W.has(x + dx, y + dy, z + dz)) { open = [dx, dy, dz]; break; }
      if (!open || !W.has(x - open[0], y - open[1], z - open[2])) continue;
      if (Math.random() >= CAVES.niche) continue; // шанс — на каждый блок стены / потолка
      W.remove(x, y, z);
      n++;
    }
    if (n) this.engine.log(`пещеры: ${n} ниш в стенах и потолке`);
  }

  // Подъёмы в проходе — полублоками: на полу прохода (3 × 3 вокруг каждой точки) у уступа в 1 блок
  // и потолок — полублоками сверху (align верх): у уступа потолка в 1 блок (над верхним рядом прохода, y + 2)
  halfSteps(pts) {
    for (const [x, y, z] of pts) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      this.world.halfStep(x + dx, y, z + dz);
      this.world.halfStepTop?.(x + dx, y + 2, z + dz);
    }
  }

  // Проход наверх: от края комнаты наружу, вверх на slope блока за шаг (1–2 на 2 клетки), пока не вышли на
  // поверхность. Направление — из 8 случайных то, где путь не задевает чужие комнаты
  carveExit(r, rnd) {
    const slope = CAVES.slope[0] + rnd() * (CAVES.slope[1] - CAVES.slope[0]);
    // Путь — по клеткам сетки, без повторов и без шагов наискосок (между ними — клетка-угол на той же высоте):
    // иначе округление давало «стоим в той же клетке, а пол выше» — уступ в 2 блока
    const plan = (a) => {
      const ux = Math.sin(a), uz = Math.cos(a), pts = [], r0 = Math.max(r.w, r.d) / 2;
      let y = r.y, px = null, pz = null;
      const add = (x, z) => {
        pts.push([x, Math.floor(y), z]);
        px = x;
        pz = z;
      };
      for (let t = 0; t < 80 && pts.length < 120; t += 0.25) {
        const x = Math.round(r.x + ux * (r0 + t)), z = Math.round(r.z + uz * (r0 + t));
        if (x === px && z === pz) continue; // та же клетка
        if (px !== null && x !== px && z !== pz) add(x, pz); // наискосок — через угол, на той же высоте
        else if (px !== null) y += slope; //                     новая клетка вперёд — выше на slope
        add(x, z);
        if (Math.floor(y) >= this.groundHeight(x, z)) break; // вышли наружу
      }
      return pts;
    };
    let pts = null;
    for (let i = 0; i < 8 && !pts; i++) {
      const p = plan(rnd() * Math.PI * 2);
      if (!this.pathHits(p, [r]) && (!this.pathCrosses(p) || i >= 5)) pts = p; // сначала — без пересечений с проходами
      else if (i === 7) pts = p;
    }
    this.carvePath(pts);
  }

  // ---------- Жизнь пещер ----------
  roomOf(p) {
    return this.caves?.rooms.find((r) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2 && p.y >= r.y - 0.5 && p.y < r.y + r.h);
  }

  // Каждый тик (хост / одиночная игра): мобы в комнатах рядом с героями, охрана сундуков, боссы
  updateCaves(dt) {
    if (!this.caves || this.duel) return;
    this.updatePits(dt); // шипы в ямах — у каждого своего героя
    if (this.role === "client") return;
    const C = CAVES, heroes = this.heroes();
    const near = (r, d) => heroes.some((h) => Math.hypot(h.position.x - r.x, h.position.y - r.y, h.position.z - r.z) < d);
    for (const room of this.caves.rooms) {
      if (!near(room, C.spawn.radius)) continue;
      if (room.kind === "chest" && room.guard && !room.guardDone && near(room, C.trigger)) this.spawnGuard(room);
      if (room.kind === "boss" && !room.bossDone && near(room, C.trigger)) this.spawnRoomBoss(room);
      room.timer = (room.timer ?? C.spawn.every * Math.random()) - dt;
      if (room.timer > 0) continue;
      room.timer = C.spawn.every;
      const inside = this.entities.list.filter((e) => e.kind === "mob" && e.alive && this.roomOf(e.position) === room).length;
      const all = this.entities.list.filter((e) => e.kind === "mob" && e.alive && !e.boss).length;
      if (inside >= C.spawn.max || all >= SPAWN.max) continue;
      this.caveMob(room, pickWeighted(MOB_MIX), {}, { minDist: C.spawn.minDist }); // не вплотную к герою
    }
  }

  // Клетка пола комнаты для моба: tries случайных; не ближе minDist к любому герою (нет такой — null).
  // near — из подходящих взять ближайшую к этой точке (охрана — у сундука)
  caveSpot(room, { minDist = 0, near = null, tries = 10 } = {}) {
    const heroes = this.heroes();
    let best = null, bestD = Infinity;
    for (let i = 0; i < tries; i++) {
      const x = room.x + (Math.random() - 0.5) * (room.w - 2), z = room.z + (Math.random() - 0.5) * (room.d - 2);
      if (heroes.some((h) => Math.hypot(h.position.x - x, h.position.y - room.y, h.position.z - z) < minDist)) continue;
      if (!near) return { x, z };
      const d = Math.hypot(x - near.x, z - near.z);
      if (d < bestD) { best = { x, z }; bestD = d; }
    }
    return best;
  }

  // Моб в комнате room: на полу, в случайной клетке
  // spot — { minDist, near, tries } для caveSpot; места нет — моб не появляется (null)
  caveMob(room, type, extra = {}, spot = {}) {
    if (CREATURES[type]?.kind && CREATURES[type].kind !== "mob") return null; // в пещерах — только враги (не мирные)
    if (type === "bat") return null; //                                             и не летающие
    const at = this.caveSpot(room, spot);
    if (!at) return null;
    const { x, z } = at;
    const growth = mobGrowth(this.spawner.spawned++);
    const e = this.spawn(type, { x, y: room.y, z, yaw: Math.random() * Math.PI * 2, ...growth, ...extra });
    if (e) e.cave = true;
    return e;
  }

  // Охрана сундука: «elites» — 1–2 элиты + обычные (всего 4); «miniboss» — минибосс и обычный стрелок
  // Появляются у сундука, не ближе CAVES.guardMinDist к героям (нет места — у сундука как получится); не пропадают
  // (guardOf), сундук не открыть, пока охрана жива. Упали в бездну — погибли, тоже считается
  spawnGuard(room) {
    room.guardDone = true;
    const c = room.chest, near = c ? { x: c.x + 1, z: c.z + 0.5 } : null;
    const id = this.caves.rooms.indexOf(room) + 1; // номер комнаты (с 1): охрана помнит, чей сундук
    const put = (type, extra = {}) => {
      const e = this.caveMob(room, type, extra, { minDist: CAVES.guardMinDist, near, tries: 24 }) || this.caveMob(room, type, extra, { near, tries: 24 });
      if (e) e.guardOf = id;
      return e;
    };
    if (room.guard === "miniboss") {
      put("champion");
      put("skeleton", { ranged: true });
    } else {
      const strong = 1 + Math.floor(Math.random() * 2);
      const auras = Object.keys(ELITE.auras);
      for (let i = 0; i < 4; i++) {
        const e = put(pickWeighted(MOB_MIX));
        if (e && i < strong) this.makeElite(e, auras[Math.floor(Math.random() * auras.length)]);
      }
    }
    this.engine.sound.play("growl", { volume: 1 });
    this.engine.log(`пещера: охрана сундука (${room.guard})`);
  }

  // Босс комнаты: тролль или лич, один раз (не возвращается)
  spawnRoomBoss(room) {
    room.bossDone = true;
    const type = Math.random() < 0.5 ? "troll" : "lich";
    const e = this.spawn(type, { x: room.x + 0.5, y: room.y, z: room.z + 0.5, yaw: Math.random() * Math.PI * 2 });
    if (!e) return;
    e.roomBoss = true;
    this.scaleBoss?.(e);
    e.stats.hp = e.stats.maxHp;
    this.engine.toast(`${this.tr(e.name)} ${this.tr("AWAKENS")}!`, 2500);
    this.engine.log(`пещера: босс ${e.name}`);
  }

  // ---------- Сундуки в комнатах ----------
  caveChestEntities() {
    const list = [];
    for (const room of this.caves?.rooms || []) {
      const c = room.chest;
      if (c?.opened && !c.items) c.gone = true; // открыт до хранилищ (старое сохранение)
      if (!c || c.gone) continue;
      if (!c.ent) {
        c.ent = { position: new Vec3(c.x + 1, c.y, c.z + 0.5), yaw: 0, roll: 0, alive: true, hurtTime: Infinity, deadTime: 0, view: null };
        this.game.models.attach(c.ent, c.tier ? "chest-" + c.tier : "chest"); // вид сундука (старые — обычный)
      }
      c.ent.view?.animator.setBase(c.opened ? "Opened" : "Closed");
      list.push(c.ent);
    }
    return list;
  }

  tryCaveChest() {
    const p = this.player.position;
    for (const room of this.caves?.rooms || []) {
      const c = room.chest;
      if (!c || c.gone) continue;
      if (Math.hypot(c.x + 1 - p.x, c.z + 0.5 - p.z) > ISLANDS.chest.reach + 0.5 || Math.abs(p.y - c.y) > 3) continue;
      // охрана жива — не открыть (охрану ещё не звали — позвать)
      if (room.guard && !room.guardDone) this.spawnGuard(room);
      const id = this.caves.rooms.indexOf(room) + 1;
      if (this.entities.list.some((e) => e.alive && e.guardOf === id)) {
        this.engine.toast(this.tr("KILL THE GUARDS FIRST"), 2000);
        return true;
      }
      // вещь: случайного тира из тех, что есть (scene/islands.js → openChestStore)
      const T = CHEST_TIERS[c.tier] || CHEST_TIERS.steel;
      this.openChestStore(c, { coins: Math.round((CAVES.reward.coins + CAVES.reward.perLevel * this.experience.level) * T.coins), tier: (tiers) => tiers[Math.floor(Math.random() * tiers.length)], view: () => c.ent?.view, rarity: T.rarity });
      return true;
    }
    return false;
  }

  // В сохранение: комнаты (без моделей)
  cavesJSON() {
    if (!this.caves) return null;
    return { rooms: this.caves.rooms.map(({ chest, ...r }) => ({ ...r, timer: undefined, ...(chest ? { chest: { x: chest.x, y: chest.y, z: chest.z, opened: !!chest.opened, ...(chest.tier ? { tier: chest.tier } : {}), ...(chest.items ? { items: chest.items } : {}), ...(chest.gone ? { gone: true } : {}) } } : {}) })) };
  }
}
