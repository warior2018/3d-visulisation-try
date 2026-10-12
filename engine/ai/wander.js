// ============================================================
//  WanderBrain — мозги мирного существа (НПС).
//  Гуляет вокруг «дома» (где появился) в радиусе radius: выбирает точку, идёт
//  к ней по найденному пути, стоит pause секунд, выбирает следующую.
//  Подошёл кто-то (не враг) ближе lookRadius — останавливается и смотрит на него.
// ============================================================

import { Brain } from "./brain.js";
import { Navigator } from "./pathfinder.js";
import { pursue, separate, turnTowards } from "../world/behaviors.js";

export class WanderBrain extends Brain {
  constructor({ radius = 6, pause = [2, 5], lookRadius = 3, turnSpeed = 3, random = Math.random } = {}) {
    super();
    this.radius = radius;
    this.pause = pause; // [от, до] секунд постоять
    this.lookRadius = lookRadius;
    this.turnSpeed = turnSpeed;
    this.random = random;
  }

  update(e, ctx, dt) {
    e.nav ||= new Navigator({ ...ctx.navWorld, height: Math.ceil(e.height - 1e-6) }); // поиск пути под рост существа
    const s = (e.wander ||= { home: { x: e.position.x, z: e.position.z }, goal: null, wait: this.pickPause() });
    e.velocity.x = 0;
    e.velocity.z = 0;

    // Кто-то подошёл — постоять и посмотреть на него
    const near = ctx.entities.find((o) => o !== e && o.alive && o.kind === "player" &&
      Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) < this.lookRadius);
    if (near) {
      turnTowards(e, Math.atan2(near.position.x - e.position.x, near.position.z - e.position.z), this.turnSpeed, dt);
      separate(e, ctx.entities);
      return { walking: false, alerted: [] };
    }

    // Стоим — ждём; дождались — новая точка вокруг дома
    if (!s.goal) {
      s.wait -= dt;
      if (s.wait > 0) return { walking: false, alerted: [] };
      const a = this.random() * Math.PI * 2;
      const r = this.random() * this.radius;
      s.goal = { alive: true, position: { x: s.home.x + Math.sin(a) * r, y: e.position.y, z: s.home.z + Math.cos(a) * r } };
      e.nav.reset();
    }
    const walking = pursue(e, s.goal, dt, { navigator: e.nav, radius: this.radius * 3, speed: e.speed, stopDistance: 0.5, turnSpeed: this.turnSpeed });
    if (!walking) {
      // Пришли (или туда не пройти) — постоим
      s.goal = null;
      s.wait = this.pickPause();
    }
    separate(e, ctx.entities);
    return { walking, alerted: [] };
  }

  pickPause() {
    const [a, b] = this.pause;
    return a + this.random() * (b - a);
  }
}
