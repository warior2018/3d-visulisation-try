// ============================================================
//  Сцена «мир», часть: Мир: рельеф, постройки, камни, острова.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { WORLDGEN, PALETTE } from "../config.js";
import { randomInt, Terrain, scatter, flattenArea, buildHouse, buildTower, buildCratePile, buildTree } from "../../../engine/index.js";
import { DEFAULT_SPAWNS, RESIDENTS } from "../creatures.js";
import { ITEMS, isWeapon, isArmor, itemName, isUsable } from "../items.js";

export class WorldgenPart {
  // ---------- Мир: постройки и камни ----------

  // Высота земли (рельефа) в столбике — без построек и того, что поставил герой. Плоский мир — 0
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
    const queue = [
      ...Array.from({ length: W.houses }, () => ({ kind: "house", w: range(W.house.w), d: range(W.house.d) })),
      ...Array.from({ length: W.towers }, () => { const s = range(W.tower.size); return { kind: "tower", w: s, d: s }; }),
      ...Array.from({ length: W.piles }, () => ({ kind: "pile", w: range(W.pile.w), d: range(W.pile.d) })),
    ];
    const spots = scatter({
      count: queue.length, area: W.area, gap: W.gap, avoid, size: () => queue.shift(), random: rnd,
      accept: (x, z, s) => { const g = ground(x, z, s.w, s.d); return g.max - g.min <= W.maxSlope; },
    });
    // 2б. Маленькие острова — свои постройки (WORLDGEN.islandStuff): пара домиков, куча коробок, иногда башня.
    // Ставим на ровной части острова (не у края и не на его горке)
    const I = W.islandStuff;
    const islands = this.terrain.discs.filter((d) => !d.main);
    const hillOf = (d) => this.terrain.mountains.find((m) => Math.hypot(m.x - d.x, m.z - d.z) < 1);
    for (const d of islands) {
      const inner = d.r - d.edge;
      const hill = hillOf(d);
      const q = [
        ...Array.from({ length: range(I.houses) }, () => ({ kind: "house", w: range(W.house.w), d: range(W.house.d) })),
        ...(rnd() < I.towerChance ? [(() => { const s = range(W.tower.size); return { kind: "tower", w: s, d: s }; })()] : []),
        ...Array.from({ length: range(I.piles) }, () => ({ kind: "pile", w: range(W.pile.w), d: range(W.pile.d) })),
      ];
      spots.push(...scatter({
        count: q.length, area: [Math.floor(d.x - inner), Math.floor(d.z - inner), Math.ceil(d.x + inner), Math.ceil(d.z + inner)],
        gap: W.gap, avoid: [...(hill ? [{ x: d.x, z: d.z, r: hill.r * 0.85 }] : []), ...arenaAvoid, ...tunnelAvoid], size: () => q.shift(), random: rnd,
        accept: (x, z, s) => {
          const far = Math.hypot(x + s.w / 2 - d.x, z + s.d / 2 - d.z) + Math.hypot(s.w, s.d) / 2;
          if (far > inner + 1) return false; //  вся постройка — на ровной части острова
          const g = ground(x, z, s.w, s.d);
          return g.min >= 1 && g.max - g.min <= W.maxSlope;
        },
      }));
    }
    const [STONE, WOOD, , , BRICK] = PALETTE;
    for (const s of spots) {
      // Площадку под постройку выравниваем (срезать / досыпать) до средней высоты земли
      const y = Math.round(ground(s.x, s.z, s.w, s.d).avg);
      flattenArea(this.world, { x: s.x, z: s.z, w: s.w, d: s.d, y, top: W.colors.grass, fill: W.colors.dirt });
      if (s.kind === "house") {
        const wall = pick([WOOD, STONE, BRICK]);
        buildHouse(this.world, { ...s, y, h: range(W.house.h), wall, trim: wall === WOOD ? STONE : WOOD, roof: pick([WOOD, BRICK, STONE]), decay: rnd() * W.house.decay[1], random: rnd });
      } else if (s.kind === "tower") {
        buildTower(this.world, { ...s, y, size: s.w, h: range(W.tower.h), wall: STONE, top: WOOD, door: pick(["north", "south", "east", "west"]), random: rnd });
      } else {
        buildCratePile(this.world, { ...s, y, colors: [WOOD, WOOD, STONE], count: range(W.pile.count), random: rnd });
      }
    }

    // 3. Деревья — на свободной земле (не на постройках, не у места появления, не на снегу и скалах)
    let trees = 0;
    for (let t = 0; t < W.trees * 20 && trees < W.trees; t++) {
      const x = Math.floor((rnd() * 2 - 1) * (W.terrain.radius - 6));
      const z = Math.floor((rnd() * 2 - 1) * (W.terrain.radius - 6));
      if (Math.hypot(x, z) < W.keepClear + 3 || this.onStructure(x, z)) continue;
      if (arenaAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue; // не на площадке лича
      if (this.groundHeight(x, z) > W.colors.rockLine || this.groundHeight(x, z) < 1) continue; // не на скалах и не за краем острова
      if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue; // не вплотную к стенам
      if (this.nearLairTunnel(x, z)) continue; // не загораживать проход к логову
      buildTree(this.world, { x, y: this.world.surfaceY(x, z), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
      trees++;
    }
    // Деревья на маленьких островах — тоже на свободной земле, не у края и не на скалах горки
    for (const d of islands) {
      const want = range(I.trees);
      for (let t = 0, n = 0; t < want * 20 && n < want; t++) {
        const a = rnd() * Math.PI * 2, r = rnd() * (d.r - d.edge);
        const x = Math.floor(d.x + Math.sin(a) * r), z = Math.floor(d.z + Math.cos(a) * r);
        if (this.onStructure(x, z) || this.groundHeight(x, z) > W.colors.rockLine || this.groundHeight(x, z) < 1) continue;
        if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue;
        if (this.terrain.lairs.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 2)) continue; // не над логовом
        if (this.nearLairTunnel(x, z)) continue; //                                               не у прохода к логову
        if (arenaAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue; //              не на площадке лича
        buildTree(this.world, { x, y: this.world.surfaceY(x, z), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
        trees++;
        n++;
      }
    }
    this.buildIslands(rnd); // мосты на маленькие острова и сундук на дальнем (scene/islands.js)
    this.buildSpawnLights(); //  столбы с факелами у места появления (scene/islands.js)
    const count = (k) => spots.filter((s) => s.kind === k).length;
    this.engine.log(`новый мир: рельеф ${terrainBlocks} кубиков (зерно ${this.terrain.seed}), ${count("house")} домиков, ${count("tower")} башен, ${count("pile")} куч, ${trees} деревьев; всего ${this.world.blocks.size} блоков`);
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
