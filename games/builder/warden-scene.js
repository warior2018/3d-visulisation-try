// ============================================================
//  Окно стража (F): большое, в два столбца — слева ПРОДАЖА (что из сумки он купит), справа ЗАДАНИЯ
//  (текущее / предложение, кнопки ВЗЯТЬ / СДАТЬ / ОТКАЗАТЬСЯ). Что продаётся и что за задание — решает
//  игра (scene/quests.js → openWarden): rows / onSell — как у TradeScene, quest() — строки и кнопки.
// ============================================================

import { Scene, drawWindow, widgets } from "../../engine/index.js";

const { drawDim } = widgets;

const PER_PAGE = 8;

export class WardenScene extends Scene {
  // rows() → [{ key, name, count, price, note, color, drawIcon }]; onSell(key) → true — продано
  // quest() → { lines: [строки], note, buttons: [{ id, label, main }] }; onQuest(id) — нажали кнопку задания
  constructor({ title = "WARDEN", rows, onSell, money = () => 0, currency = "COINS", quest, onQuest, closeActions = ["pause", "interact"] }) {
    super();
    Object.assign(this, { title, rows, onSell, money, currency, quest, onQuest, closeActions });
    this.transparent = true;
    this.live = true;
    this.page = 0;
    this.message = null;
  }

  get label() {
    return `окно стража «${this.title}»`;
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 200);
    const W = Math.min(1180, ui.width - 40), H = Math.min(640, ui.height - 40);
    const box = drawWindow(ui, { title: this.title, width: W, height: H, closeId: "close" });
    const gap = 24, colW = (box.w - gap) / 2;
    const L = { x: box.x, w: colW }, R = { x: box.x + colW + gap, w: colW };
    // разделитель
    ui.rect(box.x + colW + gap / 2 - 1, box.y, 2, box.h - 30, th.muted, 80);

    // ---------- ПРОДАЖА ----------
    ui.text("SELL", L.x + L.w / 2, box.y, 3, th.text, "center");
    ui.text(`YOU HAVE: ${this.money()} ${this.currency}`, L.x + L.w / 2, box.y + 30, 2, th.accent, "center");
    const rows = this.rows();
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const rh = 44;
    rows.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((r, i) => {
      const y = box.y + 58 + i * (rh + 5);
      ui.rect(L.x, y, L.w, rh, th.button.fill, 230);
      if (r.color) ui.rect(L.x, y, 6, rh, r.color, 255);
      ui.rect(L.x + 12, y + 4, 36, 36, [14, 16, 22], 255);
      r.drawIcon?.(ui, L.x + 12, y + 4, 36);
      ui.text(r.count > 1 ? `${r.name} X${r.count}` : r.name, L.x + 58, y + 8, 2, r.color || th.text);
      if (r.note) ui.text(r.note, L.x + 58, y + 28, 1, th.muted);
      ui.text(`${r.price}`, L.x + L.w - 120, y + 14, 2, th.accent, "right");
      ui.button("sell:" + r.key, "SELL", L.x + L.w - 52, y + rh / 2, 92, 32, 2, false);
    });
    if (!rows.length) ui.text("NOTHING TO SELL", L.x + L.w / 2, box.y + 160, 2, th.muted, "center");
    if (pages > 1) {
      const py = box.y + box.h - 74;
      ui.button("page:-1", "<", L.x + 30, py, 50, 32, 2);
      ui.text(`${this.page + 1}/${pages}`, L.x + L.w / 2, py - 8, 2, th.muted, "center");
      ui.button("page:1", ">", L.x + L.w - 30, py, 50, 32, 2);
    }

    // ---------- ЗАДАНИЯ ----------
    const q = this.quest();
    ui.text("QUESTS", R.x + R.w / 2, box.y, 3, th.text, "center");
    ui.rect(R.x, box.y + 50, R.w, 230, th.button.fill, 200);
    (q.lines || []).forEach((line, i) => ui.text(line, R.x + 18, box.y + 66 + i * 30, 2, i === 0 ? th.accent : th.text));
    (q.buttons || []).forEach((b, i) => ui.button("quest:" + b.id, b.label, R.x + R.w / 2, box.y + 320 + i * 50, Math.min(320, R.w - 40), 40, 2, !!b.main));
    if (q.note) ui.text(q.note, R.x + R.w / 2, box.y + box.h - 74, 2, th.muted, "center");

    const msg = this.message;
    ui.text(msg ? msg.text : "THE WARDEN BUYS WEAPONS, ARMOR, BONES AND SKULLS FROM YOUR BAG", box.cx, box.y + box.h - 16, 2, msg?.ok ? th.accent : msg ? th.warn : th.muted, "center");
  }

  onButton(id) {
    if (id === "close") return this.engine.pop();
    const i = id.indexOf(":");
    const kind = id.slice(0, i), arg = id.slice(i + 1);
    if (kind === "page") this.page = Math.max(0, this.page + Number(arg));
    if (kind === "sell") {
      const row = this.rows().find((r) => String(r.key) === arg);
      const ok = row && this.onSell(row.key);
      this.message = ok ? { text: `SOLD: ${row.name} +${row.price}`, ok: true } : { text: "CANNOT SELL", ok: false };
    }
    if (kind === "quest") {
      this.onQuest(arg);
      this.message = null;
    }
    this.engine.redraw();
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}
