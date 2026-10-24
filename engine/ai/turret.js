// ============================================================
//  TurretBrain — мозги турели: стоит на месте, поворачивается к ближайшему, с кем враждует (не дальше
//  range), и стреляет атакой entity.attack, как только она готова (перезарядка с модификаторами — как у всех).
//  Сам выстрел (снаряд) — onFire(entity, target): его запускает игра.
//
//    turret.brain = new TurretBrain({ range: 16, onFire: (t, target) => launchSpore(t, target) });
// ============================================================

import { Brain } from "./brain.js";
import { turnTowards } from "../world/behaviors.js";

export class TurretBrain extends Brain {
  constructor({ range = 16, turnSpeed = 6, onFire = () => {} } = {}) {
    super();
    this.range = range;
    this.turnSpeed = turnSpeed;
    this.onFire = onFire;
  }

  update(e, ctx, dt) {
    e.velocity.x = 0;
    e.velocity.z = 0;
    e.attack?.update(dt);
    let target = null, best = this.range;
    for (const o of ctx.entities) {
      if (!o.alive || o === e || !e.isHostileTo(o)) continue;
      const d = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z);
      if (d < best) { best = d; target = o; }
    }
    if (!target) return { walking: false, alerted: [] };
    turnTowards(e, Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z), this.turnSpeed, dt);
    if (e.attack?.ready && e.attack.use(e, { target, entities: ctx.entities })) this.onFire(e, target);
    return { walking: false, alerted: [] };
  }
}
