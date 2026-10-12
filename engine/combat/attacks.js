// ============================================================
//  Атаки. Общий класс Attack и пять видов:
//
//    MeleeAttack  — ближний бой: удар рукой, меч, когти скелета (можно с замахом);
//    RangedAttack — дальний: пистолет, лук (сейчас мгновенный луч; снаряды — позже);
//    MagicAttack  — магия: тратит ману, может бить по области (радиус);
//    ItemAttack   — тратит предмет из инвентаря (бросить кость, граната, зелье);
//    TrapAttack   — ловушка в мире: срабатывает, когда кто-то подошёл.
//
//  Как проходит удар (одинаково для всех):
//    use() → (кулдаун готов?) → perform() — кого задели → hit() для каждой цели:
//      пакет урона (Damage) → модификаторы атаки и атакующего → статус стихии →
//      target.receive(): сопротивления, урон, статусы.
//
//  Атака не знает, как устроен мир игры. Всё, что ей нужно от мира, игра
//  передаёт в ctx:
//    aim(range)      → { entity, part } | null    — кто под прицелом и в какую часть тела
//                      (part — из entity.hitboxes: { id, multiplier }; голова — хедшот);
//    aimPoint(range) → Vec3                       — точка под прицелом (для магии по области);
//    entities        — все сущности (для области и ловушек);
//    target          — конкретная цель (так бьёт ИИ: он уже знает, кого бьёт);
//    random          — генератор случайных чисел (по умолчанию Math.random);
//    onUse(), onHit(result), onMiss(reason) — чтобы игра включила анимацию, звук, отметку.
// ============================================================

import { viewBasis, toLocal } from "../math/basis.js";
import { Damage } from "./damage.js";
import { ELEMENTS } from "./elements.js";

export class Attack {
  // damage — число или [мин, макс]; element — стихия; cooldown — секунд между использованиями;
  // modifiers — модификаторы самой атаки (оружия)
  // fixedCooldown — перезарядку не ускоряют никакие модификаторы («атаки на 10 % чаще»): тяжёлое оружие
  constructor({ id, name, damage = 10, element = "physical", cooldown = 0.5, modifiers = [], fixedCooldown = false }) {
    this.id = id;
    this.name = name;
    this.kind = "attack"; // вид: melee / ranged / magic / item / trap — проставляют наследники
    this.damage = damage;
    this.element = element;
    this.cooldown = cooldown;
    this.cooldownLeft = 0;
    this.fixedCooldown = fixedCooldown;
    this.modifiers = modifiers;
    this.extraTags = []; // дополнительные ярлыки урона (например, "item" — если атакой бросают предмет)
  }

  // Все модификаторы, которые работают при этой атаке: самой атаки, атакующего (таланты)
  // и его баффов/дебаффов (статусы с modifiers, engine/combat/status.js)
  allModifiers(owner) {
    const fromStatuses = (owner?.statuses || []).flatMap((s) => s.modifiers || []);
    return [...this.modifiers, ...(owner?.modifiers || []), ...fromStatuses].sort((a, b) => a.priority - b.priority);
  }

  get ready() {
    return this.cooldownLeft <= 0;
  }

  update(dt) {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
  }

  // Использовать. Вернёт null, если ещё не готова (кулдаун), иначе — что получилось.
  use(owner, ctx = {}) {
    if (!this.ready) return null;
    const result = this.perform(owner, ctx);
    if (result.used === false) return result; // нечем (нет маны, нет предмета) — кулдаун не тратим
    // Перезарядка с учётом модификаторов («атаки на 10 % чаще»)
    const k = this.fixedCooldown ? 1 : this.allModifiers(owner).reduce((m, mod) => m * mod.cooldownMultiplier(this), 1);
    this.cooldownLeft = this.cooldown * k;
    for (const s of owner?.statuses || []) s.spendCharge?.(); // баффы «на N атак» тратят заряд
    ctx.onUse?.(this);
    if (result.hits?.length === 0 && !result.pending) ctx.onMiss?.("no-target");
    return result;
  }

  // Наследники решают, кого задели. По умолчанию — то, что под прицелом.
  perform(owner, ctx) {
    return { hits: this.hitAll(owner, ctx.target ? [ctx.target] : [], ctx) };
  }

  // Сколько урона до модификаторов
  roll(random = Math.random) {
    if (!Array.isArray(this.damage)) return this.damage;
    const [min, max] = this.damage;
    return min + Math.floor(random() * (max - min + 1));
  }

  // Собрать пакет урона для цели: база → модификаторы → статус стихии
  makeDamage(owner, target, ctx) {
    const random = ctx.random || Math.random;
    const base = (ctx.baseDamage ?? this.roll(random)) * (ctx.cleave ? this.arcMultiplier ?? 1 : 1); // взмах по сектору — свой множитель
    const d = new Damage({ amount: base, element: this.element, source: owner, attack: this, tags: [this.kind, ...this.extraTags] });
    // use — контекст этого удара: один и тот же для всех целей одного взмаха (сплеш катаны)
    const mctx = { owner, target, attack: this, random, part: ctx.part || null, use: ctx };
    for (const m of this.allModifiers(owner)) m.apply(d, mctx);
    // Попали в часть тела с множителем (голова) — урон умножается после всех модификаторов
    if (ctx.part?.multiplier && ctx.part.multiplier !== 1) {
      d.amount *= ctx.part.multiplier;
      d.tags.add(ctx.part.id === "head" ? "headshot" : "part:" + ctx.part.id);
      d.part = ctx.part.id;
    }
    const el = ELEMENTS[d.element];
    if (el?.status && random() < (el.statusChance ?? 1)) d.statuses.push(el.status(owner));
    return d;
  }

  // Ударить одну цель
  hit(owner, target, ctx) {
    const damage = this.makeDamage(owner, target, ctx);
    const { dealt, killed, blocked = false } = target.receive(damage);
    const result = { target, damage, dealt, killed, blocked }; // blocked — цель отбила удар (блок)
    const mctx = { owner, target, attack: this, random: ctx.random || Math.random };
    for (const m of this.allModifiers(owner)) m.afterHit(result, mctx); // вампиризм и т. п.
    ctx.onHit?.(result);
    return result;
  }

  hitAll(owner, targets, ctx) {
    // Кого этот атакующий ранить не может (неуязвимые, защищённые от его стороны) — атака не трогает вовсе
    return targets.filter((t) => t && t.alive && t !== owner && (t.canBeDamagedBy?.(owner) ?? true)).map((t) => this.hit(owner, t, ctx));
  }
}

// ---------- Ближний бой ----------
// windup — замах (секунд) перед ударом: за это время цель может отойти.
// Удар долетает чуть дальше, чем начинается (lenience), — отойти можно, но непросто.
// Хитбокс удара (для игрока — когда цель не задана, ctx.target нет): arc — ширина сектора перед
//   атакующим в градусах (куда смотрит, yaw), reach — его длина, maxTargets — сколько самое большее
//   (ближние — первыми). Бьём по хитбоксу, а не «в кого целишься»: кулак — узкий сектор и одна цель,
//   катана — почти весь экран. Кого задевает: врагов атакующего (isHostileTo); мирных — только если
//   целился прямо в них. Хедшотов в ближнем бою нет. Сквозь стены не бьёт, если игра даст
//   ctx.blocked(owner, target) → true, когда между ними препятствие.
//   arc = 0 — по-старому: только цель под прицелом. ИИ (ctx.target задан) бьёт свою цель, с замахом;
//   если у атаки ИИ есть arc — удар ещё и СПЛЕШ: задевает других своих врагов в секторе (до maxTargets
//   вместе с целью). Так моб, рубящий стража, может зацепить и героя, стоящего рядом.
//   Сектор по камере: игра даёт ctx.view = { origin, pitch, roll } — откуда и с каким наклоном смотрит
//   атакующий (глаза героя). Тогда сектор лежит в ПЛОСКОСТИ ВЗГЛЯДА, а не по земле: смотришь вниз —
//   удар идёт вниз, вверх — вверх, как и след на экране. thickness — сколько метров «толщины» у этой
//   плоскости вверх и вниз (насколько можно промахнуться по высоте). Без ctx.view — по земле, как раньше.
//   arcMultiplier — во сколько раз базовый урон взмаха по сектору больше обычного (катана — ×5).
export class MeleeAttack extends Attack {
  constructor({ reach = 2.5, windup = 0, lenience = 1.2, arc = 0, maxTargets = Infinity, thickness = 1, arcMultiplier = 1, ...rest }) {
    super(rest);
    this.kind = "melee";
    this.reach = reach;
    this.windup = windup;
    this.lenience = lenience;
    this.arc = arc;
    this.maxTargets = maxTargets;
    this.thickness = thickness;
    this.arcMultiplier = arcMultiplier; // урон взмаха по сектору (хитбоксу игрока) ×arcMultiplier к базовому
    this.pending = null; // идёт замах: { left, owner, target, ctx }
  }

  // Кого задевает хитбокс: враги в секторе arc перед owner (ближние — первыми)
  cleaveTargets(owner, aimedTarget, ctx) {
    if (ctx.view) return this.viewTargets(owner, aimedTarget, ctx);
    const half = (this.arc * Math.PI) / 360;
    const found = [];
    for (const e of ctx.entities || []) {
      if (!this.mayHit(owner, e, aimedTarget)) continue;
      if (!this.inRange(owner, e)) continue;
      const dx = e.position.x - owner.position.x;
      const dz = e.position.z - owner.position.z;
      let diff = Math.atan2(dx, dz) - owner.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // к −π…π
      const close = Math.hypot(dx, dz) < e.radius + owner.radius + 0.2; // вплотную — задеваем при любом угле
      if (Math.abs(diff) > half + (close ? Math.PI : 0)) continue;
      if (ctx.blocked?.(owner, e)) continue;
      found.push({ e, d: Math.hypot(dx, dz) });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, this.maxTargets).map((f) => f.e);
  }

  // Можно ли вообще задеть e: живой враг (мирный — только если целились прямо в него), не сам и не скакун
  mayHit(owner, e, aimedTarget) {
    if (e === owner || e === owner.mount || !e.alive || !e.canBeDamagedBy(owner)) return false;
    return e === aimedTarget || owner.isHostileTo(e);
  }

  // Хитбокс в плоскости взгляда (ctx.view): тело цели — вертикальный отрезок от ног до макушки;
  // берём его точку, ближайшую к плоскости, и смотрим: близко ли к плоскости (thickness),
  // в пределах reach и в секторе arc от «вперёд» взгляда
  viewTargets(owner, aimedTarget, ctx) {
    const { origin, pitch = 0, roll = 0 } = ctx.view;
    const basis = viewBasis(owner.yaw, pitch, roll);
    const half = (this.arc * Math.PI) / 360;
    const reach = this.reachFor(owner);
    const found = [];
    for (const e of ctx.entities || []) {
      if (!this.mayHit(owner, e, aimedTarget)) continue;
      const feet = toLocal(origin, basis, e.position);
      const head = toLocal(origin, basis, { x: e.position.x, y: e.position.y + e.height, z: e.position.z });
      // Точка тела ближе всего к плоскости: «вверх» меняется по отрезку линейно — ищем, где он 0
      const t = head.y === feet.y ? 0.5 : Math.max(0, Math.min(1, feet.y / (feet.y - head.y)));
      const p = { x: feet.x + (head.x - feet.x) * t, y: feet.y + (head.y - feet.y) * t, z: feet.z + (head.z - feet.z) * t };
      if (Math.abs(p.y) > this.thickness + e.radius) continue; // выше или ниже взмаха
      const d = Math.hypot(p.x, p.z);
      if (d > reach) continue; //                         дальность — как по земле: до оси тела
      const close = d < e.radius + owner.radius + 0.2; // вплотную — задеваем при любом угле
      if (!close && Math.abs(Math.atan2(p.x, p.z)) > half) continue;
      if (ctx.blocked?.(owner, e)) continue;
      found.push({ e, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, this.maxTargets).map((f) => f.e);
  }

  // Радиус удара с учётом модификаторов владельца (талант «+10 % к радиусу» и т. п.)
  reachFor(owner) {
    return this.reach * this.allModifiers(owner).reduce((k, m) => k * (m.reachMultiplier?.(this) ?? 1), 1);
  }

  // Достаёт ли до цели (по земле; по высоте — не больше 1.5 м разницы)
  inRange(owner, target, k = 1) {
    const dx = target.position.x - owner.position.x;
    const dz = target.position.z - owner.position.z;
    return Math.hypot(dx, dz) <= this.reachFor(owner) * k && Math.abs(target.position.y - owner.position.y) < 1.5;
  }

  perform(owner, ctx) {
    // Игрок (цель не задана): бьём по хитбоксу — всем в секторе; в кого целились — важно только для мирных
    if (!ctx.target) {
      const aimed = ctx.aim?.(this.reachFor(owner))?.entity || null;
      if (this.arc > 0) {
        ctx.cleave = true; // удар по сектору: базовый урон ×arcMultiplier
        return { hits: this.hitAll(owner, this.cleaveTargets(owner, aimed, ctx), ctx) };
      }
      return { hits: aimed ? this.hitAll(owner, [aimed], ctx) : [] }; // arc 0 — по-старому, в цель (без хедшота)
    }
    // ИИ: своя цель, с замахом
    const target = ctx.target;
    if (this.windup > 0) {
      this.pending = { left: this.windup, owner, target, ctx };
      return { hits: [], pending: true };
    }
    return { hits: this.hitAll(owner, this.splashTargets(owner, target, ctx, 1), ctx) };
  }

  // Удар ИИ по цели + сплеш: кто ещё попал под взмах (враги в секторе arc). k — запас дальности для цели
  splashTargets(owner, target, ctx, k) {
    const list = target?.alive && this.inRange(owner, target, k) ? [target] : [];
    if (this.arc > 0 && ctx.entities) {
      for (const t of this.cleaveTargets(owner, null, ctx)) {
        if (list.length >= this.maxTargets) break;
        if (!list.includes(t)) list.push(t);
      }
    }
    return list;
  }

  update(dt) {
    super.update(dt);
    const p = this.pending;
    if (!p) return;
    p.left -= dt;
    if (p.left > 0) return;
    this.pending = null;
    if (!p.owner.alive) return;
    const targets = this.splashTargets(p.owner, p.target, p.ctx, this.lenience); // цель (если не увернулась) + сплеш
    if (targets.length) this.hitAll(p.owner, targets, p.ctx);
    else p.ctx.onMiss?.("dodged");
  }
}

// ---------- Дальний бой ----------
// Сейчас — мгновенный луч (hitscan): попали в то, что под прицелом, если оно ближе range.
// Снаряды, летящие по дуге, — следующий шаг (будет projectile: true).
//
// Обойма: magazine — сколько выстрелов до перезарядки (0 — без обоймы, стреляет бесконечно),
// reloadTime — сколько секунд перезаряжается. Запас патронов бесконечный — кончается только обойма.
//   attack.ammo — сколько осталось, attack.reloading — идёт ли перезарядка, attack.reloadProgress — 0…1.
//   attack.reload() — начать (сама начнётся, когда обойма опустеет). ctx.onReload(attack) — сообщит игре.
export class RangedAttack extends Attack {
  constructor({ range = 40, magazine = 0, reloadTime = 1.5, ...rest }) {
    super(rest);
    this.kind = "ranged";
    this.range = range;
    this.magazine = magazine;
    this.reloadTime = reloadTime;
    this.ammo = magazine;
    this.reloadLeft = 0;
  }

  get reloading() {
    return this.reloadLeft > 0;
  }

  get reloadProgress() {
    return this.reloading ? 1 - this.reloadLeft / this.reloadTime : 1;
  }

  // Готова: перезарядка выстрела прошла, обойму не перезаряжаем и в ней есть патроны
  get ready() {
    return this.cooldownLeft <= 0 && !this.reloading && (this.magazine === 0 || this.ammo > 0);
  }

  // Начать перезарядку. false — нечего (обоймы нет, она полная или уже перезаряжаемся)
  reload(ctx = {}) {
    if (this.magazine === 0 || this.reloading || this.ammo >= this.magazine) return false;
    this.reloadLeft = this.reloadTime;
    ctx.onReload?.(this);
    return true;
  }

  use(owner, ctx = {}) {
    // Пусто — вместо выстрела перезаряжаемся
    if (this.magazine > 0 && this.ammo <= 0) {
      this.reload(ctx);
      return null;
    }
    const result = super.use(owner, ctx);
    if (result && result.used !== false && this.magazine > 0) {
      this.ammo--;
      if (this.ammo === 0) this.reload(ctx); // последний патрон — сразу перезарядка
    }
    return result;
  }

  update(dt) {
    super.update(dt);
    if (!this.reloading) return;
    this.reloadLeft = Math.max(0, this.reloadLeft - dt);
    if (this.reloadLeft === 0) this.ammo = this.magazine; // запас бесконечный — обойма полная
  }

  perform(owner, ctx) {
    const aimed = ctx.target ? null : ctx.aim?.(this.range);
    const target = ctx.target || aimed?.entity || null;
    return { hits: this.hitAll(owner, [target], aimed?.part ? { ...ctx, part: aimed.part } : ctx) };
  }
}

// ---------- Магия ----------
// cost — сколько маны (owner.stats.mana) тратит; если маны у сущности нет вообще — бесплатно.
// radius — 0: одна цель под прицелом; больше 0: все в круге вокруг точки прицела.
export class MagicAttack extends Attack {
  constructor({ range = 25, cost = 10, radius = 0, ...rest }) {
    super(rest);
    this.kind = "magic";
    this.range = range;
    this.cost = cost;
    this.radius = radius;
  }

  perform(owner, ctx) {
    const s = owner?.stats;
    if (s && s.mana !== undefined) {
      if (s.mana < this.cost) {
        ctx.onMiss?.("no-mana");
        return { used: false, hits: [], reason: "no-mana" };
      }
      s.mana -= this.cost;
    }
    if (this.radius <= 0) {
      const target = ctx.target || ctx.aim?.(this.range)?.entity || null;
      return { hits: this.hitAll(owner, [target], ctx) };
    }
    const point = ctx.target?.position || ctx.aimPoint?.(this.range);
    if (!point) return { hits: [] };
    const inside = (ctx.entities || []).filter((e) =>
      Math.hypot(e.position.x - point.x, e.position.z - point.z) <= this.radius + e.radius &&
      point.y >= e.position.y - this.radius && point.y <= e.position.y + e.height + this.radius);
    return { hits: this.hitAll(owner, inside, ctx), point };
  }
}

// ---------- Предмет ----------
// Тратит count штук item из инвентаря и делает то, что умеет effect (другая атака).
// Например: бросок кости = ItemAttack({ item: "bone", effect: new RangedAttack({ damage: 6, range: 15 }) }).
export class ItemAttack extends Attack {
  constructor({ item, count = 1, effect, ...rest }) {
    super({ damage: 0, ...rest });
    this.kind = "item";
    this.item = item;
    this.count = count;
    this.effect = effect;
    effect.extraTags = [...effect.extraTags, "item"]; // урон от предмета — с ярлыком "item" (для талантов ветки «Предметы»)
  }

  perform(owner, ctx) {
    if (!owner?.inventory || owner.inventory.count(this.item) < this.count) {
      ctx.onMiss?.("no-item");
      return { used: false, hits: [], reason: "no-item" };
    }
    owner.inventory.remove(this.item, this.count);
    return this.effect.perform(owner, ctx); // урон считает эффект (с ярлыком "item")
  }
}

// ---------- Бросок (камень, нож, граната...) ----------
// Сам по себе ничего не задевает: use() тратит перезарядку (с модификаторами: «броски чаще»),
// а летит и попадает СНАРЯД (engine/world/projectiles.js) — он и наносит урон через attack.hit.
// Сила броска power 0…1 (сколько держали кнопку, до chargeTime секунд): от неё — скорость и урон.
// Вид — "item": работают таланты ветки «Предметы». Хедшоты есть (снаряд знает, куда попал).
export class ThrowAttack extends Attack {
  constructor({ minDamage = 5, maxDamage = 10, minSpeed = 9, maxSpeed = 24, chargeTime = 0.8, ...rest }) {
    super({ damage: maxDamage, ...rest });
    this.kind = "item";
    this.minDamage = minDamage;
    this.maxDamage = maxDamage;
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;
    this.chargeTime = chargeTime;
  }

  // Сила по времени, что держали кнопку (0…1)
  powerFor(heldSeconds) {
    return Math.max(0, Math.min(1, heldSeconds / this.chargeTime));
  }

  speedFor(power) {
    return this.minSpeed + (this.maxSpeed - this.minSpeed) * power;
  }

  damageFor(power) {
    return Math.round(this.minDamage + (this.maxDamage - this.minDamage) * power);
  }

  perform() {
    return { hits: [], thrown: true }; // урон — когда снаряд долетит
  }
}

// ---------- Ловушка ----------
// Стоит в мире (place), сама ничего не «использует»: каждый кадр update(dt, ctx)
// проверяет, не зашёл ли кто-то в радиус. rearm — через сколько секунд снова
// готова (null — одноразовая). filter(e) — кого трогает (например, только врагов).
export class TrapAttack extends Attack {
  constructor({ radius = 0.8, rearm = null, filter = () => true, owner = null, ...rest }) {
    super({ cooldown: rearm ?? 0, ...rest });
    this.kind = "trap";
    this.radius = radius;
    this.rearm = rearm;
    this.filter = filter;
    this.owner = owner; // кто поставил (может быть null — ловушка «мира»)
    this.position = null;
    this.spent = false; // одноразовая уже сработала
  }

  place(position) {
    this.position = position;
    this.spent = false;
    return this;
  }

  update(dt, ctx = {}) {
    super.update(dt);
    if (!this.position || this.spent || !this.ready) return null;
    const p = this.position;
    const caught = (ctx.entities || []).filter((e) => e.alive && this.filter(e) &&
      Math.hypot(e.position.x - p.x, e.position.z - p.z) <= this.radius + e.radius &&
      Math.abs(e.position.y - p.y) < 1);
    if (!caught.length) return null;
    const hits = this.hitAll(this.owner, caught, ctx);
    this.cooldownLeft = this.cooldown;
    if (this.rearm === null) this.spent = true;
    ctx.onUse?.(this);
    return { hits };
  }
}
