// ============================================================
//  KamikazeBrain — мозги смертника: бежит к ближайшему, с кем враждует (не дальше range), и взрывается
//  рядом с ним (ближе trigger) или когда выйдет время fuse. Сам взрыв — onBoom(entity) (урон решает игра),
//  после него существо гибнет.
//
//    minion.brain = new KamikazeBrain({ range: 15, fuse: 10, onBoom: (e) => burst(e.position) });
//  prime — запал: подбежал ближе trigger — встаёт и через prime секунд взрывается (успеешь отбежать);
//  onPrime(e) — запал зажёгся (игра покажет круг и зашипит), e.priming — сколько осталось. 0 — сразу.
// ============================================================

import { Brain } from "./brain.js";
import { Navigator } from "./pathfinder.js";
import { pursue, separate } from "../world/behaviors.js";

export class KamikazeBrain extends Brain {
  constructor({ range = 15, fuse = 10, trigger = 1.3, speed = 0, prime = 0, onPrime = () => {}, onBoom = () => {} } = {}) {
    super();
    this.prime = prime;
    this.onPrime = onPrime;
    this.range = range;
    this.fuse = fuse;
    this.trigger = trigger;
    this.speed = speed;
    this.onBoom = onBoom;
  }

  update(e, ctx, dt) {
    e.nav ||= new Navigator({ ...ctx.navWorld, height: Math.ceil(e.height - 1e-6) });
    e.velocity.x = 0;
    e.velocity.z = 0;
    e.fuseTime = (e.fuseTime || 0) + dt;
    let target = null, best = this.range;
    for (const o of ctx.entities) {
      if (!o.alive || o === e || !e.isHostileTo(o)) continue;
      const d = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z);
      if (d < best) { best = d; target = o; }
    }
    // Запал горит — стоим и ждём взрыва
    if (e.priming > 0) {
      e.priming -= dt;
      if (e.priming > 0) return { walking: false, alerted: [] };
      this.onBoom(e, target);
      e.stats.hp = 0;
      return { walking: false, alerted: [] };
    }
    if (target && best <= this.trigger && this.prime > 0) {
      e.priming = this.prime;
      this.onPrime(e);
      return { walking: false, alerted: [] };
    }
    if ((target && best <= this.trigger) || e.fuseTime >= this.fuse) {
      this.onBoom(e, target);
      e.stats.hp = 0; // взорвался
      return { walking: false, alerted: [] };
    }
    if (!target) return { walking: false, alerted: [] };
    const walking = pursue(e, target, dt, { navigator: e.nav, radius: this.range * 2, speed: this.speed || e.speed, stopDistance: this.trigger * 0.6 });
    separate(e, ctx.entities);
    return { walking, alerted: [] };
  }
}
