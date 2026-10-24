// ============================================================
//  Отложенные удары — возможность движка: удар «с неба» в точку через delay секунд
//  (метеор, солнечный удар, артиллерия). Пока ждём — onWarn(s) каждый кадр (игра рисует круг-предупреждение,
//  s.progress — 0…1), время вышло — onStrike(s) (игра наносит урон: например, MagicAttack.burst).
//
//    const strikes = new DelayedStrikes();
//    strikes.add({ point, delay: 0.9, radius: 3, data: { attack }, onWarn, onStrike });
//    strikes.update(dt);
// ============================================================

export class DelayedStrikes {
  constructor() {
    this.list = [];
  }

  get active() {
    return this.list.length > 0;
  }

  add({ point, delay = 1, radius = 1, data = null, onWarn = () => {}, onStrike = () => {} }) {
    const s = { point: { x: point.x, y: point.y, z: point.z }, delay, left: delay, radius, data, onWarn, onStrike };
    this.list.push(s);
    return s;
  }

  update(dt) {
    for (const s of [...this.list]) {
      s.left -= dt;
      s.progress = Math.min(1, 1 - s.left / s.delay);
      if (s.left > 0) {
        s.onWarn(s);
        continue;
      }
      this.list.splice(this.list.indexOf(s), 1);
      s.onStrike(s);
    }
  }

  clear() {
    this.list = [];
  }
}
