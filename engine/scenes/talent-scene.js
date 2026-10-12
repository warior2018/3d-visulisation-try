// ============================================================
//  Экран дерева талантов поверх мира.
//  Вкладки сверху, в каждой — ярусы (ряды) талантов. Клик — вложить очко.
//  Наведи мышь на талант — снизу описание: что даёт сейчас и на следующем ранге.
//
//    new TalentScene({ talents, onLearn: (id) => { ... } })
//  talents — engine/progression/talents.js; закрывается действиями closeActions.
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { measureText } from "../ui/font.js";

const LOCKED = [70, 76, 92];

export class TalentScene extends Scene {
  constructor({ talents, title = "ТАЛАНТЫ", closeActions = ["talents", "pause"], onLearn = () => {} }) {
    super();
    this.transparent = true;
    this.showToasts = false; // надписи вроде «НОВЫЙ УРОВЕНЬ» закрыли бы заголовок
    this.talents = talents;
    this.title = title;
    this.closeActions = closeActions;
    this.onLearn = onLearn;
    this.tab = talents.tree.tabs[0].id;
    this.message = null; // почему нельзя вложить очко (последняя попытка)
  }

  get label() {
    return "таланты";
  }

  drawUI(ui) {
    const t = this.talents;
    const th = ui.theme;
    const tabs = t.tree.tabs;
    drawDim(ui, 200);
    const box = drawWindow(ui, { title: this.title, width: 1000, height: 640, closeId: "close" });
    const cx = box.cx;

    ui.text(`СВОБОДНЫХ ОЧКОВ: ${t.points}`, cx, box.y, 2, t.points > 0 ? th.accent : th.muted, "center");

    // Вкладки: название и сколько очков вложено
    const tabW = Math.min(200, Math.floor((box.w - (tabs.length - 1) * 8) / tabs.length));
    tabs.forEach((tab, i) => {
      const spent = t.spentIn(tab.id);
      ui.button("tab:" + tab.id, spent ? `${tab.name} ${spent}` : tab.name, cx + (i - (tabs.length - 1) / 2) * (tabW + 8), box.y + 40, tabW, 36, 2, this.tab === tab.id);
    });
    const tab = tabs.find((x) => x.id === this.tab);
    if (tab.note) ui.text(tab.note, cx, box.y + 66, 2, th.muted, "center");

    // Ярусы: ряды узлов
    const tiers = [...new Set(tab.talents.map((x) => x.tier))].sort((a, b) => a - b);
    const nodeW = 214;
    const nodeH = 64;
    let hovered = null;
    tiers.forEach((tier, row) => {
      const y = box.y + 90 + row * (nodeH + 24);
      const need = t.tierRequirement(tier);
      const open = t.spentIn(tab.id) >= need;
      const list = tab.talents.filter((x) => x.tier === tier);
      list.forEach((talent, i) => {
        const x = cx + (i - (list.length - 1) / 2) * (nodeW + 12) - nodeW / 2;
        if (this.drawNode(ui, talent, x, y, nodeW, nodeH, open)) hovered = talent;
      });
      if (need > 0 && !open) ui.text(`ЯРУС ${tier}: НУЖНО ${need} ОЧК. ВО ВКЛАДКЕ`, cx, y + nodeH + 4, 2, th.muted, "center");
    });

    // Описание таланта под мышью — внизу окна
    const pw = Math.min(760, box.w);
    const ph = 90;
    const py = box.y + box.h - ph;
    ui.rect(cx - pw / 2, py, pw, ph, th.window.titleBar, 235);
    ui.frame(cx - pw / 2, py, pw, ph, th.window.border, 2);
    if (hovered) {
      const r = t.rank(hovered.id);
      const ranks = Number.isFinite(hovered.maxRank) ? `${r}/${hovered.maxRank}` : `РАНГ ${r}, БЕЗ ПРЕДЕЛА`;
      ui.text(`${hovered.name}  ${ranks}`, cx, py + 10, 2, th.text, "center");
      const now = r > 0 ? "СЕЙЧАС: " + hovered.describe(r) : "";
      const next = r < hovered.maxRank ? "ДАЛЬШЕ: " + hovered.describe(r + 1) : "ИЗУЧЕН ПОЛНОСТЬЮ";
      // Влезает в одну строку — одной, иначе «сейчас» и «дальше» — двумя строками
      const one = [now, next].filter(Boolean).join("   ");
      const lines = measureText(one, 2) <= pw - 20 ? [one] : [now, next].filter(Boolean);
      lines.forEach((line, i) => ui.text(line, cx, py + 30 + i * 20, 2, th.muted, "center"));
      const c = t.check(hovered.id);
      if (!c.ok && r < hovered.maxRank) ui.text(c.reason, cx, py + 30 + lines.length * 20, 2, th.warn, "center");
    } else {
      ui.text(this.message || "НАВЕДИ НА ТАЛАНТ - УВИДИШЬ, ЧТО ОН ДАЁТ. КЛИК - ВЛОЖИТЬ ОЧКО", cx, py + 38, 2, this.message ? th.warn : th.muted, "center");
    }
  }

  // Узел таланта: название, ранг, цвет по состоянию. Вернёт true, если мышь на нём.
  drawNode(ui, talent, x, y, w, h, open) {
    const t = this.talents;
    const th = ui.theme;
    const r = t.rank(talent.id);
    const hover = ui.isInside(ui.mouseX, ui.mouseY, x, y, w, h);
    const can = t.check(talent.id).ok;
    const border = r >= talent.maxRank ? th.accent : r > 0 ? [200, 170, 90] : can ? th.button.hoverBorder : LOCKED;
    const fill = hover ? th.button.hover.map((c) => Math.round(c * 0.55)) : open ? th.button.fill : [18, 20, 26];
    ui.rect(x, y, w, h, fill, 235);
    ui.frame(x, y, w, h, border, hover ? 3 : 2);
    // Название видно всегда — и у закрытых (тусклее), и под мышью
    ui.text(talent.name, x + w / 2, y + 12, 2, open || hover ? th.text : [120, 126, 142], "center");
    // Бесконечный талант: вместо квадратиков — число вложенных рангов
    if (!Number.isFinite(talent.maxRank)) {
      ui.text(`РАНГ ${r}`, x + w / 2, y + 38, 2, r > 0 ? th.accent : [120, 126, 142], "center");
      ui.buttons.push({ id: "talent:" + talent.id, x, y, w, h });
      return hover;
    }
    // Ранг: квадратики
    const size = 12;
    const gap = 6;
    let bx = x + w / 2 - (talent.maxRank * size + (talent.maxRank - 1) * gap) / 2;
    for (let i = 0; i < talent.maxRank; i++) {
      ui.rect(bx, y + 38, size, size, i < r ? th.accent : [40, 44, 56]);
      bx += size + gap;
    }
    if ((talent.cost ?? 1) > 1) ui.text(`${talent.cost} ОЧК.`, x + w - 6, y + h - 18, 2, th.muted, "right"); // дорогой талант
    ui.buttons.push({ id: "talent:" + talent.id, x, y, w, h });
    return hover;
  }

  onButton(id) {
    const [kind, arg] = id.split(":");
    if (kind === "tab") {
      this.tab = arg;
      this.message = null;
    }
    if (kind === "talent") {
      const r = this.talents.learn(arg);
      this.message = r.ok ? null : r.reason;
      if (r.ok) this.onLearn(arg);
    }
    if (kind === "close") return this.engine.pop();
    this.engine.redraw();
  }

  onPress(actions) {
    if (this.closeActions.some((a) => actions.includes(a))) this.engine.pop();
  }
}
