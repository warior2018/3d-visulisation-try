// ============================================================
//  Поведения сущностей — простые «мозги», которые игра может раздать существам.
//  Поведение только решает, КУДА идти и куда смотреть (задаёт скорость и поворот),
//  а двигает сущность физика (engine/world/physics.js) — со стенами и тяжестью.
// ============================================================

// Повернуть сущность к углу target не быстрее turnSpeed (рад/с), в короткую сторону
export function turnTowards(e, target, turnSpeed, dt) {
  let diff = target - e.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // в пределах -π..π
  e.yaw += Math.max(-turnSpeed * dt, Math.min(turnSpeed * dt, diff));
}

// Преследовать цель: если она ближе radius — повернуться к ней и идти,
// пока не подойдём на stopDistance. Упёрлись в ступеньку — подпрыгнуть.
// Возвращает true, если сущность идёт (аниматору — играть ходьбу).
export function chase(e, target, dt, { radius = 10, speed = 2.2, stopDistance = 1.1, turnSpeed = 4, jumpSpeed = 7 } = {}) {
  const dx = target.position.x - e.position.x;
  const dz = target.position.z - e.position.z;
  const dist = Math.hypot(dx, dz);
  e.velocity.x = 0;
  e.velocity.z = 0;
  if (dist > radius) return false;

  turnTowards(e, Math.atan2(dx, dz), turnSpeed, dt);
  if (dist <= stopDistance) return false;

  // Идём туда, куда смотрим (а не прямо на цель): разворот получается плавным
  const v = speed * e.speedMultiplier; // замедление от статусов
  e.velocity.x = Math.sin(e.yaw) * v;
  e.velocity.z = Math.cos(e.yaw) * v;

  // Прошлый кадр упирались в стену (физика обнулила скорость) — пробуем запрыгнуть
  if (e.blocked && e.onGround) e.velocity.y = jumpSpeed;
  return true;
}

// Не толпиться: если соседи ближе, чем сумма «радиусов» + gap, слегка отходим от них.
// Вызывать после chase (он задаёт скорость), до физики (она двигает).
export function separate(e, others, { gap = 0.3, push = 2.5 } = {}) {
  for (const o of others) {
    if (o === e || !o.alive) continue;
    const dx = e.position.x - o.position.x;
    const dz = e.position.z - o.position.z;
    const dist = Math.hypot(dx, dz);
    const want = e.radius + o.radius + gap;
    if (dist >= want) continue;
    // Стоят ровно в одной точке — расходимся в случайную сторону
    const a = dist > 1e-4 ? Math.atan2(dx, dz) : Math.random() * Math.PI * 2;
    const k = push * (1 - dist / want); // чем ближе, тем сильнее
    e.velocity.x += Math.sin(a) * k;
    e.velocity.z += Math.cos(a) * k;
  }
}

// Ближний бой для ИИ: атака (MeleeAttack из engine/combat) готова и цель в досягаемости —
// бьём. Замах, кулдаун, урон, стихии и модификаторы — всё внутри атаки.
// ctx — как у атак (onUse, onHit, onMiss...); цель подставляем сами.
export function melee(e, target, dt, attack, ctx = {}) {
  attack.update(dt);
  if (!e.alive || !target.alive || !attack.ready || attack.pending) return;
  if (!attack.inRange(e, target)) return;
  attack.use(e, { ...ctx, target });
}

// Преследовать цель С ПОИСКОМ ПУТИ (engine/ai/pathfinder.js): обходит столбы и стены,
// запрыгивает на ступеньки в 1 блок, спрыгивает вниз. Если до цели не добраться
// (стоит на столбе) — подходит как можно ближе и ждёт, а не прыгает в стену.
//   navigator — new Navigator({ isSolid }) у каждого существа свой.
// Возвращает true, если сущность идёт.
export function pursue(e, target, dt, { navigator, radius = 10, speed = 2.2, stopDistance = 1.1, turnSpeed = 4, jumpSpeed = 7.5 } = {}) {
  const dx = target.position.x - e.position.x;
  const dz = target.position.z - e.position.z;
  const dist = Math.hypot(dx, dz);
  e.velocity.x = 0;
  e.velocity.z = 0;
  if (dist > radius) {
    navigator.reset(); // потеряли из виду — путь больше не нужен
    return false;
  }
  const sameLevel = Math.abs(target.position.y - e.position.y) < 1;
  if (dist <= stopDistance && sameLevel) {
    turnTowards(e, Math.atan2(dx, dz), turnSpeed, dt);
    return false;
  }

  const step = navigator.update(e, target.position, dt);
  let tx = target.position.x;
  let tz = target.position.z;
  if (step && !step.done) {
    tx = step.x;
    tz = step.z;
  } else if (step?.done && !step.complete) {
    // Ближе не подойти — стоим и смотрим на цель
    turnTowards(e, Math.atan2(dx, dz), turnSpeed, dt);
    return false;
  }
  const mx = tx - e.position.x;
  const mz = tz - e.position.z;
  const len = Math.hypot(mx, mz);
  if (len > 1e-3) {
    // Идём прямо к точке пути, а лицом плавно поворачиваемся туда же
    const v = speed * e.speedMultiplier;
    e.velocity.x = (mx / len) * v;
    e.velocity.z = (mz / len) * v;
    turnTowards(e, Math.atan2(mx, mz), turnSpeed, dt);
  }
  // Ступенька впереди (по пути) или упёрлись — прыжок
  if (e.onGround && (step?.jump || (e.blocked && !step))) e.velocity.y = jumpSpeed;
  return true;
}


// Стадная тревога переехала в engine/ai/social.js (там весь «социальный» ИИ)
export { alertHerd } from "../ai/social.js";
