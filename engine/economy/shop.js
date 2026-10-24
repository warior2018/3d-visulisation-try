// ============================================================
//  Магазин — возможность движка. Набор позиций (слотов); платят предметом-валютой
//  из инвентаря покупателя (по умолчанию "coin").
//
//  Позиция (слот):
//    {
//      id: "rifle", name: "СНАЙПЕРКА",
//      price: 60,                 // сколько валюты (или () => число — цена может меняться, например от талантов)
//      stock: 1,                  // сколько штук в продаже (Infinity — без ограничений)
//      when: (ctx) => true,       // ТРИГГЕР: когда позиция появляется в магазине (необязательно)
//      describe: (ctx) => "...",  // строка-описание (необязательно)
//      give: (buyer, ctx) => {},  // что получает покупатель (игра решает: способность, предмет, лечение...)
//      owned: (ctx) => false,     // уже есть — второй раз не продаём (необязательно)
//      canGive: (buyer, ctx) => true | "ПРИЧИНА", // есть ли куда выдать (необязательно)
//      drawIcon: (ui, x, y, size) => {}, // значок (необязательно)
//      category: "melee",         // раздел магазина (необязательно; см. categories)
//    }
//
//  Разделы: new Shop({ categories: [{ id: "melee", name: "БЛИЖНИЙ" }, ...] }) — окно магазина покажет
//  вкладки; позиции без category попадают в последний раздел. У раздела может быть when: (ctx) => true —
//  закрытый раздел не виден вовсе (например, оружие чужого класса), как и его позиции.
//
//    const shop = new Shop({ currency: "coin", slots: [...] });
//    shop.visible(ctx)                 // позиции, которые сейчас видны (сработал триггер)
//    shop.check(slot, buyer, ctx)      // { ok, reason } — можно ли купить
//    shop.buy("rifle", buyer, ctx)     // { ok, reason }
//    shop.toJSON() / shop.loadFrom()   // остатки — в сохранение
// ============================================================

export class Shop {
  constructor({ currency = "coin", currencyName = "COINS", slots = [], categories = [] } = {}) {
    this.currency = currency;
    this.categories = categories; // [{ id, name }] — разделы (вкладки окна магазина)
    this.currencyName = currencyName; // как валюта пишется в окне: «НУЖНО 60 МОНЕТ»
    this.slots = slots.map((s) => ({ stock: Infinity, ...s, left: s.stock ?? Infinity }));
  }

  // Цена позиции сейчас (число или функция)
  priceOf(slot) {
    return typeof slot.price === "function" ? slot.price() : slot.price;
  }

  get(id) {
    return this.slots.find((s) => s.id === id) || null;
  }

  // Позиции, которые сейчас в магазине (без триггера — всегда)
  // Разделы, открытые сейчас
  categoriesFor(ctx) {
    return this.categories.filter((c) => !c.when || c.when(ctx));
  }

  // В каком разделе позиция (без своего — в последнем)
  categoryOf(slot) {
    return this.categories.some((c) => c.id === slot.category) ? slot.category : this.categories.at(-1)?.id;
  }

  visible(ctx, category = null) {
    let all = this.slots.filter((s) => !s.when || s.when(ctx));
    if (!this.categories.length) return all;
    const open = new Set(this.categoriesFor(ctx).map((c) => c.id));
    all = all.filter((s) => open.has(this.categoryOf(s))); // в закрытом разделе — не видна
    return category ? all.filter((s) => this.categoryOf(s) === category) : all;
  }

  money(buyer) {
    return buyer.inventory?.count(this.currency) || 0;
  }

  check(slot, buyer, ctx) {
    if (!slot) return { ok: false, reason: "NO SUCH ITEM" };
    if (slot.when && !slot.when(ctx)) return { ok: false, reason: "NOT FOR SALE YET" };
    if (this.categories.length && !this.categoriesFor(ctx).some((c) => c.id === this.categoryOf(slot))) return { ok: false, reason: "UNAVAILABLE" };
    if (slot.owned?.(ctx)) return { ok: false, reason: "ALREADY OWNED" };
    if (slot.left <= 0) return { ok: false, reason: "SOLD OUT" };
    const price = this.priceOf(slot);
    if (this.money(buyer) < price) return { ok: false, reason: `NEED ${price} ${this.currencyName}` };
    const room = slot.canGive ? slot.canGive(buyer, ctx) : true;
    if (room !== true) return { ok: false, reason: room || "NO ROOM" };
    return { ok: true };
  }

  buy(id, buyer, ctx) {
    const slot = this.get(id);
    const c = this.check(slot, buyer, ctx);
    if (!c.ok) return c;
    buyer.inventory.remove(this.currency, this.priceOf(slot));
    slot.left -= 1;
    slot.give?.(buyer, ctx);
    return { ok: true, slot };
  }

  // Сохранение: сколько чего осталось (бесконечные не пишем)
  toJSON() {
    const left = {};
    for (const s of this.slots) if (Number.isFinite(s.left)) left[s.id] = s.left;
    return { left };
  }

  loadFrom(data) {
    for (const [id, n] of Object.entries(data?.left || {})) {
      const s = this.get(id);
      if (s && Number.isFinite(n) && Number.isFinite(s.stock)) s.left = Math.max(0, Math.min(s.stock, n)); // бесконечным — не верим старым остаткам
    }
  }
}
