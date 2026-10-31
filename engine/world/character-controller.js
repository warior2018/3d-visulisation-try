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
    entity.velocity.x = (sin * fwd + cos * side) * k;
    entity.velocity.z = (cos * fwd - sin * side) * k;
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
    if (this.jumpBlocked || dashing) {
      // не прыгаем (рывок сам ведёт по вертикали — нажатие не тратим, оно останется «про запас»)
    } else if ((jumpDown || want) && (entity.onGround || coyote)) {
      // На земле — по зажатию (держишь — прыгаешь снова, как в Minecraft) или по нажатию: короткое касание
      // между кадрами (при низком FPS) тоже прыжок — раньше на земле смотрели только «зажат ли сейчас»
      entity.velocity.y = jumpV;
      this.jumped = true;
      this.jumpBuffer = 0;
    } else if (want && !entity.onGround && this.airJumps < this.extraJumps) {
      this.airJumps++;
      this.jumped = true;
      this.jumpBuffer = 0;
      // Двойной прыжок: полная сила прыжка + половина того, с чем ещё летим вверх — нажал рано, на взлёте, —
      // всё равно заметно выше (раньше скорость просто ставилась заново, и ранний второй прыжок почти не ощущался)
      entity.velocity.y = jumpV + Math.max(0, entity.velocity.y) * 0.5;
    }
    this.jumpWasDown = jumpDown;
    // 3D-рывок: вертикаль — тоже его (и прыжок, и тяжесть на это время не действуют)
    if (dashing && entity.dash.y !== null) entity.velocity.y = entity.dash.y;

    entity.forgive = dashing && entity.dash.slide ? entity.dash.slide : null; // рывок прощает края (физика)
    const wasAir = this.peakY !== null;
    this.physics.step(entity, dt);
    entity.forgive = null;
    // Полёт и приземление: в воздухе (или на скользком — тоже не стоим) копим самую высокую точку
    if (!entity.onGround) {
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
