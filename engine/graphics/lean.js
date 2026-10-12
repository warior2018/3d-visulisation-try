// ============================================================
//  Наклоны (выглянуть из-за угла) — возможность движка, как в шутерах:
//  зажал «наклон влево/вправо» — голова плавно наклоняется (крен камеры)
//  и сдвигается вбок. Если сбоку стена — сдвигаемся только до неё.
//
//    const lean = new Lean({ angle: 14, offset: 0.4 });
//    lean.update(dt, input.isDown("skill2") - input.isDown("skill1")); // Q — влево, E — вправо
//    lean.apply(camera, raycast); // после того, как поставили камеру в глаза
//  raycast(origin, dir, maxDist) → расстояние до стены или null.
// ============================================================

import { Vec3 } from "../math/vec3.js";

export class Lean {
  constructor({ angle = 14, offset = 0.4, drop = 0.06, speed = 9 } = {}) {
    this.angle = (angle * Math.PI) / 180; // наибольший крен
    this.offset = offset; //  на сколько метров сдвигаем голову вбок
    this.drop = drop; //      и чуть вниз (голова опускается при наклоне)
    this.speed = speed; //    как быстро наклоняемся
    this.t = 0; //            -1 — влево, 0 — прямо, 1 — вправо (плавно)
  }

  // dir: -1 влево, 0 прямо, 1 вправо
  update(dt, dir) {
    this.t += (dir - this.t) * Math.min(1, dt * this.speed);
    if (Math.abs(this.t) < 1e-3) this.t = 0;
  }

  // Наклонить камеру: крен и сдвиг вбок (не дальше стены)
  apply(camera, raycast = null) {
    camera.roll = this.angle * this.t;
    if (!this.t) return;
    const r = camera.right(); // вправо по земле
    const side = Math.sign(this.t);
    const dir = new Vec3(r.x * side, 0, r.z * side);
    let dist = this.offset * Math.abs(this.t);
    const wall = raycast?.(camera.position, dir, dist + 0.2);
    if (wall !== null && wall !== undefined) dist = Math.max(0, Math.min(dist, wall - 0.2));
    camera.position = camera.position.add(dir.scale(dist)).add(new Vec3(0, -this.drop * Math.abs(this.t), 0));
  }
}
