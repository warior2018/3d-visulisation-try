// ============================================================
//  Снаряды — то, что летит по дуге: брошенный камень, стрела, граната. Возможность движка.
//  Каждый кадр снаряд падает (тяжесть gravity) и летит; путь за кадр — отрезок, и движок
//  проверяет, не задел ли он сущность (по её хитбоксам — значит, и голову: хедшот) или блок/пол.
//
//    const shots = new Projectiles({ world, entities, gravity: 20,
//      onAdd: (p) => models.attach(p, "item-stone"), onRemove: (p) => models.detach(p),
//      onHit: (p, hit) => p.attack.hit(p.owner, hit.entity, { part: hit.part, baseDamage: p.damage }),
//      onLand: (p) => pickups.add(p.item, 1, p.position) });       // упал — лежит, можно поднять
//    shots.launch({ owner, position: eye, velocity: dir.scale(20), attack, damage: 8, item: "stone" });
//    shots.update(dt);
//
//  Как и у предметов на земле, у снаряда есть position, yaw, alive — библиотека моделей рисует его.
// ============================================================

import { Vec3 } from "../math/vec3.js";

export class Projectiles {
  // world — { raycast(origin, dir, max) } (кубики и пол), entities — { raycast(origin, dir, max, skip) }
  constructor({ world, entities, gravity = 20, maxLife = 6, spin = 2.5, onAdd = () => {}, onRemove = () => {}, onHit = () => {}, onLand = () => {} }) {
    this.world = world;
    this.entities = entities;
    this.gravity = gravity;
    this.maxLife = maxLife;
    this.spin = spin;
    this.onAdd = onAdd;
    this.onRemove = onRemove;
    this.onHit = onHit;
    this.onLand = onLand;
    this.list = [];
  }

  // Запустить: owner — кто бросил (в него самого не попадёт), остальное — что игре нужно при попадании
  launch({ owner, position, velocity, ...data }) {
    const p = {
      ...data, owner,
      position: new Vec3(position.x, position.y, position.z),
      velocity: new Vec3(velocity.x, velocity.y, velocity.z),
      yaw: owner?.yaw || 0, roll: 0, age: 0,
      alive: true, hurtTime: Infinity, deadTime: 0, view: null, // для библиотеки моделей
    };
    this.list.push(p);
    this.onAdd(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i === -1) return;
    this.list.splice(i, 1);
    this.onRemove(p);
  }

  update(dt) {
    for (const p of [...this.list]) {
      p.age += dt;
      p.velocity.y -= this.gravity * dt;
      const step = p.velocity.scale(dt);
      const len = Math.hypot(step.x, step.y, step.z);
      if (len < 1e-6) continue;
      const dir = step.scale(1 / len);
      const skip = [p.owner, p.owner?.mount].filter(Boolean);
      const hit = this.entities.raycast(p.position, dir, len, skip);
      const wall = this.world.raycast(p.position, dir, len);
      if (hit && (!wall || hit.t <= wall.t)) {
        p.position = p.position.add(dir.scale(hit.t));
        this.onHit(p, hit);
        this.remove(p);
        continue;
      }
      if (wall) {
        p.position = p.position.add(dir.scale(Math.max(0, wall.t - 0.05)));
        this.onLand(p, wall);
        this.remove(p);
        continue;
      }
      p.position = p.position.add(step);
      p.roll += dt * this.spin * Math.PI * 2; // кувыркается в полёте
      if (p.age > this.maxLife) this.remove(p);
    }
  }

  clear() {
    for (const p of [...this.list]) this.remove(p);
  }
}
