// ============================================================
//  Окно продажи (торговец): список того, что можно продать, цена, кнопка SELL. Что продаётся и почём —
//  решает игра (rows); продажа — её же onSell(key) (вернуть true — продано).
//
//    engine.push(new TradeScene({ title: "WARDEN", money: () => coins, currency: "COINS",
//      rows: () => [{ key, name, count, price, color, drawIcon }], onSell: (key) => true }));
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

const PER_PAGE = 8;

export class TradeScene extends Scene {
  constructor({ title = "TRADE", rows, onSell, money = () => 0, currency = "COINS", hint = "", closeActions = ["pause", "interact"] }) {
    super();
    Object.assign(this, { title, rows, onSell, money, currency, hint, closeActions });
    this.transparent = true;
    this.live = true;
    this.page = 0;
    this.message = null;
  }

  get label() {
    return `торговля «${this.title}»`;
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 200);
    const box = drawWindow(ui, { title: this.title, width: 760, height: 560, closeId: "close" });
    ui.text(`YOU HAVE: ${this.money()} ${this.currency}`, box.cx, box.y, 2, th.accent, "center");
    const rows = this.rows();
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const list = rows.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    const rh = 48;
    list.forEach((r, i) => {
      const y = box.y + 30 + i * (rh + 6);
      ui.rect(box.x, y, box.w, rh, th.button.fill, 230);
      if (r.color) ui.rect(box.x, y, 6, rh, r.color, 255); // полоска цвета редкости
      ui.rect(box.x + 14, y + 4, 40, 40, [14, 16, 22], 255);
      r.drawIcon?.(ui, box.x + 14, y + 4, 40);
      ui.text(r.count > 1 ? `${r.name} X${r.count}` : r.name, box.x + 66, y + 10, 2, r.color || th.text);
      if (r.note) ui.text(r.note, box.x + 66, y + 30, 1, th.muted);
      ui.text(`${r.price}`, box.x + box.w - 170, y + 16, 2, th.accent, "right");
      ui.button("sell:" + r.key, "SELL", box.x + box.w - 70, y + rh / 2, 120, 36, 2, false);
    });
    if (!rows.length) ui.text("NOTHING TO SELL", box.cx, box.y + 140, 2, th.muted, "center");
    if (pages > 1) {
      ui.button("page:-1", "<", box.x + 30, box.y + box.h - 40, 50, 36, 2);
      ui.text(`${this.page + 1}/${pages}`, box.cx, box.y + box.h - 48, 2, th.muted, "center");
      ui.button("page:1", ">", box.x + box.w - 30, box.y + box.h - 40, 50, 36, 2);
    }
    const msg = this.message;
    ui.text(msg ? msg.text : this.hint, box.cx, box.y + box.h - 16, 2, msg?.ok ? th.accent : msg ? th.warn : th.muted, "center");
  }

  onButton(id) {
    if (id === "close") return this.engine.pop();
    const [kind, arg] = id.split(":");
    if (kind === "page") this.page = Math.max(0, this.page + Number(arg));
    if (kind === "sell") {
      const row = this.rows().find((r) => String(r.key) === arg);
      const ok = row && this.onSell(row.key);
      this.message = ok ? { text: `SOLD: ${row.name} +${row.price}`, ok: true } : { text: "CANNOT SELL", ok: false };
    }
    this.engine.redraw();
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}
