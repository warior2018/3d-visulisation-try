// ============================================================
//  Каст скилла — как в Dota 2 / Deadlock / Overwatch: у умения есть фазы, заряды и перезарядка.
//
//    const blink = new Cast({
//      castPoint: 0.3,    // замах до срабатывания (с), ускоряется скоростью каста
//      backswing: 0.2,    // «хвост» после срабатывания (с) — можно отменить движением (cancelBackswing)
//      channel: 0,        // > 0 — поддержание (с): onTick каждый tickEvery, прерывается оглушением
//      tickEvery: 0.25,
//      cooldown: 8,       // перезарядка заряда (с)
//      charges: 1,        // зарядов (Deadlock / OW: 2 рывка подряд, потом ждать)
//      castSpeed: () => 1 + talents.castSpeed, // скорость каста: ускоряет ТОЛЬКО замах, хвост и анимацию,
//                                               // НЕ перезарядку (как Cast Speed в Dota)
//      cooldownMult: () => 1 - talents.cdr,     // множитель перезарядки (сокращение — отдельно от скорости каста)
//      onStart, onFire, onTick, onEnd, onInterrupt, // что делать в каждой фазе
//    });
//    blink.tryCast(ctx)   // начать (true — началось); нет заряда / уже кастуем — false и reason
//    blink.update(dt, ctx) // каждый тик
//    blink.interrupt("stun") // оглушили / толкнули: замах и поддержание прерываются, заряд НЕ тратится,
//                            // если умение ещё не сработало (как в Dota)
//    blink.state  // "idle" | "windup" | "channel" | "backswing";  blink.progress — 0…1 текущей фазы
//    blink.animSpeed // во сколько раз ускорить анимацию каста (= скорость каста)
// ============================================================

export class Cast {
  constructor({ castPoint = 0, backswing = 0, channel = 0, tickEvery = 0.25, cooldown = 0, charges = 1, castSpeed = () => 1, cooldownMult = () => 1, onStart = null, onFire = null, onTick = null, onEnd = null, onInterrupt = null } = {}) {
    Object.assign(this, { castPoint, backswing, channel, tickEvery, cooldown, maxCharges: charges, castSpeed, cooldownMult, onStart, onFire, onTick, onEnd, onInterrupt });
    this.charges = charges;
    this.recharge = 0; // сколько осталось до следующего заряда (с); идёт, пока зарядов меньше максимума
    this.state = "idle";
    this.time = 0; //    сколько прошло в текущей фазе
    this.length = 0; //  длина текущей фазы (с учётом скорости каста)
    this.tickIn = 0;
    this.reason = "";
  }

  get speed() {
    return Math.max(0.1, this.castSpeed());
  }

  get animSpeed() {
    return this.speed;
  }

  get progress() {
    return this.length > 0 ? Math.min(1, this.time / this.length) : 1;
  }

  get busy() {
    return this.state !== "idle" && this.state !== "backswing";
  }

  // Можно ли начать (заряд есть, не кастуем). Хвост прошлого каста новый каст прерывает
  canCast() {
    if (this.busy) return (this.reason = "BUSY"), false;
    if (this.charges <= 0) return (this.reason = "COOLDOWN"), false;
    return (this.reason = ""), true;
  }

  tryCast(ctx) {
    if (!this.canCast()) return false;
    if (this.state === "backswing") this.finish(ctx);
    this.onStart?.(ctx, this);
    this.enter("windup", this.castPoint / this.speed);
    if (this.length <= 0) this.fire(ctx);
    return true;
  }

  enter(state, length) {
    this.state = state;
    this.time = 0;
    this.length = length;
  }

  // Срабатывание: заряд тратится сейчас (прерванный замах заряда не стоит)
  fire(ctx) {
    this.charges--;
    if (this.recharge <= 0) this.recharge = this.cooldown * this.cooldownMult();
    this.onFire?.(ctx, this);
    if (this.channel > 0) {
      this.enter("channel", this.channel);
      this.tickIn = 0;
    } else this.startBackswing(ctx);
  }

  startBackswing(ctx) {
    this.enter("backswing", this.backswing / this.speed);
    if (this.length <= 0) this.finish(ctx);
  }

  finish(ctx) {
    this.state = "idle";
    this.time = this.length = 0;
    this.onEnd?.(ctx, this);
  }

  // Прервать: оглушение, отбрасывание, смерть. В хвосте — просто конец (умение уже сработало)
  interrupt(reason = "interrupt", ctx = null) {
    if (this.state === "idle") return false;
    const was = this.state;
    this.state = "idle";
    this.time = this.length = 0;
    this.onInterrupt?.(ctx, this, reason, was);
    return was !== "backswing";
  }

  // Движение / новый приказ в хвосте — отменить хвост (анимация-хвост не держит героя)
  cancelBackswing(ctx = null) {
    if (this.state !== "backswing") return false;
    this.finish(ctx);
    return true;
  }

  update(dt, ctx = null) {
    // заряды копятся по одному (как у рывков в OW / Deadlock)
    if (this.charges < this.maxCharges) {
      this.recharge -= dt;
      while (this.recharge <= 0 && this.charges < this.maxCharges) {
        this.charges++;
        this.recharge += this.charges < this.maxCharges ? this.cooldown * this.cooldownMult() : 0;
      }
      if (this.charges >= this.maxCharges) this.recharge = 0;
    }
    if (this.state === "idle") return;
    this.time += dt;
    if (this.state === "windup" && this.time >= this.length) this.fire(ctx);
    else if (this.state === "channel") {
      this.tickIn -= dt;
      while (this.tickIn <= 0 && this.state === "channel") {
        this.onTick?.(ctx, this);
        this.tickIn += this.tickEvery;
      }
      if (this.time >= this.length && this.state === "channel") this.startBackswing(ctx);
    } else if (this.state === "backswing" && this.time >= this.length) this.finish(ctx);
  }

  // Для интерфейса: сколько осталось до заряда (0…1) и зарядов
  get cooldownLeft() {
    return this.charges > 0 ? 0 : this.recharge;
  }
}
