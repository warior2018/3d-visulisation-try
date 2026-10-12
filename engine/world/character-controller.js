// ============================================================
//  Управление персонажем: действия forward/back/left/right/run/jump
//  превращаются в скорость сущности, а двигает её физика (с тяжестью и стенами).
//  Какие клавиши за действия отвечают — решают привязки (engine/input/input.js).
// ============================================================

// Рывок (выпад): сущность летит в сторону (dirX, dirZ) со скоростью speed duration секунд —
// управление на это время не действует. Стены останавливают, как обычно (физика).
export function dash(entity, dirX, dirZ, speed, duration) {
  const l = Math.hypot(dirX, dirZ) || 1;
  entity.dash = { x: (dirX / l) * speed, z: (dirZ / l) * speed, left: duration };
}

export class CharacterController {
  constructor(entity, input, physics, { speed = 4, runMultiplier = 2, jumpHeight = 1.2 } = {}) {
    this.entity = entity;
    this.input = input;
    this.physics = physics;
    this.speed = speed; //           метров в секунду (блок = 1 метр)
    this.runMultiplier = runMultiplier;
    this.jumpHeight = jumpHeight; // на сколько метров подпрыгиваем
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
    const running = moving && input.isDown("run");
    // Замедление и т. п. — от статусов сущности (engine/combat/status.js)
    const speed = moving ? this.speed * (running ? this.runMultiplier : 1) * entity.speedMultiplier : 0;

    // Вперёд и вправо по земле при повороте yaw; делим на len, чтобы по диагонали не бежать в √2 быстрее
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const k = moving ? speed / len : 0;
    entity.velocity.x = (sin * fwd + cos * side) * k;
    entity.velocity.z = (cos * fwd - sin * side) * k;
    // Идёт рывок (dash) — он важнее клавиш
    if (entity.dash?.left > 0) {
      entity.velocity.x = entity.dash.x;
      entity.velocity.z = entity.dash.z;
      entity.dash.left -= dt;
    }

    // Прыжок. Какая нужна скорость, чтобы взлететь на h метров? Из физики: v² = 2·g·h
    if (input.isDown("jump") && entity.onGround) {
      entity.velocity.y = Math.sqrt(2 * this.physics.gravity * this.jumpHeight);
    }

    this.physics.step(entity, dt);
    return { moving, running, speed };
  }
}
