// ============================================================
//  Большая карта мира — окно поверх игры (по умолчанию клавиша M в игре).
//  Это та же миникарта (engine/ui/minimap.js), только крупнее и с бо́льшим радиусом.
//
//    new MapScene({ map: () => ({ world, center, yaw, markers, fog }), radius: 40, info: () => "X 0  Z 0" })
//  map() вызывается при каждой перерисовке: карта всегда свежая. center — где игрок.
//  info() — строка под картой (например, координаты героя); legend — подсказка ещё ниже.
//
//  Управление: зажал ЛКМ и тянешь — карта едет за мышью; колесо — приблизить / отдалить (к точке под
//  курсором); ПРОБЕЛ или ПКМ — обратно к игроку. Сдвиг и масштаб помнятся, пока окно открыто.
// ============================================================

import { Scene } from "../core/scene.js";
import { KEYS } from "../input/input.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { drawMinimap } from "../ui/minimap.js";

export class MapScene extends Scene {
  // minRadius / maxRadius — пределы приближения (радиус карты в блоках)
  constructor({ map, title = "MAP", radius = 40, minRadius = 15, maxRadius = 160, closeActions = ["map", "pause"], legend = null, info = null }) {
    super();
    this.transparent = true;
    this.showToasts = false;
    this.map = map;
    this.title = title;
    this.radius = radius;
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.closeActions = closeActions;
    this.legend = legend; // строка подсказки под картой
    this.info = info; //     () => строка под картой (координаты и т. п.)
    this.offset = { x: 0, z: 0 }; // насколько карту сдвинули от игрока (в блоках)
    this.drag = null; //            тянем: { x, y, ox, oz } — где нажали и какой был сдвиг
    this.box = null; //             где карта на экране (из последнего drawUI): { x, y, size }
  }

  get label() {
    return "карта";
  }

  drawUI(ui) {
    drawDim(ui);
    const t = ui.theme.window;
    const lines = 1 + (this.info ? 1 : 0) + (this.legend ? 1 : 0);
    const below = 8 + lines * 22; // место под картой для строк
    const size = Math.max(200, Math.min(ui.width - 80, ui.height - t.titleHeight - t.padding * 2 - 50 - below));
    const box = drawWindow(ui, { title: this.title, width: size + t.padding * 2, height: size + t.titleHeight + t.padding * 2 + below, closeId: "close" });
    this.box = { x: box.x, y: box.y, size };
    const data = this.map();
    const player = data.center;
    const center = { x: player.x + this.offset.x, z: player.z + this.offset.z };
    drawMinimap(ui, { ...data, center, player, x: box.x, y: box.y, size, radius: this.radius });
    let y = box.y + size + 10;
    if (this.info) {
      ui.text(this.info(), box.cx, y, 2, ui.theme.text, "center");
      y += 22;
    }
    if (this.legend) {
      ui.text(this.legend, box.cx, y, 2, ui.theme.muted, "center");
      y += 22;
    }
    ui.text("LMB DRAG - MOVE   WHEEL - ZOOM   SPACE / RMB - BACK TO YOU", box.cx, y, 2, ui.theme.muted, "center");
  }

  // Блоков на пиксель экрана
  get blocksPerPixel() {
    return this.box ? (this.radius * 2) / this.box.size : 0;
  }

  inside(x, y) {
    const b = this.box;
    return !!b && x >= b.x && x <= b.x + b.size && y >= b.y && y <= b.y + b.size;
  }

  recenter() {
    this.offset = { x: 0, z: 0 };
    return true;
  }

  onMouseDown({ x, y, button }) {
    if (button === "right") return this.recenter();
    if (button !== "left" || !this.inside(x, y)) return false;
    this.drag = { x, y, ox: this.offset.x, oz: this.offset.z };
    return false;
  }

  onMouseMove({ x, y }) {
    if (!this.drag) return false;
    // Тянем карту за мышью: вправо — карта едет вправо (видим то, что левее); +Z — вверх
    const k = this.blocksPerPixel;
    this.offset.x = this.drag.ox - (x - this.drag.x) * k;
    this.offset.z = this.drag.oz + (y - this.drag.y) * k;
    return true;
  }

  onMouseUp({ button }) {
    if (button === "left") this.drag = null;
    return false;
  }

  // Колесо: приблизить к точке под курсором (она остаётся под курсором)
  onWheel({ x, y, dy }) {
    if (!dy || !this.box) return false;
    const b = this.box;
    const k0 = this.blocksPerPixel;
    const next = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius * (dy > 0 ? 0.8 : 1.25)));
    if (next === this.radius) return false;
    const mx = x - (b.x + b.size / 2), my = y - (b.y + b.size / 2); // курсор от середины карты, пиксели
    const inMap = this.inside(x, y);
    this.radius = next;
    const k1 = this.blocksPerPixel;
    if (inMap) {
      this.offset.x += mx * (k0 - k1);
      this.offset.z -= my * (k0 - k1);
    }
    return true;
  }

  onBlur() {
    this.drag = null;
  }

  onButton(id) {
    if (id === "close") this.engine.pop();
  }

  onKey(e) {
    if (e.scancode === KEYS.SPACE && this.recenter()) this.engine.redraw();
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}
