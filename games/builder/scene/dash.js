// ============================================================
//  Рывок и выносливость (DASH), как в Deadlock: выносливость — деления (DASH.pips, базово 3); рывок (Shift —
//  skill3) тратит одно. Деления копятся по одному: каждое — за DASH.recharge секунд (базово 4), пока не полные.
//  Прыжок из рывка: через DASH.jump[0] с после рывка шкала на DASH.jump[1] с синяя — прыжок в это окно тратит ещё
//  деление и даёт ещё такой же толчок (туда же) с прыжком.
//  Рывок с земли прилипает к полу (DASH.stick): пологие подъёмы и спуски — не отрываясь.
//  Рывок — толчок (DASH.impulse м/с) туда, куда жмёшь клавиши движения (не жмёшь — вперёд, куда смотришь):
//  прибавляется к скорости векторно, дальше гаснет сам (инерция: CharacterController.approach, MOVEMENT.boost*),
//  клавиши его поворачивают. Между рывками — DASH.cooldown. Бега нет: шаг один, разгон — только так.
//  Нельзя: верхом, в капкане / оглушён, лёжа (матч), в рывке способности. Шкала — под прицелом: деления, заполняемое
//  сейчас — полоской.
// ============================================================

import { DASH } from "../config.js";

export class DashPart {
  // Сколько делений всего (база + таланты, если появятся: talentStats.stamina)
  get staminaMax() {
    return DASH.pips + (this.talentStats?.stamina || 0);
  }

  // Каждый тик: деления копятся по одному
  updateDash(dt) {
    this.dashCd = Math.max(0, (this.dashCd || 0) - dt);
    this.wallJumpCd = Math.max(0, (this.wallJumpCd || 0) - dt);
    if (this.player?.noFriction > 0) this.player.noFriction -= dt;
    if (this.player?.onGround) {
      this.airDashes = 0; // приземлился — рывки в воздухе и прыжки от стен снова есть
      this.wallJumps = 0;
    }
    // окно прыжка из рывка: открылось / закрылось — перерисовать шкалу (синяя)
    if (this.dashSince !== undefined) {
      const was = this.dashJumpOpen;
      this.dashSince += dt;
      if (this.dashSince > DASH.jump[0] + DASH.jump[1]) this.dashSince = undefined;
      if (was !== this.dashJumpOpen) this.engine.redraw();
    }
    this.updateDashStick();
    const max = this.staminaMax;
    this.pips ??= max;
    if (this.pips > max) this.pips = max;
    if (this.pips >= max) return void (this.pipT = 0);
    const before = Math.floor(((this.pipT || 0) / DASH.recharge) * 20);
    this.pipT = (this.pipT || 0) + dt;
    if (this.pipT >= DASH.recharge) {
      this.pipT -= DASH.recharge;
      this.pips++;
    }
    // полоска растёт — перерисовать интерфейс (раз в 1/20 деления, не каждый тик)
    if (Math.floor((this.pipT / DASH.recharge) * 20) !== before || this.pips >= max) this.engine.redraw();
  }

  // Потратить деление (прыжок в воздухе и т. п.)
  spendPip() {
    this.pips = Math.max(0, (this.pips ?? this.staminaMax) - 1);
    this.wallJumps = 0; // потратил выносливость — прыжки от стен снова есть
    this.engine.redraw();
  }

  // Shift: рывок, если есть деление
  tryDash() {
    const p = this.player;
    if (!p?.alive || this.downed || p.mount || p.dash || this.pull) return;
    if (p.speedMultiplier < 0.2 || p.stunned) return; // в капкане / оглушён — никуда
    if ((this.dashCd || 0) > 0) return; //               пауза между рывками
    if ((this.pips ?? this.staminaMax) < 1) return this.noStamina?.();
    // в воздухе — не больше DASH.airDashes (+ талант) рывков до приземления
    if (!p.onGround && (this.airDashes || 0) >= DASH.airDashes + (this.talentStats?.airDashes || 0)) return;
    // куда: клавиши движения относительно взгляда; не жмёшь — вперёд
    const input = this.engine.input;
    let fwd = 0, side = 0;
    if (input.isDown("forward")) fwd += 1;
    if (input.isDown("back")) fwd -= 1;
    if (input.isDown("right")) side += 1;
    if (input.isDown("left")) side -= 1;
    if (!fwd && !side) {
      if (p.onGround) return; // на земле без клавиш движения рывка нет (в воздухе — вперёд)
      fwd = 1;
    }
    const yaw = this.look.yaw, s = Math.sin(yaw), c = Math.cos(yaw);
    const dx = s * fwd + c * side, dz = c * fwd - s * side;
    // бросок (как в Deadlock): скорость вдоль рывка — не меньше DASH.burst (быстрее уже летишь — не прибавляет:
    // цепочка рывков по прямой не разгоняет); поперёк — половина прежней. Дальше гаснет сама (инерция)
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const along = p.velocity.x * ux + p.velocity.z * uz;
    const px = p.velocity.x - ux * along, pz = p.velocity.z - uz * along;
    const sp = Math.max(along, DASH.burst);
    p.velocity.x = ux * sp + px * 0.5;
    p.velocity.z = uz * sp + pz * 0.5;
    if (!p.onGround) this.airDashes = (this.airDashes || 0) + 1;
    p.noFriction = DASH.hold; // бросок держит скорость DASH.hold с (трения нет), потом гаснет
    this.dashCd = DASH.cooldown;
    this.dashSince = 0; //                                 окно прыжка из рывка (dashJump)
    this.dashDir = { x: dx / l, z: dz / l };
    if (p.onGround) this.groundDash = true; // с земли — прилипает к полу (updateDashStick)
    this.spendPip();
    this.engine.sound.play("dash");
    this.fx?.burst({ x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, speed: 2, color: [210, 210, 220], size: 0.06, life: 0.35, gravity: 1, drag: 3 });
    this.engine.redraw();
  }

  // Окно прыжка из рывка открыто (DASH.jump: через [0] с после рывка, на [1] с)
  get dashJumpOpen() {
    const t = this.dashSince;
    return t !== undefined && t >= DASH.jump[0] && t <= DASH.jump[0] + DASH.jump[1];
  }

  // Нажали прыжок (scene/input.js): в окне — прыжок из рывка: деление, ещё толчок туда же, куда рывок, и прыжок
  dashJump() {
    const p = this.player;
    if (!this.dashJumpOpen || !p?.alive || p.mount || (this.pips ?? 0) < 1) return false;
    if (p.speedMultiplier < 0.2 || p.stunned) return false;
    this.dashSince = undefined;
    this.spendPip();
    // скорость вдоль рывка — не меньше DASH.jumpSpeed (не прибавляет сверху: быстрее уже — остаётся)
    const along = p.velocity.x * this.dashDir.x + p.velocity.z * this.dashDir.z, add = Math.max(0, DASH.jumpSpeed - along);
    p.velocity.x += this.dashDir.x * add;
    p.velocity.z += this.dashDir.z * add;
    const jumpV = Math.sqrt(2 * (this.physics?.gravity ?? 20) * (this.controller?.jumpHeight ?? 1.25));
    p.velocity.y = Math.max(p.velocity.y, jumpV);
    p.onGround = false;
    this.groundDash = false; // в прыжке — не прилипает
    if (p.stepHeight === DASH.stick) delete p.stepHeight;
    this.engine.sound.play("dash", { volume: 1.2 });
    this.fx?.burst({ x: p.position.x, y: p.position.y + 0.1, z: p.position.z }, { count: 12, speed: 2.5, color: [150, 200, 255], size: 0.07, life: 0.4, gravity: 1, drag: 3 });
    this.engine.redraw();
    return true;
  }

  // Прыжок от стены (бесплатно): в воздухе у стены — вверх и от неё (DASH.wall). Вернёт, прыгнули ли
  wallJump() {
    const p = this.player;
    if (!p?.alive || p.onGround || p.mount || p.inWater || (this.wallJumpCd || 0) > 0) return false;
    if (p.speedMultiplier < 0.2 || p.stunned) return false;
    // стены рядом: клетки сбоку на высоте ног и пояса — нормаль от стены
    const P = p.position, r = ((p.radius || 0.3) + 0.35) * DASH.wall.reach;
    let nx = 0, nz = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = Math.floor(P.x + dx * r), cz = Math.floor(P.z + dz * r);
      if (this.wallHeight(cx, cz, P.y) >= DASH.wall.minHeight) { nx -= dx; nz -= dz; }
    }
    const nl = Math.hypot(nx, nz);
    if (!nl) return false;
    // не больше wall.max подряд; потратил выносливость (рывок, прыжок в воздухе, прыжок из рывка…) или
    // приземлился — снова wall.max
    if ((this.wallJumps || 0) >= DASH.wall.max) return false;
    this.wallJumps = (this.wallJumps || 0) + 1;
    const W = DASH.wall, jumpV = Math.sqrt(2 * (this.physics?.gravity ?? 22) * (this.controller?.jumpHeight ?? 1.2));
    // от стены: скорость в стену убираем, от стены — не меньше W.push (в стену не прыгнуть, только от неё)
    const ux = nx / nl, uz = nz / nl, out = p.velocity.x * ux + p.velocity.z * uz;
    const add = Math.max(W.push, out) - out;
    p.velocity.x += ux * add;
    p.velocity.z += uz * add;
    p.velocity.y = Math.max(p.velocity.y, jumpV * W.up);
    this.wallJumpCd = W.cooldown;
    this.engine.sound.play("dash", { volume: 0.6 });
    return true;
  }

  // Высота стены в столбике (cx, cz) у тела героя (ноги на y): сплошной кусок, задевающий тело (0.3…1.1 м над
  // ногами), — от его низа до верха, в метрах (0 — стены нет). Низкий бортик / ступенька — не стена
  wallHeight(cx, cz, y) {
    const w = this.world;
    let y0 = Math.floor(y + 0.3);
    if (!w.isSolid(cx, y0, cz)) y0 = Math.floor(y + 1.1);
    if (!w.isSolid(cx, y0, cz)) return 0;
    let lo = y0, hi = y0;
    while (lo - y0 > -40 && w.isSolid(cx, lo - 1, cz)) lo--;
    while (hi - y0 < 40 && w.isSolid(cx, hi + 1, cz)) hi++;
    return hi + w.cellTop(cx, hi, cz) - (lo + w.cellBottom(cx, lo, cz));
  }

  // Быстрое падение: присед дважды в воздухе (за DASH.fall.double с) — рывок вниз, 1 деление
  crouchPressed() {
    const p = this.player, now = this.combatClock || 0;
    const second = now - (this.lastCrouchAt ?? -9) < DASH.fall.double;
    this.lastCrouchAt = now;
    if (!second || !p?.alive || p.onGround || p.mount || (this.pips ?? this.staminaMax) < 1) return;
    this.lastCrouchAt = -9;
    this.spendPip();
    p.velocity.y = Math.min(p.velocity.y, -DASH.fall.speed);
    this.engine.sound.play("dash", { volume: 0.8 });
  }

  // Рывок с земли: пока разгон не погас — ступенька вверх и вниз до DASH.stick блоков (физика: stepHeight), то
  // есть по пологому подъёму / спуску скользит по полу и считается на земле. Оторвался (большой перепад, прыжок),
  // разгон погас — обычная ступенька
  updateDashStick() {
    const p = this.player;
    if (!this.groundDash || !p) return;
    const walk = (this.controller?.speed || 4) * Math.max(1, p.speedMultiplier) + 0.1;
    const over = !p.alive || !p.onGround || p.velocity.y > 0.5 || Math.hypot(p.velocity.x, p.velocity.z) <= walk;
    if (over) {
      this.groundDash = false;
      if (p.stepHeight === DASH.stick) delete p.stepHeight;
    } else p.stepHeight = DASH.stick;
  }

  // Под прицелом: деления выносливости — отдельные полоски: полные — белые, пустые — тёмно-серые, копящаяся —
  // заполняется светло-серым; в окно прыжка из рывка полные — синие
  drawStaminaPips(ui) {
    const p = this.player;
    if (!p?.alive) return;
    const max = this.staminaMax, have = this.pips ?? max;
    const w = 22, h = 5, gap = 4, total = max * w + (max - 1) * gap;
    const x0 = Math.round(ui.width / 2 - total / 2), y = Math.round(ui.height / 2 + 24);
    for (let i = 0; i < max; i++) {
      const x = x0 + i * (w + gap);
      ui.rect(x - 1, y - 1, w + 2, h + 2, [10, 12, 16], 170);
      if (i < have) ui.rect(x, y, w, h, this.dashJumpOpen ? [110, 190, 255] : [242, 242, 246], 240); // синие — окно прыжка из рывка
      else if (i === have) {
        ui.rect(x, y, w, h, [70, 70, 76], 200);
        ui.rect(x, y, Math.round(w * Math.min(1, (this.pipT || 0) / DASH.recharge)), h, [165, 165, 172], 225);
      } else ui.rect(x, y, w, h, [70, 70, 76], 200);
    }
  }
}
