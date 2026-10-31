// ============================================================
//  Окно ввода строки: заголовок, поле, OK / ОТМЕНА. Например — адрес хоста для сетевой игры.
//
//    engine.push(new TextInputScene({ title: "JOIN GAME", value: "192.168.1.5", allowed: /[0-9a-z.:-]/i,
//      hint: "HOST ADDRESS", onDone: (text) => {...}, onCancel: () => engine.pop() }));
//
//  Буквы — из события клавиши (e.key); Backspace стирает, Enter — готово, Esc — отмена.
// ============================================================

import sdl from "@kmamal/sdl";
import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

const SC = sdl.keyboard.SCANCODE;

export class TextInputScene extends Scene {
  constructor({ title, value = "", hint = "", allowed = /./, maxLength = 48, onDone = () => {}, onCancel = null }) {
    super();
    this.title = title;
    this.value = String(value);
    this.hint = hint;
    this.allowed = allowed;
    this.maxLength = maxLength;
    this.onDone = onDone;
    this.onCancel = onCancel;
    this.transparent = true;
  }

  get label() {
    return `ввод «${this.title}»`;
  }

  drawUI(ui) {
    drawDim(ui);
    const box = drawWindow(ui, { title: this.title, width: 560, height: 230 });
    if (this.hint) ui.text(this.hint, box.cx, box.y + 6, 2, ui.theme.muted, "center");
    // поле
    const fx = box.x + 10, fy = box.y + 34, fw = box.w - 20, fh = 56;
    ui.rect(fx, fy, fw, fh, [0, 0, 0], 160);
    ui.text(this.value.toUpperCase() + "_", fx + 14, fy + 16, 3, ui.theme.text);
    const bw = (box.w - 30) / 2;
    ui.button("ok", "OK", box.x + 10 + bw / 2, box.y + 130, bw, 50, 3);
    ui.button("cancel", "CANCEL", box.x + 20 + bw * 1.5, box.y + 130, bw, 50, 3);
  }

  onKey(e) {
    if (e.scancode === SC.BACKSPACE) this.value = this.value.slice(0, -1);
    else if (e.scancode === SC.RETURN || e.scancode === SC.KP_ENTER) return this.onDone(this.value.trim());
    else if (e.scancode === SC.ESCAPE) return this.cancel();
    else if (typeof e.key === "string" && e.key.length === 1 && this.allowed.test(e.key) && this.value.length < this.maxLength) this.value += e.key;
    else return;
    this.engine.redraw();
  }

  cancel() {
    if (this.onCancel) this.onCancel();
    else this.engine.pop();
  }

  onButton(id) {
    if (id === "ok") this.onDone(this.value.trim());
    if (id === "cancel") this.cancel();
  }
}
