// ============================================================
//  Скольжение (SLIDE), как в Deadlock: нажал присед (Ctrl), а скорость не меньше SLIDE.minSpeed (после рывка,
//  взрыва) — не просто садишься, а скользишь с этим разгоном: трение маленькое (SLIDE.friction), под горку
//  разгоняет, в горку тормозит (SLIDE.gravity × уклон), клавиши поворачивают чуть-чуть (SLIDE.steer). Стоишь или
//  идёшь на склоне (уклон ≥ SLIDE.slope) — присед тоже скольжение: вниз по склону, куда бы ни смотрел (хоть
//  спиной). Кончается: отпустил присед, оторвался от земли (прыжок из скольжения — разгон остаётся), скорость
//  упала ниже SLIDE.endSpeed не на склоне. Пока скользишь — патроны не тратятся (freeAmmo: attacks.js).
//  Движение считает CharacterController (entity.slide), здесь — когда начать / кончить и уклон под ногами.
// ============================================================

import { SLIDE } from "../config.js";

export class SlidePart {
  // Высота опоры под точкой (x, z) около ног (y): верх ближайшего твёрдого вниз (до 2.5 блоков), иначе null
  groundAt(x, z, y) {
    const w = this.world, fx = Math.floor(x), fz = Math.floor(z);
    for (let yy = Math.floor(y + 0.7); yy >= Math.floor(y - 2.5); yy--) if (w.isSolid(fx, yy, fz)) return yy + w.cellTop(fx, yy, fz);
    return null;
  }

  // Уклон под героем: { x, z } — куда вниз (единичный), m — крутизна (перепад на метр)
  slopeUnder(p) {
    const r = SLIDE.sample, y = p.position.y, P = p.position;
    const h = (dx, dz) => this.groundAt(P.x + dx, P.z + dz, y) ?? y - 2.5;
    const gx = (h(-r, 0) - h(r, 0)) / (2 * r), gz = (h(0, -r) - h(0, r)) / (2 * r);
    // ступеньки дают рваный уклон — сглаживаем во времени
    const s = (this.slopeSm ||= { x: 0, z: 0 });
    s.x += (gx - s.x) * 0.35;
    s.z += (gz - s.z) * 0.35;
    const m = Math.hypot(s.x, s.z);
    return { x: m ? s.x / m : 0, z: m ? s.z / m : 0, m };
  }

  // Каждый тик (до управления героем): начать / продолжать / кончить скольжение
  updateSlide(dt) {
    const p = this.player;
    const want = !!this.crouchWanted?.();
    const pressed = want && !this.crouchWas;
    this.crouchWas = want;
    if (!p?.alive || p.mount || this.flying || this.downed) return this.stopSlide();
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    const slope = this.slopeUnder(p);
    const onSlope = p.onGround && slope.m >= SLIDE.slope;
    if (!this.sliding) {
      // присед с разгоном — скольжение; присед на склоне (хоть стоя) — тоже
      if (want && p.onGround && ((pressed && speed >= SLIDE.minSpeed) || onSlope)) this.startSlide(p, slope, speed);
    } else {
      this.slideAir = p.onGround ? 0 : (this.slideAir || 0) + dt;
      if (!want || this.slideAir > 0.15 || (speed < SLIDE.endSpeed && !onSlope)) return this.stopSlide();
    }
    if (!this.sliding) return;
    // разгон под горку / торможение в горку: вдоль уклона (на земле)
    const sl = p.slide;
    sl.ax = p.onGround ? slope.x * slope.m * SLIDE.gravity : 0;
    sl.az = p.onGround ? slope.z * slope.m * SLIDE.gravity : 0;
    // пыль из-под ног
    this.slideFx = (this.slideFx || 0) - dt;
    if (this.slideFx <= 0 && speed > 2) {
      this.slideFx = 0.08;
      this.fx?.burst({ x: p.position.x, y: p.position.y + 0.05, z: p.position.z }, { count: 2, speed: 0.8, color: [170, 160, 140], size: 0.05, life: 0.35, gravity: 1, drag: 3 });
    }
  }

  startSlide(p, slope, speed) {
    this.sliding = true;
    this.slideAir = 0;
    p.slide = { friction: SLIDE.friction, steer: SLIDE.steer, ax: 0, az: 0, cap: SLIDE.maxMult };
    p.freeAmmo = true; // патроны не тратятся (attacks.js → RangedAttack.use)
    // почти стоял на склоне — толчок вниз по склону, чтобы поехать
    if (speed < 1 && slope.m > 0) {
      p.velocity.x += slope.x * SLIDE.push;
      p.velocity.z += slope.z * SLIDE.push;
    }
    this.engine.sound.play("dash", { volume: 0.5 });
  }

  stopSlide() {
    if (!this.sliding) return;
    this.sliding = false;
    const p = this.player;
    if (p) {
      p.slide = null;
      p.freeAmmo = false;
    }
  }
}
