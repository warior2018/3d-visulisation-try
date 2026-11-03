// ============================================================
//  Частицы мира (движок: engine/graphics/particles.js — 3D, с глубиной): кровь и костяная крошка при ударе,
//  огонь и дым взрыва, искры от пули в блок, крошка сломанного блока. Цвета и силу — FX (config.js)
// ============================================================

import { FX } from "../config.js";

export class EffectsPart {
  // Попали по существу: брызги его «крови» (у скелета — костяная крошка) от удара
  hitFx(e, d, dealt) {
    if (!this.fx || dealt <= 0) return;
    const color = FX.blood[e.type] || FX.blood.default;
    const head = d?.part === "head";
    const at = { x: e.position.x, y: e.position.y + e.height * (head ? 0.85 : 0.55), z: e.position.z };
    const src = d?.source?.position;
    let dir = null;
    if (src) {
      const dx = at.x - src.x, dz = at.z - src.z, l = Math.hypot(dx, dz) || 1;
      dir = { x: (dx / l) * 0.8, y: 0.3, z: (dz / l) * 0.8 }; // брызги — от того, кто ударил
    }
    this.fx.burst(at, {
      count: Math.min(FX.bloodMax, 3 + Math.round(dealt / FX.bloodPer)), speed: 2.6, spread: 0.7, dir, up: 1,
      color, size: 0.06, life: 0.7, gravity: 11, drag: 1, ground: e.position.y + 0.02, bounce: 0.15,
    });
  }

  // Взрыв: вспышка огня (быстро гаснет) и клубы дыма (медленно поднимаются и растут)
  boomFx(at, radius = 2) {
    if (!this.fx) return;
    this.fx.burst(at, { count: 18 + Math.round(radius * 6), speed: radius * 3.2, color: FX.fire, size: 0.16, life: 0.35, drag: 3, grow: 0.3, up: 0.6 });
    this.fx.burst(at, { count: 10, speed: radius * 1.8, color: FX.fireCore, size: 0.1, life: 0.25, drag: 4, grow: 0.2 });
    this.fx.burst({ x: at.x, y: at.y + 0.3, z: at.z }, { count: 10 + Math.round(radius * 3), speed: 1.2, up: 1.5, color: FX.smoke, alpha: 0.55, size: 0.3, life: 1.6, drag: 1.5, gravity: -0.8, grow: 3 });
  }

  // Пуля в блок: искры и пыль
  sparkFx(at) {
    if (!this.fx) return;
    this.fx.burst(at, { count: 5, speed: 2.5, color: FX.spark, size: 0.035, life: 0.25, gravity: 9, drag: 1 });
    this.fx.burst(at, { count: 3, speed: 0.6, color: FX.dust, alpha: 0.6, size: 0.08, life: 0.6, grow: 2, drag: 2 });
  }

  // Сломали блок: крошка его цвета
  blockFx(x, y, z, color) {
    if (!this.fx || !color) return;
    this.fx.burst({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { count: 10, speed: 2.2, color, size: 0.12, life: 0.7, gravity: 12, drag: 1, ground: y, bounce: 0.2 });
  }
}
