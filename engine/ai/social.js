// ============================================================
//  Социальный ИИ — как существа влияют друг на друга.
//  Стадо: разозлился один — злятся соседи, от них — их соседи.
//  Злость «прилипает» к ПЕРВОЙ цели: пока она жива и не убежала, существо не переключается,
//  даже если его бьёт кто-то другой (иначе мобы метались бы между стражем и героем).
//  Сменить цель силой может только провокация — taunt (навык «агро на себя»).
//  Позже здесь же: позвать на помощь, разбежаться, держаться группой, разговоры НПС...
// ============================================================

// Провокация: существо e duration секунд злится только на target, что бы ни было
// (ни своя цель, ни удары других его не отвлекают). После — продолжает злиться на target как обычно.
//   taunt(skeleton, hero, 4);
export function taunt(e, target, duration = 4) {
  e.taunt = { target, left: duration };
  e.aggro = target;
}

// Для мозгов: идёт ли провокация (и отсчитать время). Вернёт цель или null
export function tauntTarget(e, dt) {
  const t = e.taunt;
  if (!t) return null;
  t.left -= dt;
  if (t.left <= 0 || !t.target?.alive) {
    e.taunt = null;
    return null;
  }
  return t.target;
}

// Аура провокации: у сущности задан tauntRadius (например, страж) — враги, зашедшие к ней ближе
// этого радиуса, злятся ИМЕННО на неё и бросают прежнюю цель (героя не трогают, пока рядом страж).
// Вернёт ближайшую такую сущность для e или null.
export function auraTarget(e, entities) {
  let best = null;
  let bestD = Infinity;
  for (const o of entities) {
    if (!o.tauntRadius || !o.alive || o === e || !e.isHostileTo(o)) continue;
    const d = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z);
    if (d <= o.tauntRadius && d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

// Занято ли существо своей целью (живой) — тогда тревога стада его не перенаправляет
export const busy = (e) => !!e.aggro?.alive;

// Стадная тревога: сущность first разозлилась на target — все «свои» в радиусе radius
// тоже злятся, а от каждого из них — их соседи, и так по цепочке (обход в ширину).
// Злость хранится в e.aggro (на кого). filter(e) — кто считается «своим»
// (по умолчанию — того же типа). Вернёт список тех, кто разозлился сейчас.
export function alertHerd(first, target, entities, { radius = 5.5, filter = (e) => e.type === first.type } = {}) {
  const alerted = [];
  if (!target?.alive) return alerted;
  const queue = [];
  if (first.aggro !== target) {
    first.aggro = target;
    alerted.push(first);
  }
  queue.push(first);
  while (queue.length) {
    const a = queue.shift();
    for (const b of entities) {
      if (b === a || b === target || !b.alive || b.aggro === target || !filter(b)) continue;
      if (busy(b)) continue; // уже дерётся со своей целью — не переключается
      if (Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) > radius) continue;
      b.aggro = target;
      alerted.push(b);
      queue.push(b); // теперь и он поднимает своих соседей
    }
  }
  return alerted;
}
