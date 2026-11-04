// ============================================================
//  Окно итогов (конец забега, гибель, победа): заголовок, строки «название — значение» в две колонки,
//  отметка «НОВЫЙ РЕКОРД» у строк с best: true, ниже — подпись и кнопки.
//
//    engine.push(new SummaryScene({
//      title: "YOU DIED", subtitle: "KILLED BY SKELETON",
//      rows: [{ label: "LEVEL", value: "12", best: true }, ...],
//      records: [{ label: "BEST LEVEL", value: "14" }, ...], // справа: рекорды
//      footer: "A NEW RUN STARTS", buttons: [{ id: "menu", label: "MAIN MENU" }],
//      lock: 1.5, onButton: (id) => ...,
//    }));
//  lock — сколько секунд кнопки не нажимаются (в пылу боя не прокликать окно, не заметив)
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

const GOLD = [240, 196, 80];

export class SummaryScene extends Scene {
  constructor({ title = "RESULTS", subtitle = "", titleColor = [230, 80, 70], rows = [], records = [], recordsTitle = "RECORDS", footer = "", buttons = [{ id: "ok", label: "OK" }], lock = 0, onButton = () => {} }) {
    super();
    this.transparent = true;
    Object.assign(this, { title, subtitle, titleColor, rows, records, recordsTitle, footer, buttons, lock });
    this.handler = onButton;
    this.realtime = lock > 0; // отсчёт блокировки — каждый кадр
  }

  get label() {
    return `итоги «${this.title}»`;
  }

  update(dt) {
    if (this.lock <= 0) return;
    this.lock -= dt;
    if (this.lock <= 0) this.realtime = false;
    this.engine.redraw();
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 190);
    const two = this.records.length > 0;
    const box = drawWindow(ui, { width: two ? 960 : 620, height: 150 + Math.max(this.rows.length, this.records.length + 1) * 34 + (this.footer ? 30 : 0) + 70 });
    ui.text(this.title, box.cx, box.y + 6, 5, this.titleColor, "center");
    if (this.subtitle) ui.text(this.subtitle, box.cx, box.y + 54, 2, th.muted, "center");
    const top = box.y + 92;
    const colW = two ? (box.w - 40) / 2 : box.w;
    const row = (x, y, w, r, color = th.text) => {
      ui.text(r.label, x, y, 2, th.muted);
      ui.text(String(r.value), x + w, y, 3, r.best ? GOLD : color, "right");
      if (r.best) ui.text("NEW BEST", x + w, y + 22, 1, GOLD, "right");
    };
    this.rows.forEach((r, i) => row(box.x, top + i * 34, colW, r));
    if (two) {
      const x = box.x + colW + 40;
      ui.rect(x - 20, top - 6, 2, Math.max(this.rows.length, this.records.length + 1) * 34, th.window.border, 160);
      ui.text(this.recordsTitle, x, top, 2, GOLD);
      this.records.forEach((r, i) => row(x, top + (i + 1) * 34, colW, r, th.muted));
    }
    const by = box.y + box.h - 28;
    if (this.footer) ui.text(this.footer, box.cx, by - 52, 2, th.muted, "center");
    const n = this.buttons.length, bw = Math.min(300, (box.w - (n - 1) * 16) / n);
    this.buttons.forEach((b, i) => {
      const label = this.lock > 0 ? `${b.label} (${Math.ceil(this.lock)})` : b.label;
      ui.button(b.id, label, box.cx + (i - (n - 1) / 2) * (bw + 16), by, bw, 46, 3, i === 0);
    });
  }

  onButton(id) {
    if (this.lock > 0) return;
    this.handler(id);
  }
}
