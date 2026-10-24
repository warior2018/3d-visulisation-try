// Бой: всё одним импортом (то же самое есть и в engine/index.js)
export { Damage } from "./damage.js";
export { ELEMENTS, defineElement } from "./elements.js";
export { StatusEffect, DamageOverTime, Slow, burn, poison, chill, bleed, stun, buff, debuff, parry, BURN_LEVELS } from "./status.js";
export {
  Modifier, convertTo, flatDamage, damageMultiplier, against, critical, withStatus,
  lifesteal, cooldownReduction, executioner, firstStrike, onlyFor, reachBonus, guaranteedCrit, critCooldown,
  firstHit, vsStunned, headshotBonus, rampPerHit, onlyAttack,
} from "./modifiers.js";
export { Attack, MeleeAttack, SlamAttack, RangedAttack, MagicAttack, ItemAttack, TrapAttack, ThrowAttack } from "./attacks.js";
