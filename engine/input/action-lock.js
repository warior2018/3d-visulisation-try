// ============================================================
//  Блокировка во время действия: пока идёт удар (анимация), камера не крутится и/или герой ходит
//  медленнее. Так тяжёлый удар «держит» героя: нельзя крутануться на 180° посреди взмаха.
//
//    const lock = new ActionLock();
//    lock.lock(0.6, { look: true, moveSpeed: -0.4 }); // 0.6 с: камера стоит, ходьба −40 %
//    // каждый кадр:
//    lock.update(dt);
//    const m = lock.filterMouse(engine.mouse.consume()); // при блокировке — { dx: 0, dy: 0 }
//    player.speedBonuses.lock = lock.moveSpeed;           // 0, когда блокировки нет
//
//  Несколько блокировок сразу (удар во время удара) складываются: время — самое долгое,
//  камера стоит, если её стопорит хоть одна, замедление — самое сильное.
//  hold(seconds) — «ещё не меньше стольких секунд» (держать, пока идёт что-то без известной длины:
//  например, молот в воздухе ждёт приземления).
// ============================================================

export class ActionLock {
  constructor() {
    this.left = 0; //       сколько секунд ещё держит
    this.look = false; //   камера не крутится
    this.moveSpeed = 0; //  прибавка к скорости ходьбы (−0.4 — на 40 % медленнее)
  }

  get active() {
    return this.left > 0;
  }

  lock(seconds, { look = true, moveSpeed = 0 } = {}) {
    if (!(seconds > 0)) return;
    if (!this.active) {
      this.look = false;
      this.moveSpeed = 0;
    }
    this.left = Math.max(this.left, seconds);
    this.look ||= look;
    this.moveSpeed = Math.min(this.moveSpeed, moveSpeed);
  }

  // Продлить текущую блокировку (если она есть) хотя бы на seconds
  hold(seconds) {
    if (this.active) this.left = Math.max(this.left, seconds);
  }

  clear() {
    this.left = 0;
    this.look = false;
    this.moveSpeed = 0;
  }

  update(dt) {
    if (!this.active) return;
    this.left -= dt;
    if (this.left <= 0) this.clear();
  }

  // Движение мыши с учётом блокировки (мышь всё равно надо «съесть», иначе рывок после конца)
  filterMouse(m) {
    return this.active && this.look ? { dx: 0, dy: 0 } : m;
  }
}
