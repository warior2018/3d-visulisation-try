// ============================================================
//  Строка ввода поверх живого мира (чат, как в Dota 2 / Minecraft): внизу экрана, мир не останавливается.
//  Enter — отправить (onDone(text)), Esc — отмена, ↑/↓ — прошлые строки (history — общий массив).
//
//    engine.push(new LineInputScene({ prompt: "SAY:", history, onDone: (text) => chat.send(text) }));
// ============================================================

import sdl from "@kmamal/sdl";
import { Scene } from "../core/scene.js";

const SC = sdl.keyboard.SCANCODE;

export class LineInputScene extends Scene {
  constructor({ prompt = "", history = [], maxLength = 120, onDone = () => {}, y = 0.72 }) {
    super();
    this.prompt = prompt;
    this.history = history;
    this.maxLength = maxLength;
    this.onDone = onDone;
    this.y = y; // где строка: доля высоты экрана
    this.transparent = true;
    this.live = true;
    this.text = "";
    this.back = 0;
    this.opened = performance.now();
  }

  get label() {
    return "строка ввода";
  }

  drawUI(ui) {
    const y = Math.round(ui.height * this.y);
    const w = Math.min(ui.width - 40, 760);
    ui.rect(20, y, w, 34, [0, 0, 0], 170);
    ui.text(`${this.prompt} ${this.text}_`, 30, y + 10, 2, [255, 240, 200]);
  }

  onKey(e) {
    // нажатие, которым окно открыли (Enter), сюда же приходит — его пропускаем
    if (performance.now() - this.opened < 60) return;
    switch (e.scancode) {
      case SC.ESCAPE:
        return this.engine.pop();
      case SC.RETURN:
      case SC.KP_ENTER: {
        const t = this.text.trim();
        this.engine.pop();
        if (t) {
          if (this.history.at(-1) !== t) this.history.push(t);
          if (this.history.length > 50) this.history.shift();
          this.onDone(t);
        }
        return;
      }
      case SC.BACKSPACE:
        this.text = this.text.slice(0, -1);
        break;
      case SC.UP:
      case SC.DOWN: {
        const n = this.history.length;
        this.back = Math.max(0, Math.min(n, this.back + (e.scancode === SC.UP ? 1 : -1)));
        this.text = this.back ? this.history[n - this.back] : "";
        break;
      }
      default:
        if (typeof e.key === "string" && e.key.length === 1 && this.text.length < this.maxLength) this.text += e.key;
        else return;
    }
    this.engine.redraw();
  }
}
