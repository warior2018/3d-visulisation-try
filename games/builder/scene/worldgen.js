// ============================================================
//  Сцена «мир», часть: Мир: рельеф, постройки, камни, острова.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { WORLDGEN, PALETTE, LIGHTS } from "../config.js";
import { randomInt, Terrain, scatter, flattenArea, buildHouse, buildBigHouse, buildRuins, buildCastle, buildTower, buildCratePile, buildTree } from "../../../engine/index.js";
import { DEFAULT_SPAWNS, RESIDENTS } from "../creatures.js";
import { ITEMS, isWeapon, isArmor, itemName, isUsable } from "../items.js";

export class WorldgenPart {
  // ---------- Мир: постройки и камни ----------

  // Высота земли (рельефа) в столбике — без построек и того, что поставил герой. Плоский мир — 0
  // Высота рельефа острова без подъёма (lift): для «на скалах ли», «на острове ли»
  // Лампы под потолком: в столбике (x, z) от пола y вверх — под каждым потолком, если до него ≥ 3 клеток воздуха
  hangLamps(x, y, z) {
    const v = this.world;
    let air = 0;
    for (let yy = y; yy < y + 24; yy++) {
      if (!v.has(x, yy, z)) { air++; continue; }
      if (air >= 3 && yy > y) v.place(x, yy - 1, z, LIGHTS.lamp.color);
      air = 0;
    }
  }

  groundRel(x, z) {
    return this.terrain ? this.terrain.relHeight(Math.floor(x) + 0.5, Math.floor(z) + 0.5) : 0;
  }

  groundHeight(x, z) {
    return this.terrain ? this.terrain.height(Math.floor(x) + 0.5, Math.floor(z) + 0.5) : 0;
  }

  // Стоит ли здесь постройка (дом, башня, дерево, блоки героя): поверхность выше земли больше чем на блок.
  // Туда не спавним мобов и камни (иначе окажутся на крыше)
  onStructure(x, z) {
    return this.world.surfaceY(x, z) - this.groundHeight(x, z) > 1;
  }

  // Новый мир: рельеф (холмы, плато, гора), на нём постройки и деревья
  // (движок: Terrain, structures; правила — WORLDGEN в config.js). Зерно рельефа — в сохранении
  // Рядом ли с проходом к логову (и с его выходом, с запасом pad) — там не строим и не сажаем деревья
  nearLairTunnel(x, z, pad = 3) {
    return (this.terrain?.lairs || []).some((l) => {
      const t = l.tunnel;
      if (!t) return false;
      const sx = t.x1 - t.x0, sz = t.z1 - t.z0, len2 = sx * sx + sz * sz || 1;
      const k = Math.max(0, Math.min(1, ((x + 0.5 - t.x0) * sx + (z + 0.5 - t.z0) * sz) / len2));
      return Math.hypot(x + 0.5 - (t.x0 + sx * k), z + 0.5 - (t.z0 + sz * k)) < pad || Math.hypot(x + 0.5 - t.x1, z + 0.5 - t.z1) < pad + 2;
    });
  }

  generateWorld() {
    const W = this.worldgen || WORLDGEN; // размер мира и летающие острова (окно создания: worldgenFor)
    const rnd = Math.random;
    const range = ([a, b]) => randomInt(rnd, a, b);
    const pick = (list) => list[Math.floor(rnd() * list.length)];

    // 1. Рельеф
    this.terrain = new Terrain({ ...W.terrain, seed: 1 + Math.floor(rnd() * 1e9) });
    this.terrainParams = W.terrain; // в сохранение: рельеф пересчитывается по ним (а не по текущему config)
    const terrainBlocks = this.terrain.build(this.world, W.colors);
    this.engine.log(`острова: ${this.terrain.discs.length - 1} маленьких, гор ${this.terrain.mountains.length}, логов боссов ${this.terrain.lairs.length}` +
      this.terrain.lairs.map((l) => ` (${l.x}, ${l.z})`).join(""));

    // 1б. Логов в горах нет — жёлтая площадка лича (второй босс)
    this.arena = this.arenaSpot();
    if (this.arena) this.buildArena(this.arena);
    const arenaAvoid = this.arena ? [{ x: this.arena.x, z: this.arena.z, r: this.arena.r + 3 }] : [];

    // 2. Где ставить постройки: не у места появления и жителей, не на крутом склоне (и не на площадке лича)
    // Выход из прохода к логову — свободен (постройка не загородит)
    const tunnelAvoid = this.terrain.lairs.filter((l) => l.tunnel).map((l) => ({ x: l.tunnel.x1, z: l.tunnel.z1, r: 6 }));
    const avoid = [{ x: 0, z: 0, r: W.keepClear }, ...[...DEFAULT_SPAWNS, ...RESIDENTS].map((d) => ({ x: d.x, z: d.z, r: 3 })), ...arenaAvoid, ...tunnelAvoid];
    const ground = (x, z, w, d) => {
      let min = Infinity, max = -Infinity, sum = 0;
      for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) {
        const h = this.groundHeight(i, k);
        min = Math.min(min, h); max = Math.max(max, h); sum += h;
      }
      return { min, max, avg: sum / (w * d) };
    };
    // Мосты на маленькие острова — раньше построек: место, куда мост выходит на сушу, не застраиваем (scene/islands.js)
    this.buildIslands(rnd);
    const bridgeAvoid = (this.bridgeEnds || []).map((p) => ({ x: p.x, z: p.z, r: 5 }));
    // Озёра — на ровных местах (scene/water.js); вокруг них тоже не строим
    this.generateLakes(rnd, W);
    const lakeAvoid = (this.lakes || []).map((o) => ({ x: o.x, z: o.z, r: o.r + 2 }));
    const blockedAll = [...avoid, ...bridgeAvoid, ...lakeAvoid];
    // Вся постройка (с запасом в клетку) — на суше острова (не на краевом склоне, не над пропастью) и ровно
    const onLand = (x, z, w, d) => {
      for (let i = x - 1; i <= x + w; i++) for (let k = z - 1; k <= z + d; k++) if (this.groundRel(i, k) < 1) return false;
      return true;
    };
    const fits = (slope) => (x, z, s) => onLand(x, z, s.w, s.d) && (() => { const g = ground(x, z, s.w, s.d); return g.max - g.min <= slope; })();
    const house = () => {
      const w = range(W.house.w), d = range(W.house.d);
      // Г-образный: к основному прямоугольнику пристройка — общий угол (place двигает её внутрь участка)
      if (rnd() < W.house.lShape) return { kind: "house", l: true, w: w + 3, d: d + 3, w0: w, d0: d };
      return { kind: "house", w, d };
    };
    const C = W.castle;
    const queue = [
      ...Array.from({ length: range(W.castles || [0, 0]) }, () => { const s = range(C.size); return { kind: "castle", w: s, d: s }; }),
      ...Array.from({ length: W.bigHouses || 0 }, () => ({ kind: "big", w: range(W.bigHouse.w), d: range(W.bigHouse.d) })),
      ...Array.from({ length: W.towers }, () => { const s = range(W.tower.size); return { kind: "tower", w: s, d: s }; }),
      ...Array.from({ length: W.houses }, house),
      ...Array.from({ length: W.ruins || 0 }, () => ({ kind: "ruin", w: range(W.house.w), d: range(W.house.d) })),
      ...Array.from({ length: W.piles }, () => ({ kind: "pile", w: range(W.pile.w), d: range(W.pile.d) })),
    ];
    const spots = scatter({
      count: queue.length, area: W.area, gap: W.gap, avoid: blockedAll, size: () => queue.shift(), random: rnd, tries: 120,
      accept: (x, z, s) => fits(s.kind === "castle" ? C.maxSlope : W.maxSlope)(x, z, s),
    });
    for (const s of spots) s.main = true; // на главном острове (порталы на небесные острова — в его больших домах)
    // 2б. Маленькие острова — свои постройки (WORLDGEN.islandStuff): пара домиков, куча коробок, иногда башня.
    // Остров побольше (большой мир) — построек больше и крупнее: большие дома, на самом большом — замок.
    // Ставим на ровной части острова (не у края и не на его горке)
    const I = W.islandStuff;
    const islands = this.terrain.discs.filter((d) => !d.main && !d.sky); // небесные — отдельно (generateSky)
    const hillOf = (d) => this.terrain.mountains.find((m) => Math.hypot(m.x - d.x, m.z - d.z) < 1);
    for (const d of islands) {
      const inner = d.r - d.edge;
      const hill = hillOf(d);
      const big = Math.max(0, Math.floor((d.r - 14) / 6)); // на сколько остров крупнее обычного
      const q = [
        ...(d.r >= 26 && rnd() < 0.5 ? [(() => { const s = range(C.size); return { kind: "castle", w: s, d: s }; })()] : []),
        ...Array.from({ length: big }, () => ({ kind: "big", w: range(W.bigHouse.w), d: range(W.bigHouse.d) })),
        ...Array.from({ length: range(I.houses) + big }, () => ({ kind: rnd() < 0.25 ? "ruin" : "house", w: range(W.house.w), d: range(W.house.d) })),
        ...(rnd() < I.towerChance ? [(() => { const s = range(W.tower.size); return { kind: "tower", w: s, d: s }; })()] : []),
        ...Array.from({ length: range(I.piles) }, () => ({ kind: "pile", w: range(W.pile.w), d: range(W.pile.d) })),
      ];
      spots.push(...scatter({
        count: q.length, area: [Math.floor(d.x - inner), Math.floor(d.z - inner), Math.ceil(d.x + inner), Math.ceil(d.z + inner)],
        gap: W.gap, avoid: [...(hill ? [{ x: d.x, z: d.z, r: hill.r * 0.85 }] : []), ...arenaAvoid, ...tunnelAvoid, ...bridgeAvoid], size: () => q.shift(), random: rnd,
        accept: (x, z, s) => {
          const far = Math.hypot(x + s.w / 2 - d.x, z + s.d / 2 - d.z) + Math.hypot(s.w, s.d) / 2;
          if (far > inner + 1) return false; //  вся постройка — на ровной части острова
          return fits(s.kind === "castle" ? C.maxSlope : W.maxSlope)(x, z, s);
        },
      }));
    }
    const [STONE, WOOD, , , BRICK] = PALETTE;
    const walls = [WOOD, STONE, BRICK];
    for (const s of spots) {
      // Площадку под постройку выравниваем (срезать / досыпать) до средней высоты земли
      const y = (s.y = Math.round(ground(s.x, s.z, s.w, s.d).avg));
      flattenArea(this.world, { x: s.x, z: s.z, w: s.w, d: s.d, y, top: W.colors.grass, fill: W.colors.dirt });
      const wall = pick(walls), trim = wall === WOOD ? STONE : WOOD, roof = pick([WOOD, BRICK, STONE]);
      if (s.kind === "house" && s.l) {
        // Г: основная часть в углу участка + пристройка, сдвинутая к противоположному углу (общий кусок стены)
        const decay = rnd() * W.house.decay[1], h = range(W.house.h);
        buildHouse(this.world, { x: s.x, z: s.z, w: s.w0, d: s.d0, y, h, wall, trim, roof, decay, random: rnd });
        const w2 = Math.max(4, s.w - s.w0 + 2), d2 = Math.max(4, s.d - s.d0 + 2);
        buildHouse(this.world, { x: s.x + s.w - w2, z: s.z + s.d - d2, w: w2, d: d2, y, h, wall, trim, roof, decay, random: rnd });
        this.maybeHouseChest({ ...s, w: s.w0, d: s.d0 }, y, rnd);
        this.hangLamps(s.x + Math.floor(s.w0 / 2), y, s.z + Math.floor(s.d0 / 2));
      } else if (s.kind === "house") {
        buildHouse(this.world, { ...s, y, h: range(W.house.h), wall, trim, roof, decay: rnd() * W.house.decay[1], random: rnd });
        this.maybeHouseChest(s, y, rnd); // сундук в доме (scene/islands.js)
        this.hangLamps(s.x + Math.floor(s.w / 2), y, s.z + Math.floor(s.d / 2));
      } else if (s.kind === "big") {
        buildBigHouse(this.world, { ...s, y, h: range(W.bigHouse.h), floors: 2, wall, trim, roof, random: rnd });
        this.maybeHouseChest(s, y, rnd);
        // по лампе в каждой половине (у дальней от лестницы стены), на каждом этаже
        for (const lx of [s.x + Math.floor(s.w / 4), s.x + s.w - 1 - Math.floor(s.w / 4)]) this.hangLamps(lx, y, s.z + s.d - 3);
      } else if (s.kind === "ruin") {
        buildRuins(this.world, { ...s, y, h: range(W.house.h), wall: pick([STONE, BRICK]), trim: STONE, random: rnd });
      } else if (s.kind === "castle") {
        buildCastle(this.world, { x: s.x, z: s.z, y, size: s.w, h: range(C.h), wall: STONE, top: STONE, keepWall: pick([BRICK, STONE]), roof: pick([WOOD, BRICK]), gate: pick(["north", "south", "east", "west"]), random: rnd });
        this.hangLamps(s.x + Math.floor(s.w / 2) - 1, y, s.z + Math.floor(s.w / 2) - 1); // в главном доме двора
      } else if (s.kind === "tower") {
        buildTower(this.world, { ...s, y, size: s.w, h: range(W.tower.h), wall: STONE, top: WOOD, door: pick(["north", "south", "east", "west"]), random: rnd });
        this.hangLamps(s.x + Math.floor(s.w / 2), y, s.z + Math.floor(s.w / 2));
      } else {
        buildCratePile(this.world, { ...s, y, colors: [WOOD, WOOD, STONE], count: range(W.pile.count), random: rnd });
      }
    }

    // 3. Деревья — на свободной земле (не на постройках, не у места появления, не на снегу и скалах)
    let trees = 0;
    for (let t = 0; t < W.trees * 20 && trees < W.trees; t++) {
      const x = Math.floor((rnd() * 2 - 1) * (W.terrain.radius - 6));
      const z = Math.floor((rnd() * 2 - 1) * (W.terrain.radius - 6));
      if (Math.hypot(x, z) < W.keepClear + 3 || this.onStructure(x, z) || this.inLake(x, z) || this.nearBridge(x, z)) continue;
      if (arenaAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue; // не на площадке лича
      if (this.groundRel(x, z) > W.colors.rockLine || this.groundRel(x, z) < 1) continue; // не на скалах и не за краем острова
      if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue; // не вплотную к стенам
      if (this.nearLairTunnel(x, z)) continue; // не загораживать проход к логову
      if (!Number.isInteger(this.world.surfaceY(x, z))) continue; // не на полублоке
      buildTree(this.world, { x, y: Math.ceil(this.world.surfaceY(x, z)), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
      trees++;
    }
    // Деревья на маленьких островах — тоже на свободной земле, не у края и не на скалах горки
    for (const d of islands) {
      const want = range(I.trees);
      for (let t = 0, n = 0; t < want * 20 && n < want; t++) {
        const a = rnd() * Math.PI * 2, r = rnd() * (d.r - d.edge);
        const x = Math.floor(d.x + Math.sin(a) * r), z = Math.floor(d.z + Math.cos(a) * r);
        if (this.onStructure(x, z) || this.inLake(x, z) || this.nearBridge(x, z) || this.groundRel(x, z) > W.colors.rockLine || this.groundRel(x, z) < 1) continue;
        if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue;
        if (this.terrain.lairs.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 2)) continue; // не над логовом
        if (this.nearLairTunnel(x, z)) continue; //                                               не у прохода к логову
        if (arenaAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue; //              не на площадке лича
        if (!Number.isInteger(this.world.surfaceY(x, z))) continue; // не на полублоке
        buildTree(this.world, { x, y: Math.ceil(this.world.surfaceY(x, z)), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
        trees++;
        n++;
      }
    }
    this.generateCaves(rnd); // пещеры: комнаты, туннели, проходы наверх (scene/caves.js)
    this.buildSpawnLights(); //  столбы с факелами у места появления (scene/islands.js)
    this.generateSky(rnd, spots); // небесные острова и порталы к ним (scene/sky.js)
    const count = (k) => spots.filter((s) => s.kind === k).length;
    this.engine.log(`новый мир: размер ${W.size || "?"}, радиус ${W.terrain.radius}, замков ${count("castle")}, больших домов ${count("big")}, руин ${count("ruin")}; рельеф ${terrainBlocks} кубиков (зерно ${this.terrain.seed}), ${count("house")} домиков, ${count("tower")} башен, ${count("pile")} куч, ${trees} деревьев; всего ${this.world.blocks.size} блоков`);
  }

  // Разбросать камни вокруг места появления (новый мир)
  // Разбросать count предметов item вокруг героя (до 14 м, не на постройках)
  scatterItem(item, count = 1) {
    const c = this.player?.position || { x: 0, z: 0 };
    for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
      const x = c.x + (Math.random() * 2 - 1) * 14;
      const z = c.z + (Math.random() * 2 - 1) * 14;
      if (Math.hypot(x - c.x, z - c.z) < 2 || this.onStructure(x, z)) continue;
      this.pickups.add(item, 1, { x, y: this.world.surfaceY(x, z), z });
      n++;
    }
  }

  // Предмет на земле под прицелом не дальше reach от глаз (и не за стеной): { pickup, t } или null
  aimedPickup(reach) {
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const hit = this.pickups.raycast(cam.position, dir, this.rig.behind + reach);
    if (!hit) return null;
    const wall = this.world.raycast(cam.position, dir, hit.t);
    if (wall?.block && wall.t < hit.t) return null; // между нами блок
    const p = hit.pickup.position;
    const eye = this.look.position;
    if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > reach + 0.5) return null;
    return hit;
  }

  // Подобрать предмет с земли: оружие — в хотбар, остальное (камни, кости) — в сумку
  // quiet — автоподбор: если некуда положить, не кричим каждый кадр (предмет просто остаётся лежать)
  pickUp(p, { quiet = false } = {}) {
    if (this.role === "client" && p.netId !== undefined) return this.net?.take(p); // гость: предмет — у хоста, просим
    if (ITEMS[p.item]?.instant) {
      // Корона лича: сразу +урон всем (навсегда), в сумку не идёт
      if (p.item === "bone-crown") {
        const add = this.crownDamage(this.boneCrowns + 1) - this.crownDamage(this.boneCrowns);
        this.boneCrowns++;
        this.pickups.remove(p);
        this.applyTalents();
        this.engine.sound.play("levelup");
        this.engine.toast(add > 0 ? `BONE CROWN: +${Math.round(add * 1000) / 10}% DMG (TOTAL +${Math.round(this.crownDamage(this.boneCrowns) * 1000) / 10}%)` : "BONE CROWN: NO MORE DAMAGE FROM CROWNS", 3000);
        this.engine.log(`корона лича №${this.boneCrowns}: +${(add * 100).toFixed(1)} % урона`);
        return;
      }
      // Шкура тролля: сразу броня (навсегда), в сумку не идёт
      if (p.item === "troll-hide") {
        const add = this.hideArmor(this.trollHides + 1) - this.hideArmor(this.trollHides);
        this.trollHides++;
        this.pickups.remove(p);
        this.applyTalents();
        this.engine.sound.play("levelup");
        this.engine.toast(add > 0 ? `TROLL HIDE: -${Math.round(add * 1000) / 10}% PHYSICAL DMG (TOTAL -${Math.round(this.hideArmor(this.trollHides) * 1000) / 10}%)` : "TROLL HIDE: NO MORE ARMOR FROM HIDES", 3000);
        this.engine.log(`шкура тролля №${this.trollHides}: +${(add * 100).toFixed(1)} % брони`);
        return;
      }
      return;
    }
    const left = isWeapon(p.item) || isArmor(p.item) ? this.giveItem(p.item, p.count, p.data) : this.giveResource(p.item, p.count, p.data);
    const got = p.count - left;
    if (got === 0) {
      if (quiet) p.delay = p.age + 1; // некуда — пробуем снова через секунду (освободил место — само подберётся)
      return quiet ? null : this.engine.toast("NO ROOM IN INVENTORY");
    }
    if (left > 0) p.count = left; // что не влезло — осталось лежать
    else this.pickups.remove(p);
    this.engine.sound.play("pickup");
    this.engine.toast(`+${got} ${itemName(p.item)}`, 900);
    this.engine.log(`подобрано: ${p.item} x${got}`);
  }

  // Выдать ресурс: сначала докладываем в НАЧАТЫЕ стопки (в хотбаре, потом в сумке), потом — новая стопка:
  // то, что используют в руке (камни), — сразу в хотбар; остальное (кости, монеты) — в сумку.
  // Возвращает, сколько не влезло
  giveResource(id, count = 1, data = null) {
    const p = this.player;
    // Со своими данными (неполная обойма) — по одной в пустые ячейки сумки, потом хотбара
    if (data) {
      const left = p.hotbar.add(id, p.inventory.add(id, count, { data }), { data });
      this.syncAbilities();
      return left;
    }
    let left = p.hotbar.add(id, count, { stackOnly: true });
    left = p.inventory.add(id, left, { stackOnly: true });
    if (isUsable(id)) {
      left = p.hotbar.add(id, left);
      left = p.inventory.add(id, left);
    } else {
      left = p.inventory.add(id, left);
      left = p.hotbar.add(id, left);
    }
    this.syncAbilities();
    return left;
  }
}
