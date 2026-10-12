// ============================================================
//  FollowBrain — мозги спутника: ходит за вожаком (entity.leader — например, хозяин
//  приручённого зверя). Отстал дальше far — догоняет по найденному пути; подошёл ближе near —
//  останавливается и смотрит на вожака. Совсем потерялся (дальше teleport) — появляется рядом.
//
//    pet.brain = new FollowBrain({ near: 2.5, far: 5, speed: 4.5 });
//    pet.leader = hero;
//
//  fight — спутник ещё и защищает: { radius, leash, stopDistance }. Врага (с кем спутник враждует,
//  entity.isHostileTo) он бьёт своей атакой (entity.attack), если враг ударил его самого или подошёл
//  к вожаку ближе radius. Цель «прилипает», пока жива и не дальше leash от вожака — потом обратно к вожаку.
// ============================================================

import { Brain } from "./brain.js";
import { Navigator } from "./pathfinder.js";
import { pursue, separate, turnTowards, melee } from "../world/behaviors.js";
import { tauntTarget, busy } from "./social.js";

const dist2d = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

export class FollowBrain extends Brain {
  // speed — скорость, когда догоняет (м/с; у вожака обычно 4); 0 — своя скорость существа
  constructor({ near = 2.5, far = 5, teleport = 40, speed = 0, turnSpeed = 4, fight = null } = {}) {
    super();
    this.fight = fight; // { radius, leash, stopDistance } или null — только ходит следом
    this.near = near;
    this.far = far;
    this.teleport = teleport;
    this.speed = speed;
    this.turnSpeed = turnSpeed;
  }

  update(e, ctx, dt) {
    e.nav ||= new Navigator({ ...ctx.navWorld, height: Math.ceil(e.height - 1e-6) });
    const leader = e.leader;
    e.velocity.x = 0;
    e.velocity.z = 0;
    if (!leader?.alive) return { walking: false, alerted: [] };

    // Защита: враг ударил спутника или подошёл к вожаку — бьём его
    const f = this.fight;
    if (f && e.attack) {
      const by = e.attackedBy;
      e.attackedBy = null;
      if (by?.alive && e.isHostileTo(by) && !busy(e)) e.aggro = by;
      const taunted = tauntTarget(e, dt);
      if (taunted) e.aggro = taunted;
      if (e.aggro && (!e.aggro.alive || dist2d(leader, e.aggro) > f.leash)) e.aggro = null;
      if (!e.aggro) {
        let best = null, bestD = f.radius;
        for (const o of ctx.entities) {
          if (!o.alive || !e.isHostileTo(o)) continue;
          const d = Math.min(dist2d(leader, o), dist2d(e, o));
          if (d <= bestD) { best = o; bestD = d; }
        }
        e.aggro = best;
      }
      if (e.aggro) {
        if (!e.fighting) e.nav.reset();
        e.fighting = true;
        const walking = pursue(e, e.aggro, dt, {
          navigator: e.nav, radius: f.leash * 2, speed: this.speed || e.speed,
          stopDistance: f.stopDistance ?? 1.2, turnSpeed: this.turnSpeed * 1.5,
        });
        separate(e, ctx.entities);
        melee(e, e.aggro, dt, e.attack, ctx.combatFor?.(e) || {});
        return { walking, alerted: [] };
      }
      if (e.fighting) e.nav.reset();
      e.fighting = false;
      e.attack.update(dt); // кулдаун идёт и без боя
    }
    const dx = leader.position.x - e.position.x;
    const dz = leader.position.z - e.position.z;
    const d = Math.hypot(dx, dz);

    // Потерялся — рядом с вожаком, чуть позади
    if (d > this.teleport) {
      e.position.x = leader.position.x - Math.sin(leader.yaw) * 2;
      e.position.y = leader.position.y;
      e.position.z = leader.position.z - Math.cos(leader.yaw) * 2;
      e.nav.reset();
      e.following = false;
      return { walking: false, alerted: [] };
    }

    // Догоняем, пока не подойдём ближе near (начинаем — когда отстали дальше far: без дёрганий на границе)
    let walking = false;
    if (e.following ? d > this.near : d > this.far) {
      e.following = true;
      walking = pursue(e, leader, dt, {
        navigator: e.nav, radius: this.teleport, speed: this.speed || e.speed,
        stopDistance: this.near, turnSpeed: this.turnSpeed,
      });
      if (!walking) e.following = false;
    } else {
      e.following = false;
      turnTowards(e, Math.atan2(dx, dz), this.turnSpeed * 0.5, dt); // стоит и поглядывает на вожака
    }
    separate(e, ctx.entities);
    return { walking, alerted: [] };
  }
}
