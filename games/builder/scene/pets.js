// ============================================================
//  Сцена «мир», часть: Приручённые звери.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { SHOP, STANCE, CROUCH, PLAYER, HAMMER } from "../config.js";
import { setNotice, StatusEffect } from "../../../engine/index.js";

// Баф аптечки: лечит share макс. HP за time с (каждая стопка — ещё столько же); новая аптечка — время заново
class MedkitRegen extends StatusEffect {
  constructor() {
    const R = SHOP.medkitRegen;
    super({ id: "medkit-regen", name: "HEALING", duration: R.time, interval: 0.5, stackable: true, maxStacks: R.maxStacks, positive: true, icon: "MED", color: [120, 230, 140] });
  }
  tick(e) {
    const R = SHOP.medkitRegen;
    e.heal(((e.stats.maxHp * R.share) / R.time) * this.interval * this.stacks);
  }
}

// Ниже ростом: low — 0 стоя, 1 стойка катаны, 2 присед. Рост (коробка) и хитбоксы — голова опускается вместе
// с ростом. Для своего героя и для героев других игроков (сеть: state.cr, снимок — флаги 16 / 32)
export const lowHeight = (low) => (low === 2 ? CROUCH.height : low === 1 ? STANCE.height : PLAYER.height);
export function lowerBody(e, low, { height = true } = {}) {
  e.baseHitboxes ||= e.hitboxes;
  const h = lowHeight(low);
  if (height) e.height = h;
  e.netLow = low;
  setNotice(e, "crouch", low === 2 ? CROUCH.notice : null); // присел — мобы замечают ближе
  const dy = h - PLAYER.height;
  e.hitboxes = low ? e.baseHitboxes.map((p) => ({ ...p, min: [p.min[0], p.min[1] + dy, p.min[2]], max: [p.max[0], p.max[1] + dy, p.max[2]] })) : e.baseHitboxes;
}

export class PetsPart {
  // ---------- Приручённые звери ----------

  // Средняя ячейка: аптечка
  useMedkit() {
    const p = this.player;
    if (this.itemCount("medkit") <= 0) return;
    this.takeItem("medkit", 1);
    p.heal(SHOP.medkitHeal);
    p.addStatus(new MedkitRegen()); // и лечение со временем (стопками)
    this.engine.sound.play("learn");
    this.engine.toast(`+${SHOP.medkitHeal} HP`, 800);
    this.backToWeapon(); // использовал — снова оружие
  }

  // Присед (Ctrl, CROUCH) и стойка самурая (катана в руках, STANCE): колени согнуты, рост и глаза ниже (плавно),
  // голова (хитбокс) — тоже. В приседе медленнее, у стволов меньше отдача и разброс (combat.js). Встаём в полный
  // рост (или из приседа — в стойку), как только над головой есть место. Во время рывка (коробка сжата) не трогаем
  crouchWanted() {
    if (this.background || this.player.mount || this.downed) return false;
    if (this.settings.general.crouchMode === "toggle") return !!this.crouchToggle;
    return this.engine.input.isDown("crouch");
  }

  updateStance(dt) {
    const p = this.player;
    const want = this.crouchWanted() ? 2 : this.abilities.current?.id === "katana" ? 1 : 0;
    const now = this.lowStance ? (this.crouched ? 2 : 1) : 0;
    if (!p.streamlined && want !== now) {
      if (lowHeight(want) <= p.height) p.height = lowHeight(want); // ниже — всегда можно (ноги на месте)
      else {
        const was = p.height;
        p.height = lowHeight(want);
        if (this.physics.collides(p)) p.height = was; // над головой блок — пока ниже
      }
      const low = p.height === lowHeight(2) ? 2 : p.height === lowHeight(1) ? 1 : 0;
      this.lowStance = low > 0;
      this.crouched = low === 2;
      lowerBody(p, low, { height: false });
    }
    if (this.crouched) p.speedBonuses.crouch = CROUCH.speed;
    else delete p.speedBonuses.crouch;
    const goal = this.crouched ? CROUCH.eyeHeight : this.lowStance ? STANCE.eyeHeight : PLAYER.eyeHeight;
    this.eyeY ??= goal;
    this.eyeY += Math.sign(goal - this.eyeY) * Math.min(Math.abs(goal - this.eyeY), dt * 1.5); // ~0.13 с на смену
  }

  // Боевой молот: пока идёт удар — на 40 % медленнее, в воздухе падаем быстрее (удар — о землю);
  // талант JUMP SLAM — с молотом в руках прыжок выше на 80 % (HAMMER)
  hammerControl(dt) {
    const p = this.player;
    const swinging = !!this.abilityCache.get("war-hammer")?.attack.pending;
    if (swinging) p.speedBonuses.hammer = HAMMER.slow;
    else delete p.speedBonuses.hammer;
    // Удар молотом в воздухе — это уже атака: пока не ударил о землю (и ещё чуть после), прыгать нельзя —
    // иначе зажатый пробел подбрасывал снова в момент приземления, и удара не было
    if (swinging) this.slamJumpLock = 0.2;
    else this.slamJumpLock = Math.max(0, (this.slamJumpLock || 0) - dt);
    this.controller.jumpBlocked = swinging || this.slamJumpLock > 0;
    if (swinging && !p.onGround) p.velocity.y -= HAMMER.fastFall * dt;
    const leap = this.talentStats?.hammerLeap && this.abilities.current?.id === "war-hammer" ? HAMMER.leap : 0;
    this.controller.jumpHeight = PLAYER.jumpHeight * (1 + (this.talentStats?.jumpMult || 0) + leap);
  }
}
