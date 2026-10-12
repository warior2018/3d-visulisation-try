// ============================================================
//  Большая карта мира — окно поверх игры (по умолчанию клавиша M в игре).
//  Это та же миникарта (engine/ui/minimap.js), только крупнее и с бо́льшим радиусом.
//
//    new MapScene({ map: () => ({ world, center, yaw, markers }), radius: 40, info: () => "X 0  Z 0" })
//  map() вызывается при каждой перерисовке: карта всегда свежая.
//  info() — строка под картой (например, координаты героя); legend — подсказка ещё ниже.
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { drawMinimap } from "../ui/minimap.js";

export class MapScene extends Scene {
  constructor({ map, title = "КАРТА", radius = 40, closeActions = ["map", "pause"], legend = null, info = null }) {
    super();
    this.transparent = true;
    this.showToasts = false;
    this.map = map;
    this.title = title;
    this.radius = radius;
    this.closeActions = closeActions;
    this.legend = legend; // строка подсказки под картой
    this.info = info; //     () => строка под картой (координаты и т. п.)
  }

  get label() {
    return "карта";
  }

  drawUI(ui) {
    drawDim(ui);
    const t = ui.theme.window;
    const lines = (this.info ? 1 : 0) + (this.legend ? 1 : 0);
    const below = 8 + lines * 22; // место под картой для строк
    const size = Math.max(200, Math.min(ui.width - 80, ui.height - t.titleHeight - t.padding * 2 - 50 - below));
    const box = drawWindow(ui, { title: this.title, width: size + t.padding * 2, height: size + t.titleHeight + t.padding * 2 + below, closeId: "close" });
    drawMinimap(ui, { ...this.map(), x: box.x, y: box.y, size, radius: this.radius });
    let y = box.y + size + 10;
    if (this.info) {
      ui.text(this.info(), box.cx, y, 2, ui.theme.text, "center");
      y += 22;
    }
    if (this.legend) ui.text(this.legend, box.cx, y, 2, ui.theme.muted, "center");
  }

  onButton(id) {
    if (id === "close") this.engine.pop();
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}
