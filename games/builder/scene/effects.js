// ============================================================
//  Частицы мира (движок: engine/graphics/particles.js — 3D, с глубиной): кровь и костяная крошка при ударе,
//  огонь и дым взрыва, искры от пули в блок, крошка сломанного блока. Цвета и силу — FX (config.js)
// ============================================================

import { FX, FLASH } from "../config.js";

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
  // color — свой цвет огня (скин оружия), иначе обычный
  // Вспышка света (FLASH): светит life с, гаснет к концу (renderer.setLights — updateFlashes)
  flash(at, { radius = 4, power = 1, life = 0.1, color = [255, 200, 130] } = {}) {
    (this.flashes ||= []).push({ x: at.x, y: at.y, z: at.z, radius, power, life, left: life, color: color.map((c) => (c > 1 ? c / 255 : c)) });
  }

  // Каждый тик: вспышки гаснут; светящиеся снаряды (стрелы, болты, сгустки — glow / FLASH.items) светят, пока летят.
  // В рисовальщик — 8 ближайших к камере
  updateFlashes(dt) {
    const list = [];
    this.flashes = (this.flashes || []).filter((f) => (f.left -= dt) > 0);
    for (const f of this.flashes) {
      const k = f.left / f.life;
      list.push({ x: f.x, y: f.y, z: f.z, radius: f.radius, color: f.color, power: f.power * k * k });
    }
    const P = FLASH.projectile;
    for (const p of this.projectiles?.list || []) {
      const c = p.glow || FLASH.items[p.item];
      if (!c) continue;
      list.push({ x: p.position.x, y: p.position.y, z: p.position.z, radius: P.radius, power: P.power, color: c.map((v) => (v > 1 ? v / 255 : v)) });
    }
    const cam = this.look?.position || this.player?.position;
    if (cam && list.length > 8) list.sort((a, b) => Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z) - Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z));
    this.activeLights = list.slice(0, 8);
    this.engine.renderer?.setLights?.(this.settings.graphics?.lighting === false ? [] : this.activeLights);
  }

  // Свет вспышек в точке (модели: lightHere)
  flashLightAt(x, y, z) {
    let k = 0;
    for (const l of this.activeLights || []) {
      const d = Math.hypot(x - l.x, y - l.y, z - l.z);
      if (d < l.radius) k += l.power * (1 - d / l.radius) ** 2;
    }
    return k;
  }

  boomFx(at, radius = 2, color = null) {
    const F = FLASH.boom;
    this.flash({ x: at.x, y: at.y + 0.5, z: at.z }, { radius: Math.max(F.radius, radius * F.perRadius), power: F.power, life: F.life, color: color || F.color });
    if (!this.fx) return;
    this.fx.burst(at, { count: 18 + Math.round(radius * 6), speed: radius * 3.2, color: color || FX.fire, size: 0.16, life: 0.35, drag: 3, grow: 0.3, up: 0.6 });
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
