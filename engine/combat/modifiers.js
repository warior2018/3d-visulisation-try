// ============================================================
//  Модификаторы урона — «детали», которые меняют пакет урона по дороге к цели.
//  Висят на атаке (оружие с огнём) или на сущности (бафф «+50 % урона»).
//  Порядок задаёт priority: меньше — раньше. Обычно: сначала стихия, потом
//  прибавки (+N), потом множители (×K), потом крит.
//
//  Свой модификатор = new Modifier({ id, name, priority, apply(damage, ctx) { ... } })
//  ctx: { attacker, victim, attack, random, part, use }
//    attacker — кто бьёт (сущность), victim — кого бьют; owner / target — те же самые (старые имена)
//    attack — какой атакой, part — часть тела (голова), use — контекст одного удара (общий для всех целей взмаха)
//  Кто вообще кого ранил и на сколько (счётчик урона) — engine/combat/combat-log.js; сработавшие
//  модификаторы записываются в пакет урона (damage.applied: { id, delta }) — сколько добавил каждый.
//
//  Кроме apply (поменять урон до попадания) модификатор может:
//   afterHit(result, ctx)        — сделать что-то после попадания (вампиризм);
//   cooldownMultiplier(attack)   — ускорить или замедлить атаку (0.9 — на 10 % чаще);
//   reachMultiplier(attack)      — дальность / радиус удара ближнего боя (1.1 — на 10 % дальше).
// ============================================================

import { ELEMENTS } from "./elements.js";

export class Modifier {
  constructor({ id, name, priority = 50, apply, afterHit, cooldownMultiplier, reachMultiplier }) {
    this.id = id;
    this.name = name;
    this.priority = priority;
    if (apply) this.apply = apply;
    if (afterHit) this.afterHit = afterHit;
    if (cooldownMultiplier) this.cooldownMultiplier = cooldownMultiplier;
    if (reachMultiplier) this.reachMultiplier = reachMultiplier;
  }

  apply(damage, ctx) {}
  afterHit(result, ctx) {}
  cooldownMultiplier(attack) {
    return 1;
  }
  reachMultiplier(attack) {
    return 1;
  }
}

// Дальше бьёт: радиус удара ближнего боя больше на fraction (0.1 — на 10 %)
export const reachBonus = (fraction) =>
  new Modifier({ id: "reach", name: `REACH +${Math.round(fraction * 100)}%`, reachMultiplier: () => 1 + fraction });

// Превратить урон в стихию (меч → огненный меч)
export const convertTo = (element) =>
  new Modifier({ id: "convert-" + element, name: (ELEMENTS[element]?.name || element) + ": DAMAGE", priority: 10, apply: (d) => (d.element = element) });

// Прибавка урона
export const flatDamage = (n) => new Modifier({ id: "flat", name: `+${n} DAMAGE`, priority: 20, apply: (d) => (d.amount += n) });

// Множитель урона (1.5 = +50 %)
export const damageMultiplier = (k) => new Modifier({ id: "mult", name: `DAMAGE X${k}`, priority: 30, apply: (d) => (d.amount *= k) });

// Только против определённых целей (например, ×2 по скелетам)
export const against = (type, k) =>
  new Modifier({ id: "vs-" + type, name: `X${k} VS ${type}`, priority: 30, apply: (d, ctx) => { if (ctx.target?.type === type) d.amount *= k; } });

// Критический удар: с шансом chance урон ×multiplier (уже крит — второй раз не умножаем)
export const critical = (chance = 0.1, multiplier = 2) =>
  new Modifier({
    id: "crit", name: `CRIT ${Math.round(chance * 100)}%`, priority: 40,
    apply: (d, ctx) => {
      if (!d.crit && ctx.random() < chance) { d.amount *= multiplier; d.crit = true; d.tags.add("crit"); }
    },
  });

// Гарантированный крит раз в every секунд: первый удар после перезарядки — ×multiplier.
// Действует на ВЕСЬ взмах: если удар задел нескольких (сплеш), крит получают все цели этого удара.
// Готовность хранится на атакующем (owner.critTimers), поэтому не сбрасывается, когда модификаторы
// пересобираются (например, таланты применили заново). Срабатывает раньше обычного крита — и тот уже не множит.
export const guaranteedCrit = (multiplier = 3, every = 5, id = "sure-crit") =>
  new Modifier({
    id, name: `CRIT X${multiplier} EVERY ${every}S`, priority: 39,
    apply: (d, ctx) => {
      const owner = ctx.owner;
      if (!owner) return;
      const t = (owner.critTimers ||= {});
      const now = performance.now() / 1000;
      const sameSwing = ctx.use && t[id]?.use === ctx.use;
      if (!sameSwing) {
        if (now < (t[id]?.readyAt ?? 0)) return; // ещё перезаряжается
        t[id] = { readyAt: now + every, use: ctx.use };
      }
      d.amount *= multiplier;
      d.crit = true;
      d.tags.add("crit");
    },
  });

// Сколько секунд до следующего гарантированного крита (0 — готов) — для подсказки в интерфейсе
export const critCooldown = (owner, id = "sure-crit") =>
  Math.max(0, (owner?.critTimers?.[id]?.readyAt ?? 0) - performance.now() / 1000);

// Наложить статус с шансом (не завязанный на стихию: например, «удар оглушает»)
export const withStatus = (makeStatus, chance = 1) =>
  new Modifier({ id: "status", name: "EFFECT", priority: 60, apply: (d, ctx) => { if (ctx.random() < chance) d.statuses.push(makeStatus(ctx.owner)); } });

// Вампиризм: fraction от нанесённого урона возвращается атакующему здоровьем
export const lifesteal = (fraction) =>
  new Modifier({
    id: "lifesteal", name: `LIFESTEAL ${Math.round(fraction * 100)}%`, priority: 90,
    afterHit: (r, ctx) => { if (r.dealt > 0) ctx.owner?.heal(Math.ceil(r.dealt * fraction)); },
  });

// Атаки чаще: перезарядка короче на fraction (0.1 — на 10 %)
export const cooldownReduction = (fraction) =>
  new Modifier({ id: "cdr", name: `COOLDOWN -${Math.round(fraction * 100)}%`, cooldownMultiplier: () => 1 - fraction });

// Добивание: по цели, у которой меньше threshold здоровья, урон ×k
export const executioner = (threshold = 0.3, k = 1.5) =>
  new Modifier({
    id: "execute", name: `EXECUTE X${k}`, priority: 35,
    apply: (d, ctx) => { const s = ctx.target?.stats; if (s && s.hp / s.maxHp < threshold) d.amount *= k; },
  });

// Первый удар: по цели с полным здоровьем урон ×k
export const firstStrike = (k = 1.5) =>
  new Modifier({
    id: "first", name: `FIRST STRIKE X${k}`, priority: 35,
    apply: (d, ctx) => { const s = ctx.target?.stats; if (s && s.hp === s.maxHp) d.amount *= k; },
  });

// Первое попадание по этой цели (атакующий её ещё ни разу не ранил): урон ×k
export const firstHit = (k = 1.5) =>
  new Modifier({
    id: "first-hit", name: `FIRST HIT X${k}`, priority: 35,
    apply: (d, ctx) => { if (ctx.target && !ctx.target.damagedBy?.(ctx.owner)) d.amount *= k; },
  });

// По оглушённой / замороженной цели (entity.stunned): урон ×k
export const vsStunned = (k = 1.1) =>
  new Modifier({ id: "vs-stunned", name: `X${k} VS STUNNED`, priority: 35, apply: (d, ctx) => { if (ctx.target?.stunned) d.amount *= k; } });

// Хедшот сильнее: попадание в голову — ещё ×k (поверх множителя головы)
export const headshotBonus = (k = 1.5) =>
  new Modifier({ id: "headshot", name: `HEADSHOT X${k}`, priority: 45, apply: (d, ctx) => { if (ctx.part?.id === "head") d.amount *= k; } });

// Нарастание в одном залпе (дробовик): каждое следующее попадание ЭТОГО выстрела по той же цели
// сильнее на step (0.025 — +2.5 %). Счёт — в контексте выстрела (use), общем для всех дробин
export const rampPerHit = (step = 0.025) =>
  new Modifier({
    id: "ramp", name: `+${Math.round(step * 1000) / 10}% PER HIT`, priority: 36,
    apply: (d, ctx) => {
      const count = (ctx.use.rampHits ||= new Map());
      const n = count.get(ctx.target) || 0;
      d.amount *= 1 + step * n;
      count.set(ctx.target, n + 1);
    },
  });

// Модификатор только для определённого оружия (по id атаки): таланты «молота» не усиливают катану
export function onlyAttack(ids, mod) {
  const list = Array.isArray(ids) ? ids : [ids];
  const mine = (attack) => list.includes(attack?.id);
  return new Modifier({
    id: mod.id,
    name: mod.name,
    priority: mod.priority,
    apply: (d, ctx) => { if (mine(ctx.attack)) mod.apply(d, ctx); },
    afterHit: (r, ctx) => { if (mine(ctx.attack)) mod.afterHit(r, ctx); },
    cooldownMultiplier: (attack) => (mine(attack) ? mod.cooldownMultiplier(attack) : 1),
    reachMultiplier: (attack) => (mine(attack) ? mod.reachMultiplier(attack) : 1),
  });
}

// Модификатор только для атак определённых видов ("melee", "ranged", "magic", "item", "trap").
// Так таланты «ветки ближнего боя» не усиливают пистолет.
export function onlyFor(kinds, mod) {
  const list = Array.isArray(kinds) ? kinds : [kinds];
  const byTags = (tags) => list.some((k) => tags.has(k));
  return new Modifier({
    id: mod.id,
    name: mod.name,
    priority: mod.priority,
    apply: (d, ctx) => { if (byTags(d.tags)) mod.apply(d, ctx); },
    afterHit: (r, ctx) => { if (byTags(r.damage.tags)) mod.afterHit(r, ctx); },
    cooldownMultiplier: (attack) => (list.includes(attack.kind) ? mod.cooldownMultiplier(attack) : 1),
    reachMultiplier: (attack) => (list.includes(attack.kind) ? mod.reachMultiplier(attack) : 1),
  });
}
