// ============================================================
//  Пещеры (CAVES): в новом мире под островами — комнаты, соединённые туннелями 3 × 3, и проходы наверх.
//  Могут выходить за край острова — тогда там просто дыра в пустоту. В потолке — лампы (светятся).
//  В комнатах: сундук (с шансом; у сундука бывает охрана) или босс (редко; с сундуком не вместе).
//  Пока герой рядом, в комнатах появляются мобы. Комнаты и что в них уже было — в сохранении мира
//  (worldgen.caves). Сундук — та же модель, что на дальнем острове (tools/make-chest.js).
// ============================================================

import { CAVES, LIGHTS, MOB_MIX, SPAWN, ELITE, ISLANDS, FLOATING } from "../config.js";
import { Vec3, HALF } from "../../../engine/index.js";
import { mobGrowth } from "../creatures.js";
import { pickWeighted } from "./shared.js";

const between = (rnd, [a, b]) => a + Math.floor(rnd() * (b - a + 1));

export class CavesPart {
  // ---------- Генерация (новый мир) ----------
  generateCaves(rnd = Math.random) {
    const C = CAVES, T = this.terrain;
    if (!T) return;
    const rooms = [];
    for (const disc of T.discs) {
      const n = disc.main ? between(rnd, C.rooms) : rnd() < C.islandRoom ? 1 : 0;
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
        if (rooms.some((o) => Math.abs(o.x - cx) < (o.w + w) / 2 + 4 && Math.abs(o.z - cz) < (o.d + d) / 2 + 4 && Math.abs(o.y - floor) < 8)) continue;
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
    // Проходы наверх — нечасто: у острова, куда нет хода из логова, — один обязательный; дальше — с шансом exitChance
    const seen = new Set(reached);
    for (const room of rooms) {
      const need = !seen.has(room.disc);
      if (!need && rnd() >= C.exitChance) continue;
      seen.add(room.disc);
      this.carveExit(room, rnd);
    }
    for (const room of rooms) if (room.kind === "chest") room.chest = { x: room.x - 1, y: room.y, z: room.z, opened: false };
    this.caves = { rooms };
    this.engine.log(`пещеры: ${rooms.length} комнат — ${rooms.filter((r) => r.kind === "chest").length} с сундуком, ${rooms.filter((r) => r.kind === "boss").length} с боссом`);
  }

  // убрать блок и, если нужно, поставить лампу (в потолке)
  caveLamp(x, y, z) {
    this.world.remove(x, y, z);
    this.world.place(x, y, z, LIGHTS.lamp.color);
  }

  carveRoom(r) {
    const x0 = r.x - Math.floor(r.w / 2), z0 = r.z - Math.floor(r.d / 2);
    for (let i = 0; i < r.w; i++) for (let k = 0; k < r.d; k++) for (let j = 0; j < r.h; j++) this.world.remove(x0 + i, r.y + j, z0 + k);
    // уступ: вдоль одной стены (ledge — какой) — возвышение в 2 блока шириной в треть комнаты, со ступенькой
    // (полублок) к нему: внутри комнаты свои уровни
    if (r.ledge >= 0 && r.h >= 5) {
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
    // лампы в потолке: по углам-внутри и в центре
    for (const [i, k] of [[1, 1], [r.w - 2, 1], [1, r.d - 2], [r.w - 2, r.d - 2], [Math.floor(r.w / 2), Math.floor(r.d / 2)]]) this.caveLamp(x0 + i, r.y + r.h, z0 + k);
  }

  // Туннель 3 × 3 от комнаты a до b: сначала по x, потом по z; высота пола плавно от одной к другой
  carveTunnel(a, b) {
    const pts = [];
    const sx = Math.sign(b.x - a.x) || 1, sz = Math.sign(b.z - a.z) || 1;
    for (let x = a.x; x !== b.x; x += sx) pts.push([x, a.z]);
    for (let z = a.z; z !== b.z + sz; z += sz) pts.push([b.x, z]);
    pts.forEach(([x, z], i) => {
      const y = Math.round(a.y + ((b.y - a.y) * i) / Math.max(1, pts.length - 1));
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let j = 0; j < 3; j++) this.world.remove(x + dx, y + j, z + dz);
      if (i % CAVES.lampEvery === 0) this.caveLamp(x, y + 3, z);
      pts[i] = [x, y, z];
    });
    this.halfSteps(pts);
  }

  // Подъёмы в проходе — полублоками: на полу прохода (3 × 3 вокруг каждой точки) у уступа в 1 блок
  halfSteps(pts) {
    for (const [x, y, z] of pts) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.world.halfStep(x + dx, y, z + dz);
  }

  // Проход наверх: от края комнаты наружу, на ступеньку выше за шаг, пока не вышли на поверхность
  carveExit(r, rnd) {
    const a = rnd() * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
    let y = r.y;
    const pts = [];
    for (let t = 0; t < 60; t++) {
      const x = Math.round(r.x + ux * (Math.max(r.w, r.d) / 2 + t)), z = Math.round(r.z + uz * (Math.max(r.w, r.d) / 2 + t));
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let j = 0; j < 3; j++) this.world.remove(x + dx, y + j, z + dz);
      if (t % CAVES.lampEvery === 0) this.caveLamp(x, y + 3, z);
      pts.push([x, y, z]);
      if (y >= this.groundHeight(x, z)) break; // вышли наружу
      y++;
    }
    this.halfSteps(pts);
  }

  // ---------- Жизнь пещер ----------
  roomOf(p) {
    return this.caves?.rooms.find((r) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2 && p.y >= r.y - 0.5 && p.y < r.y + r.h);
  }

  // Каждый тик (хост / одиночная игра): мобы в комнатах рядом с героями, охрана сундуков, боссы
  updateCaves(dt) {
    if (!this.caves || this.duel || this.role === "client") return;
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
        this.game.models.attach(c.ent, "chest");
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
      this.openChestStore(c, { coins: CAVES.reward.coins + CAVES.reward.perLevel * this.experience.level, tier: (tiers) => tiers[Math.floor(Math.random() * tiers.length)], view: () => c.ent?.view });
      return true;
    }
    return false;
  }

  // В сохранение: комнаты (без моделей)
  cavesJSON() {
    if (!this.caves) return null;
    return { rooms: this.caves.rooms.map(({ chest, ...r }) => ({ ...r, timer: undefined, ...(chest ? { chest: { x: chest.x, y: chest.y, z: chest.z, opened: !!chest.opened, ...(chest.items ? { items: chest.items } : {}), ...(chest.gone ? { gone: true } : {}) } } : {}) })) };
  }
}
