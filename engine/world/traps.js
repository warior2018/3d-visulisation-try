// ============================================================
//  Ловушки в мире — возможность движка. Ловушка = TrapAttack (engine/combat/attacks.js) + место,
//  где она стоит, + модель. Каждый кадр update(dt, ctx) проверяет, не зашёл ли в неё кто-то
//  (кого трогает — решает filter атаки), и бьёт. Одноразовая (rearm: null) после срабатывания
//  исчезает, многоразовая — ждёт rearm секунд и снова готова. lifetime — сколько стоит вообще.
//
//    const traps = new Traps({ onAdd: (t) => models.attach(t, "trap-" + t.type), onRemove: (t) => models.detach(t),
//      onTrigger: (t, result) => sound("snap") });
//    traps.place({ type: "spikes", attack: new TrapAttack({ damage: 12, radius: 1, rearm: 1 }), position, owner: hero, lifetime: 60 });
//    traps.update(dt, combatContext);
//    traps.count(hero)       // сколько ловушек поставил герой (для ограничения)
//    traps.toJSON()          // [{ type, x, y, z, yaw, tilt, age }] — в сохранение (атаки игра соберёт заново)
//
//  Как у предметов на земле, у ловушки есть position, yaw, alive — библиотека моделей её рисует.
// ============================================================

import { Vec3 } from "../math/vec3.js";

export class Traps {
  constructor({ onAdd = () => {}, onRemove = () => {}, onTrigger = () => {} } = {}) {
    this.onAdd = onAdd;
    this.onRemove = onRemove;
    this.onTrigger = onTrigger;
    this.list = [];
  }

  // Поставить ловушку. attack — TrapAttack (её owner станет owner), lifetime — секунд (Infinity — навсегда)
  // tilt — наклон модели вперёд: 0 — лежит на полу, π/2 — висит на стене (смотрит туда, куда yaw), π — на потолке
  place({ type, attack, position, owner = null, yaw = 0, tilt = 0, lifetime = Infinity, age = 0 }) {
    const t = {
      type, attack, owner, yaw, tilt, lifetime, age, triggered: 0,
      position: new Vec3(position.x, position.y, position.z),
      alive: true, roll: 0, hurtTime: Infinity, deadTime: 0, view: null, // для библиотеки моделей
    };
    attack.owner = owner;
    attack.place(t.position);
    this.list.push(t);
    this.onAdd(t);
    return t;
  }

  remove(t) {
    const i = this.list.indexOf(t);
    if (i === -1) return;
    this.list.splice(i, 1);
    t.alive = false;
    this.onRemove(t);
  }

  update(dt, ctx = {}) {
    for (const t of [...this.list]) {
      t.age += dt;
      if (t.age >= t.lifetime) {
        this.remove(t);
        continue;
      }
      const result = t.attack.update(dt, ctx);
      if (result) {
        t.triggered++;
        this.onTrigger(t, result);
      }
      if (t.attack.spent) this.remove(t); // одноразовая сработала
    }
  }

  // Сколько ловушек стоит (owner — только чьих; type — только такого вида)
  count(owner = undefined, type = undefined) {
    return this.list.filter((t) => (owner === undefined || t.owner === owner) && (type === undefined || t.type === type)).length;
  }

  // Самая старая ловушка (чтобы убрать её, если ставят сверх лимита)
  oldest(owner = undefined, type = undefined) {
    return this.list.find((t) => (owner === undefined || t.owner === owner) && (type === undefined || t.type === type)) || null;
  }

  clear() {
    for (const t of [...this.list]) this.remove(t);
  }

  toJSON() {
    return this.list.filter((t) => !t.noSave).map((t) => ({ type: t.type, x: t.position.x, y: t.position.y, z: t.position.z, yaw: t.yaw, tilt: t.tilt, age: t.age }));
  }
}
