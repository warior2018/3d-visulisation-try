// ============================================================
//  Рывок и выносливость (DASH), как в Deadlock: выносливость — деления (DASH.pips, базово 3); рывок (Shift —
//  skill3) тратит одно. Деления копятся по одному: каждое — за DASH.recharge секунд (базово 4), пока не полные.
//  Рывок с земли прилипает к полу (DASH.stick): пологие подъёмы и спуски — не отрываясь.
//  Рывок — толчок (DASH.impulse м/с) туда, куда жмёшь клавиши движения (не жмёшь — вперёд, куда смотришь):
//  прибавляется к скорости векторно, дальше гаснет сам (инерция: CharacterController.approach, MOVEMENT.boost*),
//  клавиши его поворачивают. Между рывками — DASH.cooldown. Бега нет: шаг один, разгон — только так.
//  Нельзя: верхом, в капкане / оглушён, лёжа (матч), в рывке способности. Шкала — под прицелом: деления, заполняемое
//  сейчас — полоской.
// ============================================================

import { DASH } from "../config.js";

export class DashPart {
  // Сколько делений всего (база + таланты, если появятся: talentStats.stamina)
  get staminaMax() {
    return DASH.pips + (this.talentStats?.stamina || 0);
  }

  // Каждый тик: деления копятся по одному
  updateDash(dt) {
    this.dashCd = Math.max(0, (this.dashCd || 0) - dt);
    this.updateDashStick();
    const max = this.staminaMax;
    this.pips ??= max;
    if (this.pips > max) this.pips = max;
    if (this.pips >= max) return void (this.pipT = 0);
    const before = Math.floor(((this.pipT || 0) / DASH.recharge) * 20);
    this.pipT = (this.pipT || 0) + dt;
    if (this.pipT >= DASH.recharge) {
      this.pipT -= DASH.recharge;
      this.pips++;
    }
    // полоска растёт — перерисовать интерфейс (раз в 1/20 деления, не каждый тик)
    if (Math.floor((this.pipT / DASH.recharge) * 20) !== before || this.pips >= max) this.engine.redraw();
  }

  // Shift: рывок, если есть деление
  tryDash() {
    const p = this.player;
    if (!p?.alive || this.downed || p.mount || p.dash || this.pull) return;
    if (p.speedMultiplier < 0.2 || p.stunned) return; // в капкане / оглушён — никуда
    if ((this.dashCd || 0) > 0) return; //               пауза между рывками
    if ((this.pips ?? this.staminaMax) < 1) return this.noStamina?.();
    // куда: клавиши движения относительно взгляда; не жмёшь — вперёд
    const input = this.engine.input;
    let fwd = 0, side = 0;
    if (input.isDown("forward")) fwd += 1;
    if (input.isDown("back")) fwd -= 1;
    if (input.isDown("right")) side += 1;
    if (input.isDown("left")) side -= 1;
    if (!fwd && !side) fwd = 1;
    const yaw = this.look.yaw, s = Math.sin(yaw), c = Math.cos(yaw);
    const dx = s * fwd + c * side, dz = c * fwd - s * side;
    // толчок: прибавляется к нынешней скорости векторно (дальше гаснет и не больше maxMult шагов — controller)
    const l = Math.hypot(dx, dz) || 1;
    p.velocity.x += (dx / l) * DASH.impulse;
    p.velocity.z += (dz / l) * DASH.impulse;
    this.dashCd = DASH.cooldown;
    if (p.onGround) this.groundDash = true; // с земли — прилипает к полу (updateDashStick)
    this.pips = (this.pips ?? this.staminaMax) - 1;
    this.engine.sound.play("dash");
    this.fx?.burst({ x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, speed: 2, color: [210, 210, 220], size: 0.06, life: 0.35, gravity: 1, drag: 3 });
    this.engine.redraw();
  }

  // Рывок с земли: пока разгон не погас — ступенька вверх и вниз до DASH.stick блоков (физика: stepHeight), то
  // есть по пологому подъёму / спуску скользит по полу и считается на земле. Оторвался (большой перепад, прыжок),
  // разгон погас — обычная ступенька
  updateDashStick() {
    const p = this.player;
    if (!this.groundDash || !p) return;
    const walk = (this.controller?.speed || 4) * Math.max(1, p.speedMultiplier) + 0.1;
    const over = !p.alive || !p.onGround || p.velocity.y > 0.5 || Math.hypot(p.velocity.x, p.velocity.z) <= walk;
    if (over) {
      this.groundDash = false;
      if (p.stepHeight === DASH.stick) delete p.stepHeight;
    } else p.stepHeight = DASH.stick;
  }

  // Под прицелом: деления выносливости (полные — светлые, копящееся — полоской)
  drawStaminaPips(ui) {
    const p = this.player;
    if (!p?.alive) return;
    const max = this.staminaMax, have = this.pips ?? max;
    const w = 22, h = 5, gap = 4, total = max * w + (max - 1) * gap;
    const x0 = Math.round(ui.width / 2 - total / 2), y = Math.round(ui.height / 2 + 24);
    for (let i = 0; i < max; i++) {
      const x = x0 + i * (w + gap);
      ui.rect(x - 1, y - 1, w + 2, h + 2, [10, 12, 16], 170);
      if (i < have) ui.rect(x, y, w, h, [235, 225, 150], 235);
      else if (i === have) {
        ui.rect(x, y, w, h, [70, 70, 76], 200);
        ui.rect(x, y, Math.round(w * Math.min(1, (this.pipT || 0) / DASH.recharge)), h, [150, 140, 90], 220);
      } else ui.rect(x, y, w, h, [70, 70, 76], 200);
    }
  }
}
