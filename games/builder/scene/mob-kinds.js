// ============================================================
//  Особые мобы (MOB_KINDS в config.js; паспорта — creatures.js):
//    УПЫРЬ — кровотечение и вампиризм;  МУМИЯ — бинты замедляют, горение ×2;
//    КОСТЯНОЙ ШАМАН — лечит мобов рядом;  ГОБЛИН-ТРАППЕР — капканы, увороты, бегство;
//    ЧУМНОЙ ВОЖАК (минибосс) — призыв упырей, чумная аура.
//  Здесь же — общий «моб ранил кого-то» (mobOnHit: зовёт onDamage цели) и счётчик для боссов.
// ============================================================

import { Damage, Slow, TrapAttack, withStatus, bleed } from "../../../engine/index.js";
import { MOB_KINDS, ATTACKS, MINION } from "../config.js";
import { mobGrowth } from "../creatures.js";

export class MobKindsPart {
  // Призвать миньона (босс, минибосс): статы ×MINION.stats, опыт ×MINION.xp, без добычи; злится на цель хозяина
  summonMinion(type, owner, at, growth = {}) {
    const m = this.spawn(type, { ...at, ...growth });
    if (!m) return null;
    const k = MINION.stats, half = (v) => Math.max(1, Math.round(v * k));
    m.stats.maxHp = half(m.stats.maxHp);
    m.stats.hp = m.stats.maxHp;
    if (m.attack) m.attack.damage = Array.isArray(m.attack.damage) ? m.attack.damage.map(half) : half(m.attack.damage);
    if (m.rangedDamage) m.rangedDamage = m.rangedDamage.map(half);
    m.xp = Math.round((m.xp || 0) * MINION.xp);
    m.inventory?.loadFrom([]); // без добычи
    m.raisedBy = owner;
    m.aggro = owner.aggro || null;
    return m;
  }

  // Новое существо (spawn): свои пассивки
  setupMobKind(e) {
    const K = MOB_KINDS;
    if (e.type === "mummy") {
      // горение (стихия огонь, статус) — ×burn; сам выстрел / взрыв — как обычно
      const before = e.onIncoming;
      e.onIncoming = (d) => {
        before?.(d);
        if (d.tags?.has("dot") && d.element === "fire") d.amount *= K.mummy.burn;
      };
    }
    if (e.type === "goblin") {
      // увернулся от выстрела (пуля, стрела, снаряд — не горение)
      const before = e.onIncoming;
      e.onIncoming = (d) => {
        before?.(d);
        if (d.kind === "ranged" && !d.tags?.has("dot") && Math.random() < K.goblin.dodge) {
          d.amount = 0;
          d.dodged = true;
          this.engine.sound.play("swing", { at: e.position, volume: 0.6 });
        }
      };
    }
    if (e.type === "champion") {
      e.miniboss = true;
      e.summonTimer = K.champion.summon.every * 0.5;
    }
  }

  // Кто-то ранил victim (зовёт onDamage цели): эффекты атак мобов; босс — «ещё дерётся» (bosses.js → bossLeave)
  mobOnHit(victim, d, dealt) {
    const src = d?.source;
    if (!src || dealt <= 0 || src === victim) return;
    if (src.boss) src.bossDealtCalm = 0;
    if (d.tags?.has("dot") || !victim.alive) return;
    const K = MOB_KINDS;
    if (src.type === "ghoul" && d.kind === "melee") {
      victim.addStatus?.(bleed(K.ghoul.bleed, 3)(src)); // когти — кровотечение
      if (src.alive) src.heal(dealt * K.ghoul.lifesteal); // и вампиризм
    }
    if (src.type === "mummy" && d.kind === "melee") {
      const S = K.mummy.slow;
      victim.addStatus?.(new Slow({ id: "wrapped", name: "WRAPPED", duration: S.time, factor: S.factor, icon: "WRP", color: [220, 205, 160] }));
    }
  }

  // Каждый тик: лечение шамана, капканы гоблина, призыв и аура вожака
  updateMobKinds(dt) {
    const K = MOB_KINDS;
    this.mobKindClock = (this.mobKindClock || 0) + dt;
    for (const e of this.entities.list) {
      if (!e.alive || e.remote || e.kind !== "mob") continue;
      if (e.type === "shaman") this.shamanTick(e, dt, K.shaman);
      else if (e.type === "goblin") this.goblinTick(e, dt, K.goblin);
      else if (e.type === "champion") this.championTick(e, dt, K.champion);
    }
  }

  shamanTick(e, dt, S) {
    e.healTimer = (e.healTimer ?? S.heal.every) - dt;
    if (e.healTimer > 0) return;
    e.healTimer = S.heal.every;
    let n = 0;
    for (const m of this.mobsNear(e, S.heal.radius)) {
      if (m.boss || m.stats.hp >= m.stats.maxHp) continue;
      m.heal(S.heal.amount);
      n++;
      this.beams?.add({ from: { x: e.position.x, y: e.position.y + 1.6, z: e.position.z }, to: { x: m.position.x, y: m.position.y + m.height * 0.6, z: m.position.z }, color: [120, 230, 120], core: [220, 255, 220], life: 0.25, width: 4 });
    }
    if (n && this.fx) this.fx.burst({ x: e.position.x, y: e.position.y + 1.8, z: e.position.z }, { count: 6, speed: 0.8, color: [130, 240, 130], size: 0.07, life: 0.6, gravity: -1.5, drag: 1 });
  }

  goblinTick(e, dt, G) {
    // ранен — убегает (mobKindMove разворачивает его от цели)
    e.fleeing = e.stats.hp < e.stats.maxHp * G.flee;
    e.speedBonuses.flee = e.fleeing ? G.fleeSpeed : 0;
    if (!e.aggro) return;
    e.trapTimer = (e.trapTimer ?? G.trap.every * 0.5) - dt;
    if (e.trapTimer > 0) return;
    e.trapTimer = G.trap.every;
    const mine = this.traps.list.filter((t) => t.owner === e);
    if (mine.length >= G.trap.max) this.traps.remove?.(mine[0]);
    const root = () => new Slow({ id: "trapped", name: "TRAPPED", duration: G.trap.root, factor: 0.05, icon: "TRP", color: [190, 190, 196] });
    const attack = new TrapAttack({ ...ATTACKS.goblinTrap, filter: (o) => o.alive && e.isHostileTo(o), modifiers: [withStatus(root, 1)] });
    const t = this.traps.place({ type: "bear-trap", attack, position: { x: e.position.x, y: e.position.y, z: e.position.z }, owner: e, yaw: Math.random() * Math.PI * 2, lifetime: G.trap.lifetime });
    t.noSave = true; // капканы гоблина не сохраняются
    this.engine.sound.play("trapSet", { at: e.position });
  }

  // После мозгов: гоблин убегает — скорость от цели (мозги гнали к ней)
  mobKindMove(e) {
    if (e.type !== "goblin" || !e.fleeing || !e.aggro?.position) return;
    const dx = e.position.x - e.aggro.position.x, dz = e.position.z - e.aggro.position.z;
    const l = Math.hypot(dx, dz) || 1;
    const v = e.speed * (1 + (e.speedBonuses.flee || 0));
    e.velocity.x = (dx / l) * v;
    e.velocity.z = (dz / l) * v;
    e.yaw = Math.atan2(dx, dz);
  }

  championTick(e, dt, C) {
    // чумная аура: зелёные искры, урон героям и страже рядом раз в 0.5 с
    if (this.fx && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * C.aura.radius;
      this.fx.burst({ x: e.position.x + Math.sin(a) * r, y: e.position.y + 0.2, z: e.position.z + Math.cos(a) * r }, { count: 1, speed: 0.3, color: [140, 200, 60], size: 0.09, life: 0.8, gravity: -1, drag: 1 });
    }
    e.auraTimer = (e.auraTimer ?? 0.5) - dt;
    if (e.auraTimer <= 0) {
      e.auraTimer = 0.5;
      for (const o of this.entities.list) {
        if (!o.alive || !e.isHostileTo(o)) continue;
        if (Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) > C.aura.radius + (o.radius || 0)) continue;
        o.receive(new Damage({ amount: C.aura.dps * 0.5, element: "poison", source: e, tags: ["dot", "aura"], kind: "magic" }));
      }
    }
    // призыв упырей (не больше max живых)
    if (!e.aggro) return;
    e.summonTimer = (e.summonTimer ?? C.summon.every) - dt;
    if (e.summonTimer > 0) return;
    e.summonTimer = C.summon.every;
    const mine = this.entities.list.filter((m) => m.alive && m.raisedBy === e).length;
    for (let k = 0; k < Math.min(C.summon.count, C.summon.max - mine); k++) {
      const a = Math.random() * Math.PI * 2;
      const x = e.position.x + Math.sin(a) * 2.5, z = e.position.z + Math.cos(a) * 2.5;
      const g = this.summonMinion("ghoul", e, { x, y: this.world.surfaceY?.(x, z) ?? e.position.y, z, yaw: a }, mobGrowth(this.spawner?.spawned || 0));
      if (!g) continue;
      this.beams?.ring({ x, y: g.position.y + 0.05, z }, 0.9, { color: [140, 200, 60], life: 0.4, width: 5 });
    }
    this.engine.sound.play("growl", { at: e.position, volume: 1 });
  }

  // Со спавнера: редкий минибосс рядом с новым мобом (один на мир)
  maybeChampion(near, index) {
    const C = MOB_KINDS.champion;
    if (!near || index < C.from || this.duel || Math.random() >= C.chance) return;
    if (this.entities.list.some((m) => m.alive && m.type === "champion")) return;
    const { x, z } = near.position;
    const e = this.spawn("champion", { x, y: near.position.y, z, yaw: near.yaw, ...mobGrowth(index) });
    if (!e) return;
    this.engine.toast("A PLAGUE CHAMPION HAS RISEN", 3000);
    this.engine.sound.play("growl", { at: e.position, volume: 1 });
    this.engine.log(`минибосс: ${e.name}, ${e.stats.maxHp} HP`);
  }
}
