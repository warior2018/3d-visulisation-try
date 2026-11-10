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
//
//  У каждого снаряда может быть своё: gravity (0 — летит прямо, огненный шар), spin (оборотов в секунду,
//  0 — не кувыркается), maxLife, onHit / onLand (вместо общих), pierce — пробить насквозь столько целей. Например, нож втыкается, а шар взрывается:
//    shots.launch({ owner, position, velocity, gravity: 0, spin: 0, onHit: boom, onLand: boom, item: "fireball" });
// ============================================================

import { Vec3 } from "../math/vec3.js";

// Навесной бросок: с какой скоростью (вектор) бросить из from со скоростью speed, чтобы при тяжести
// gravity попасть в to. Берём нижнюю (быструю) траекторию; не долетает — бросаем под 45° (сколько хватит)
export function aimArc(from, to, speed, gravity) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const d = Math.hypot(dx, dz) || 1e-6;
  const v2 = speed * speed;
  const disc = v2 * v2 - gravity * (gravity * d * d + 2 * dy * v2);
  const angle = disc >= 0 ? Math.atan((v2 - Math.sqrt(disc)) / (gravity * d)) : Math.PI / 4;
  const h = Math.cos(angle) * speed;
  return new Vec3((dx / d) * h, Math.sin(angle) * speed, (dz / d) * h);
}

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

  // Луч снаряда: hitRadius > 0 — «толстый» (центр + 4 луча по краям, поперёк полёта), иначе тонкий
  thickRay(p, dir, len, skip) {
    const ray = (o) => this.entities.raycast(o, dir, len, skip);
    let best = ray(p.position);
    const r = p.hitRadius || 0;
    if (!r) return best;
    // Две оси поперёк направления полёта
    const up = Math.abs(dir.y) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const a = new Vec3(dir.y * up.z - dir.z * up.y, dir.z * up.x - dir.x * up.z, dir.x * up.y - dir.y * up.x);
    const al = Math.hypot(a.x, a.y, a.z) || 1;
    const s = a.scale(1 / al);
    const b = new Vec3(dir.y * s.z - dir.z * s.y, dir.z * s.x - dir.x * s.z, dir.x * s.y - dir.y * s.x);
    for (const off of [s, s.scale(-1), b, b.scale(-1)]) {
      const h = ray(p.position.add(off.scale(r)));
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }

  update(dt) {
    for (const p of [...this.list]) {
      p.age += dt;
      p.velocity.y -= (p.gravity ?? this.gravity) * dt;
      const step = p.velocity.scale(dt);
      const len = Math.hypot(step.x, step.y, step.z);
      if (len < 1e-6) continue;
      const dir = step.scale(1 / len);
      const skip = [p.owner, p.owner?.mount, ...(p.passed || [])].filter(Boolean);
      const hit = this.thickRay(p, dir, len, skip);
      const wall = this.world.raycast(p.position, dir, len);
      if (hit && (!wall || hit.t <= wall.t)) {
        p.position = p.position.add(dir.scale(hit.t));
        (p.onHit || this.onHit)(p, hit);
        // pierce — сколько ещё целей пробьёт насквозь (летит дальше, ту же не задевает)
        if (p.pierce > 0) {
          p.pierce--;
          (p.passed ||= []).push(hit.entity);
          continue;
        }
        this.remove(p);
        continue;
      }
      if (wall) {
        p.position = p.position.add(dir.scale(Math.max(0, wall.t - 0.05)));
        (p.onLand || this.onLand)(p, wall);
        this.remove(p);
        continue;
      }
      p.position = p.position.add(step);
      p.roll += dt * (p.spin ?? this.spin) * Math.PI * 2; // кувыркается в полёте
      // align — смотрит носом по полёту (стрела, болт): поворот и наклон по скорости (дуга — нос опускается)
      if (p.align) {
        p.yaw = Math.atan2(p.velocity.x, p.velocity.z);
        p.tilt = Math.atan2(-p.velocity.y, Math.hypot(p.velocity.x, p.velocity.z));
      }
      if (p.age > (p.maxLife ?? this.maxLife)) {
        (p.onExpire || (() => {}))(p);
        this.remove(p);
      }
    }
  }

  clear() {
    for (const p of [...this.list]) this.remove(p);
  }

  // Предпросмотр: куда упадёт снаряд, брошенный из position со скоростью velocity (тяжесть — как в update).
  // Летим по шагам step секунд до maxLife: стена/земля → { point, wall }, существо → { point, entity },
  // никуда не попал — { point } в конце пути. Сам ничего не запускает (прицел-круг для бросков).
  predict({ owner = null, position, velocity, gravity = this.gravity, maxLife = this.maxLife, step = 1 / 30 }) {
    let pos = new Vec3(position.x, position.y, position.z);
    const vel = new Vec3(velocity.x, velocity.y, velocity.z);
    const skip = [owner, owner?.mount].filter(Boolean);
    for (let t = 0; t < maxLife; t += step) {
      vel.y -= gravity * step;
      const d = vel.scale(step);
      const len = Math.hypot(d.x, d.y, d.z);
      if (len < 1e-6) continue;
      const dir = d.scale(1 / len);
      const hit = this.entities.raycast(pos, dir, len, skip);
      const wall = this.world.raycast(pos, dir, len);
      if (hit && (!wall || hit.t <= wall.t)) return { point: pos.add(dir.scale(hit.t)), entity: hit.entity };
      if (wall) return { point: pos.add(dir.scale(Math.max(0, wall.t - 0.05))), wall };
      pos = pos.add(d);
    }
    return { point: pos };
  }
}
