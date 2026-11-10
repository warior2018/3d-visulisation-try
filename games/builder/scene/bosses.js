// ============================================================
//  Сцена «мир», часть: Боссы в логовах.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { BONE_CROWN, TROLL_HIDE, BOSS, WORLDGEN, LICH, ATTACKS, SHAKE, BLOATER } from "../config.js";
import { seededRandom, flattenArea, grow, Vec3, MagicAttack } from "../../../engine/index.js";
import { CREATURES, mobGrowth } from "../creatures.js";

export class BossesPart {
  // ---------- Боссы в логовах ----------

  // Сколько урона дают n корон лича: первая BONE_CROWN.first, каждая следующая на step меньше (не меньше 0)
  crownDamage(n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.max(0, BONE_CROWN.first - BONE_CROWN.step * i);
    return sum;
  }

  // Сколько брони дают n шкур тролля: первая TROLL_HIDE.first, каждая следующая на step меньше (не меньше 0)
  hideArmor(n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.max(0, TROLL_HIDE.first - TROLL_HIDE.step * i);
    return sum;
  }

  // Логова (terrain.lairs): в каждом — свой тролль. Погиб — через BOSS.respawn секунд новый.
  // Таймеры — в сохранении (сам босс не сохраняется: после загрузки появится заново, если пора)
  updateLairs(dt) {
    this.bossSites().forEach((lair, i) => {
      const boss = this.entities.list.find((e) => e.boss && e.lair === i);
      if (boss && !boss.alive && !boss.respawnSet) {
        boss.respawnSet = true;
        this.lairTimers[i] = BOSS.respawn; // убит — новый через 3 минуты
        this.engine.log(`босс логова ${i} повержен: новый через ${BOSS.respawn} с`);
      }
      if (boss?.alive) return this.bossTick(boss, lair, dt);
      this.lairTimers[i] = Math.max(0, (this.lairTimers[i] || 0) - dt);
      if (this.lairTimers[i] > 0 || (boss && !boss.alive && this.entities.list.includes(boss))) return; // ждём (и пока лежит тело)
      this.spawnBoss(i);
    });
  }

  // Где живут боссы: логово в горе — ТРОЛЛЬ, ЖЁЛТАЯ ПЛОЩАДКА — ЛИЧ (this.arena). В новом мире — оба всегда.
  // Номер места — индекс в lairTimers: сначала логова, площадка — последняя
  bossSites() {
    return [...(this.terrain?.lairs || []).map((l) => ({ ...l, type: "troll" })), ...(this.arena ? [{ ...this.arena, type: "lich" }] : [])];
  }

  // Место площадки лича — по зерну мира: середина маленького острова без горки, иначе — главный остров
  // на WORLDGEN.arena.distance от центра, не в горе. { x, y, z, r } — y: где стоят (над жёлтым настилом)
  arenaSpot() {
    const T = this.terrain;
    if (!T) return null;
    const A = (this.worldgen || WORLDGEN).arena;
    const rnd = seededRandom(T.seed * 7 + 3);
    const flat = T.discs.filter((d) => !d.main && d.r - d.edge >= A.radius && !T.mountains.some((m) => Math.hypot(m.x - d.x, m.z - d.z) < 1));
    let x, z;
    if (flat.length) {
      const d = flat[Math.floor(rnd() * flat.length)];
      x = Math.round(d.x);
      z = Math.round(d.z);
    } else {
      for (let k = 0; k < 16; k++) {
        const a = rnd() * Math.PI * 2;
        x = Math.round(Math.sin(a) * A.distance);
        z = Math.round(Math.cos(a) * A.distance);
        if (!T.mountains.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + A.radius) && !T.plateaus.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + p.edge + A.radius)) break;
      }
    }
    const g = Math.max(1, Math.round(this.groundHeight(x, z)));
    return { x, z, r: A.radius, y: g + 1 };
  }

  // Построить площадку: выровнять землю, круглый жёлтый настил в блок высотой и 4 каменных столба по краям
  buildArena(a) {
    const W = this.worldgen || WORLDGEN;
    const g = a.y - 1;
    flattenArea(this.world, { x: a.x - a.r, z: a.z - a.r, w: a.r * 2 + 1, d: a.r * 2 + 1, y: g, top: W.colors.grass, fill: W.colors.dirt });
    for (let i = -a.r; i <= a.r; i++) for (let k = -a.r; k <= a.r; k++) {
      if (Math.hypot(i, k) <= a.r + 0.3) this.world.place(a.x + i, g, a.z + k, W.arena.color);
    }
    const p = Math.round(a.r * 0.75);
    for (const [i, k] of [[p, p], [-p, p], [p, -p], [-p, -p]]) {
      for (let j = 0; j < 3; j++) this.world.place(a.x + i, a.y + j, a.z + k, W.colors.stone);
    }
    this.engine.log(`площадка лича: (${a.x}, ${a.z}), радиус ${a.r}`);
  }

  // Босс в месте i: в центре, лицом к центру мира; не выходит за свою территорию; сила — по счёту мобов
  spawnBoss(i) {
    const lair = this.bossSites()[i];
    const x = lair.x + 0.5, z = lair.z + 0.5;
    const type = lair.type; //  в логове — тролль, на площадке — лич
    const e = this.spawn(type, { x, y: lair.y, z, yaw: Math.atan2(-lair.x, -lair.z) });
    if (!e) return;
    e.lair = i;
    e.summonTimer = LICH.summon.every * 0.5; // лич: первых скелетов — побыстрее
    e.blinkCd = 0;
    e.brain.territory = { x, z, radius: lair.r + BOSS.territory };
    this.scaleBoss(e);
    e.stats.hp = e.stats.maxHp;
    this.engine.log(`босс в логове ${i} (${lair.x}, ${lair.z}): ${e.name}, ${e.stats.maxHp} HP, удар ${e.attack.damage}, валун ${e.rangedDamage}`);
  }

  // Босс растёт с мобами (BOSS.growth по счёту появлений — как страж)
  scaleBoss(e) {
    const n = this.spawner.spawned;
    const g = BOSS.growth;
    const def = CREATURES[e.type];
    e.setMaxHp(grow(def.maxHp, n, g.hp));
    e.attack.damage = grow(ATTACKS[def.attack].damage, n, g.damage);
    e.rangedDamage = grow(ATTACKS[def.rangedWeapon.attack].damage, n, g.damage);
  }

  // Тролль ударил о землю: пыльный круг, грохот, тряска экрана, если герой рядом
  // Босс в погоне (HostileBrain chase): блоки перед ним, от уровня ног до макушки, ломаются (раз в chase.every с).
  // Пол под ногами и ниже — не трогаем: яму себе не выкопает. Неломаемые (арена) — стоят
  bossDig(e, target, dt) {
    e.digIn = (e.digIn ?? 0) - dt;
    if (e.digIn > 0) return;
    e.digIn = BOSS.chase.every;
    const dx = target.position.x - e.position.x, dz = target.position.z - e.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const feet = Math.floor(e.position.y + 0.05);
    const cells = new Set();
    for (const ahead of [e.radius + 0.4, e.radius + 1]) {
      for (const side of [-e.radius * 0.8, 0, e.radius * 0.8]) {
        const x = Math.floor(e.position.x + (dx / len) * ahead - (dz / len) * side);
        const z = Math.floor(e.position.z + (dz / len) * ahead + (dx / len) * side);
        for (let y = feet; y <= Math.floor(e.position.y + e.height); y++) cells.add(`${x},${y},${z}`);
      }
    }
    this.bossBreak([...cells].map((k) => k.split(",").map(Number)));
  }

  // Сломать блоки (босс): сломанные не выпадают; пыль и звук
  bossBreak(list) {
    let n = 0;
    for (const [x, y, z] of list) {
      if (!this.world.has(x, y, z)) continue;
      if (this.world.remove(x, y, z) === false) continue; // неломаемый
      n++;
      if (n <= 4) this.sparkFx?.({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    }
    if (n) this.engine.sound.play("remove", { at: { x: list[0][0], y: list[0][1], z: list[0][2] } });
    return n;
  }

  bossSlam(c, r) {
    // удар дубиной ломает блоки в круге удара — от уровня земли вверх на 2 (пол не трогаем)
    const cells = [];
    const y0 = Math.floor(c.y + 0.05);
    for (let x = Math.floor(c.x - r); x <= Math.floor(c.x + r); x++) {
      for (let z = Math.floor(c.z - r); z <= Math.floor(c.z + r); z++) {
        if (Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) > r) continue;
        for (let y = y0; y <= y0 + 1; y++) cells.push([x, y, z]);
      }
    }
    this.bossBreak(cells);
    this.beams.ring({ x: c.x, y: c.y + 0.05, z: c.z }, r, { color: [190, 170, 140], life: 0.35, width: 9 });
    this.beams.ring({ x: c.x, y: c.y + 0.05, z: c.z }, r * 0.55, { color: [150, 130, 100], life: 0.25, width: 6, segments: 14 });
    this.engine.sound.play("boom", { at: c });
    const d = Math.hypot(this.player.position.x - c.x, this.player.position.z - c.z);
    this.shakeNear(c, SHAKE.bossSlam); // удар дубины — трясёт тем сильнее, чем ближе
  }

  // Предупреждение: тролль замахнулся — красный круг там, куда ударит (успей отойти)
  // Живой босс: без цели — лечится; ниже половины HP — ЯРОСТЬ; у лича — прыжки по залу и подъём скелетов
  bossTick(e, lair, dt) {
    if (!e.aggro && e.stats.hp < e.stats.maxHp) e.heal(e.stats.maxHp * BOSS.regen * dt); // ушёл из логова — лечится
    if (!e.enraged && e.stats.hp <= e.stats.maxHp * BOSS.enrageAt) {
      e.enraged = true;
      e.speedBonuses.enrage = BOSS.enrage.speed;
      if (e.attack) e.attack.cooldown *= BOSS.enrage.cooldown;
      if (e.rangedAttack) e.rangedAttack.cooldown *= BOSS.enrage.cooldown;
      this.engine.sound.play("growl", { at: e.position, volume: 1 });
      if (e.aggro === this.player) this.engine.toast(`${e.name} IS ENRAGED!`, 2000);
    }
    if (e.type !== "lich" || !e.aggro || e.stunned) return;
    // Прыжок: подошли вплотную — исчезает и появляется подальше от героя, в другом конце зала
    e.blinkCd -= dt;
    const t = e.aggro;
    if (e.blinkCd <= 0 && Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z) < LICH.blink.near) {
      let best = null;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * Math.max(1, lair.r - 1.2);
        const x = lair.x + 0.5 + Math.sin(a) * r, z = lair.z + 0.5 + Math.cos(a) * r;
        const bx = Math.floor(x), bz = Math.floor(z);
        if ([0, 1, 2].some((j) => this.world.has(bx, lair.y + j, bz))) continue; // в камень не прыгаем
        const d = Math.hypot(x - t.position.x, z - t.position.z);
        if (!best || d > best.d) best = { x, z, d };
      }
      if (best) {
        const from = { x: e.position.x, y: e.position.y + 1.3, z: e.position.z };
        e.position = new Vec3(best.x, lair.y, best.z);
        e.velocity.x = e.velocity.z = 0;
        e.nav?.reset();
        e.blinkCd = LICH.blink.cooldown;
        this.beams.add({ from, to: { x: best.x, y: lair.y + 1.3, z: best.z }, color: [180, 110, 255], core: [240, 220, 255], life: 0.3, width: 8 });
        this.beams.ring({ x: best.x, y: lair.y + 0.05, z: best.z }, 1.2, { color: [180, 110, 255], life: 0.4, width: 6 });
        this.engine.sound.play("zap", { at: e.position });
      }
    }
    // Подъём скелетов: раз в every с, не больше max живых своих
    e.summonTimer -= dt;
    if (e.summonTimer > 0) return;
    e.summonTimer = LICH.summon.every;
    const mine = this.entities.list.filter((m) => m.alive && m.raisedBy === e).length;
    const growth = mobGrowth(this.spawner.spawned);
    for (let k = 0; k < Math.min(LICH.summon.count, LICH.summon.max - mine); k++) {
      const a = Math.random() * Math.PI * 2;
      const x = e.position.x + Math.sin(a) * 1.5, z = e.position.z + Math.cos(a) * 1.5;
      if (this.world.has(Math.floor(x), lair.y, Math.floor(z))) continue;
      const s = this.spawn("skeleton", { x, y: lair.y, z, yaw: a, ...growth });
      if (!s) continue;
      s.raisedBy = e;
      s.aggro = t;
      s.xp = 5; //                          поднятые — без добычи и почти без опыта
      s.inventory.slots.fill(null);
      this.beams.ring({ x, y: lair.y + 0.05, z }, 0.8, { color: [180, 110, 255], life: 0.5, width: 5 });
    }
    this.engine.sound.play("growl", { at: e.position, volume: 0.8 });
  }

  // РАЗДУТЫЙ взорвался: урон всем вокруг (его врагам: герою, стражу, призванным), искры и грохот
  bloaterBoom(b) {
    const blast = new MagicAttack({ id: "bloater-blast", name: "BLAST", damage: b.blastDamage || BLOATER.damage, radius: BLOATER.radius, cost: 0 });
    const point = { x: b.position.x, y: b.position.y + 0.6, z: b.position.z };
    const r = blast.burst(b, point, { entities: this.entities.list, onHit: (h) => this.engine.log(`взрыв раздутого → ${h.target.name}: -${h.dealt} HP`) });
    if (r.hits.some((h) => h.target === this.player)) this.engine.sound.play("hurt");
    this.engine.sound.play("boom", { at: point });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, k = BLOATER.radius * (0.7 + 0.3 * Math.random());
      this.beams.add({ from: point, to: { x: point.x + Math.sin(a) * k, y: point.y + ((i % 3) - 1) * k * 0.4, z: point.z + Math.cos(a) * k }, color: [150, 210, 90], core: [230, 255, 190], life: 0.3, width: 12 });
    }
    this.shakeNear(point, SHAKE.bloater);
  }

  bossWarnings() {
    // Раздутый зажёг запал — пульсирующий красный круг взрыва
    for (const e of this.entities.list) {
      if (e.type !== "bloater" || !e.alive || !(e.priming > 0)) continue;
      const k = 1 - e.priming / BLOATER.prime;
      this.beams.ring({ x: e.position.x, y: e.position.y + 0.05, z: e.position.z }, BLOATER.radius, { color: [255, 60, 50], life: 0.04, width: 6 });
      this.beams.ring({ x: e.position.x, y: e.position.y + 0.05, z: e.position.z }, BLOATER.radius * k, { color: [255, 170, 90], life: 0.04, width: 4, segments: 14 });
    }
    // Замах босса (дубина тролля) больше не подсвечивается кругом на земле — читать удар по анимации
  }
}
