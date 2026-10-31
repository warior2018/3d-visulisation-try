// ============================================================
//  Сцена «мир», часть: Приручённые звери.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { SHOP, STANCE, PLAYER, HAMMER } from "../config.js";

export class PetsPart {
  // ---------- Приручённые звери ----------

  // Средняя ячейка: аптечка
  useMedkit() {
    const p = this.player;
    if (this.itemCount("medkit") <= 0) return;
    if (p.stats.hp >= p.stats.maxHp) return this.engine.toast("HEALTH IS FULL", 800);
    this.takeItem("medkit", 1);
    p.heal(SHOP.medkitHeal);
    this.engine.sound.play("learn");
    this.engine.toast(`+${SHOP.medkitHeal} HP`, 800);
    this.backToWeapon(); // использовал — снова оружие
  }

  // Стойка самурая: катана в руках — колени согнуты, рост STANCE.height, глаза ниже (плавно). Убрал катану —
  // встаём в полный рост, как только над головой есть место. Во время рывка ИАЙ (коробка сжата) не трогаем
  updateStance(dt) {
    const p = this.player;
    const want = this.abilities.current?.id === "katana";
    if (!p.streamlined && want !== !!this.lowStance) {
      if (want) {
        p.height = STANCE.height; // ниже — всегда можно (ноги на месте)
        this.lowStance = true;
      } else {
        p.height = PLAYER.height;
        if (this.physics.collides(p)) p.height = STANCE.height; // над головой блок — пока в стойке
        else this.lowStance = false;
      }
    }
    const goal = this.lowStance ? STANCE.eyeHeight : PLAYER.eyeHeight;
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
