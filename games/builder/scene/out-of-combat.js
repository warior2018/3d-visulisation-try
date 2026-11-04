// ============================================================
//  Вне боя (OUT_OF_COMBAT): рядом нет моба, который охотится на героя, герой давно не получал урона от мобов
//  и сам никого не ранил — быстрее ходит и быстрее лечится. Значок «OOC» среди эффектов, пока действует.
// ============================================================

import { OUT_OF_COMBAT } from "../config.js";

export class OutOfCombatPart {
  // Урон: по герою от моба или героем по кому-то — отметка «в бою» (зовёт onDamage сущности)
  combatHit(e, d, dealt) {
    if (dealt <= 0) return;
    const now = this.combatClock || 0;
    if (e === this.player && d?.source && d.source !== this.player && d.source.kind === "mob") this.lastHurt = now;
    if (d?.source === this.player && e !== this.player) this.lastHit = now;
  }

  // Каждый тик: в бою или нет — и бонусы
  updateOutOfCombat(dt) {
    const p = this.player, O = OUT_OF_COMBAT;
    const now = (this.combatClock = (this.combatClock || 0) + dt);
    const near = this.entities.list.some((e) => e.kind === "mob" && e.alive && e.aggro === p
      && Math.hypot(e.position.x - p.position.x, e.position.y - p.position.y, e.position.z - p.position.z) <= O.radius);
    const recent = now - (this.lastHurt ?? -Infinity) < O.delay || now - (this.lastHit ?? -Infinity) < O.delay;
    const ooc = p.alive && !near && !recent;
    if (ooc !== this.outOfCombat) this.engine.log(ooc ? "вне боя" : "в бою");
    this.outOfCombat = ooc;
    p.speedBonuses.ooc = ooc ? O.speed : 0;
    // регенерация: от талантов (REGENERATION...), вне боя — ×regenMult. Тесты выключают её (regenOff)
    if (!this.regenOff) p.regen = p.stats.maxHp * (this.talentStats?.regenPct || 0) * (ooc ? O.regenMult : 1);
  }
}
