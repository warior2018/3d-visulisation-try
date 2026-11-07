// ============================================================
//  Окно консоли разработчика (engine/core/console.js): верхняя половина экрана, мир под ним живёт
//  (как в Dota 2 / Deadlock). Ввод — строка внизу окна: Enter — выполнить, ↑/↓ — история, Tab — дописать
//  имя команды, ` (или Esc) — закрыть.
// ============================================================

import sdl from "../platform/sdl.js";
import { Scene } from "../core/scene.js";

const SC = sdl.keyboard.SCANCODE;

export class ConsoleScene extends Scene {
  constructor(con) {
    super();
    this.con = con;
    this.transparent = true;
    this.live = true; // мир под консолью не останавливается
    this.input = "";
    this.back = 0; //   позиция в истории (0 — новая строка)
    this.scroll = 0; // сколько строк пролистали вверх
    this.seen = -1;
  }

  get label() {
    return "консоль";
  }

  update() {
    if (this.seen !== this.con.version) {
      this.seen = this.con.version;
      this.engine.redraw();
    }
  }

  drawUI(ui) {
    const h = Math.round(ui.height * 0.5);
    ui.rect(0, 0, ui.width, h, [8, 10, 16], 225);
    ui.rect(0, h, ui.width, 2, [120, 140, 180], 255);
    const scale = 2, lh = 18;
    const rows = Math.floor((h - 44) / lh);
    const lines = this.con.lines;
    const end = Math.max(0, lines.length - this.scroll);
    const from = Math.max(0, end - rows);
    for (let i = from, y = 8; i < end; i++, y += lh) ui.text(lines[i].text, 10, y, scale, lines[i].color || [220, 225, 235]);
    ui.rect(0, h - 34, ui.width, 32, [0, 0, 0], 200);
    ui.text("] " + this.input + "_", 10, h - 25, scale, [255, 230, 150]);
    if (this.scroll) ui.text(`^ ${this.scroll}`, ui.width - 10, h - 25, scale, [150, 160, 180], "right");
  }

  onPress(actions) {
    if (actions.includes("console")) this.engine.pop();
  }

  onKey(e) {
    const con = this.con;
    switch (e.scancode) {
      case SC.ESCAPE:
        return this.engine.pop();
      case SC.RETURN:
      case SC.KP_ENTER:
        con.exec(this.input);
        this.input = "";
        this.back = 0;
        this.scroll = 0;
        break;
      case SC.BACKSPACE:
        this.input = this.input.slice(0, -1);
        break;
      case SC.UP:
      case SC.DOWN: {
        const n = con.history.length;
        this.back = Math.max(0, Math.min(n, this.back + (e.scancode === SC.UP ? 1 : -1)));
        this.input = this.back ? con.history[n - this.back] : "";
        break;
      }
      case SC.PAGEUP:
        this.scroll = Math.min(Math.max(0, con.lines.length - 5), this.scroll + 10);
        break;
      case SC.PAGEDOWN:
        this.scroll = Math.max(0, this.scroll - 10);
        break;
      case SC.TAB: {
        const [first, ...rest] = this.input.split(" ");
        if (rest.length) break;
        const list = con.complete(first);
        if (list.length === 1) this.input = list[0] + " ";
        else if (list.length > 1) con.print(list.join("  "), [150, 170, 200]);
        break;
      }
      default:
        // ` (сама клавиша консоли) не печатаем
        if (e.scancode === SC.GRAVE) return;
        if (typeof e.key === "string" && e.key.length === 1 && this.input.length < 120) this.input += e.key;
        else return;
    }
    this.engine.redraw();
  }
}
