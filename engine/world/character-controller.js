// ============================================================
//  Управление персонажем: действия forward/back/left/right/run/jump
//  превращаются в скорость сущности, а двигает её физика (с тяжестью и стенами).
//  Какие клавиши за действия отвечают — решают привязки (engine/input/input.js).
// ============================================================

import { slideVelocity } from "./physics.js";

// Рывок (выпад): сущность летит в сторону (dirX, dirZ) со скоростью speed duration секунд —
// управление на это время не действует. Стены останавливают, как обычно (физика).
// dirY — рывок в 3D (вверх / вниз / наискось, куда смотришь): направление (dirX, dirY, dirZ), тяжесть на
// время рывка не действует, прыжок тоже. Без dirY — только по земле, падать можно как обычно.
// Скорость 0 с dirY: 0 — «замереть» на месте (и в воздухе) на duration секунд.
// shape — «обтекаемая» коробка на время рывка (как Гэндзи в рывке): { radius, height, anchor } — уже и ниже.
// anchor: "top" — у головы (низ коробки высоко: пролетаешь над блоком перед собой), "middle" — по середине тела.
// Меньше цепляет края блоков, пролезает в щели; после рывка — снова в полный рост (streamline).
// slide — скольжение по стенам и прощение краёв (подняться на край, пройти под потолком, обогнуть угол),
// как у рывков в Overwatch (без него рывок в стену просто теряет скорость):
//   { stopAngle: 30, keep: 0.9 } — влетел в стену почти в лоб (ближе stopAngle° к перпендикуляру) — рывок
//   встаёт; иначе скорость разворачивается ВДОЛЬ стены и сохраняется на keep (0.9 — 90 % скорости рывка)
//   и рывок едет вдоль неё, а кончилась стена — летит дальше в ту же сторону. Внутренний угол (стены с двух
//   сторон) — стоп. true — значения по умолчанию
export function dash(entity, dirX, dirZ, speed, duration, dirY = null, { shape = null, slide = null } = {}) {
  const l = Math.hypot(dirX, dirZ, dirY ?? 0) || 1;
  entity.dash = {
    x: (dirX / l) * speed, z: (dirZ / l) * speed, y: dirY === null ? null : (dirY / l) * speed, left: duration, shape: !!shape,
    slide: slide === true ? { ...SLIDE_DEFAULTS } : slide ? { ...SLIDE_DEFAULTS, ...slide } : null,
  };
  if (shape) streamline(entity, shape);
}

// Прощение краёв (физика: moveAxis → forgive) — тоже часть slide: stepUp — подняться на край, если задел его
// низом тела не глубже stepUp м; stepDown — пройти под краем потолка, если задел головой не глубже stepDown;
// corner — обогнуть угол стены, если задел его краешком не больше corner м
const SLIDE_DEFAULTS = { stopAngle: 30, keep: 0.9, stepUp: 0.5, stepDown: 0.25, corner: 0.25 };

// Рывок упёрся в стену — общий алгоритм скольжения по нормали (physics.js → slideVelocity). Нормали —
// от физики (wallNX / wallNZ); у кубиков их до двух: стена по X и стена по Z (угол)
const NORMALS = [{ x: 0, z: 0 }, { x: 0, z: 0 }]; // без новых объектов каждый кадр
const SLID = { x: 0, z: 0 };
function slideDash(e) {
  const d = e.dash;
  let n = 0;
  if (e.wallNX) { NORMALS[n].x = e.wallNX; NORMALS[n].z = 0; n++; }
  if (e.wallNZ) { NORMALS[n].x = 0; NORMALS[n].z = e.wallNZ; n++; }
  if (!n) return;
  const r = slideVelocity(d.x, d.z, NORMALS, d.slide, SLID, n);
  d.x = r.x;
  d.z = r.z;
}

// Сжать коробку столкновений до shape = { radius, height, anchor }: у головы ("top") или по середине тела
// ("middle"); ноги коробки поднимаются на lift (модель рисуется на lift ниже — drawOffsetY, на экране ничего
// не прыгает; глаза игра считает от lift сама)
export function streamline(entity, { radius, height, anchor = "middle" }) {
  if (entity.streamlined) return;
  const lift = Math.max(0, anchor === "top" ? entity.height - height : (entity.height - height) / 2);
  entity.streamlined = { radius: entity.radius, height: entity.height, lift };
  entity.radius = Math.min(entity.radius, radius);
  entity.height = height;
  entity.position.y += lift;
  entity.drawOffsetY = -lift;
}

// Вернуть полный рост. Места нет (рывок кончился в низкой щели) — остаёмся сжатыми: вернёт false, попробуем
// в следующем кадре. Сначала — с ногами там, где были до сжатия, потом — встать, не опуская ног
export function unstreamline(entity, physics) {
  const s = entity.streamlined;
  if (!s) return true;
  const small = { radius: entity.radius, height: entity.height, y: entity.position.y };
  entity.radius = s.radius;
  entity.height = s.height;
  for (const y of [small.y - s.lift, small.y]) {
    entity.position.y = y;
    if (!physics?.collides(entity)) {
      entity.streamlined = null;
      entity.drawOffsetY = 0;
      return true;
    }
  }
  entity.radius = small.radius;
  entity.height = small.height;
  entity.position.y = small.y;
  return false;
}

// Нажал прыжок чуть раньше приземления — он всё равно сработает (с), и «койот»: сошёл с края — ещё столько
// секунд прыгаешь как с земли, двойной прыжок не тратится
const JUMP_BUFFER = 0.15;
const COYOTE_TIME = 0.12;

export class CharacterController {
  constructor(entity, input, physics, { speed = 4, runMultiplier = 2, jumpHeight = 1.2 } = {}) {
    this.entity = entity;
    this.input = input;
    this.physics = physics;
    this.speed = speed; //           метров в секунду (блок = 1 метр)
    this.runMultiplier = runMultiplier;
    this.jumpHeight = jumpHeight; // на сколько метров подпрыгиваем
    this.extraJumps = 0; //          прыжков в воздухе (1 — двойной прыжок): нажал прыжок ещё раз, пока летишь
    this.airJumps = 0; //            сколько уже сделано в этом полёте
    this.jumpWasDown = false;
    this.canRun = () => true; //    можно ли бежать сейчас (игра ставит своё: выносливость — engine/world/stamina.js)
    this.jumpBlocked = false; //    прыгать нельзя (игра ставит на время — например, удар молотом в воздухе)
    // Приземление: onLand({ fall, speed }) — с какой высоты упал (м, от самой высокой точки полёта) и с какой
    // скоростью ударился о землю (м/с). Игре — урон от падения, толчок камеры
    this.onLand = null;
    this.peakY = null; //          самая высокая точка этого полёта (null — стоим на земле)
    this.fallSpeed = 0; //         скорость падения в прошлом кадре
    this.sinceGround = 0; //         сколько секунд уже в воздухе
    this.jumped = false; //          в воздухе — потому что прыгнули (а не сошли с края)
    this.jumpBuffer = 0; //          нажатие «про запас» ещё действует столько секунд
    // Разгон (как в Overwatch): не мгновенная скорость, а за время. null — мгновенно (как раньше).
    //   { ground, stop, air, airStop, over } — секунд: разогнаться до шага на земле, остановиться на земле,
    //   разогнаться / затормозить в воздухе (меньше — резче управление в полёте), сбросить лишнюю скорость
    //   (после рывка или отброса быстрее шага — не тянется вечно). Разворот = торможение + разгон
    this.accel = null;
  }

  // Горизонтальная скорость → к цели (tx, tz), не быстрее, чем позволяет разгон (вектором: смена направления
  // тоже требует времени — как у машины «0–100», только за доли секунды)
  // Движение как в Source (accel.source = true): трение (только на земле) + ускорение по ПРОЕКЦИИ — ограничена
  // только скорость вдоль клавиш, а не вся. Отсюда сами собой: инерция, повороты в воздухе (air strafe: жмёшь вбок
  // и ведёшь мышью — набираешь скорость по дуге), прыжки подряд без потери скорости (в кадр прыжка трения нет).
  //   трение: до шага — как в Source (max(скорость, stop) × friction за секунду: останавливаешься быстро);
  //           сверх шага — линейно boostGround м/с за секунду (разгон от рывка живёт ~секунду), в воде — boostWater;
  //   ускорение: на земле — до шага за groundAccel⁻¹ с; в воздухе — вдоль клавиш не больше airCap м/с
  //              (ускорение airAccel × шаг), в воздухе лишняя скорость гаснет на boostAir м/с за секунду;
  //   entity.noFriction > 0 — трения нет (рывок держит скорость: игра);
  //   жмёшь против движения на земле — ещё brake; больше maxMult × шага не бывает; в капкане — стоп
  sourceMove(entity, wx, wz, wishspeed, dt, jumping) {
    const a = this.accel, v = entity.velocity, air = !entity.onGround;
    const walk = Math.max(0.1, this.speed) * Math.max(1, entity.speedMultiplier);
    if (entity.speedMultiplier < 0.2) { v.x = 0; v.z = 0; return; }
    let s = Math.hypot(v.x, v.z);
    // трение
    if (s > 0.001) {
      let drop = 0;
      if (entity.inWater) drop = (s > walk ? a.boostWater : Math.max(s, a.stopSpeed) * a.friction) * dt;
      else if (!air && !jumping && !(entity.noFriction > 0)) drop = (s > walk + 0.05 ? a.boostGround : Math.max(s, a.stopSpeed) * (wishspeed > 0 ? a.friction : a.stopFriction ?? a.friction)) * dt; // отпустил клавиши — тормозит резко (stopFriction)
      else if (air && s > walk) drop = a.boostAir * dt;
      if (!air && wishspeed > 0 && (v.x * wx + v.z * wz) < 0 && s > walk) drop += a.brake * dt; // против движения — тормоз
      const ns = Math.max(0, s - drop);
      v.x *= ns / s;
      v.z *= ns / s;
      s = ns;
    }
    // Управляемость на большой скорости в воздухе (не как в Source — чтобы не улетать в бездну): клавиши
    // поворачивают разгон на airSteer рад/с, жмёшь против — тормозит на airBrake м/с за секунду
    if (air && wishspeed > 0 && s > walk && a.airSteer) {
      let dx = v.x / s, dz = v.z / s;
      const c0 = dx * wx + dz * wz;
      if (c0 < -0.3) s = Math.max(walk, s - a.airBrake * dt); //  против движения — тормоз (не разворот)
      const ang = c0 < -0.3 ? 0 : Math.atan2(dx * wz - dz * wx, c0), turn = Math.max(-a.airSteer * dt, Math.min(a.airSteer * dt, ang));
      const c = Math.cos(turn), sn = Math.sin(turn);
      [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c];
      v.x = dx * s;
      v.z = dz * s;
    }
    // ускорение по проекции (Source: Accelerate / AirAccelerate)
    if (wishspeed > 0) {
      const cap = air ? Math.min(wishspeed, a.airCap) : wishspeed;
      const cur = v.x * wx + v.z * wz;
      const add = cap - cur;
      if (add > 0) {
        const before = Math.hypot(v.x, v.z);
        const acc = Math.min(add, (air ? a.airAccel : a.groundAccel) * wishspeed * dt);
        v.x += wx * acc;
        v.z += wz * acc;
        // на земле клавиши разгоняют только до шага: смена направления (WASD по кругу) не набирает скорость
        // сверх него (иначе — разгон без рывков и скольжение после); разгон от рывка не трогаем — не больше, чем был
        if (!air) {
          const after = Math.hypot(v.x, v.z), lim = Math.max(wishspeed, before);
          if (after > lim) { v.x *= lim / after; v.z *= lim / after; }
        }
      }
    }
    // предел
    const capAll = walk * (a.maxMult ?? 6), ns = Math.hypot(v.x, v.z);
    if (ns > capAll) { v.x *= capAll / ns; v.z *= capAll / ns; }
  }

  approach(entity, tx, tz, dt) {
    const a = this.accel, v = entity.velocity;
    const air = !entity.onGround;
    const want = Math.hypot(tx, tz), have = Math.hypot(v.x, v.z);
    const base = Math.max(0.1, this.speed);
    // Скольжение (entity.slide = { friction, steer, ax, az, cap } — ставит игра): трение маленькое, ускорение
    // по склону (ax, az), клавиши только чуть поворачивают; больше cap × шага не бывает
    const sl = entity.slide;
    if (sl) {
      v.x += (sl.ax || 0) * dt;
      v.z += (sl.az || 0) * dt;
      let s = Math.hypot(v.x, v.z);
      if (s > 0.01) {
        let dx = v.x / s, dz = v.z / s;
        if (want > 0.01) {
          const ix = tx / want, iz = tz / want;
          const ang = Math.atan2(dx * iz - dz * ix, dx * ix + dz * iz), turn = Math.max(-sl.steer * dt, Math.min(sl.steer * dt, ang));
          const c = Math.cos(turn), sn = Math.sin(turn);
          [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c];
        }
        s = Math.min(base * (sl.cap ?? 6), Math.max(0, s - sl.friction * dt));
        v.x = dx * s;
        v.z = dz * s;
      }
      return;
    }
    // Инерция (accel.boostGround задан): скорость сверх шага (рывок, взрыв, отдача) гаснет сама — по земле
    // boostGround м/с за секунду, в воздухе boostAir, в воде boostWater; клавиши её поворачивают (steer рад/с) и
    // тормозят, если жмёшь против (brake); больше maxMult × шага не бывает; в капкане — сразу шаг
    if (a.boostGround !== undefined) {
      const walk = base * Math.max(1, entity.speedMultiplier);
      const cap = walk * (a.maxMult ?? 6);
      if (have > cap) { v.x *= cap / have; v.z *= cap / have; }
      const fast = Math.min(have, cap);
      if (fast > walk + 0.05 && entity.speedMultiplier >= 0.2) {
        let dx = v.x / fast, dz = v.z / fast;
        let decay = entity.inWater ? a.boostWater : air ? a.boostAir : a.boostGround;
        if (want > 0.01) {
          const ix = tx / want, iz = tz / want;
          // повернуть направление к клавишам — не больше steer × dt
          const ang = Math.atan2(dx * iz - dz * ix, dx * ix + dz * iz), turn = Math.max(-a.steer * dt, Math.min(a.steer * dt, ang));
          const c = Math.cos(turn), s = Math.sin(turn);
          [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
          if (dx * ix + dz * iz < 0) decay += a.brake; // жмёшь против — тормозишь
        } else if (!air) decay += a.brake * 0.5; //       отпустил клавиши на земле — тормозит быстрее
        const s2 = Math.max(want > 0.01 ? walk : 0, fast - decay * dt);
        v.x = dx * s2;
        v.z = dz * s2;
        return;
      }
    }
    let time = want > 0.01 ? (air ? a.air : a.ground) : (air ? a.airStop : a.stop);
    if (have > Math.max(want, base * this.runMultiplier) + 0.05) time = Math.min(time, a.over ?? time); // лишняя скорость
    const rate = (base / Math.max(0.01, time)) * dt; // м/с за этот шаг
    const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
    if (d <= rate) { v.x = tx; v.z = tz; return; }
    v.x += (dx / d) * rate;
    v.z += (dz / d) * rate;
  }

  // yaw — куда смотрит игрок: «вперёд» — это туда.
  // Возвращает { moving, running, speed } — аниматору нужно знать, идём ли и как быстро.
  update(dt, yaw) {
    const { input, entity } = this;

    let fwd = 0;
    let side = 0;
    if (input.isDown("forward")) fwd += 1;
    if (input.isDown("back")) fwd -= 1;
    if (input.isDown("right")) side += 1;
    if (input.isDown("left")) side -= 1;

    const len = Math.hypot(fwd, side);
    const moving = len > 0;
    const running = moving && input.isDown("run") && this.canRun(); // canRun — например, хватает ли выносливости
    // Замедление и т. п. — от статусов сущности (engine/combat/status.js)
    const speed = moving ? this.speed * (running ? this.runMultiplier : 1) * entity.speedMultiplier : 0;

    // Вперёд и вправо по земле при повороте yaw; делим на len, чтобы по диагонали не бежать в √2 быстрее
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const k = moving ? speed / len : 0;
    const tx = (sin * fwd + cos * side) * k, tz = (cos * fwd - sin * side) * k;
    if (this.accel?.source && !entity.slide) {
      // Source: направление клавиш (единичное) и желаемая скорость; в кадр прыжка — без трения (bunny hop)
      const want = Math.hypot(tx, tz);
      const jumping = entity.onGround && (input.isDown("jump") || this.jumpBuffer > 0) && !this.jumpBlocked;
      this.sourceMove(entity, want ? tx / want : 0, want ? tz / want : 0, want, dt, jumping);
    } else if (this.accel) this.approach(entity, tx, tz, dt);
    else {
      entity.velocity.x = tx;
      entity.velocity.z = tz;
    }
    // Разбег (engine/world/charge.js) — бежим сами, куда смотрим; клавиши не действуют
    if (entity.charge?.active) {
      const v = entity.charge.velocity;
      entity.velocity.x = v.x;
      entity.velocity.z = v.z;
    }
    // Идёт рывок (dash) — он важнее клавиш
    const dashing = entity.dash?.left > 0;
    // Рывок с обтекаемой коробкой кончился (или сменился обычным) — встаём в полный рост, как только есть место
    if (entity.streamlined && !(dashing && entity.dash.shape)) unstreamline(entity, this.physics);
    if (dashing) {
      entity.velocity.x = entity.dash.x;
      entity.velocity.z = entity.dash.z;
      entity.dash.left -= dt;
      // рывок способности (ИАЙ, прыжок мачете) кончился — его скорость не уносит дальше по инерции: обычный шаг
      if (entity.dash.left <= 0 && !entity.dash.keep) {
        entity.velocity.x = tx;
        entity.velocity.z = tz;
      }
    }

    // Прыжок. Какая нужна скорость, чтобы взлететь на h метров? Из физики: v² = 2·g·h
    // На земле — пока зажат (держишь — прыгаешь снова, как в Minecraft); в воздухе (двойной прыжок) — по НАЖАТИЮ:
    // нажатие ловится событием (input.wasPressed), так что даже короткое между кадрами не теряется.
    // jumpBlocked — прыгать сейчас нельзя (например, удар молотом в воздухе ждёт приземления)
    const jumpDown = input.isDown("jump");
    const jumpPressed = input.wasPressed?.("jump") ?? (jumpDown && !this.jumpWasDown);
    const jumpV = Math.sqrt(2 * this.physics.gravity * this.jumpHeight);
    if (entity.onGround) {
      this.airJumps = 0;
      this.sinceGround = 0;
      this.jumped = false;
    } else this.sinceGround += dt;
    // Нажатие «про запас»: нажал чуть раньше, чем приземлился (и прыжков в воздухе не осталось) — прыгнем,
    // как только коснёмся земли. Пока прыгать нельзя (jumpBlocked) — нажатие не копится
    if (jumpPressed && !this.jumpBlocked) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const want = jumpPressed || this.jumpBuffer > 0;
    // «Койот»: только что сошёл с края (не прыжком) — это ещё обычный прыжок, двойной не тратится
    const coyote = !entity.onGround && !this.jumped && this.sinceGround < COYOTE_TIME;
    // Игра может перехватить нажатие прыжка (jumpOverride → true): прыжок из рывка, от стены — тогда обычного
    // прыжка и прыжка в воздухе на это нажатие нет (раньше прыжок от стены тратил ещё и прыжок в воздухе)
    if (want && !this.jumpBlocked && !(entity.inWater && !entity.noGravity) && this.jumpOverride?.()) {
      this.jumpBuffer = 0;
      this.jumped = true;
      entity.swimUp = false;
    } else if (entity.inWater && !entity.noGravity) {
      // В воде: прыжок — всплывать (с разгоном, engine/world/physics.js → WATER_PHYS); у берега (упёрся) — выпрыгнуть
      entity.swimUp = jumpDown;
      if (jumpDown && entity.blocked && !entity.headInWater) entity.velocity.y = Math.max(entity.velocity.y, jumpV * 0.8);
      this.jumpBuffer = 0;
      this.airJumps = 0;
      this.jumped = true;
    } else if (this.jumpBlocked || dashing) {
      entity.swimUp = false;
      // не прыгаем; в рывке нажатие и не копится (иначе прыжок сработал бы сразу после рывка)
      if (dashing && entity.dash?.lockJump) this.jumpBuffer = 0;
    } else if ((jumpDown || want) && (entity.onGround || coyote)) {
      // На земле — по зажатию (держишь — прыгаешь снова, как в Minecraft) или по нажатию: короткое касание
      // между кадрами (при низком FPS) тоже прыжок — раньше на земле смотрели только «зажат ли сейчас»
      entity.velocity.y = jumpV;
      this.jumped = true;
      this.jumpBuffer = 0;
    } else if (want && !entity.onGround && this.airJumps < this.extraJumps && (this.canAirJump?.() ?? true)) {
      this.onAirJump?.(); // игра: прыжок в воздухе чего-то стоит (выносливость)
      this.airJumps++;
      this.jumped = true;
      this.jumpBuffer = 0;
      // Двойной прыжок: полная сила прыжка + половина того, с чем ещё летим вверх — нажал рано, на взлёте, —
      // всё равно заметно выше (раньше скорость просто ставилась заново, и ранний второй прыжок почти не ощущался)
      entity.velocity.y = jumpV * Math.sqrt(this.airJumpHeight ?? 1) + Math.max(0, entity.velocity.y) * 0.5; // airJumpHeight — доля высоты обычного прыжка
    }
    this.jumpWasDown = jumpDown;
    // 3D-рывок: вертикаль — тоже его (и прыжок, и тяжесть на это время не действуют)
    if (dashing && entity.dash.y !== null) entity.velocity.y = entity.dash.y;

    entity.forgive = dashing && entity.dash.slide ? entity.dash.slide : null; // рывок прощает края (физика)
    const wasAir = this.peakY !== null;
    this.physics.step(entity, dt);
    entity.forgive = null;
    // Полёт и приземление: в воздухе (или на скользком — тоже не стоим) копим самую высокую точку
    if (entity.inWater) {
      this.peakY = null; // в воде — не падение (урона от падения в воду нет)
      this.fallSpeed = 0;
    } else if (!entity.onGround) {
      this.peakY = Math.max(this.peakY ?? entity.position.y, entity.position.y);
      this.fallSpeed = Math.max(0, -entity.velocity.y);
    } else {
      if (wasAir) this.onLand?.({ fall: Math.max(0, this.peakY - entity.position.y), speed: this.fallSpeed });
      this.peakY = null;
      this.fallSpeed = 0;
    }
    if (dashing && entity.dash?.slide) slideDash(entity); // упёрся рывком в стену — скользим вдоль неё
    return { moving, running, speed };
  }
}
