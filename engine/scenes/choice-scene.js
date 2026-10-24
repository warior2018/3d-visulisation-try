// ============================================================
//  Выбор из нескольких вариантов — карточками в ряд (класс героя, награда, путь...).
//  Карточка: значок, название, описание (по словам на строки), кнопка «ВЫБРАТЬ».
//  required: true — закрыть, не выбрав, нельзя (Esc не работает); lock — первые секунды кнопки не жмутся
//  (чтобы не выбрать случайно кликом из боя).
//
//    engine.push(new ChoiceScene({
//      title: "ВЫБЕРИ КЛАСС", subtitle: "...",
//      options: [{ id: "melee", name: "МЕЧНИК", describe: "БЛИЖНИЙ БОЙ...", drawIcon: (ui, x, y, s) => {} }],
//      onPick: (id) => {...}, required: true, lock: 1,
//    }));
// ============================================================

import { measureText } from "../ui/font.js";
import { translate } from "../ui/i18n.js";
import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

export class ChoiceScene extends Scene {
  constructor({ title, subtitle = "", options, onPick = () => {}, required = false, lock = 0, closeActions = ["pause"] }) {
    super();
    this.transparent = true;
    this.showToasts = false;
    this.title = title;
    this.subtitle = subtitle;
    this.options = options;
    this.onPick = onPick;
    this.required = required;
    this.closeActions = closeActions;
    this.lockUntil = performance.now() + lock * 1000;
    // Меню перерисовывается только при изменениях — когда блокировка кончится, «разбудим» сами
    if (lock > 0) setTimeout(() => this.engine?.redraw(), lock * 1000 + 30);
  }

  get label() {
    return `выбор «${this.title}»`;
  }

  get locked() {
    return performance.now() < this.lockUntil;
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 210);
    const n = this.options.length;
    const gap = 14;
    const cw = Math.min(200, Math.floor((ui.width - 100 - (n - 1) * gap) / n)); // много карточек — уже
    const ch = 300;
    const width = Math.min(ui.width - 40, n * cw + (n - 1) * gap + 60);
    const box = drawWindow(ui, { title: this.title, width, height: ch + 120, closeId: this.required ? null : "close" });
    if (this.subtitle) ui.text(this.subtitle, box.cx, box.y, 2, th.accent, "center");
    this.options.forEach((o, i) => {
      const x = box.cx - (n * cw + (n - 1) * gap) / 2 + i * (cw + gap);
      const y = box.y + 30;
      ui.rect(x, y, cw, ch, th.button.fill, 235);
      ui.frame(x, y, cw, ch, th.window.border, 2);
      const icon = 64;
      ui.rect(x + (cw - icon) / 2, y + 12, icon, icon, [14, 16, 22], 255);
      o.drawIcon?.(ui, x + (cw - icon) / 2, y + 12, icon);
      ui.text(o.name, x + cw / 2, y + 88, measureText(o.name, 3) <= cw - 8 ? 3 : 2, th.text, "center");
      // Описание — до 8 строк; не влезло (другой язык) — мелким шрифтом
      const big = lines(o.describe || "", 15);
      if (big.length <= 8) big.forEach((line, k) => ui.text(line, x + cw / 2, y + 122 + k * 18, 2, th.muted, "center"));
      else lines(o.describe || "", 30).slice(0, 14).forEach((line, k) => ui.text(line, x + cw / 2, y + 122 + k * 10, 1, th.muted, "center"));
      ui.button("pick:" + o.id, this.locked ? "..." : "CHOOSE", x + cw / 2, y + ch - 26, cw - 20, 36, 2, false);
    });
  }

  onButton(id) {
    if (id === "close" && !this.required) return this.engine.pop();
    if (this.locked) return;
    const [kind, value] = id.split(":");
    if (kind !== "pick") return;
    this.engine.pop();
    this.onPick(value);
  }

  onPress(actions) {
    if (!this.required && this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
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
