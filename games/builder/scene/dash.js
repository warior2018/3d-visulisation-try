// ============================================================
//  Рывок и выносливость (DASH), как в Deadlock: выносливость — деления (DASH.pips, базово 3); рывок (Shift —
//  skill3) тратит одно. Деления копятся по одному: каждое — за DASH.recharge секунд (базово 4), пока не полные.
//  Во время рывка направление не меняется и сам рывок не отменить (кроме прыжка из рывка и приседа — скольжение);
//  прерывают — оглушение, капкан. Прыжок из рывка: через DASH.jump[0] с после рывка шкала на DASH.jump[1] с синяя — прыжок в это окно тратит ещё
//  деление и даёт ещё такой же толчок (туда же) с прыжком.
//  Рывок с земли прилипает к полу (DASH.stick): пологие подъёмы и спуски — не отрываясь.
//  Рывок — толчок (DASH.impulse м/с) туда, куда жмёшь клавиши движения (не жмёшь — вперёд, куда смотришь):
//  прибавляется к скорости векторно, дальше гаснет сам (инерция: CharacterController.approach, MOVEMENT.boost*),
//  клавиши его поворачивают. Между рывками — DASH.cooldown. Бега нет: шаг один, разгон — только так.
//  Нельзя: верхом, в капкане / оглушён, лёжа (матч), в рывке способности. Шкала — под прицелом: деления, заполняемое
//  сейчас — полоской.
// ============================================================

import { DASH, DASH_SLIDE } from "../config.js";
import { dash } from "../../../engine/index.js";

export class DashPart {
  // Сколько делений всего (база + таланты, если появятся: talentStats.stamina)
  get staminaMax() {
    return DASH.pips + (this.talentStats?.stamina || 0);
  }

  // Каждый тик: деления копятся по одному
  updateDash(dt) {
    this.dashCd = Math.max(0, (this.dashCd || 0) - dt);
    this.updateDashRun(dt);
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
    if (!p?.alive || this.downed || p.mount || p.dash?.left > 0 || this.pull) return; // рывок кончился — объект dash остаётся (left ≤ 0)
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
    // рывок как в Deadlock: DASH.distance м, скорость по пути — DASH.speed: [в начале, к середине пути, в конце]
    // (updateDashRun), клавиши не действуют; в воздухе — ровно по горизонтали. Кончился — летишь со скоростью конца,
    // дальше гаснет сама: на земле быстро (до шага), в воздухе медленно (MOVEMENT.boost*)
    const l = Math.hypot(dx, dz) || 1;
    dash(p, dx, dz, DASH.speed[0], 60, p.onGround ? null : 0, { slide: DASH_SLIDE });
    p.dash.lockJump = true; // в рывке — ни прыжка, ни прыжка в воздухе / от стены (только прыжок из рывка, присед — скольжение)
    this.dashRun = { d: 0, x: dx / l, z: dz / l };
    this.dashFromGround = p.onGround; // прыжок из рывка — только у рывка с земли
    if (!p.onGround) this.airDashes = (this.airDashes || 0) + 1;
    this.dashCd = DASH.cooldown;
    this.dashSince = 0; //                                 окно прыжка из рывка (dashJump)
    this.dashDir = { x: dx / l, z: dz / l };
    if (p.onGround) this.groundDash = true; // с земли — прилипает к полу (updateDashStick)
    this.spendPip();
    this.engine.sound.play("dash");
    this.fx?.burst({ x: p.position.x, y: p.position.y + 0.3, z: p.position.z }, { count: 8, speed: 2, color: [210, 210, 220], size: 0.06, life: 0.35, gravity: 1, drag: 3 });
    this.engine.redraw();
  }

  // Скорость рывка по пройденному пути: растёт от speed[0] к speed[1] к середине, к концу — до speed[2]. Прошли
  // DASH.distance — рывок кончился, остаётся скорость конца (дальше — инерция). Рывок оборвали (прыжок, скольжение)
  // — забываем
  updateDashRun(dt) {
    const r = this.dashRun, p = this.player, D = p?.dash;
    if (!r) return;
    if (!D || !(D.left > 0)) return void (this.dashRun = null);
    // оглушили / капкан / сели верхом — рывок прерван (сам игрок — только прыжком из рывка или приседом в скольжение)
    if (p.stunned || p.speedMultiplier < 0.2 || p.mount || !p.alive) {
      D.left = 0;
      this.dashRun = null;
      return;
    }
    const v = Math.hypot(D.x, D.z) || DASH.speed[0];
    r.d += v * dt;
    const [v0, v1, v2] = DASH.speed, half = DASH.distance / 2;
    // направление — как сейчас у рывка (об стену он мог повернуть вдоль неё)
    const ux = D.x / v || r.x, uz = D.z / v || r.z;
    if (r.d >= DASH.distance) {
      D.left = 0;
      D.keep = true; // скорость конца — остаётся (дальше гаснет сама)
      p.velocity.x = ux * v2;
      p.velocity.z = uz * v2;
      this.dashRun = null;
      return;
    }
    const s = r.d < half ? v0 + (v1 - v0) * (r.d / half) : v1 + (v2 - v1) * ((r.d - half) / half);
    D.x = ux * s;
    D.z = uz * s;
  }

  // Окно прыжка из рывка открыто (DASH.jump: через [0] с после рывка, на [1] с)
  get dashJumpOpen() {
    const t = this.dashSince, p = this.player;
    if (t === undefined || t < DASH.jump[0] || t > DASH.jump[0] + DASH.jump[1]) return false;
    // рывок с земли и ты на земле (или только что сошёл с края) — иначе окна нет (и шкала не синеет)
    return !!this.dashFromGround && !!p && (p.onGround || (this.controller?.sinceGround ?? 1) < 0.1);
  }

  // Нажали прыжок (scene/input.js): в окне — прыжок из рывка: деление, ещё толчок туда же, куда рывок, и прыжок
  dashJump() {
    const p = this.player;
    if (!this.dashJumpOpen || !p?.alive || p.mount || (this.pips ?? 0) < 1) return false;
    // только рывок с земли и пока ты на земле (или только что сошёл с края — 0.1 с): рывок в воздухе и упавший
    // с края — без прыжка из рывка (обычный прыжок / прыжок в воздухе)
    if (!this.dashFromGround || !(p.onGround || (this.controller?.sinceGround ?? 1) < 0.1)) return false;
    if (p.speedMultiplier < 0.2 || p.stunned) return false;
    if (p.dash) { p.dash.left = 0; p.dash.keep = true; } // рывок ещё идёт — кончается, его скорость — в прыжке
    this.dashSince = undefined;
    this.spendPip();
    // скорость вдоль рывка — не меньше DASH.jumpSpeed (не прибавляет сверху: быстрее уже — остаётся)
    const along = p.velocity.x * this.dashDir.x + p.velocity.z * this.dashDir.z, add = Math.max(0, DASH.jumpSpeed - along);
    p.velocity.x += this.dashDir.x * add;
    p.velocity.z += this.dashDir.z * add;
    const jumpV = Math.sqrt(2 * (this.physics?.gravity ?? 22) * (this.controller?.jumpHeight ?? 1.2) * DASH.jumpHeight); // выше обычного на DASH.jumpHeight
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
    const dashing = p?.dash?.left > 0; // в рывке у стены — прыжок от стены обрывает рывок (и на земле)
    if (!p?.alive || (p.onGround && !dashing) || p.mount || p.inWater || (this.wallJumpCd || 0) > 0) return false;
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
    // Куда: по клавишам движения, но не ближе W.angle° к стене (вдоль стены жмёшь «вперёд» — отлетаешь под
    // W.angle° от неё вперёд, а не поперёк); клавиш нет или жмёшь в стену — прямо от стены. Скорость — не меньше
    // W.push и не меньше той, с которой летел (разгон сохраняется, только поворачивает)
    const ux = nx / nl, uz = nz / nl;
    const input = this.engine.input;
    let fwd = 0, side = 0;
    if (input.isDown("forward")) fwd += 1;
    if (input.isDown("back")) fwd -= 1;
    if (input.isDown("right")) side += 1;
    if (input.isDown("left")) side -= 1;
    const yaw = this.look.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    let ix = sy * fwd + cy * side, iz = cy * fwd - sy * side;
    const il = Math.hypot(ix, iz);
    let dx = ux, dz = uz;
    if (il > 0) {
      ix /= il;
      iz /= il;
      const outK = ix * ux + iz * uz, minOut = Math.sin((W.angle * Math.PI) / 180);
      if (outK >= minOut) { dx = ix; dz = iz; } //                           и так достаточно от стены
      else {
        // вдоль стены (знак — как у клавиш), отклонение от стены — ровно angle°
        const tx = ix - ux * outK, tz = iz - uz * outK, tl = Math.hypot(tx, tz);
        if (tl > 1e-3) {
          const c = Math.cos((W.angle * Math.PI) / 180);
          dx = (tx / tl) * c + ux * minOut;
          dz = (tz / tl) * c + uz * minOut;
        }
      }
    }
    // скорость: летишь туда, куда прыгнул (dx, dz); величина — W.push + та часть нынешней скорости (в рывке —
    // скорости рывка; он обрывается), что смотрит в ту же сторону: прыгнул почти по ходу — сохранил почти всё,
    // вбок — мало, назад — ничего (только толчок). Часть скорости «в стену» стена гасит
    let vx = p.velocity.x, vz = p.velocity.z;
    if (dashing) {
      vx = p.dash.x;
      vz = p.dash.z;
      p.dash.left = 0;
      p.dash.keep = true;
      this.dashRun = null;
    }
    const into = vx * ux + vz * uz;
    if (into < 0) { vx -= ux * into; vz -= uz * into; }
    const keep = Math.max(0, vx * dx + vz * dz); // проекция на направление прыжка
    p.velocity.x = dx * (keep + W.push);
    p.velocity.z = dz * (keep + W.push);
    // высота: чем быстрее летишь, тем ниже — от W.up[0] (до W.upSpeed[0] м/с) до W.up[1] (от W.upSpeed[1] м/с) доли
    // высоты обычного прыжка
    const sp = Math.hypot(p.velocity.x, p.velocity.z), [s0, s1] = W.upSpeed;
    const k = Math.max(0, Math.min(1, (sp - s0) / (s1 - s0)));
    const frac = W.up[0] + (W.up[1] - W.up[0]) * k;
    p.velocity.y = Math.max(p.velocity.y, jumpV * Math.sqrt(frac));
    p.onGround = false;
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
    if (p?.dash?.left > 0) return; // в рывке — не падение (присед в рывке — скольжение: scene/slide.js)
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
