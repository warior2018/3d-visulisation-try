// ============================================================
//  GuardBrain — мозги стража (НПС, который защищается и защищает).
//  Спокоен — гуляет вокруг дома (как WanderBrain). Враг (с кем страж враждует)
//  подошёл ближе radius к нему или к дому, или ударил его — идёт и бьёт своей атакой.
//  Враг убежал дальше leash от дома — возвращается домой.
// ============================================================

import { Brain } from "./brain.js";
import { WanderBrain } from "./wander.js";
import { Navigator } from "./pathfinder.js";
import { pursue, separate, melee } from "../world/behaviors.js";
import { tauntTarget, busy } from "./social.js";

const dist2d = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

export class GuardBrain extends Brain {
  constructor({ radius = 8, leash = 16, stopDistance = 1.2, turnSpeed = 5, wander = {} } = {}) {
    super();
    this.radius = radius;
    this.leash = leash;
    this.stopDistance = stopDistance;
    this.turnSpeed = turnSpeed;
    this.wander = new WanderBrain(wander);
  }

  update(e, ctx, dt) {
    const home = (e.wander ||= { home: { x: e.position.x, z: e.position.z }, goal: null, wait: 1 }).home;
    const fromHome = (o) => Math.hypot(o.position.x - home.x, o.position.z - home.z);
    e.nav ||= new Navigator({ ...ctx.navWorld, height: Math.ceil(e.height - 1e-6) });

    // Кто напал — тот и враг (если страж с ним враждует), но только если стражу ещё не с кем драться:
    // цель «прилипает» до победы или пока не убежит. Провокация (taunt) — сильнее
    const by = e.attackedBy;
    e.attackedBy = null;
    if (by?.alive && e.isHostileTo(by) && !busy(e)) e.aggro = by;
    const taunted = tauntTarget(e, dt);
    if (taunted) e.aggro = taunted;
    if (e.aggro && (!e.aggro.alive || fromHome(e.aggro) > this.leash)) e.aggro = null;
    if (!e.aggro) {
      // Ближайший враг рядом со стражем или с его домом
      let best = null;
      let bestD = Infinity;
      for (const o of ctx.entities) {
        if (!o.alive || !e.isHostileTo(o)) continue;
        const d = Math.min(dist2d(e, o), fromHome(o));
        if (d <= this.radius && d < bestD) {
          best = o;
          bestD = d;
        }
      }
      e.aggro = best;
    }

    if (!e.aggro) {
      e.attack?.update(dt);
      return this.wander.update(e, ctx, dt); // спокойно — гуляем
    }
    const walking = pursue(e, e.aggro, dt, {
      navigator: e.nav, radius: this.leash * 2, speed: e.speed * 1.6, // в бою — бегом
      stopDistance: this.stopDistance, turnSpeed: this.turnSpeed,
    });
    separate(e, ctx.entities);
    if (e.attack) melee(e, e.aggro, dt, e.attack, ctx.combatFor?.(e) || {});
    return { walking, alerted: [] };
  }
}
