// ============================================================
//  Меню — заголовок и столбик кнопок. Подходит для главного меню и паузы.
//
//  new MenuScene({
//    title: "ПАУЗА",
//    items: [{ id: "resume", label: "ПРОДОЛЖИТЬ" }, ...],
//    overlay: true,               // поверх мира (затемнение) или на своём фоне
//    onSelect: (id) => { ... },   // нажали кнопку
//    onBack: () => { ... },       // нажали «пауза» (Esc)
//    enterSelects: "play",        // Enter нажимает эту кнопку
//    corner: () => ({ id, label }) | null, // кнопка справа снизу (например, «ОБНОВИТЬ»)
//    footer: () => "ВЕРСИЯ 0.15.0",        // строка слева снизу
//    lock: 1.5,                   // первые секунды кнопки не нажимаются (чтобы не прокликать меню случайно)
//  })
// ============================================================

import sdl from "@kmamal/sdl";
import { Scene } from "../core/scene.js";
import { drawBackground, drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

const SC = sdl.keyboard.SCANCODE;

export class MenuScene extends Scene {
  constructor({ title, items, overlay = false, onSelect = () => {}, onBack = null, enterSelects = null, corner = null, footer = null, lock = 0 }) {
    super();
    this.lockUntil = performance.now() + lock * 1000;
    this.title = title;
    this.items = items;
    this.overlay = overlay;
    this.transparent = overlay;
    this.onSelect = onSelect;
    this.onBack = onBack;
    this.enterSelects = enterSelects;
    this.corner = corner;
    this.footer = footer;
  }

  get label() {
    return `меню «${this.title}»`;
  }

  // Меню — это окно (engine/ui/window.js) с кнопками столбиком.
  // Главное меню: на своём фоне, крупное название над окном. Поверх мира: затемнение и окно с заголовком.
  drawUI(ui) {
    const big = !this.overlay;
    const h = ui.height;
    const [bh, step, scale] = big ? [56, 68, 4] : [50, 60, 3];
    const pad = ui.theme.window.padding;
    const count = (typeof this.items === "function" ? this.items() : this.items).length;
    const height = (big ? 0 : ui.theme.window.titleHeight) + pad * 2 + count * step - (step - bh);
    if (big) {
      drawBackground(ui);
      ui.text(this.title, ui.width / 2, h * 0.14, 12, ui.theme.text, "center");
    } else {
      drawDim(ui);
    }
    const box = drawWindow(ui, { title: big ? null : this.title, width: big ? 340 : 400, height, y: big ? Math.round(h * 0.42) : undefined });
    const items = typeof this.items === "function" ? this.items() : this.items;
    items.forEach((item, i) => ui.button(item.id, item.label, box.cx, box.y + bh / 2 + i * step, box.w, bh, scale));
    // Справа снизу — особая кнопка (обновление), слева снизу — строка (версия)
    const c = this.corner?.();
    if (c) {
      const w = Math.max(260, c.label.length * 13 + 40);
      ui.button(c.id, c.label, ui.width - 24 - w / 2, h - 24 - 26, w, 52, 2, true);
    }
    const f = this.footer?.();
    if (f) ui.text(f, 24, h - 36, 2, ui.theme.muted);
  }

  get locked() {
    return performance.now() < this.lockUntil;
  }

  onButton(id) {
    if (this.locked) return;
    this.onSelect(id);
  }

  onPress(actions, event) {
    if (this.locked) return;
    if (actions.includes("pause") && this.onBack) return this.onBack();
    if (event.scancode === SC.RETURN && this.enterSelects) this.onSelect(this.enterSelects);
  }
}
