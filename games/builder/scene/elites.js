// ============================================================
//  Элитные мобы (ELITE): редкий моб с аурой и гарантированной добычей — цель в бою. Видно издалека: крупнее,
//  вокруг — искры цвета ауры; под прицелом — «ELITE: <аура>». Ауры:
//    SWIFT  — быстрее;            THORNS — часть ближнего урона героя возвращается ему;
//    HEALER — лечит мобов рядом;  FRENZY — мобы рядом (и он сам) бьют сильнее.
//  Элита не сохраняется (после загрузки — обычный моб не появится: элиту просто не пишем в сохранение).
// ============================================================

import { ELITE } from "../config.js";
import { Damage, buff, damageMultiplier } from "../../../engine/index.js";

export class ElitesPart {
  // Новый моб со спавнера (index — его номер): может стать элитой
  maybeElite(e, index) {
    const E = ELITE;
    if (!e || e.boss || index < E.from) return;
    const k = this.invasion?.active ? E.invasion : 1;
    if (Math.random() >= E.chance * k) return;
    const ids = Object.keys(E.auras);
    this.makeElite(e, ids[Math.floor(Math.random() * ids.length)]);
  }

  makeElite(e, aura) {
    const E = ELITE, A = E.auras[aura];
    if (!A) return;
    e.elite = aura;
    e.stats.maxHp = Math.round(e.stats.maxHp * E.hp);
    e.stats.hp = e.stats.maxHp;
    e.scale = (e.scale ?? 1) * E.scale;
    // модель больше — и тело, и голова больше: хедшот — по настоящей голове, а не по шее
    e.height = (e.height ?? 1.8) * E.scale;
    e.radius = (e.radius ?? 0.3) * E.scale;
    e.hitboxes = (e.hitboxes || []).map((h) => ({ ...h, min: h.min.map((v) => v * E.scale), max: h.max.map((v) => v * E.scale) }));
    e.xp = Math.round((e.xp || 0) * E.xp);
    const scale = (d) => Math.round(d * E.damage);
    if (e.attack) e.attack.damage = Array.isArray(e.attack.damage) ? e.attack.damage.map(scale) : scale(e.attack.damage);
    if (A.speed) e.speedBonuses.elite = A.speed;
    e.inventory?.add?.("coin", E.coins);
    this.engine.log(`элита: ${e.name} (${aura}), ${e.stats.maxHp} HP`);
  }

  // Каждый тик: ауры и искры
  updateElites(dt) {
    const E = ELITE;
    for (const e of this.entities.list) {
      if (!e.elite || !e.alive) continue;
      const A = E.auras[e.elite];
      e.eliteFx = (e.eliteFx || 0) - dt;
      if (e.eliteFx <= 0 && this.fx) {
        e.eliteFx = 0.18;
        const a = Math.random() * Math.PI * 2, r = (e.radius || 0.4) + 0.25;
        this.fx.burst({ x: e.position.x + Math.sin(a) * r, y: e.position.y + Math.random() * e.height, z: e.position.z + Math.cos(a) * r },
          { count: 2, speed: 0.4, up: 1.2, color: A.color, size: 0.07, life: 0.6, gravity: -1.5, drag: 1 });
      }
      if (e.elite === "healer") {
        e.healTimer = (e.healTimer ?? A.every) - dt;
        if (e.healTimer <= 0) {
          e.healTimer = A.every;
          for (const m of this.mobsNear(e, A.radius)) {
            if (m.stats.hp >= m.stats.maxHp) continue;
            m.stats.hp = Math.min(m.stats.maxHp, m.stats.hp + Math.round(m.stats.maxHp * A.heal));
            this.fx?.burst({ x: m.position.x, y: m.position.y + m.height * 0.7, z: m.position.z }, { count: 4, speed: 0.8, up: 1, color: A.color, size: 0.06, life: 0.5, gravity: -1 });
          }
        }
      }
      if (e.elite === "frenzy") {
        for (const m of this.mobsNear(e, A.radius)) {
          // держится, пока рядом с элитой (полсекунды после)
          const had = m.statuses.find((s) => s.id === "frenzy");
          if (had) had.left = 0.5;
          else m.addStatus(buff({ id: "frenzy", name: "FRENZY", duration: 0.5, color: A.color, modifiers: [damageMultiplier(1 + A.damage)] }));
        }
      }
    }
  }

  mobsNear(e, r) {
    return this.entities.list.filter((m) => m.kind === "mob" && m.alive && Math.hypot(m.position.x - e.position.x, m.position.y - e.position.y, m.position.z - e.position.z) <= r);
  }

  // Урон по элите (зовёт onDamage): шипы — часть ближнего урона обратно герою
  eliteHurt(e, d, dealt) {
    if (e.elite !== "thorns" || dealt <= 0 || d?.source !== this.player || d.kind !== "melee" || d.tags?.has("reflect")) return;
    const amount = Math.max(1, Math.round(dealt * ELITE.auras.thorns.share));
    this.player.receive(new Damage({ amount, source: e, tags: ["reflect"] }));
  }
}
