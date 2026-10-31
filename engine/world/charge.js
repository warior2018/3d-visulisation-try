// ============================================================
//  Разбег (charge) — возможность движка: сущность бежит вперёд сама (копьё наперевес, таран), а
//  куда — подправляет взгляд. Управление клавишами на это время не действует (CharacterController
//  берёт скорость отсюда, как у dash).
//
//    const run = new Charge({ speed: 8, ramp: 2, maxSpeed: 14 });
//    run.start(hero, look.yaw);
//    // каждый кадр, до controller.update:
//    run.update(dt, look.yaw);           // поворот, разгон, конец
//    if (!run.active) ...                // кончился: время вышло, замедлился, остановили (stop)
//
//  Поворот: есть «мёртвая зона» deadZone (градусы) — посмотрел чуть в сторону, случайно дёрнул мышью —
//  ничего не теряешь, а направление само плавно доворачивает за взглядом (freeTurn градусов в секунду).
//  Отвернулся дальше зоны — направление сразу за взглядом, но скорость падает ПРОПОРЦИОНАЛЬНО лишнему углу:
//  чуть повернул — чуть замедлился, резко и сильно (turnStop градусов сверх зоны) — встал.
//  ramp — разгон: +м/с каждую секунду (талант), не быстрее maxSpeed. Медленнее minSpeed или дольше
//  duration секунд (Infinity — без предела: кончит игра, например по выносливости) — разбег кончается.
//  elapsed — сколько секунд уже бежим. Скорость умножается на entity.speedMultiplier (замедления).
// ============================================================

const RAD = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // к −π…π

export class Charge {
  constructor({ speed = 8, ramp = 0, maxSpeed = 14, deadZone = 20, freeTurn = 45, turnStop = 90, minSpeed = 3, duration = 4 } = {}) {
    this.base = speed;
    this.ramp = ramp;
    this.maxSpeed = maxSpeed;
    this.deadZone = deadZone * RAD;
    this.freeTurn = freeTurn * RAD;
    this.turnStop = turnStop * RAD;
    this.minSpeed = minSpeed;
    this.duration = duration;
    this.active = false;
    this.entity = null;
    this.yaw = 0;
    this.speed = 0;
    this.left = 0;
  }

  start(entity, yaw) {
    this.entity = entity;
    this.yaw = yaw;
    this.speed = this.base;
    this.left = this.duration;
    this.elapsed = 0;
    this.active = true;
    entity.charge = this;
  }

  stop() {
    if (this.entity?.charge === this) this.entity.charge = null;
    this.active = false;
  }

  // Куда и как быстро бежим сейчас: { x, z } (м/с по земле)
  get velocity() {
    const k = this.speed * (this.entity?.speedMultiplier ?? 1);
    return { x: Math.sin(this.yaw) * k, z: Math.cos(this.yaw) * k };
  }

  // Доля скорости от начальной (1 — как в начале; удар разгоном может быть сильнее — решает игра)
  get power() {
    return this.speed / this.base;
  }

  update(dt, aimYaw) {
    if (!this.active) return;
    // 1. Взгляд в мёртвой зоне — бесплатно доворачиваем направление за ним
    let d = wrap(aimYaw - this.yaw);
    const free = Math.min(Math.abs(d), this.freeTurn * dt);
    this.yaw = wrap(this.yaw + Math.sign(d) * free);
    // 2. Вышел за зону — направление за взглядом, скорость падает пропорционально лишнему углу
    d = wrap(aimYaw - this.yaw);
    if (Math.abs(d) > this.deadZone) {
      const excess = Math.abs(d) - this.deadZone;
      this.yaw = wrap(this.yaw + Math.sign(d) * excess);
      this.speed *= Math.max(0, 1 - excess / this.turnStop);
    }
    // 3. Разгон и конец
    this.speed = Math.min(this.maxSpeed, this.speed + this.ramp * dt);
    this.left -= dt;
    this.elapsed += dt;
    if (this.left <= 0 || this.speed < this.minSpeed) this.stop();
  }
}
