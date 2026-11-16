// ============================================================
//  BatBrain — мозги летучей мыши (BAT в config.js): летает взмахами (каждый взмах подбрасывает вверх, между
//  ними падает — тяжесть физики), кружит вокруг цели чуть выше неё и раз в wait с нападает:
//    выше цели больше чем на diveHeight — ПИКЕ: складывает крылья (e.diving), летит в цель, урон при касании
//      (ctx.batDive), потом отлетает в обратную сторону;
//    иначе — подлетает вплотную и бьёт обычным ударом (e.attack: быстрый замах, по кругу), потом отлетает.
//  Летит напрямую (без поиска пути): стены останавливают физика.
// ============================================================

import { Brain } from "../../engine/ai/brain.js";

const rnd = ([a, b]) => a + Math.random() * (b - a);

export class BatBrain extends Brain {
  constructor(o = {}) {
    super();
    Object.assign(this, {
      aggroRadius: 18, leash: 45, speed: 4.5, orbit: [2.5, 3.5], hover: [1, 1.5], wait: [4, 5], diveHeight: 2.25,
      diveSpeed: 11, retreat: 1.2, flap: { every: 0.3, impulse: 4.4 }, maxFall: 6,
    }, o);
  }

  findTarget(e, ctx) {
    const cur = e.aggro;
    if (cur?.alive && Math.hypot(cur.position.x - e.position.x, cur.position.z - e.position.z) < this.leash) return cur;
    let best = null, bestD = Infinity;
    for (const o of ctx.entities) {
      if (!o.alive || o === e || !e.isHostileTo(o)) continue;
      const d = Math.hypot(o.position.x - e.position.x, o.position.y - e.position.y, o.position.z - e.position.z);
      if (d > this.aggroRadius * (o.noticeScale ?? 1) || d >= bestD) continue;
      if (ctx.combatFor?.(e)?.blocked?.(e, o)) continue; // не видит — не нападает
      best = o;
      bestD = d;
    }
    return best;
  }

  // Взмахи: держит высоту y (между взмахами падает). Пикирует — крылья сложены, не машет
  fly(e, dt, y) {
    if (!e.diving) {
      e.flapT = (e.flapT ?? Math.random() * this.flap.every) - dt;
      if (e.flapT <= 0) {
        e.flapT = this.flap.every;
        const need = y - e.position.y;
        if (need > -0.3) e.velocity.y = this.flap.impulse * Math.max(0.55, Math.min(1.35, 0.8 + need * 0.4));
        e.flapped = true; // взмах (звук / анимация — игре)
      }
    }
    e.velocity.y = Math.max(e.velocity.y, -this.maxFall);
  }

  steer(e, x, z, speed) {
    const dx = x - e.position.x, dz = z - e.position.z, l = Math.hypot(dx, dz);
    if (l < 0.05) {
      e.velocity.x = 0;
      e.velocity.z = 0;
      return;
    }
    const s = Math.min(speed, l * 4);
    e.velocity.x = (dx / l) * s;
    e.velocity.z = (dz / l) * s;
    e.yaw = Math.atan2(dx, dz);
  }

  update(e, ctx, dt) {
    const t = this.findTarget(e, ctx);
    e.aggro = t || null;
    e.attack?.update(dt);
    e.home ||= { x: e.position.x, y: e.position.y, z: e.position.z };
    if (!t) { // без цели — кружит над местом появления
      e.diving = false;
      e.orbitA = (e.orbitA ?? 0) + dt * 0.6;
      this.steer(e, e.home.x + Math.sin(e.orbitA) * 4, e.home.z + Math.cos(e.orbitA) * 4, this.speed * 0.5);
      this.fly(e, dt, e.home.y + 3);
      return { walking: true, alerted: [] };
    }
    const tp = t.position, th = t.height || 1.6;
    e.batState ||= "circle";
    e.batTimer = (e.batTimer ?? rnd(this.wait)) - dt;
    if (e.batState === "circle") {
      e.orbitR ||= rnd(this.orbit);
      e.hoverH ??= rnd(this.hover);
      e.orbitA = (e.orbitA ?? Math.atan2(e.position.x - tp.x, e.position.z - tp.z)) + (dt * this.speed) / e.orbitR;
      this.steer(e, tp.x + Math.sin(e.orbitA) * e.orbitR, tp.z + Math.cos(e.orbitA) * e.orbitR, this.speed);
      this.fly(e, dt, tp.y + th * 0.6 + e.hoverH);
      if (e.batTimer <= 0) {
        const above = e.position.y - tp.y - th * 0.6;
        e.batState = above > this.diveHeight ? "dive" : "approach";
        e.batTimer = e.batState === "dive" ? 1.6 : 4;
        if (e.batState === "dive") {
          e.diving = true;
          e.diveFrom = { x: e.position.x - tp.x, z: e.position.z - tp.z }; // откуда налетел — потом в обратную сторону
        }
      }
    } else if (e.batState === "dive") {
      // крылья сложены: прямо в грудь цели (чуть доворачивает)
      const cx = tp.x - e.position.x, cy = tp.y + th * 0.6 - e.position.y, cz = tp.z - e.position.z, l = Math.hypot(cx, cy, cz) || 1;
      e.velocity.x = (cx / l) * this.diveSpeed;
      e.velocity.y = (cy / l) * this.diveSpeed;
      e.velocity.z = (cz / l) * this.diveSpeed;
      e.yaw = Math.atan2(cx, cz);
      if (l < (t.radius || 0.3) + 0.6) {
        ctx.batDive?.(e, t);
        this.startRetreat(e, -(e.diveFrom?.x ?? 0), -(e.diveFrom?.z ?? 0));
      } else if (e.batTimer <= 0 || e.onGround) this.startRetreat(e, -(e.diveFrom?.x ?? 0), -(e.diveFrom?.z ?? 0));
    } else if (e.batState === "approach") {
      this.steer(e, tp.x, tp.z, this.speed * 1.2);
      this.fly(e, dt, tp.y + th * 0.5);
      if (e.attack && e.attack.ready && !e.attack.pending && e.attack.inRange(e, t)) {
        e.attack.use(e, { ...(ctx.combatFor?.(e) || {}), target: t });
        this.startRetreat(e, e.position.x - tp.x, e.position.z - tp.z, 0.35); // ударил — отлетает (после замаха)
      } else if (e.batTimer <= 0) this.startRetreat(e, e.position.x - tp.x, e.position.z - tp.z);
    } else if (e.batState === "retreat") {
      if (e.retreatDelay > 0) { // ждёт конца замаха рядом с целью
        e.retreatDelay -= dt;
        this.steer(e, tp.x, tp.z, this.speed * 0.3);
      } else this.steer(e, e.position.x + e.retreatDir.x, e.position.z + e.retreatDir.z, this.speed * 1.4);
      this.fly(e, dt, tp.y + th * 0.6 + 2);
      if (e.batTimer <= 0) {
        e.batState = "circle";
        e.batTimer = rnd(this.wait);
        e.hoverH = rnd(this.hover);
        e.orbitA = undefined;
      }
    }
    return { walking: true, alerted: [] };
  }

  startRetreat(e, dx, dz, delay = 0) {
    const l = Math.hypot(dx, dz) || 1;
    e.diving = false;
    e.batState = "retreat";
    e.batTimer = this.retreat + delay;
    e.retreatDelay = delay;
    e.retreatDir = { x: (dx / l) * 5, z: (dz / l) * 5 };
  }
}
