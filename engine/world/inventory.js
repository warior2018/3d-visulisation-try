// ============================================================
//  Инвентарь: ряд ячеек (слотов). В ячейке — предмет и сколько их: { item: "bone", count: 3 }
//  или null, если пусто.
//
//  Движок не знает, какие предметы бывают в игре — это решает игра (game/items.js).
//  От игры инвентарю нужно одно: сколько штук предмета влезает в одну ячейку (maxStack).
//  accepts(i, item) — необязательно: что можно класть в ячейку i (например, хотбар: по краям — только
//  оружие, в середине — только расходники). add и экран инвентаря это соблюдают.
//  Предмет со своими данными (data — например, неполная обойма: { rounds: 7, label: "7" }) лежит
//  ОДИН в ячейке ({ item, count: 1, data }) и в стопки не складывается; data.label — что написать на ячейке.
// ============================================================

export class Inventory {
  // size — сколько ячеек; maxStack(item) — сколько штук этого предмета в одной ячейке
  constructor(size, maxStack = () => 64, accepts = () => true) {
    this.slots = new Array(size).fill(null);
    this.maxStack = maxStack;
    this.accepts = accepts;
  }

  get size() {
    return this.slots.length;
  }

  // Положить count штук. Сначала докладываем в ячейки, где этот предмет уже есть,
  // потом занимаем пустые. Возвращает, сколько НЕ влезло (0 — влезло всё).
  // stackOnly — только докладывать в начатые стопки, пустые ячейки не занимать
  // (так игра сначала дополняет стопки во всех сумках, а уже потом начинает новые).
  add(item, count = 1, { stackOnly = false, data = null } = {}) {
    // Со своими данными — по одному в пустые ячейки, без стопок
    if (data) {
      for (let i = 0; i < this.slots.length && count > 0 && !stackOnly; i++) {
        if (this.slots[i] || !this.accepts(i, item)) continue;
        this.slots[i] = { item, count: 1, data: { ...data } };
        count--;
      }
      return count;
    }
    const max = this.maxStack(item);
    for (const slot of this.slots) {
      if (count === 0) break;
      if (slot && !slot.data && slot.item === item && slot.count < max) { // (раз лежит — значит, сюда можно)
        const put = Math.min(count, max - slot.count);
        slot.count += put;
        count -= put;
      }
    }
    for (let i = 0; i < this.slots.length && count > 0 && !stackOnly; i++) {
      if (this.slots[i] || !this.accepts(i, item)) continue;
      const put = Math.min(count, max);
      this.slots[i] = { item, count: put };
      count -= put;
    }
    return count;
  }

  // Забрать count штук. Возвращает, сколько удалось забрать. Сначала — обычные стопки, потом — с данными
  remove(item, count = 1) {
    let taken = 0;
    for (const withData of [false, true]) {
      // С конца — чтобы сначала пустели последние ячейки
      for (let i = this.slots.length - 1; i >= 0 && taken < count; i--) {
        const slot = this.slots[i];
        if (!slot || slot.item !== item || !!slot.data !== withData) continue;
        const take = Math.min(count - taken, slot.count);
        slot.count -= take;
        taken += take;
        if (slot.count === 0) this.slots[i] = null;
      }
    }
    return taken;
  }

  // Сколько всего штук предмета во всех ячейках
  count(item) {
    return this.slots.reduce((sum, s) => sum + (s && s.item === item ? s.count : 0), 0);
  }

  isEmpty() {
    return this.slots.every((s) => s === null);
  }

  // Высыпать всё в другой инвентарь (например, добыча с побеждённого).
  // Возвращает список того, что переложили: [{ item, count }]
  moveAllTo(other) {
    const moved = [];
    this.slots.forEach((slot, i) => {
      if (!slot) return;
      const left = other.add(slot.item, slot.count, { data: slot.data });
      if (slot.count - left > 0) moved.push({ item: slot.item, count: slot.count - left, ...(slot.data ? { data: slot.data } : {}) });
      this.slots[i] = left > 0 ? { ...slot, count: left } : null;
    });
    return moved;
  }

  // Для сохранения: [null, { item, count }, ...]
  toJSON() {
    return this.slots.map((s) => (s ? { item: s.item, count: s.count, ...(s.data ? { data: { ...s.data } } : {}) } : null));
  }

  // Из сохранения. Битые ячейки пропускаем, лишние — отбрасываем.
  loadFrom(list) {
    this.slots.fill(null);
    if (!Array.isArray(list)) return;
    list.slice(0, this.slots.length).forEach((s, i) => {
      if (s && typeof s.item === "string" && Number.isInteger(s.count) && s.count > 0) {
        this.slots[i] = s.data && typeof s.data === "object" ? { item: s.item, count: 1, data: { ...s.data } } : { item: s.item, count: s.count };
      }
    });
  }
}
