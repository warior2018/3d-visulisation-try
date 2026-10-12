// ============================================================
//  Сущности (entity) — всё, что «живёт» в мире отдельно от блоков:
//  игрок, скелеты, позже — звери, двери, сундуки, летящие снаряды...
//
//  У каждой сущности есть:
//   - id и type («skeleton», «player») — кто это;
//   - position (ноги!) и yaw — где стоит и куда смотрит;
//   - stats — числа-характеристики: hp, maxHp, resist (сопротивления стихиям), позже — мана, сила...;
//   - modifiers — модификаторы урона, который наносит сама сущность (баффы), см. engine/combat;
//   - statuses — статусы на ней: горит, отравлена, замедлена...;
//   - inventory — что у неё с собой;
//   - размеры (radius, height) — «коробка», по которой в неё попадают;
//   - hitboxes — части тела со своим множителем урона (голова — хедшот), см. ниже.
//
//  Это БАЗА. Конкретные виды — наследники (engine/world/creatures.js):
//    Player — герой, Mob — враждебное существо (скелет), NPC — мирный житель (неуязвим).
//  У всех есть то, что здесь, плюс:
//   - kind — вид («player» / «mob» / «npc»), faction — сторона («player», «monster», «neutral»);
//   - hostileTo — с какими сторонами враждует (isHostileTo(other));
//   - invulnerable — урон не проходит ни от кого; protectedFrom — от каких сторон не проходит
//     (страж: protectedFrom ["player"] — герой его не ранит, а мобы — могут);
//   - speed — скорость шага (м/с), brain — «мозги» ИИ (engine/ai), если сущность думает сама.
// ============================================================

import { Inventory } from "./inventory.js";
import { Vec3 } from "../math/vec3.js";

let nextId = 1;

export class Entity {
  // hitboxes: [{ id: "head", min: [x, y, z], max: [x, y, z], multiplier: 2 }] — коробки частей тела
  //   в СВОИХ осях сущности: от ног, +Z — куда смотрит, +X — вправо. Поворачиваются вместе с ней (yaw).
  constructor({ type, name, position, yaw = 0, maxHp = 100, hp = maxHp, resist = {}, inventorySize = 0, maxStack, radius = 0.3, height = 1.8, hitboxes = [] }) {
    this.id = nextId++;
    this.type = type;
    this.kind = "entity"; //        вид — проставляют наследники (player / mob / npc)
    this.faction = null; //         сторона: "player", "monster", "neutral"...
    this.hostileTo = new Set(); //  враждует с этими сторонами
    this.invulnerable = false; //   неуязвима: урон не проходит ни от кого
    this.protectedFrom = new Set(); // стороны, чей урон не проходит
    this.speed = 0; //              скорость шага, м/с
    this.brain = null; //           ИИ (engine/ai): brain.update(entity, ctx, dt)
    this.name = name;
    this.position = position; // Vec3, точка у ног
    this.yaw = yaw;
    this.velocity = new Vec3(); // скорость (м/с) — её меняет физика (engine/world/physics.js)
    this.onGround = false; //       стоит ли на чём-то твёрдом (можно прыгать)
    this.blocked = false; //        упёрлась ли сбоку в стену в прошлом кадре
    // resist: { fire: 0.5 } — огонь режется на 50 %; 1 — полный иммунитет; меньше 0 — уязвимость
    this.stats = { maxHp, hp: Math.min(hp, maxHp), resist: { ...resist } };
    this.modifiers = []; //  модификаторы урона, который наносит эта сущность
    this.statuses = []; //   статусы на ней (StatusEffect)
    // Прибавки к скорости по источникам: { weapon: -0.05, aim: -0.1 } — складываются
    // (-0.05 и -0.1 = -15 %). Источник сам ставит и убирает свою (0 или delete).
    this.speedBonuses = {};
    this.inventory = new Inventory(inventorySize, maxStack);
    this.radius = radius;
    this.height = height;
    this.hitboxes = hitboxes; // части тела: попадание в них — с множителем (голова ×2)
    this.regen = 0; //          регенерация: сколько HP в секунду восстанавливается само
    this.regenPart = 0; //      накопленная дробная часть (0.5 HP/с — +1 HP раз в 2 секунды)
    this.attackedBy = null; //  кто ударил последним (ИИ: разозлиться на обидчика); читающий сам обнуляет
    this.damageLog = new Map(); // кто сколько урона нанёс: source → { dealt, kind } (добыча за участие)
    this.tauntRadius = 0; //    аура провокации: враги ближе этого злятся на эту сущность (0 — нет), engine/ai/social.js
    this.aggro = null; //       на кого злится (поведения ИИ: преследовать, пока не отстанет)
    this.hurtTime = Infinity; // секунд с последнего удара — для красной вспышки (ещё не били)
    this.deadTime = 0; //       секунд с гибели — для анимации падения
    this.age = 0; //            секунд в мире (например, чтобы убирать долго живущих мобов)
    this.view = null; //  как сущность выглядит (модель, аниматор) — это решает игра
  }

  // Может ли source (сущность или null — урон «мира») ранить эту сущность
  canBeDamagedBy(source) {
    if (this.invulnerable) return false;
    return !(source && this.protectedFrom.has(source.faction));
  }

  // Враг ли нам other (по сторонам)
  isHostileTo(other) {
    return !!other && other !== this && this.hostileTo.has(other.faction);
  }

  get alive() {
    return this.stats.hp > 0;
  }

  // Получить урон. Возвращает true, если от этого удара сущность погибла.
  damage(amount) {
    if (!this.alive) return false;
    this.stats.hp = Math.max(0, this.stats.hp - amount);
    this.hurtTime = 0;
    return !this.alive;
  }

  // Получить пакет урона (engine/combat/damage.js): сопротивления → урон → статусы.
  // Возвращает { dealt — сколько на самом деле сняли, killed — погибла ли }
  receive(damage) {
    if (!this.alive || !this.canBeDamagedBy(damage.source)) return { dealt: 0, killed: false };
    // Блок / парирование: статус с guard отбил удар — урона нет (обидчика ИИ всё равно запомнит)
    const guard = this.statuses.find((s) => s.guard?.(damage, this));
    if (guard) {
      if (damage.source && damage.source !== this) this.attackedBy = damage.source;
      this.onBlock?.(damage, guard); // слушатель (звук, надпись) — игра ставит сама
      return { dealt: 0, killed: false, blocked: true };
    }
    const resist = this.stats.resist[damage.element] || 0;
    const dealt = Math.max(0, Math.round(damage.amount * (1 - resist)));
    const killed = dealt > 0 ? this.damage(dealt) : false;
    if (dealt > 0) this.onDamage?.(damage, dealt); // слушатель (например, цифры урона) — игра ставит сама
    if (damage.source && damage.source !== this) {
      this.attackedBy = damage.source; // обидчик — для ИИ (он сам обнулит, когда прочтёт)
      this.lastHitBy = damage.source; //  кто ударил последним — не обнуляется (кто добил, тому и добыча)
      this.lastHitKind = damage.kind; //  и каким видом атаки (melee / ranged...) — для трофеев «за убийство оружием»
      // Кто вообще ранил (хоть на 1 HP) — участники убийства: { dealt — сколько всего, kind — чем в последний раз}
      if (dealt > 0) {
        const rec = this.damageLog.get(damage.source) || { dealt: 0, kind: null };
        rec.dealt += dealt;
        rec.kind = damage.kind;
        this.damageLog.set(damage.source, rec);
      }
    }
    if (this.alive) {
      for (const s of damage.statuses) {
        s.origin ??= damage.kind; // статус помнит, какая атака его наложила
        this.addStatus(s);
      }
    }
    return { dealt, killed };
  }

  // Участвовал ли source в убийстве (нанёс хоть 1 урона) — и чем бил: { dealt, kind } или null
  damagedBy(source) {
    return this.damageLog.get(source) || null;
  }

  // Есть ли статус / снять статус (бафф, дебафф) по id
  hasStatus(id) {
    return this.statuses.some((s) => s.id === id);
  }

  removeStatus(id) {
    this.statuses = this.statuses.filter((s) => s.id !== id);
  }

  // Наложить статус. Такой уже есть — обновить время (и стопки)
  addStatus(status) {
    const same = this.statuses.find((s) => s.id === status.id);
    if (same) same.refresh(status);
    else this.statuses.push(status);
  }

  hasStatus(id) {
    return this.statuses.some((s) => s.id === id);
  }

  // Статусы «тикают»; закончившиеся убираем
  updateStatuses(dt) {
    if (this.statuses.length) this.statuses = this.statuses.filter((s) => s.update(this, dt));
  }

  // Во сколько раз меняется скорость: прибавки (оружие в руках, прицеливание...) складываются,
  // статусы (замедление 0.6 и т. п.) умножают сверху. Медленнее 10 % от обычной не бывает.
  get speedMultiplier() {
    const bonus = Object.values(this.speedBonuses).reduce((sum, b) => sum + b, 0);
    const statuses = this.statuses.reduce((k, s) => k * s.speedMultiplier, 1);
    return Math.max(0.1, (1 + bonus) * statuses);
  }

  // Сменить максимум здоровья. Подняли — текущее растёт на столько же (выучил «+10 HP» — сразу +10),
  // опустили — текущее не больше нового максимума
  setMaxHp(value) {
    const s = this.stats;
    const diff = value - s.maxHp;
    s.maxHp = value;
    if (diff > 0 && this.alive) s.hp += diff;
    s.hp = Math.min(s.hp, s.maxHp);
  }

  // Регенерация: по regen HP в секунду, целыми единицами
  updateRegen(dt) {
    if (!this.alive || this.regen <= 0 || this.stats.hp >= this.stats.maxHp) {
      this.regenPart = 0;
      return;
    }
    this.regenPart += this.regen * dt;
    const whole = Math.floor(this.regenPart);
    if (whole > 0) {
      this.regenPart -= whole;
      this.heal(whole);
    }
  }

  heal(amount) {
    if (!this.alive) return;
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  // Попадает ли луч в «коробку» сущности. Возвращает расстояние по лучу или null.
  // Метод «плит» (slab): по каждой оси находим отрезок t, где луч между двумя стенками
  // коробки. Пересечение этих трёх отрезков — где луч внутри коробки.
  rayHit(origin, dir, maxDist) {
    const p = this.position;
    const min = [p.x - this.radius, p.y, p.z - this.radius];
    const max = [p.x + this.radius, p.y + this.height, p.z + this.radius];
    return slab([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], min, max, maxDist);
  }

  // Луч по частям тела (hitboxes). Переводим луч в оси сущности (поворот на -yaw вокруг Y) —
  // тогда коробки частей можно проверять как обычные. Вернёт { t, part } ближайшей или null.
  rayHitPart(origin, dir, maxDist) {
    if (!this.hitboxes.length) return null;
    const p = this.position;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const ox = origin.x - p.x;
    const oz = origin.z - p.z;
    const o = [ox * c - oz * s, origin.y - p.y, ox * s + oz * c];
    const d = [dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c];
    let best = null;
    for (const part of this.hitboxes) {
      const t = slab(o, d, part.min, part.max, maxDist);
      if (t !== null && (!best || t < best.t)) best = { t, part };
    }
    return best;
  }

  // Попадание луча: часть тела (если задета) или вся коробка. { t, part | null } или null
  rayHitDetailed(origin, dir, maxDist) {
    const part = this.rayHitPart(origin, dir, maxDist);
    if (part) return part;
    const t = this.rayHit(origin, dir, maxDist);
    return t === null ? null : { t, part: null };
  }

  // Занимает ли сущность клетку-блок (x, y, z) — чтобы не ставить блок внутрь неё
  overlapsCell(c) {
    const p = this.position;
    return c.x < p.x + this.radius && c.x + 1 > p.x - this.radius &&
           c.z < p.z + this.radius && c.z + 1 > p.z - this.radius &&
           c.y < p.y + this.height && c.y + 1 > p.y;
  }
}

// Все сущности мира в одном месте
export class EntityManager {
  constructor() {
    this.list = [];
  }

  add(entity) {
    this.list.push(entity);
    return entity;
  }

  remove(entity) {
    this.list = this.list.filter((e) => e !== entity);
  }

  clear() {
    this.list = [];
  }

  // Ближайшая сущность на луче (кроме skip — например, самого игрока): { entity, t, part } или null.
  // part — часть тела, в которую попали (голова и т. п., entity.hitboxes), или null — просто в тело
  // skip — сущность или список сущностей, которых луч не задевает (сам стрелок, его скакун)
  raycast(origin, dir, maxDist, skip = null) {
    const skips = Array.isArray(skip) ? skip : [skip];
    let best = null;
    for (const e of this.list) {
      if (skips.includes(e) || !e.alive) continue;
      const h = e.rayHitDetailed(origin, dir, maxDist);
      if (h && (!best || h.t < best.t)) best = { entity: e, t: h.t, part: h.part };
    }
    return best;
  }

  overlapsCell(c) {
    return this.list.some((e) => e.alive && e.overlapsCell(c));
  }

  // Часы сущностей: сколько прошло с удара и с гибели (для вспышки и падения), статусы
  update(dt) {
    for (const e of this.list) {
      e.age += dt;
      e.hurtTime += dt;
      if (e.alive) e.updateStatuses(dt);
      e.updateRegen(dt);
      if (!e.alive) e.deadTime += dt;
    }
  }
}

// Метод «плит» для коробки min..max: расстояние по лучу до входа или null
function slab(o, d, min, max, maxDist) {
  let tNear = 0;
  let tFar = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null; // луч параллелен стенкам и мимо
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
