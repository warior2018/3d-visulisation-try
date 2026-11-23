// ============================================================
//  Частицы мира (движок: engine/graphics/particles.js — 3D, с глубиной): кровь и костяная крошка при ударе,
//  огонь и дым взрыва, искры от пули в блок, крошка сломанного блока. Цвета и силу — FX (config.js)
// ============================================================

import { FX, FLASH, TORCH } from "../config.js";
import { skinFx } from "../skins.js";

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
  // hold — сколько из life светит в полную силу (дальше гаснет до конца life)
  flash(at, { radius = 4, power = 1, life = 0.1, hold = 0, color = [255, 200, 130] } = {}) {
    (this.flashes ||= []).push({ x: at.x, y: at.y, z: at.z, radius, power, life, hold: Math.min(hold, life * 0.95), left: life, color: color.map((c) => (c > 1 ? c / 255 : c)) });
  }

  // Каждый тик: вспышки гаснут; светящиеся снаряды (стрелы и болты со скином — light, сгустки — FLASH.items) светят.
  // В рисовальщик — 8 ближайших к камере
  updateFlashes(dt) {
    const list = [];
    this.flashes = (this.flashes || []).filter((f) => (f.left -= dt) > 0);
    for (const f of this.flashes) {
      const fade = f.life - f.hold, k = f.left > fade ? 1 : f.left / Math.max(1e-3, fade); // держит hold с, потом гаснет
      list.push({ x: f.x, y: f.y, z: f.z, radius: f.radius, color: f.color, power: f.power * k * k });
    }
    const P = FLASH.projectile;
    for (const p of this.projectiles?.list || []) {
      const c = p.light || FLASH.items[p.item]; // светит снаряд со скином (огненный, ледяной…) или светящийся сам; простая стрела — нет
      if (!c) continue;
      list.push({ x: p.position.x, y: p.position.y, z: p.position.z, radius: P.radius, power: P.power, color: c.map((v) => (v > 1 ? v / 255 : v)) });
    }
    list.push(...(this.portalLights?.() || [])); // порталы светятся
    list.push(...(this.lavaLights?.() || [])); //   лава светится (scene/biomes.js)
    // факелы других игроков (сеть: e.netTorch) — светят и у нас
    const T = TORCH, tc = [1, 0.85, 0.6];
    for (const e of this.entities?.list || []) {
      if (!e.netTorch || e === this.player || e.alive === false) continue;
      list.push({ x: e.position.x, y: e.position.y + T.height, z: e.position.z, radius: T.radius, power: T.power, color: tc });
    }
    const cam = this.look?.position || this.player?.position;
    if (cam && list.length > 8) list.sort((a, b) => Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z) - Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z));
    this.activeLights = list.slice(0, 8);
    this.engine.renderer?.setLights?.(this.settings.graphics?.lighting === false ? [] : this.activeLights);
  }

  // Каждый кадр: видно состояние существ. Горит (горение от оружия / талантов — цвет скина оружия, без скина —
  // жёлто-оранжевый; солнце — e.sunBurnT) — языки огня вверх и серо-белый дым; кровотечение — капли крови
  // падают с тела вниз (ускоряясь) и ложатся у ног
  statusFx(dt) {
    const fx = this.fx;
    if (!fx || dt <= 0) return;
    const chance = (perSec) => Math.random() < perSec * dt;
    for (const e of this.entities.list) {
      if (!e.alive || e.firefly) continue;
      const h = e.height || 1.6, r = Math.max(0.15, (e.radius || 0.3) * 0.9), p = e.position;
      const onBody = (lo, hi) => ({ x: p.x + (Math.random() * 2 - 1) * r, y: p.y + h * (lo + Math.random() * (hi - lo)), z: p.z + (Math.random() * 2 - 1) * r });
      const burnSt = e.statuses.find((s) => s.id === "burn");
      if (e.sunBurnT > 0) e.sunBurnT -= dt;
      if (burnSt || e.sunBurnT > 0) {
        // цвет: скин оружия героя, который поджёг (запоминаем на статусе при первом кадре); иначе — базовый
        if (burnSt && burnSt.fxColor === undefined) burnSt.fxColor = burnSt.source === this.player ? skinFx(this.settings, this.abilities?.current?.id) || null : null;
        const base = burnSt?.fxColor || null;
        const big = Math.min(2.5, h / 1.6);
        for (let i = 0; i < 2; i++) if (chance(14 * big)) {
          const hot = Math.random() < 0.45;
          const color = base ? base.map((c) => Math.min(255, c * (hot ? 1.25 : 1))) : hot ? [255, 225, 90] : [255, 140, 40];
          fx.emit({ at: onBody(0.1, 0.9), vel: { x: (Math.random() - 0.5) * 0.4, y: 0.8 + Math.random() * 0.8, z: (Math.random() - 0.5) * 0.4 }, life: 0.35 + Math.random() * 0.25, size: 0.05 + Math.random() * 0.04, color, gravity: -2.5, drag: 1.5, grow: 0.3 });
        }
        if (chance(5 * big)) {
          const g = 120 + Math.random() * 110; // от серого до почти белого
          fx.emit({ at: onBody(0.7, 1.05), vel: { x: (Math.random() - 0.5) * 0.3, y: 0.6 + Math.random() * 0.5, z: (Math.random() - 0.5) * 0.3 }, life: 1 + Math.random() * 0.6, size: 0.08 + Math.random() * 0.05, color: [g, g, g + 5], alpha: 0.7, gravity: -0.8, drag: 1, grow: 2.2 });
        }
      }
      // кровотечение: капли (стопки — чаще)
      const stacks = e.statuses.filter((s) => s.id === "bleed").length;
      if (stacks && chance(4 + 3 * stacks)) {
        const dark = Math.random() < 0.4;
        fx.emit({ at: onBody(0.25, 0.85), vel: { x: (Math.random() - 0.5) * 0.3, y: 0, z: (Math.random() - 0.5) * 0.3 }, life: 1.2, size: 0.035 + Math.random() * 0.02, color: dark ? [120, 10, 12] : [190, 20, 24], gravity: 14, ground: p.y + 0.02, bounce: 0, fade: true });
      }
    }
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
