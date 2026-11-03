// ============================================================
//  Сцена «мир», часть: Баффы, перезарядки, ульта, броня.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { critCooldown, MeleeAttack, dash, MagicAttack, grow } from "../../../engine/index.js";
import { signedPct } from "./shared.js";
import { ARMOR, BLOCK, SPEAR, ATTACKS, HAMMER, PLAYER, SHAKE, BOAR_SCALE, WARDEN_GROWTH } from "../config.js";
import { CREATURES } from "../creatures.js";

export class BuffsPart {
  // ---------- Баффы и перезарядки (панель у хотбара: hud.js) ----------

  // Баффы и дебаффы героя — значки НАД хотбаром: статусы (движок), прибавки и штрафы к скорости,
  // готовый крит, разбег, навсегда полученное (шкуры, короны). Каждый: { icon, name, positive, color, label?, left? }
  buffList() {
    const p = this.player;
    const list = p.statuses.filter((st) => st.icon || st.name).map((st) => st); // статусы как есть (бафф — зелёная рамка, дебафф — красная)
    // Прибавки скорости: от талантов — вечные (над здоровьем), остальное (оружие, стойка, статусы) — сейчас
    let up = 0, down = 0;
    for (const [k, v] of Object.entries(p.speedBonuses)) if (k !== "talents") (v > 0 ? (up += v) : (down += v));
    for (const st of p.statuses) if (st.speed) (st.speed > 0 ? (up += st.speed) : (down += st.speed));
    if (up > 0.001) list.push({ icon: "SPD", name: "SPEED", positive: true, color: [110, 200, 255], label: `+${Math.round(up * 100)}%` });
    if (down < -0.001) list.push({ icon: "SLW", name: "SLOW", positive: false, color: [235, 120, 70], label: `${Math.round(down * 100)}%` });
    if (this.spearRun.active) list.push({ icon: "CHG", name: "CHARGE", positive: true, color: [255, 200, 90], label: `X${this.spearRun.power.toFixed(1)}` });
    const crit = this.talents.rank("f-crit");
    if (crit && this.playerClass === "melee" && critCooldown(p, "fighter-crit") <= 0) list.push({ icon: "CRT", name: "CRIT", positive: true, color: [255, 210, 80], label: `X${crit > 1 ? 3 : 2}` });
    return [...list, ...this.permanentBuffs()];
  }

  // Вечные (мелкие, навсегда) баффы — над полосой здоровья, а не над центром: шкуры тролля, короны лича,
  // надетая броня, скорость от талантов. permanent: true — по нему их делят HUD и справка F1
  permanentBuffs() {
    const p = this.player;
    const pct = (v) => Math.round(v * 1000) / 10;
    const list = [];
    const hide = this.hideArmor(this.trollHides || 0), crown = this.crownDamage(this.boneCrowns || 0), armor = this.armorValue();
    const spd = p.speedBonuses.talents || 0;
    if (hide > 0) list.push({ icon: "HID", name: "TROLL HIDE", text: `-${pct(hide)}% PHYSICAL DMG`, color: [140, 170, 110], label: `-${pct(hide)}%` });
    if (crown > 0) list.push({ icon: "CRN", name: "BONE CROWN", text: `+${pct(crown)}% DMG`, color: [200, 170, 255], label: `+${pct(crown)}%` });
    const aspd = this.armorSpeed(), fullSet = this.armorFullSet();
    const spd2 = aspd ? `, ${signedPct(aspd)}% SPEED` : "";
    if (armor > 0) list.push({ icon: "ARM", name: "ARMOR", text: `-${pct(armor)}% PHYSICAL DMG${aspd ? spd2 : ""}`, color: [170, 150, 120], label: `-${pct(armor)}%` });
    if (fullSet) list.push({ icon: "SET", name: `FULL ${ARMOR.sets[fullSet].name} SET`, text: ARMOR.sets[fullSet].full.text, color: ARMOR.sets[fullSet].color, label: "SET" });
    if (spd > 0) list.push({ icon: "SPD", name: "SPEED", text: `+${pct(spd)}% SPEED`, color: [110, 200, 255], label: `+${pct(spd)}%` });
    return list.map((b) => ({ ...b, positive: true, permanent: true }));
  }

  // Все перезарядки — «часиками» ПОД хотбаром: { icon, color, progress (0…1 — сколько уже прошло), left, draw? }
  cooldownList() {
    const p = this.player;
    const list = [];
    const cur = this.abilities.current;
    const atk = cur?.attack;
    // Оружие в руках: перезарядка обоймы и долгая перезарядка удара / выстрела (от 0.8 с)
    if (atk?.reloading) list.push({ icon: "RLD", color: [240, 196, 80], progress: atk.reloadProgress, left: atk.reloadLeft });
    else if (atk && atk.cooldownLeft > 0.05) {
      const total = Math.max(atk.cooldownLeft, atk.cooldown);
      if (total >= 0.8) list.push({ icon: "ATK", color: [220, 220, 230], progress: 1 - atk.cooldownLeft / total, left: atk.cooldownLeft, draw: cur.drawIcon ? (ui, x, y, s) => cur.drawIcon(ui, x, y, s, this) : null });
    }
    if (cur?.blocks && this.blockCooldown > 0) list.push({ icon: "BLK", color: [150, 200, 255], progress: 1 - this.blockCooldown / BLOCK.cooldown, left: this.blockCooldown });
    // Гарантированный крит бойца
    const crit = this.talents.rank("f-crit");
    const cl = crit && this.playerClass === "melee" ? critCooldown(p, "fighter-crit") : 0;
    if (cl > 0) list.push({ icon: "CRT", color: [255, 210, 80], progress: 1 - cl / (crit > 1 ? 7 : 8), left: cl });
    // Разбег с копьём
    if (this.mountCd > 0) list.push({ icon: "MNT", color: [200, 160, 110], progress: 1 - this.mountCd / this.mountCooldown(), left: this.mountCd }); // маунт (Z)
    if (this.spearCd > 0) list.push({ icon: "CHG", color: [255, 200, 90], progress: 1 - this.spearCd / SPEAR.cooldown, left: this.spearCd });
    return list;
  }

  // Окно поверх мира — карта, таланты, магазин, инвентарь, торговля. В одиночной игре мир на паузе, пока окно
  // открыто; в сетевой время не стоит (движок: scene.live — мир под окном живёт)
  pushLive(scene) {
    scene.live = this.role !== "solo";
    this.engine.push(scene);
  }

  // ПКМ с копьём: разбег (SPEAR). Перезарядка — после конца разбега
  startSpearCharge() {
    if (this.spearRun.active) return;
    if (this.spearCd > 0) return this.engine.toast(`CHARGE READY IN ${Math.ceil(this.spearCd)} S`, 700);
    this.beforeMovementSkill(); // верхом — сначала слезть (MOUNT)
    if (this.stamina && (this.stamina.value < SPEAR.minStamina || this.stamina.exhausted)) return this.noStamina(); // выдохся — не разбежаться
    // Талант MOMENTUM: разгон до +30/60/90 % скорости (за rampTime с), а насквозь — на +2/4/6 врагов больше
    const r = this.talents.rank("spear-momentum");
    const bonus = r ? SPEAR.momentum.speed[r - 1] : 0;
    this.spearRun.maxSpeed = SPEAR.charge.speed * (1 + bonus);
    this.spearRun.ramp = bonus ? (SPEAR.charge.speed * bonus) / SPEAR.momentum.rampTime : 0;
    this.spearMaxHits = SPEAR.maxHits + (r ? SPEAR.momentum.hits[r - 1] : 0);
    this.spearRun.start(this.player, this.look.yaw);
    this.spearHits = new Set();
    this.spearTip = null; // где был наконечник в прошлом кадре (урон — по всему пройденному отрезку)
    this.spearAttack ||= new MeleeAttack(ATTACKS.spearCharge);
    this.engine.sound.play("growl", { volume: 0.5 });
  }

  // Разбег идёт: держим ПКМ — бежим, тратится выносливость (как бег). Кого прошёл наконечник — урон (больше
  // на большой скорости), насквозь до SPEAR.maxHits. Отпустил, сменил оружие, упёрся в стену, набрал предел или
  // кончилась выносливость — конец и перезарядка.
  // Урон — по отрезку «наконечник в прошлом кадре → сейчас»: на большой скорости никого не проскакиваем
  spearControl(dt) {
    this.spearCd = Math.max(0, this.spearCd - dt);
    const run = this.spearRun;
    if (!run.active) return;
    const p = this.player;
    const end = () => {
      run.stop();
      this.spearCd = SPEAR.cooldown;
    };
    if (this.background || !this.engine.input.isDown("secondary") || this.abilities.current?.id !== "spear" || !p.alive) return end();
    if (p.blocked && run.elapsed > 0.25) return end(); // упёрлись в стену
    if (this.stamina?.exhausted) return end(); //          выдохся
    if (!this.stamina && run.elapsed >= SPEAR.maxTime) return end(); // без выносливости — предел по времени
    run.update(dt, this.look.yaw);
    if (!run.active) return end();
    const tip = { x: p.position.x + Math.sin(run.yaw) * SPEAR.tip, z: p.position.z + Math.cos(run.yaw) * SPEAR.tip };
    const from = this.spearTip || tip;
    this.spearTip = tip;
    const sx = tip.x - from.x, sz = tip.z - from.z, len2 = sx * sx + sz * sz;
    for (const e of this.entities.list) {
      if (this.spearHits.size >= this.spearMaxHits) break;
      if (e === p || !e.alive || this.spearHits.has(e) || !p.isHostileTo(e)) continue;
      // дёшево — сначала: по высоте и до отрезка; луч (стена между) — только для тех, кто рядом
      const dy = e.position.y - p.position.y;
      if (dy < -1.2 || dy > 1.8) continue;
      const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((e.position.x - from.x) * sx + (e.position.z - from.z) * sz) / len2)) : 0;
      if (Math.hypot(e.position.x - (from.x + sx * t), e.position.z - (from.z + sz * t)) > SPEAR.hitRadius + e.radius) continue;
      if (!e.canBeDamagedBy(p) || this.blockedBetween(p, e)) continue;
      this.spearHits.add(e);
      const k = run.power ** SPEAR.powerExp; // быстрее бежишь — сильнее бьёшь (с MOMENTUM 3 — до ×2.6)
      this.spearAttack.hit(p, e, this.combatContext({ baseDamage: this.spearAttack.roll() * k, onHit: (h) => this.onPlayerHit(h) }));
      this.engine.sound.play("hit", { at: e.position });
    }
    if (this.spearHits.size >= this.spearMaxHits) end(); // насадили сколько могли — хватит
  }

  // JUMP SLAM: во сколько раз сильнее удар после падения с высоты fall (м)
  slamFallMultiplier(fall) {
    if (!this.talentStats?.hammerLeap) return 1;
    return Math.min(HAMMER.maxMult, 1 + Math.floor(fall / HAMMER.step + 1e-6) * HAMMER.perStep); // ступеньками по step блока
  }

  // Боевой молот ударил о землю (движок: SlamAttack → onSlam): круг удара, тряска экрана, звук
  hammerSlam(center, radius, hits, info = {}) {
    // След удара, как у катаны, только вертикальный — молот идёт сверху вниз к точке удара (плоский, сразу)
    const H = ATTACKS.warHammer;
    // Тяжёлый удар: герой на миг замирает (HAMMER.root с), камера стоит — как в конце рывка ИАЙ
    dash(this.player, 0, 0, 0, HAMMER.root, 0);
    this.actionLock.lock(HAMMER.root, { look: true });
    // длина — от глаз до точки удара на земле (+ чуть дальше), а не радиус круга: иначе след уходит за цель
    this.slashTrail({ arc: 0 }, { arc: 100, reach: Math.hypot(H.distance, PLAYER.eyeHeight) + 0.4, from: 0, to: 0, delay: 0, instant: true, roll: Math.PI / 2 });
    if (info.k > 1.05) {
      // Удар с прыжка — круг шире и ярче, и надпись, во сколько раз сильнее
      this.beams.ring({ x: center.x, y: center.y + 0.05, z: center.z }, radius * 1.3, { color: [255, 210, 120], life: 0.35, width: 9 });
      this.engine.toast(`JUMP SLAM X${info.k.toFixed(1)}`, 700);
    }
    this.beams.ring({ x: center.x, y: center.y + 0.05, z: center.z }, radius, { color: [210, 200, 180], life: 0.3, width: 7 });
    this.beams.ring({ x: center.x, y: center.y + 0.05, z: center.z }, radius * 0.5, { color: [160, 150, 130], life: 0.2, width: 5, segments: 12 });
    this.shake.add(SHAKE.hammer + SHAKE.jumpSlam * Math.max(0, (info.k || 1) - 1)); // с прыжка — сильнее
    this.engine.sound.play(hits.length ? "hit" : "place", { at: center });
  }

  // Автомат выстрелил: талант GRENADE — каждые 15 выстрелов граната (200 % урона выстрела по площади)
  onRifleShot(attack) {
    if (!this.talentStats.rifleGrenade) return;
    this.rifleShots = (this.rifleShots || 0) + 1;
    if (this.rifleShots < ATTACKS.grenade.every) return;
    this.rifleShots = 0;
    const G = ATTACKS.grenade;
    const nade = new MagicAttack({ ...G, damage: Math.round(ATTACKS.auto.damage * 2) });
    nade.kind = "ranged";
    const dir = this.rig.camera.lookDirection();
    const from = this.handPoint();
    const boom = (p) => this.explode(nade, p.position, [], { radius: G.radius });
    this.projectiles.launch({ owner: this.player, position: from, velocity: dir.scale(G.speed), item: "grenade", gravity: 12, spin: 2, maxLife: 3, onHit: boom, onLand: boom, onExpire: boom });
    this.engine.sound.play("cast");
  }

  // Кабаны крепчают по счёту появлений мобов (BOAR_SCALE)
  // (worldHp не сохраняется — всегда считается заново от счёта). keepHp — после загрузки: здоровье уже из сохранения
  scaleBoars(keepHp = false) {
    const n = this.spawner.spawned;
    const g = BOAR_SCALE;
    const def = CREATURES.boar;
    const worldHp = grow(0, n, g.hp);
    for (const e of this.entities.list) {
      if (e.type !== "boar" || !e.alive) continue;
      e.worldHp = worldHp;
      e.xp = grow(def.xp, n, g.xp);
      if (e.attack) e.attack.damage = grow(ATTACKS.boarTusk.damage, n, g.damage);
      const hp = e.stats.hp;
      e.setMaxHp(def.maxHp + (e.bonusHp || 0) + worldHp);
      if (keepHp) e.stats.hp = Math.min(hp, e.stats.maxHp);
    }
  }

  // Страж растёт вместе с мобами (тот же счёт появлений): здоровье — как у мобов, урон — медленнее
  scaleWardens() {
    const n = this.spawner.spawned;
    const g = WARDEN_GROWTH;
    for (const e of this.entities.list) {
      if (e.type !== "warden" || !e.alive) continue;
      e.setMaxHp(grow(CREATURES.warden.maxHp, n, g.hp));
      if (e.attack) e.attack.damage = grow(ATTACKS.wardenSword.damage, n, g.damage);
    }
  }
}
