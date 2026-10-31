// ============================================================
//  Выносливость — возможность движка. Запас (max), тратится на бег (drain в секунду, пока бежишь) и на
//  действия (spend: удар оружием ближнего боя...), восстанавливается сам (regen в секунду) — но только через
//  delay секунд после последней траты. Кончилась — «выдохся»: бегать нельзя, пока не наберётся recover.
//
//    const st = new Stamina({ max: 100, drain: 11, regen: 25, delay: 0.8, recover: 20 });
//    controller.canRun = () => st.canRun;      // бег — пока есть выносливость (CharacterController)
//    st.update(dt, { running });               // каждый кадр: бежим — тратится, нет — восстанавливается
//    if (!st.spend(9)) return;                 // удар стоит 9: не хватает — удара нет
//
//  value — сколько сейчас, ratio — доля (0…1), exhausted — выдохся (ждём recover)
// ============================================================

export class Stamina {
  constructor({ max = 100, drain = 10, regen = 20, delay = 0.8, recover = 20 } = {}) {
    this.max = max;
    this.value = max;
    this.drain = drain; //     в секунду бега
    this.regen = regen; //     в секунду отдыха
    this.delay = delay; //     секунд после траты до начала восстановления
    this.recover = recover; // выдохся — бег снова можно, когда наберётся столько
    this.rest = 0; //          сколько секунд уже не тратили
    this.exhausted = false;
  }

  get ratio() {
    return this.value / this.max;
  }

  get canRun() {
    return !this.exhausted && this.value > 0;
  }

  // Потратить amount разом. Не хватает — ничего не тратим и вернём false
  spend(amount) {
    if (amount <= 0) return true;
    if (this.value < amount) return false;
    this.take(amount);
    return true;
  }

  // Потратить сколько есть (не больше amount) — для трат «в секунду»
  take(amount) {
    this.value = Math.max(0, this.value - amount);
    this.rest = 0;
    if (this.value <= 0) this.exhausted = true;
  }

  update(dt, { running = false } = {}) {
    if (running) return this.take(this.drain * dt);
    this.rest += dt;
    if (this.rest >= this.delay) this.value = Math.min(this.max, this.value + this.regen * dt);
    if (this.exhausted && this.value >= this.recover) this.exhausted = false;
  }

  fill() {
    this.value = this.max;
    this.exhausted = false;
  }
}
