// ============================================================
//  Опыт и уровни. Сколько опыта нужно до следующего уровня, задаёт кривая
//  curve(level) — игра может поставить свою. За каждый уровень — очки
//  (pointsPerLevel), которые игра тратит, например, на таланты.
// ============================================================

export class Experience {
  constructor({ curve = (level) => 50 + level * 50, pointsPerLevel = 1, maxLevel = 50 } = {}) {
    this.curve = curve; //  опыта нужно с уровня level до level + 1
    this.pointsPerLevel = pointsPerLevel;
    this.maxLevel = maxLevel;
    this.level = 1;
    this.xp = 0; //         опыта набрано на текущем уровне
  }

  get toNext() {
    return this.curve(this.level);
  }

  // 0..1 — сколько пройдено до следующего уровня (для полоски или кольца)
  get progress() {
    return this.level >= this.maxLevel ? 1 : this.xp / this.toNext;
  }

  // Добавить опыт. Вернёт, сколько уровней набрали (обычно 0 или 1, но может и больше)
  add(amount) {
    let gained = 0;
    this.xp += amount;
    while (this.level < this.maxLevel && this.xp >= this.toNext) {
      this.xp -= this.toNext;
      this.level++;
      gained++;
    }
    if (this.level >= this.maxLevel) this.xp = 0;
    return gained;
  }

  toJSON() {
    return { level: this.level, xp: this.xp };
  }

  loadFrom(data) {
    if (!data) return;
    if (Number.isInteger(data.level) && data.level >= 1) this.level = Math.min(data.level, this.maxLevel);
    if (Number.isFinite(data.xp) && data.xp >= 0) this.xp = data.xp;
  }
}
