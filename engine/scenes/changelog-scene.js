// ============================================================
//  Окно «Что нового» — записи обновлений (engine/core/updates.js).
//    new ChangelogScene({ entries, title: "ЧТО НОВОГО" })
//  Показывает, сколько влезает (самые новые сверху), длинные строки переносит.
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { measureText } from "../ui/font.js";

export class ChangelogScene extends Scene {
  constructor({ entries, title = "ЧТО НОВОГО", closeActions = ["pause"] }) {
    super();
    this.transparent = true;
    this.showToasts = false;
    this.entries = entries;
    this.title = title;
    this.closeActions = closeActions;
  }

  get label() {
    return "что нового";
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 210);
    const width = Math.min(900, ui.width - 40);
    const height = Math.min(620, ui.height - 40);
    const box = drawWindow(ui, { title: this.title, width, height, closeId: "close" });
    let y = box.y;
    const bottom = box.y + box.h - 50;
    for (const e of this.entries) {
      if (y > bottom) break;
      ui.text(`ВЕРСИЯ ${e.version}${e.date ? "  " + e.date : ""}`, box.x, y, 2, th.accent);
      y += 22;
      if (e.title) {
        ui.text(e.title.toUpperCase(), box.x, y, 2, th.text);
        y += 22;
      }
      for (const c of e.changes || []) {
        for (const [k, line] of wrap(c.toUpperCase(), box.w - 30).entries()) {
          if (y > bottom) break;
          ui.text((k === 0 ? "- " : "  ") + line, box.x + 10, y, 2, th.muted);
          y += 20;
        }
      }
      y += 12;
    }
    ui.button("close", "ПОНЯТНО", box.cx, box.y + box.h - 22, 220, 40, 2);
  }

  onButton(id) {
    if (id === "close") this.engine.pop();
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}

// Перенос по словам под ширину в пикселях
function wrap(text, width) {
  const out = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? cur + " " + word : word;
    if (cur && measureText("- " + next, 2) > width) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
