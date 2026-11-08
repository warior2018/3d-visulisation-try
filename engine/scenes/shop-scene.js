// ============================================================
//  Окно магазина поверх мира (по умолчанию — клавиша B, действие "shop").
//  Карточки позиций: значок, название, описание, цена, остаток и кнопка «КУПИТЬ».
//
//    new ShopScene({ shop, buyer: player, ctx: game, onBuy: (slot) => sound("loot") })
// ============================================================

import { translate } from "../ui/i18n.js";
import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

export class ShopScene extends Scene {
  constructor({ shop, buyer, ctx = null, title = "SHOP", closeActions = ["shop", "pause"], onBuy = () => {} }) {
    super();
    this.transparent = true;
    this.showToasts = false;
    this.shop = shop;
    this.buyer = buyer;
    this.ctx = ctx;
    this.title = title;
    this.closeActions = closeActions;
    this.onBuy = onBuy;
    this.message = null; // { text, ok }
    this.tab = shop.categoriesFor?.(ctx)?.[0]?.id ?? null; // открытый раздел (если у магазина есть разделы)
    this.scroll = 0; // первый показанный ряд карточек (колесо мыши / стрелки справа)
    this.maxScroll = 0;
  }

  get label() {
    return "магазин";
  }

  drawUI(ui) {
    const th = ui.theme;
    const shop = this.shop;
    drawDim(ui, 200);
    const box = drawWindow(ui, { title: this.title, width: 900, height: Math.max(560, Math.min(ui.height - 24, 760)), closeId: "close" });
    ui.text(`YOU HAVE: ${shop.money(this.buyer)} ${shop.currencyName}`, box.cx, box.y, 2, th.accent, "center");

    // Разделы — вкладками сверху (как в окне талантов)
    let top = box.y + 34;
    const cats = shop.categoriesFor(this.ctx); // разделы, открытые сейчас (when)
    if (cats.length && !cats.some((c) => c.id === this.tab)) this.tab = cats[0].id;
    if (cats.length) {
      const tabW = Math.min(150, Math.floor((box.w - (cats.length - 1) * 8) / cats.length));
      cats.forEach((c, i) => {
        ui.button("tab:" + c.id, c.name, box.cx + (i - (cats.length - 1) / 2) * (tabW + 8), box.y + 46, tabW, 34, 2, this.tab === c.id);
      });
      top = box.y + 76;
    }
    // Карточки сеткой: по 3 в ряд; не влезают — листаем рядами (колесо мыши, стрелки справа)
    const slots = shop.visible(this.ctx, this.tab);
    const cw = 256;
    const ch = 150;
    const gap = 14;
    const cols = 3;
    const rows = Math.ceil(slots.length / cols);
    const fit = Math.max(1, Math.floor((box.y + box.h - 36 - top + gap) / (ch + gap))); // сколько рядов влезает
    this.maxScroll = Math.max(0, rows - fit);
    this.scroll = Math.max(0, Math.min(this.scroll, this.maxScroll));
    slots.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols) - this.scroll;
      if (row < 0 || row >= fit) return;
      const inRow = Math.min(cols, slots.length - (row + this.scroll) * cols);
      const x = box.cx - (inRow * cw + (inRow - 1) * gap) / 2 + col * (cw + gap);
      const y = top + row * (ch + gap);
      this.drawCard(ui, s, x, y, cw, ch);
    });
    if (this.maxScroll > 0) {
      const ax = box.x + box.w - 16;
      if (this.scroll > 0) ui.button("scroll:-1", "^", ax, top + 20, 32, 40, 2, false);
      if (this.scroll < this.maxScroll) ui.button("scroll:1", "v", ax, top + fit * (ch + gap) - gap - 20, 32, 40, 2, false);
      ui.text(`${this.scroll + 1}-${this.scroll + fit} / ${rows}`, ax, top + (fit * (ch + gap)) / 2, 1, th.muted, "center");
    }
    if (!slots.length) ui.text("NOTHING FOR SALE YET", box.cx, box.y + 120, 2, th.muted, "center");

    const msg = this.message;
    ui.text(msg ? msg.text : "PICK AN ITEM AND PRESS BUY", box.cx, box.y + box.h - 24, 2, msg ? (msg.ok ? th.accent : th.warn) : th.muted, "center");
  }

  drawCard(ui, s, x, y, w, h) {
    const th = ui.theme;
    const c = this.shop.check(s, this.buyer, this.ctx);
    ui.rect(x, y, w, h, th.button.fill, 235);
    ui.frame(x, y, w, h, c.ok ? th.button.hoverBorder : th.window.border, 2);
    // Значок слева сверху, название и описание справа
    const icon = 56;
    ui.rect(x + 10, y + 10, icon, icon, [14, 16, 22], 255);
    s.drawIcon?.(ui, x + 10, y + 10, icon, this.ctx);
    ui.text(this.shop.nameOf(s), x + 76, y + 14, 2, th.text);
    const desc = s.describe?.(this.ctx) || "";
    // Описание — до 3 строк, переносим по словам; длинное (другой язык) — мелким шрифтом, до 6 строк
    const big = lines(desc, 15);
    if (big.length <= 3) big.forEach((line, i) => ui.text(line, x + 76, y + 36 + i * 18, 2, th.muted));
    else lines(desc, 30).slice(0, 6).forEach((line, i) => ui.text(line, x + 76, y + 34 + i * 9, 1, th.muted));
    // Цена и остаток
    ui.text(`PRICE: ${this.shop.priceOf(s)}`, x + 12, y + 94, 2, th.accent);
    const left = !Number.isFinite(s.left) ? "" : s.left > 0 ? `LEFT: ${s.left}` : "SOLD OUT";
    if (left) ui.text(left, x + w - 12, y + 94, 2, th.muted, "right");
    // Кнопка
    const label = c.ok ? "BUY" : c.reason;
    ui.button("buy:" + s.id, label, x + w / 2, y + h - 22, w - 24, 30, 2, false);
  }

  onButton(id) {
    if (id === "close") return this.engine.pop();
    const [kind, slotId] = id.split(":");
    if (kind === "tab") {
      this.tab = slotId;
      this.scroll = 0;
      this.message = null;
    }
    if (kind === "scroll") this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + Number(slotId)));
    if (kind === "buy") {
      const r = this.shop.buy(slotId, this.buyer, this.ctx);
      this.message = r.ok ? { text: `BOUGHT: ${this.shop.nameOf(r.slot)}`, ok: true } : { text: r.reason, ok: false };
      if (r.ok) this.onBuy(r.slot);
    }
    this.engine.redraw();
  }

  onWheel({ dy }) {
    const next = Math.max(0, Math.min(this.maxScroll, this.scroll + (dy > 0 ? -1 : 1))); // от себя — вверх
    if (next === this.scroll) return false;
    this.scroll = next;
    return true;
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}

// Разбить строку на куски не длиннее n символов (по словам)
function lines(text, n) {
  text = translate(text); // переносим по словам уже переведённое
  const out = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (cur && (cur + " " + word).length > n) {
      out.push(cur);
      cur = word;
    } else cur = cur ? cur + " " + word : word;
  }
  if (cur) out.push(cur);
  return out;
}
