// ============================================================
//  Предметы, лежащие на земле: камень под ногами, выброшенный пистолет...
//  Возможность движка. Что это за предметы и как они выглядят — решает игра.
//
//    const pickups = new Pickups({ physics,
//      onAdd: (p) => models.attach(p, "item-" + p.item), //   появился — одеть в модель
//      onRemove: (p) => models.detach(p) });               //   подобрали — снять
//    pickups.add("stone", 1, { x, y, z });                   // положить (упадёт сам)
//    pickups.add("pistol", 1, eye, { velocity: dir.scale(4) }); // бросить вперёд
//    pickups.update(dt);                                     // каждый кадр: падают, крутятся
//    const hit = pickups.raycast(origin, dir, 3);            // { pickup, t } — на что смотрим
//    pickups.remove(hit.pickup);                             // подобрали
//
//  У предмета на земле те же поля, что у сущности, которые нужны физике и моделям:
//  position (низ), velocity, radius, height, yaw, alive. Поэтому физика его роняет
//  на блоки, а библиотека моделей рисует — как любое существо.
// ============================================================

import { Vec3 } from "../math/vec3.js";

let nextId = 1;

export class Pickup {
  constructor({ item, count = 1, position, velocity = null, yaw = Math.random() * Math.PI * 2, radius = 0.18, height = 0.24 }) {
    this.id = nextId++;
    this.kind = "pickup";
    this.item = item; //    id предмета ("stone")
    this.count = count; //  сколько штук лежит одной кучкой
    this.position = new Vec3(position.x, position.y, position.z);
    this.velocity = velocity ? new Vec3(velocity.x, velocity.y, velocity.z) : new Vec3();
    this.yaw = yaw;
    this.radius = radius; // «коробка» для физики и для прицела
    this.height = height;
    this.onGround = false;
    this.age = 0; //           секунд лежит
    // Для библиотеки моделей (engine/graphics/models.js): живой, не ранен
    this.alive = true;
    this.hurtTime = Infinity;
    this.deadTime = 0;
    this.view = null;
  }
}

export class Pickups {
  // physics — чтобы падали и лежали на блоках (null — висят, где положили)
  // spin — оборотов в секунду (чтобы предмет было видно издалека), friction — торможение по земле
  // hitPadding — насколько «коробка» для прицела больше настоящей: маленький камень легче навести
  // lifetime — через сколько секунд лежащий предмет исчезает (Infinity — никогда)
  constructor({ physics = null, spin = 0.25, friction = 10, hitPadding = 0.12, lifetime = Infinity, onAdd = () => {}, onRemove = () => {} } = {}) {
    this.lifetime = lifetime;
    this.physics = physics;
    this.spin = spin;
    this.friction = friction;
    this.hitPadding = hitPadding;
    this.onAdd = onAdd;
    this.onRemove = onRemove;
    this.list = [];
  }

  add(item, count, position, options = {}) {
    if (count <= 0) return null;
    const p = new Pickup({ item, count, position, ...options });
    this.list.push(p);
    this.onAdd(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i === -1) return false;
    this.list.splice(i, 1);
    this.onRemove(p);
    return true;
  }

  clear() {
    for (const p of [...this.list]) this.remove(p);
  }

  // Сколько штук предмета лежит в мире (спавнеру: не накидать лишнего)
  count(item = null) {
    return this.list.reduce((n, p) => n + (item === null || p.item === item ? p.count : 0), 0);
  }

  update(dt) {
    // Пролежал дольше lifetime — исчезает
    for (const p of this.list.filter((p) => p.age > this.lifetime)) this.remove(p);
    for (const p of this.list) {
      p.age += dt;
      p.yaw += dt * this.spin * Math.PI * 2;
      if (!this.physics) continue;
      this.physics.step(p, dt);
      if (p.onGround) {
        // По земле не скользит вечно: скорость гаснет
        const k = Math.max(0, 1 - this.friction * dt);
        p.velocity.x *= k;
        p.velocity.z *= k;
      }
    }
  }

  // Луч (прицел): ближайший предмет не дальше maxDist — { pickup, t } или null
  raycast(origin, dir, maxDist) {
    let best = null;
    const o = [origin.x, origin.y, origin.z];
    const d = [dir.x, dir.y, dir.z];
    for (const p of this.list) {
      const r = p.radius + this.hitPadding;
      const min = [p.position.x - r, p.position.y - this.hitPadding / 2, p.position.z - r];
      const max = [p.position.x + r, p.position.y + p.height + this.hitPadding, p.position.z + r];
      const t = rayBox(o, d, min, max, maxDist);
      if (t !== null && (!best || t < best.t)) best = { pickup: p, t };
    }
    return best;
  }

  // ---------- Сохранение ----------

  toJSON() {
    return this.list.map((p) => ({ item: p.item, count: p.count, x: p.position.x, y: p.position.y, z: p.position.z }));
  }

  loadFrom(list) {
    this.clear();
    if (!Array.isArray(list)) return;
    for (const s of list) {
      const ok = s && typeof s.item === "string" && Number.isInteger(s.count) && s.count > 0 && [s.x, s.y, s.z].every(Number.isFinite);
      if (ok) this.add(s.item, s.count, s);
    }
  }
}

// Метод «плит»: расстояние по лучу до входа в коробку min..max или null
function rayBox(o, d, min, max, maxDist) {
  let tNear = 0;
  let tFar = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - o[i]) / d[i];
    let t2 = (max[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tNear = Math.max(tNear, t1);
    tFar = Math.min(tFar, t2);
    if (tNear > tFar) return null;
  }
  return tNear;
}
