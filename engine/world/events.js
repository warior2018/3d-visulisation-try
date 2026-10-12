// ============================================================
//  Случайное событие мира: раз в every секунд бросаем кубик с шансом chance —
//  повезло (или не повезло) — событие идёт duration секунд. Что оно делает — решает игра.
//  Возможность движка: нашествие, буря, ярмарка, ночь...
//
//    const invasion = new RandomEvent({ chance: 1 / 360, every: 1, duration: 60,
//      onStart: () => toast("НАШЕСТВИЕ!"), onEnd: () => toast("ОТБИЛИСЬ") });
//    invasion.update(dt);          // каждый кадр
//    invasion.active, invasion.timeLeft
//    invasion.start() / stop()     // вручную (для проверки)
//
//  Шанс 1/360 раз в секунду — в среднем раз в 6 минут (но может и дважды подряд, и долго нет).
//  cooldown — сколько секунд после конца событие не может начаться снова.
// ============================================================

export class RandomEvent {
  constructor({ id = "event", chance, every = 1, duration = 60, cooldown = 0, onStart = () => {}, onEnd = () => {}, random = Math.random }) {
    this.id = id;
    this.chance = chance;
    this.every = every;
    this.duration = duration;
    this.cooldown = cooldown;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.random = random;
    this.active = false;
    this.timeLeft = 0; //  сколько осталось (пока идёт)
    this.timer = 0; //     до следующего броска
    this.rest = 0; //      сколько ещё ждать после конца (cooldown)
    this.count = 0; //     сколько раз уже было
  }

  update(dt) {
    if (this.active) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.stop();
      return;
    }
    if (this.rest > 0) {
      this.rest -= dt;
      return;
    }
    this.timer += dt;
    while (this.timer >= this.every && !this.active) {
      this.timer -= this.every;
      if (this.random() < this.chance) this.start();
    }
  }

  start(duration = this.duration) {
    if (this.active) return;
    this.active = true;
    this.timeLeft = duration;
    this.count++;
    this.onStart(this);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.timeLeft = 0;
    this.rest = this.cooldown;
    this.onEnd(this);
  }
}
