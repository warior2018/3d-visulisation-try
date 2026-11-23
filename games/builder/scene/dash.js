// ============================================================
//  Рывок и выносливость (DASH), как в Deadlock: выносливость — деления (DASH.pips, базово 2); рывок (Shift —
//  skill3) тратит одно. Деления копятся по одному: каждое — за DASH.recharge секунд (базово 4), пока не полные.
//  Рывок — коротко и быстро туда, куда жмёшь клавиши движения (не жмёшь — вперёд, куда смотришь); в воздухе —
//  ровно по горизонтали (не падаешь, пока длится), по земле — по земле; в стену — скользит вдоль (DASH_SLIDE).
//  Нельзя: верхом, в капкане / оглушён, лёжа (матч), уже в рывке. Шкала — под прицелом: деления, заполняемое
//  сейчас — полоской.
// ============================================================

import { DASH, DASH_SLIDE } from "../config.js";
import { dash } from "../../../engine/index.js";

export class DashPart {
  // Сколько делений всего (база + таланты, если появятся: talentStats.stamina)
  get staminaMax() {
    return DASH.pips + (this.talentStats?.stamina || 0);
  }

  // Каждый тик: деления копятся по одному
  updateDash(dt) {
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
    const air = !p.onGround;
    dash(p, dx, dz, DASH.speed, DASH.time, air ? 0 : null, { slide: DASH_SLIDE }); // в воздухе — ровно, без падения
    this.pips = (this.pips ?? this.staminaMax) - 1;
    this.engine.sound.play("dash");
    this.fx?.burst({ x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, speed: 2, color: [210, 210, 220], size: 0.06, life: 0.35, gravity: 1, drag: 3 });
    this.engine.redraw();
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
