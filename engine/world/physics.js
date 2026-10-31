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
  // surfaceAt(x, y, z) — какая поверхность у твёрдой клетки ("slip" — скользкая; null — обычная). Не передали —
  // все обычные. slip — как съезжает тело со скользкого: accel (м/с² разгона), max (м/с), drag (как быстро
  // гаснет, когда сошли на обычную опору)
  constructor({ isSolid, surfaceAt = null, hasSurfaces = null, gravity = 22, slip = { accel: 14, max: 6, drag: 12 } }) {
    this.isSolid = isSolid; // (x, y, z) -> true/false
    this.surfaceAt = surfaceAt;
    this.slip = slip;
    // hasSurfaces() — есть ли в мире хоть одна особая клетка (не передали — считаем, что может быть).
    // Нет ни одной и никто не съезжает — опору под ногами не проверяем (экономия на каждой сущности)
    this.hasSurfaces = hasSurfaces;
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
    // Съезжаем со скользкого: своя скорость скольжения прибавляется к той, что задали клавиши / мозги
    const sv = e.slipVel;
    if (sv) {
      v.x += sv.x;
      v.z += sv.z;
    }
    const longest = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
    const steps = Math.max(1, Math.ceil(longest / MAX_STEP));
    const k = dt / steps;

    e.onGround = false;
    e.blocked = false; // упёрлась ли сбоку в стену (поведениям: пора прыгать)
    e.blockedX = false; // в какую стену: по X или по Z
    e.blockedZ = false;
    // Нормали стен, в которые упёрлись за этот шаг (куда «смотрит» поверхность: от стены к нам). У кубиков стены
    // по осям, поэтому нормаль — ±1 по X или по Z; алгоритм скольжения (slideVelocity) работает с любой нормалью
    e.wallNX = 0;
    e.wallNZ = 0;
    for (let i = 0; i < steps; i++) {
      if (this.moveAxis(e, "x", v.x * k)) { e.wallNX = -Math.sign(v.x); v.x = 0; e.blocked = true; e.blockedX = true; }
      if (this.moveAxis(e, "y", v.y * k)) {
        if (v.y < 0) e.onGround = true; // упали на что-то — стоим
        v.y = 0; //                         ударились головой или приземлились
      }
      if (this.moveAxis(e, "z", v.z * k)) { e.wallNZ = -Math.sign(v.z); v.z = 0; e.blocked = true; e.blockedZ = true; }
    }
    if (!e.onGround) v.y = Math.max(v.y - half, -MAX_FALL); // вторая половина тяжести
    if (sv) {
      // скорость скольжения — своя, не копится в скорости тела (её каждый кадр задают заново);
      // упёрлись в стену — по этой оси скольжение кончилось
      if (e.blockedX) sv.x = 0;
      else v.x -= sv.x;
      if (e.blockedZ) sv.z = 0;
      else v.z -= sv.z;
    }
    if (this.surfaceAt && (!this.hasSurfaces || this.hasSurfaces() || (sv && (sv.x || sv.z)))) this.updateSlip(e, dt);
    else e.onSlip = false;
  }

  // Стоит ли на скользком: опора под ногами — только скользкие клетки (хоть одна обычная — стоим, как в OW:
  // край обычной опоры держит). Тогда не «на земле» (не прыгнуть, не устоять) и съезжаем: вдоль того, куда
  // уже едем, а если стоим — от середины скользкого блока к ближнему краю
  updateSlip(e, dt) {
    const S = this.slip;
    let slipCell = null;
    if (e.onGround) {
      const p = e.position, r = e.radius;
      const y = Math.floor(p.y - 0.01);
      let normal = false;
      for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r - 1e-9) && !normal; x++)
        for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r - 1e-9); z++) {
          if (!this.isSolid(x, y, z)) continue;
          if (this.surfaceAt(x, y, z) === "slip") slipCell ||= { x, z };
          else { normal = true; break; }
        }
      if (normal) slipCell = null;
    }
    const sv = (e.slipVel ||= { x: 0, z: 0 });
    if (!slipCell) {
      // Сошли на обычную опору — скольжение быстро гаснет; в воздухе — летим с ним дальше (инерция съезда)
      if (e.onGround) {
        const k = Math.max(0, 1 - S.drag * dt);
        sv.x *= k;
        sv.z *= k;
      }
      e.onSlip = false;
      return;
    }
    e.onSlip = true;
    e.onGround = false; // на скользком не устоять: не прыгнешь, не встанешь
    let dx = sv.x, dz = sv.z;
    if (Math.hypot(dx, dz) < 0.3) {
      dx = e.position.x - (slipCell.x + 0.5);
      dz = e.position.z - (slipCell.z + 0.5);
      if (Math.hypot(dx, dz) < 1e-3) dx = 1; // ровно посередине — куда-нибудь
    }
    const len = Math.hypot(dx, dz);
    const speed = Math.min(S.max, Math.hypot(sv.x, sv.z) + S.accel * dt);
    sv.x = (dx / len) * speed;
    sv.z = (dz / len) * speed;
  }

  // Сдвинуть по одной оси. Если упёрлись — встаём вплотную к препятствию. Вернёт true при ударе.
  // e.forgive (принудительное движение — рывок; ставит контроллер) — прощение краёв, как в Overwatch:
  //   corner — задели угол стены краешком (перекрытие не больше corner м) — сдвигаемся вбок и огибаем угол;
  //   stepUp — задели верхний край препятствия низом тела (до края не больше stepUp м) — поднимаемся на него;
  //   stepDown — задели головой нижний край потолка (не глубже stepDown м) — прижимаемся вниз и проходим под ним
  moveAxis(e, axis, d) {
    if (d === 0) return false;
    const p = e.position;
    p[axis] += d;
    if (!this.collides(e)) return false;
    if (axis !== "y" && e.forgive && this.forgive(e, axis)) return false;

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

  // Прощение краёв (см. moveAxis): пробуем по очереди — угол вбок, край снизу, край сверху; что освободило
  // коробку, то и оставляем. Ничего — возвращаем как было (это настоящая стена)
  forgive(e, axis) {
    const f = e.forgive, p = e.position, r = e.radius;
    // Угол: сдвиг по ДРУГОЙ горизонтальной оси — сначала в ближнюю сторону
    const side = axis === "x" ? "z" : "x";
    if (f.corner > 0) {
      const lo = p[side] - r, hi = p[side] + r;
      const toMinus = Math.floor(hi - 1e-9) - hi - EPS; // уйти «назад», чтобы дальний край коробки вышел из клетки
      const toPlus = Math.ceil(lo) - lo + EPS; //          уйти «вперёд», чтобы ближний край вышел из клетки
      const tries = Math.abs(toMinus) <= toPlus ? [toMinus, toPlus] : [toPlus, toMinus];
      for (const dz of tries) {
        if (Math.abs(dz) > f.corner || Math.abs(dz) < 1e-6) continue;
        p[side] += dz;
        if (!this.collides(e)) return true;
        p[side] -= dz;
      }
    }
    // Край снизу: подняться на верх препятствия у ног
    if (f.stepUp > 0) {
      const up = Math.floor(p.y) + 1 - p.y + EPS;
      if (up <= f.stepUp) {
        p.y += up;
        if (!this.collides(e)) return true;
        p.y -= up;
      }
    }
    // Край сверху: опустить голову под нижний край потолка
    if (f.stepDown > 0) {
      const head = p.y + e.height;
      const down = head - Math.floor(head - 1e-9) + EPS;
      if (down <= f.stepDown && p.y - down >= 0) {
        p.y -= down;
        if (!this.collides(e)) return true;
        p.y += down;
      }
    }
    return false;
  }

  // Сущность оказалась внутри блока (старое сохранение, блок появился на ней) — выталкиваем вверх
  unstuck(e) {
    for (let i = 0; i < 64 && this.collides(e); i++) {
      e.position.y = Math.floor(e.position.y) + 1 + EPS;
      e.velocity.y = 0;
    }
  }
}

// ---------- Скольжение по поверхности («столкнись и скользи», как в Overwatch / Source) ----------
// Скорость (x, z) упёрлась в поверхность с нормалью n (единичная, от поверхности к нам). Из скорости вычитаем
// часть «в поверхность»: v − n·(v·n) — остаётся движение вдоль неё под ЛЮБЫМ углом (у кубиков нормаль по оси,
// у наклонной стены модели — наискось, формула та же). Правила для принудительного движения (рывок):
//   stopAngle — влетел почти в лоб (угол между движением и «внутрь поверхности» меньше stopAngle°) — стоп;
//   keep — вдоль поверхности скорость не меньше keep от прежней (0.9 — почти не теряем, как в OW).
// Несколько нормалей (угол из двух стен) — по очереди: во внутреннем углу вдоль обеих ехать некуда — ноль.
// Пишет результат в out ({ x, z }) и возвращает его; count — сколько нормалей из массива брать
export function slideVelocity(vx, vz, normals, { stopAngle = 30, keep = 0.9 } = {}, out = { x: 0, z: 0 }, count = normals.length) {
  const speed = Math.hypot(vx, vz);
  let x = vx, z = vz;
  for (let i = 0; i < count; i++) {
    const n = normals[i];
    const dot = x * n.x + z * n.z; //               < 0 — движемся в поверхность
    if (dot >= 0) continue; //                       от поверхности или вдоль — не мешает
    const len = Math.hypot(x, z);
    const intoAngle = (Math.acos(Math.min(1, -dot / (len || 1))) * 180) / Math.PI; // 0° — точно в лоб
    if (intoAngle < stopAngle) {
      out.x = 0;
      out.z = 0;
      return out;
    }
    x -= n.x * dot; // убираем часть «в поверхность»
    z -= n.z * dot;
  }
  const left = Math.hypot(x, z);
  if (left > 1e-9 && left < speed * keep) {
    const k = (speed * keep) / left; // вдоль поверхности — почти прежней скоростью
    x *= k;
    z *= k;
  }
  out.x = x;
  out.z = z;
  return out;
}
