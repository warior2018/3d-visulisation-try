// ============================================================
//  Ветер от приёмов движения (WIND): рывок, прыжок из рывка, прыжок в воздухе, быстрое скольжение (от
//  WIND.slideFrom м/с) — windFx(strength). В мире: короткие светлые полосы позади героя (против движения), видно от 3-го лица
//  (и другим — нет: эффект свой). На экране: несколько тонких полос по краям (слева и справа), быстро гаснут.
// ============================================================

import { WIND } from "../config.js";

export class WindPart {
  // Порыв: strength 0…1+ (рывок — 1, прыжок в воздухе — поменьше)
  windFx(strength = 1) {
    const p = this.player;
    if (!p) return;
    this.windT = Math.max(this.windT || 0, WIND.screen.time * strength);
    this.windK = strength;
    this.windSeed = Math.random() * 1000;
    // полосы позади героя: против скорости (стоит — против взгляда), вокруг тела
    const v = p.velocity, s = Math.hypot(v.x, v.z);
    const bx = s > 0.5 ? -v.x / s : -Math.sin(this.look.yaw), bz = s > 0.5 ? -v.z / s : -Math.cos(this.look.yaw);
    const sx = -bz, sz = bx; // вбок
    const n = Math.round(WIND.world.count * strength);
    for (let i = 0; i < n; i++) {
      const side = (Math.random() * 2 - 1) * 0.55, up = 0.2 + Math.random() * 1.3, back = 0.3 + Math.random() * 0.5;
      const len = WIND.world.length * (0.6 + Math.random() * 0.6);
      const from = { x: p.position.x + bx * back + sx * side, y: p.position.y + up, z: p.position.z + bz * back + sz * side };
      const to = { x: from.x + bx * len, y: from.y + (Math.random() - 0.5) * 0.1, z: from.z + bz * len };
      this.beams?.add({ from, to, color: WIND.world.color, core: [255, 255, 255], life: WIND.world.life * (0.7 + Math.random() * 0.6), width: WIND.world.width });
    }
    this.engine.redraw();
  }

  updateWind(dt) {
    if (!(this.windT > 0)) return;
    this.windT = Math.max(0, this.windT - dt);
    this.engine.redraw();
  }

  // По краям экрана: тонкие полосы, к центру короче; гаснут за WIND.screen.time
  drawWind(ui) {
    if (!(this.windT > 0)) return;
    const S = WIND.screen, k = Math.min(1, this.windT / S.time), a = Math.round(S.alpha * k * Math.min(1, this.windK || 1));
    let seed = this.windSeed || 1;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < S.count; i++) {
      const left = i % 2 === 0, y = ui.height * (0.15 + rnd() * 0.7);
      const len = ui.width * S.length * (0.5 + rnd()) * (0.6 + 0.4 * k), w = left ? 0 : ui.width - len;
      const x = left ? -len * (1 - k) * 0.3 : w + len * (1 - k) * 0.3; // уезжают к краю, пока гаснут
      ui.rect(Math.round(x), Math.round(y), Math.round(len), S.thick, [235, 240, 250], a);
    }
  }
}
