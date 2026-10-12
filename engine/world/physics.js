// ============================================================
//  Физика сущностей: тяжесть и столкновения с твёрдыми клетками.
//
//  Сущность — «коробка» (engine/world/entity.js): от ног вверх на height,
//  вширь на radius в каждую сторону. Мир для физики — одна функция
//  isSolid(x, y, z): твёрдая ли клетка 1×1×1. Откуда она это знает (кубики,
//  карта уровня, что угодно) — физике всё равно.
//
//  Как двигаемся: по каждой оси ОТДЕЛЬНО — сначала X, потом Y, потом Z.
//  Упёрлись по X — по X дальше не идём, но по Z продолжаем: так получается
//  «скольжение» вдоль стены, а не прилипание к ней.
//  Быстрое движение режем на шаги не длиннее 0.25 м, чтобы не проскочить сквозь блок.
// ============================================================

const EPS = 1e-3; //      зазор между коробкой и стеной, чтобы не «касаться» её
const MAX_STEP = 0.25; // самый длинный шаг за раз (меньше блока — не проскочим)
const MAX_FALL = 50; //   быстрее падать нельзя (м/с)

export class Physics {
  constructor({ isSolid, gravity = 22 }) {
    this.isSolid = isSolid; // (x, y, z) -> true/false
    this.gravity = gravity; // м/с² (на Земле 9.8, в играх обычно больше — прыжки бодрее)
  }

  // Пересекается ли коробка сущности хоть с одной твёрдой клеткой
  collides(e) {
    const p = e.position;
    const r = e.radius;
    // Клетки, которые задевает коробка. -1e-9: коробка, стоящая ровно на границе, соседнюю клетку не задевает
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r - 1e-9);
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + e.height - 1e-9);
    const z0 = Math.floor(p.z - r), z1 = Math.floor(p.z + r - 1e-9);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (this.isSolid(x, y, z)) return true;
    return false;
  }

  // Один кадр: тяжесть тянет вниз, скорость двигает, стены и пол останавливают
  step(e, dt) {
    this.unstuck(e);
    // Тяжесть — половину до движения и половину после. Если вычесть всю сразу,
    // прыжок получится ниже задуманного (1.14 вместо 1.2): мы бы «тормозили» слишком рано.
    // С половинками путь за кадр точный: v·t − g·t²/2, как в школьной формуле.
    const half = this.gravity * dt * 0.5;
    e.velocity.y = Math.max(e.velocity.y - half, -MAX_FALL);

    const v = e.velocity;
    const longest = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
    const steps = Math.max(1, Math.ceil(longest / MAX_STEP));
    const k = dt / steps;

    e.onGround = false;
    e.blocked = false; // упёрлась ли сбоку в стену (поведениям: пора прыгать)
    for (let i = 0; i < steps; i++) {
      if (this.moveAxis(e, "x", v.x * k)) { v.x = 0; e.blocked = true; }
      if (this.moveAxis(e, "y", v.y * k)) {
        if (v.y < 0) e.onGround = true; // упали на что-то — стоим
        v.y = 0; //                         ударились головой или приземлились
      }
      if (this.moveAxis(e, "z", v.z * k)) { v.z = 0; e.blocked = true; }
    }
    if (!e.onGround) v.y = Math.max(v.y - half, -MAX_FALL); // вторая половина тяжести
  }

  // Сдвинуть по одной оси. Если упёрлись — встаём вплотную к препятствию. Вернёт true при ударе.
  moveAxis(e, axis, d) {
    if (d === 0) return false;
    const p = e.position;
    p[axis] += d;
    if (!this.collides(e)) return false;

    // Насколько коробка выступает от position в сторону движения и в обратную
    const ahead = axis === "y" ? (d > 0 ? e.height : 0) : e.radius;
    const behind = axis === "y" ? 0 : e.radius; // ноги — это и есть position.y
    if (d > 0) {
      const cell = Math.floor(p[axis] + ahead - 1e-9); // клетка, в которую въехали
      p[axis] = cell - ahead - EPS;
    } else {
      const cell = Math.floor(p[axis] - behind); //       клетка, в которую въехали
      p[axis] = cell + 1 + behind + EPS;
    }
    return true;
  }

  // Сущность оказалась внутри блока (старое сохранение, блок появился на ней) — выталкиваем вверх
  unstuck(e) {
    for (let i = 0; i < 64 && this.collides(e); i++) {
      e.position.y = Math.floor(e.position.y) + 1 + EPS;
      e.velocity.y = 0;
    }
  }
}
