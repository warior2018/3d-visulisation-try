// ============================================================
//  Всплывающие цифры урона — возможность движка.
//  Цифра появляется у цели, взлетает вверх, чуть разлетается в сторону и гаснет.
//  Новый удар по той же цели — старые её цифры гаснут быстрее (не копятся кучей).
//
//    const numbers = new DamageNumbers();
//    numbers.add(target, { x, y, z }, 26, { color: [255, 70, 60], big: true }); // хедшот
//    numbers.update(dt);           // каждый кадр
//    numbers.draw(ui, camera);     // в интерфейсе (camera — та, через которую смотрим)
// ============================================================

export class DamageNumbers {
  constructor({ life = 1.0, rise = 1.4, shortenTo = 0.22, max = 60, random = Math.random } = {}) {
    this.life = life; //           сколько секунд живёт цифра
    this.rise = rise; //           как быстро взлетает (м/с, к концу замедляется)
    this.shortenTo = shortenTo; // новый удар по цели — старые её цифры доживают столько
    this.max = max;
    this.random = random;
    this.list = [];
  }

  get active() {
    return this.list.length > 0;
  }

  // target — по кому (чтобы ускорять гашение старых цифр); at — точка мира; amount — сколько урона
  add(target, at, amount, { color = [255, 235, 140], big = false } = {}) {
    for (const n of this.list) if (n.target === target) n.life = Math.min(n.life, n.age + this.shortenTo);
    const a = this.random() * Math.PI * 2;
    const spread = 0.3; // каждая цифра — чуть в своём месте, чтобы не слипались
    this.list.push({
      target,
      x: at.x + Math.cos(a) * spread, y: at.y, z: at.z + Math.sin(a) * spread,
      vx: Math.cos(a) * 0.35, vz: Math.sin(a) * 0.35, // разлетаются чуть в стороны
      age: 0, life: this.life,
      text: String(Math.round(amount)),
      color, scale: big ? 4 : 3,
    });
    if (this.list.length > this.max) this.list.shift();
  }

  update(dt) {
    for (const n of this.list) {
      n.age += dt;
      const slow = Math.max(0, 1 - n.age / n.life);
      n.y += this.rise * dt * slow;
      n.x += n.vx * dt * slow;
      n.z += n.vz * dt * slow;
    }
    this.list = this.list.filter((n) => n.age < n.life);
  }

  draw(ui, camera) {
    for (const n of this.list) {
      const s = camera.toScreen(n, ui.width, ui.height);
      if (!s) continue;
      const t = n.age / n.life;
      const alpha = Math.round(255 * Math.min(1, (1 - t) * 3)); // последнюю треть — гаснет
      const pop = n.age < 0.08 ? 1 + (0.08 - n.age) * 6 : 1; //    в первый миг — чуть крупнее
      const scale = Math.max(2, Math.round(n.scale * pop));
      ui.text(n.text, s.x + 2, s.y + 2, scale, [0, 0, 0], "center", Math.round(alpha * 0.7)); // тень
      ui.text(n.text, s.x, s.y, scale, n.color, "center", alpha);
    }
  }
}
