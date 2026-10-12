// ============================================================
//  Приручение — возможность движка. Существу можно дать Taming:
//  корми нужной едой (item из инвентаря кормящего) need раз — и оно твоё (owner).
//
//    boar.taming = new Taming({ food: "bone", need: 5 });
//    const r = boar.taming.feed(player);  // { ok, fed, need, tamed, reason }
// ============================================================

export class Taming {
  constructor({ food, need = 5, fed = 0 } = {}) {
    this.food = food; //   чем кормить (id предмета)
    this.need = need; //   сколько раз
    this.fed = fed; //     сколько уже съело
    this.owner = null; //  кто приручил (сущность)
    this.ownerType = null; // тип хозяина — для сохранения
    this.refused = false; // больше не приручить (например, его ранили)
  }

  // Зверь обиделся — приручить больше нельзя
  refuse() {
    if (!this.tamed) this.refused = true;
  }

  get tamed() {
    return this.fed >= this.need;
  }

  // Покормить один раз. Еду берём из from (по умолчанию — инвентарь кормящего;
  // игра может дать свой источник: например, только последнюю ячейку хотбара, как в ARK)
  feed(feeder, from = feeder.inventory) {
    if (this.tamed) return { ok: false, reason: "tamed", fed: this.fed, need: this.need, tamed: true };
    if (this.refused) return { ok: false, reason: "refused", fed: this.fed, need: this.need, tamed: false };
    if (!from || from.count(this.food) < 1) return { ok: false, reason: "no-food", fed: this.fed, need: this.need, tamed: false };
    from.remove(this.food, 1);
    this.fed++;
    if (this.tamed) {
      this.owner = feeder;
      this.ownerType = feeder.type;
    }
    return { ok: true, fed: this.fed, need: this.need, tamed: this.tamed };
  }

  toJSON() {
    return { fed: this.fed, ownerType: this.ownerType, refused: this.refused };
  }

  loadFrom(data) {
    if (!data) return;
    this.fed = Math.max(0, Math.min(this.need, data.fed | 0));
    this.ownerType = data.ownerType || null;
    if (this.ownerType) this.fed = this.need; // уже приручён (даже если с тех пор кормить нужно больше)
    this.refused = !!data.refused;
  }
}
