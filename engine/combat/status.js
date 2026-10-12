// ============================================================
//  Статусы (эффекты) на сущности: горение, отравление, замедление...
//  Статус живёт duration секунд и каждые interval секунд что-то делает (tick).
//
//  Свой статус = наследник StatusEffect: переопределить tick, а для замедления
//  и т. п. — speedMultiplier. Одинаковый статус (тот же id) не дублируется:
//  обновляется время, а если stackable — растёт число стопок (сильнее эффект).
//
//  Баффы и дебаффы — те же статусы:
//   positive — бафф (хороший, зелёный значок) или дебафф (плохой, красный);
//   modifiers — модификаторы урона (engine/combat/modifiers.js), которые действуют, ПОКА статус висит:
//               атаки владельца сами их учитывают (Attack.allModifiers);
//   speed — прибавка к скорости (0.2 — на 20 % быстрее, −0.3 — медленнее);
//   charges — сколько атак продержится (каждая атака тратит заряд; 0 — не тратится);
//   duration: Infinity — висит, пока не потратят заряды или не снимут (entity.removeStatus).
//   icon — короткая надпись на значке (2–3 знака), color — цвет значка;
//   guard(damage, owner) → true — статус ОТБИВАЕТ этот удар целиком (блок, парирование, щит).
//
//    hero.addStatus(buff({ id: "iai", name: "ИАЙ", icon: "X2", modifiers: [damageMultiplier(2)], charges: 1, duration: Infinity }));
// ============================================================

import { Damage } from "./damage.js";

export class StatusEffect {
  constructor({ id, name, duration = 3, interval = 0, stackable = false, maxStacks = 5, source = null,
    positive = false, modifiers = [], speed = 0, charges = 0, icon = null, color = null, guard = null }) {
    this.id = id;
    this.name = name;
    this.duration = duration;
    this.left = duration; //  сколько ещё осталось
    this.interval = interval; // как часто tick (0 — не тикает)
    this.timer = 0;
    this.stackable = stackable;
    this.maxStacks = maxStacks;
    this.stacks = 1;
    this.source = source; //  кто наложил
    this.positive = positive; //   бафф или дебафф
    this.modifiers = modifiers; // модификаторы урона, пока висит
    this.speed = speed; //         прибавка к скорости
    this.charges = charges; //     на сколько атак (0 — без счёта)
    this.icon = icon; //           надпись на значке
    this.color = color; //         цвет значка
    this.guard = guard; //         (damage, owner) → true — удар отбит
  }

  // Во сколько раз меняется скорость сущности (1 — не меняется)
  get speedMultiplier() {
    return 1 + this.speed;
  }

  // Атака владельца состоялась — потратить заряд (кончились — статус снимается)
  spendCharge() {
    if (this.charges <= 0) return;
    this.charges--;
    if (this.charges === 0) this.left = 0;
  }

  // Тот же статус наложили снова: время — заново, стопки — +1 (если можно)
  refresh(other) {
    this.left = Math.max(this.left, other.duration);
    if (this.stackable) this.stacks = Math.min(this.maxStacks, this.stacks + 1);
  }

  // Вернёт false, когда статус закончился
  update(entity, dt) {
    this.left -= dt;
    if (this.interval > 0) {
      this.timer += dt;
      while (this.timer >= this.interval && entity.alive) {
        this.timer -= this.interval;
        this.tick(entity);
      }
    }
    return this.left > 0 && entity.alive;
  }

  tick(entity) {}
}

// Урон по времени («dot»): горение, яд, кровотечение. Урон тоже идёт через пакет —
// значит, сопротивления цели работают (огнеупорный скелет почти не горит).
// Сила — либо число за тик (damagePerTick), либо доля МАКС. здоровья цели в секунду
// (percentPerSecond: 0.075 — 7.5 % в секунду): так огонь одинаково опасен и слабым, и крепким.
export class DamageOverTime extends StatusEffect {
  constructor({ damagePerTick = 0, percentPerSecond = 0, element, ...rest }) {
    super(rest);
    this.damagePerTick = damagePerTick;
    this.percentPerSecond = percentPerSecond;
    this.element = element;
    this.carry = 0; // дробная часть урона (7.5 % от 50 HP за полсекунды = 1.875) — копим до целых
  }

  // Наложили снова: время — заново, а если новый сильнее — берём его силу
  refresh(other) {
    super.refresh(other);
    if (other.percentPerSecond > this.percentPerSecond) this.percentPerSecond = other.percentPerSecond;
    if (other.damagePerTick > this.damagePerTick) this.damagePerTick = other.damagePerTick;
  }

  tick(entity) {
    const raw = (this.damagePerTick + entity.stats.maxHp * this.percentPerSecond * this.interval) * this.stacks + this.carry;
    const amount = Math.floor(raw);
    this.carry = raw - amount;
    if (amount <= 0) return;
    // kind — от какого вида атаки статус (подожгли пулей — горение «дальнее»): кто добил огнём, добил ею
    const d = new Damage({ amount, element: this.element, source: this.source, tags: ["dot"], kind: this.origin || null });
    entity.receive(d);
  }
}

// Замедление: скорость умножается на factor (0.6 — 60 % от обычной)
export class Slow extends StatusEffect {
  constructor({ factor = 0.6, ...rest }) {
    super({ icon: "ЛЁД", color: [120, 190, 255], ...rest });
    this.factor = factor;
  }

  get speedMultiplier() {
    return this.factor;
  }
}

// Уровни горения: доля макс. HP в секунду и длительность. Уровень берётся у поджигателя
// (source.burnLevel — например, ранг таланта), по умолчанию — 1
export const BURN_LEVELS = [
  { percent: 0.075, duration: 4 }, // 1: 7.5 % HP/с, 4 с (≈ 30 % здоровья за поджог)
  { percent: 0.15, duration: 5 }, //  2: 15 % HP/с, 5 с (≈ 75 %)
];

// Бафф / дебафф: статус без тиков — модификаторы урона, скорость, заряды (см. шапку файла)
export const buff = (options) => new StatusEffect({ positive: true, ...options });
export const debuff = (options) => new StatusEffect({ positive: false, ...options });

// Блок (парирование): duration секунд отбивает удары видов kinds (по умолчанию — ближний бой),
// пришедшие спереди — в секторе arc° от того, куда смотрит владелец (yaw). Отбитый удар не ранит.
export const parry = ({ duration = 0.4, kinds = ["melee"], arc = 160 } = {}) =>
  new StatusEffect({
    id: "parry", name: "БЛОК", icon: "БЛ", positive: true, color: [140, 200, 255], duration,
    guard: (d, owner) => {
      if (!kinds.includes(d.kind)) return false;
      const src = d.source;
      if (!src?.position) return true; // урон «ниоткуда» — отбиваем
      let diff = Math.atan2(src.position.x - owner.position.x, src.position.z - owner.position.z) - owner.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      return Math.abs(diff) <= (arc * Math.PI) / 360;
    },
  });

// Готовые статусы
export const burn = (source, level = source?.burnLevel || 1) => {
  const b = BURN_LEVELS[Math.max(1, Math.min(BURN_LEVELS.length, level)) - 1];
  return new DamageOverTime({ id: "burn", name: "ГОРЕНИЕ", duration: b.duration, interval: 0.5, percentPerSecond: b.percent, element: "fire", source });
};
export const poison = (source) => new DamageOverTime({ id: "poison", name: "ЯД", duration: 5, interval: 1, damagePerTick: 1, element: "poison", stackable: true, source });
export const chill = (source) => new Slow({ id: "chill", name: "ОХЛАЖДЕНИЕ", duration: 2, factor: 0.6, source });
