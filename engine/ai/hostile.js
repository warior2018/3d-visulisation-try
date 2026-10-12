// ============================================================
//  HostileBrain — мозги врага (моба).
//   1. Ударили — злится на обидчика (с любого расстояния). Заметил врага ближе
//      aggroRadius — тоже злится. Со стадом (herd) — поднимает соседей по цепочке (social.js).
//   2. Злой — идёт к цели по найденному пути (pursue + Navigator), пока цель не дальше leash.
//   3. Не толпится с остальными (separate). Подошёл — бьёт своей атакой (melee).
//   4. Злиться не на кого — бродит вокруг места, где появилось (wander — как WanderBrain).
//  Аура провокации (у сущности tauntRadius, например у стража): зашёл в зону — злится на неё (social.js).
//  Охота (ctx.hunt — сущность): все злятся на неё, где бы она ни была (нашествие), leash не действует.
//  Цели — те, с кем существо враждует (entity.isHostileTo), а не «игрок» жёстко:
//  так же можно сделать мобов, которые воюют друг с другом.
// ============================================================

import { Brain } from "./brain.js";
import { WanderBrain } from "./wander.js";
import { Navigator } from "./pathfinder.js";
import { alertHerd, tauntTarget, busy, auraTarget } from "./social.js";
import { pursue, separate, melee } from "../world/behaviors.js";

const dist2d = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

export class HostileBrain extends Brain {
  // herd: { radius, alertOnSight } или null — без стада
  // wander: { radius, pause } — бродить без цели (null — стоять на месте); huntRadius — докуда идти на охоту
  constructor({ aggroRadius = 12, leash = 45, stopDistance = 1.1, turnSpeed = 4, jumpSpeed = 7.5, herd = null, wander = null, huntRadius = 150 } = {}) {
    super();
    this.aggroRadius = aggroRadius; // замечает врага ближе этого
    this.leash = leash; //             дальше этого — отстаёт и успокаивается
    this.stopDistance = stopDistance;
    this.turnSpeed = turnSpeed;
    this.jumpSpeed = jumpSpeed;
    this.herd = herd;
    this.idle = wander ? new WanderBrain({ lookRadius: 0, ...wander }) : null; // мобы на героя не «засматриваются»
    this.huntRadius = huntRadius;
  }

  // Ближайший враг ближе radius
  nearestEnemy(e, entities, radius) {
    let best = null;
    let bestD = radius;
    for (const o of entities) {
      if (!o.alive || !e.isHostileTo(o)) continue;
      const d = dist2d(e, o);
      if (d <= bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  // Разозлиться на target (со стадом — и соседи)
  anger(e, target, entities) {
    if (this.herd) return alertHerd(e, target, entities, this.herd);
    if (e.aggro === target) return [];
    e.aggro = target;
    return [e];
  }

  update(e, ctx, dt) {
    const entities = ctx.entities;
    e.nav ||= new Navigator({ ...ctx.navWorld, height: Math.ceil(e.height - 1e-6) }); // свой «штурман» у каждого, под рост существа
    let alerted = [];

    // 1. Злость. Цель «прилипает»: ударили — злимся на обидчика, только если своей цели ещё нет
    const hurtBy = e.attackedBy;
    e.attackedBy = null;
    if (hurtBy?.alive && e.isHostileTo(hurtBy) && !busy(e)) alerted = this.anger(e, hurtBy, entities);
    // Силой цель меняют (по возрастанию силы): аура стража → нашествие → провокация (навык)
    const force = (t) => {
      if (t && e.aggro !== t) {
        e.aggro = t;
        alerted = [e];
      }
    };
    const taunted = tauntTarget(e, dt); //                                   провокация — сильнее всего
    const hunt = ctx.hunt?.alive && e.isHostileTo(ctx.hunt) ? ctx.hunt : null; // нашествие: цель одна на всех
    const aura = !hunt && !taunted ? auraTarget(e, entities) : null; //      зашёл в зону стража — злится на него
    force(taunted || hunt || aura);
    if (e.aggro && e.aggro !== hunt && e.aggro !== taunted && e.aggro !== aura && (!e.aggro.alive || dist2d(e, e.aggro) > this.leash)) e.aggro = null;
    if (!e.aggro && (!this.herd || this.herd.alertOnSight !== false)) {
      const seen = this.nearestEnemy(e, entities, this.aggroRadius);
      if (seen) alerted = this.anger(e, seen, entities);
    }

    // 2. Преследование (или стоим, если злиться не на кого)
    const target = e.aggro;
    let walking = false;
    // Сменили занятие (бродили — погнались или наоборот) — старый путь не нужен;
    // успокоились — бродим уже там, где оказались (а не тащимся к месту появления)
    if (!!target !== !!e.hunting) {
      e.nav.reset();
      if (!target) e.wander = null;
    }
    e.hunting = !!target;
    if (target) {
      walking = pursue(e, target, dt, {
        navigator: e.nav, radius: target === hunt ? this.huntRadius : this.leash, speed: e.speed,
        stopDistance: this.stopDistance, turnSpeed: this.turnSpeed, jumpSpeed: this.jumpSpeed,
      });
    } else if (this.idle) {
      walking = this.idle.update(e, ctx, dt).walking; // бродит (и сам не толпится)
    } else {
      e.velocity.x = 0;
      e.velocity.z = 0;
    }

    // 3. Не толпиться и бить
    if (target || !this.idle) separate(e, entities);
    if (e.attack) {
      if (target) melee(e, target, dt, e.attack, ctx.combatFor?.(e) || {});
      else e.attack.update(dt); // кулдаун идёт и без цели
    }
    return { walking, alerted };
  }
}
