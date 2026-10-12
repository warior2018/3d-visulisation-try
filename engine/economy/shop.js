// ============================================================
//  Магазин — возможность движка. Набор позиций (слотов); платят предметом-валютой
//  из инвентаря покупателя (по умолчанию "coin").
//
//  Позиция (слот):
//    {
//      id: "rifle", name: "СНАЙПЕРКА",
//      price: 60,                 // сколько валюты
//      stock: 1,                  // сколько штук в продаже (Infinity — без ограничений)
//      when: (ctx) => true,       // ТРИГГЕР: когда позиция появляется в магазине (необязательно)
//      describe: (ctx) => "...",  // строка-описание (необязательно)
//      give: (buyer, ctx) => {},  // что получает покупатель (игра решает: способность, предмет, лечение...)
//      owned: (ctx) => false,     // уже есть — второй раз не продаём (необязательно)
//      canGive: (buyer, ctx) => true | "ПРИЧИНА", // есть ли куда выдать (необязательно)
//      drawIcon: (ui, x, y, size) => {}, // значок (необязательно)
//    }
//
//    const shop = new Shop({ currency: "coin", slots: [...] });
//    shop.visible(ctx)                 // позиции, которые сейчас видны (сработал триггер)
//    shop.check(slot, buyer, ctx)      // { ok, reason } — можно ли купить
//    shop.buy("rifle", buyer, ctx)     // { ok, reason }
//    shop.toJSON() / shop.loadFrom()   // остатки — в сохранение
// ============================================================

export class Shop {
  constructor({ currency = "coin", currencyName = "МОНЕТ", slots = [] } = {}) {
    this.currency = currency;
    this.currencyName = currencyName; // как валюта пишется в окне: «НУЖНО 60 МОНЕТ»
    this.slots = slots.map((s) => ({ stock: Infinity, ...s, left: s.stock ?? Infinity }));
  }

  get(id) {
    return this.slots.find((s) => s.id === id) || null;
  }

  // Позиции, которые сейчас в магазине (без триггера — всегда)
  visible(ctx) {
    return this.slots.filter((s) => !s.when || s.when(ctx));
  }

  money(buyer) {
    return buyer.inventory?.count(this.currency) || 0;
  }

  check(slot, buyer, ctx) {
    if (!slot) return { ok: false, reason: "НЕТ ТАКОГО ТОВАРА" };
    if (slot.when && !slot.when(ctx)) return { ok: false, reason: "ПОКА НЕ ПРОДАЁТСЯ" };
    if (slot.owned?.(ctx)) return { ok: false, reason: "УЖЕ ЕСТЬ" };
    if (slot.left <= 0) return { ok: false, reason: "РАСПРОДАНО" };
    if (this.money(buyer) < slot.price) return { ok: false, reason: `НУЖНО ${slot.price} ${this.currencyName}` };
    const room = slot.canGive ? slot.canGive(buyer, ctx) : true;
    if (room !== true) return { ok: false, reason: room || "НЕКУДА ПОЛОЖИТЬ" };
    return { ok: true };
  }

  buy(id, buyer, ctx) {
    const slot = this.get(id);
    const c = this.check(slot, buyer, ctx);
    if (!c.ok) return c;
    buyer.inventory.remove(this.currency, slot.price);
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
