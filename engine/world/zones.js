// ============================================================
//  Зоны на земле — возможность движка: лужа магмы, ядовитый туман, аура. Зона стоит duration секунд
//  в точке position, радиус radius; раз в interval секунд зовёт onTick(zone, inside) — inside: кто сейчас
//  внутри (живые, прошедшие filter). Что делать с ними (урон, замедление) — решает игра. Рисует тоже игра
//  (например, кругом лучей), зона только считает.
//
//    const zones = new Zones();
//    zones.add({ position, radius: 2, duration: 8, interval: 0.5, owner: hero, filter: (e) => hero.isHostileTo(e),
//      onTick: (z, inside) => inside.forEach((e) => attack.hit(hero, e, { baseDamage: 5 })) });
//    zones.update(dt, entities);
// ============================================================

export class Zones {
  constructor() {
    this.list = [];
  }

  get active() {
    return this.list.length > 0;
  }

  add({ position, radius = 2, duration = 5, interval = 0.5, owner = null, data = {}, filter = () => true, onTick = () => {}, onEnd = () => {} }) {
    const z = { position: { x: position.x, y: position.y, z: position.z }, radius, duration, interval, owner, data, filter, onTick, onEnd, age: 0, timer: 0 };
    this.list.push(z);
    return z;
  }

  // Кто внутри зоны: по горизонтали ближе radius (+ толщина тела), по высоте — у земли зоны
  inside(z, entities) {
    return entities.filter((e) => e.alive && z.filter(e) &&
      Math.hypot(e.position.x - z.position.x, e.position.z - z.position.z) <= z.radius + (e.radius || 0) &&
      e.position.y >= z.position.y - 1 && e.position.y <= z.position.y + 1.5);
  }

  update(dt, entities) {
    for (const z of [...this.list]) {
      z.age += dt;
      z.timer += dt;
      while (z.timer >= z.interval) {
        z.timer -= z.interval;
        z.onTick(z, this.inside(z, entities));
      }
      if (z.age >= z.duration) {
        this.list.splice(this.list.indexOf(z), 1);
        z.onEnd(z);
      }
    }
  }

  clear() {
    this.list = [];
  }
}
