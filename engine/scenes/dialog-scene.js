// ============================================================
//  Диалог с НПС: окно с заголовком, текстом (по словам в строки; "\n" — новая строка) и кнопками в ряд.
//  Текст и кнопки могут быть функциями — окно перерисует их после каждого нажатия (взял задание — кнопки другие).
//
//    engine.push(new DialogScene({
//      title: "WARDEN", text: () => "KILL 10 SKELETONS",
//      buttons: () => [{ id: "accept", label: "ACCEPT" }, { id: "close", label: "BYE" }],
//      onButton: (id, dialog) => { ... return true — закрыть окно },
//    }));
//  live: true — мир под окном живёт (как магазин); Esc / «close» — закрыть
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { measureText } from "../ui/font.js";
import { translate } from "../ui/i18n.js";

const value = (v) => (typeof v === "function" ? v() : v);

export class DialogScene extends Scene {
  constructor({ title = "", text = "", note = "", buttons = [{ id: "close", label: "CLOSE" }], onButton = () => true, width = 760, live = false }) {
    super();
    this.transparent = true;
    this.live = live;
    Object.assign(this, { title, text, note, buttons, width });
    this.handler = onButton;
  }

  get label() {
    return `диалог «${value(this.title)}»`;
  }

  lines(ui, text, w, scale) {
    const out = [];
    for (const para of translate(String(text)).split("\n")) {
      let cur = "";
      for (const word of para.split(" ")) {
        const next = cur ? cur + " " + word : word;
        if (measureText(next, scale) > w && cur) { out.push(cur); cur = word; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 150);
    const lines = this.lines(ui, value(this.text), this.width - 60, 2);
    const note = value(this.note);
    const buttons = value(this.buttons) || [];
    const box = drawWindow(ui, { title: value(this.title), width: this.width, height: 150 + lines.length * 24 + (note ? 30 : 0), closeId: "close" });
    lines.forEach((l, i) => ui.text(l, box.x + 4, box.y + 8 + i * 24, 2, th.text));
    if (note) ui.text(note, box.cx, box.y + 16 + lines.length * 24, 2, th.muted, "center");
    const n = buttons.length, bw = Math.min(240, (box.w - (n - 1) * 14) / Math.max(1, n));
    buttons.forEach((b, i) => ui.button(b.id, b.label, box.cx + (i - (n - 1) / 2) * (bw + 14), box.y + box.h - 28, bw, 44, 3, !!b.main));
  }

  onButton(id) {
    if (id === "close") return this.engine.pop();
    const close = this.handler(id, this);
    if (close && this.engine.scene === this) this.engine.pop();
    this.engine.redraw();
  }

  onPress(actions) {
    if (actions.includes("pause")) this.engine.pop();
  }
}
