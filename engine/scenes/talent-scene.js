// ============================================================
//  Экран дерева талантов поверх мира.
//  Вкладки сверху, в каждой — ярусы (ряды) талантов. Клик — вложить очко.
//  Наведи мышь на талант — снизу описание: что даёт сейчас и на следующем ранге.
//  Если у талантов есть col / row (дерево-схема) — узлы стоят по столбцам и рядам, а стрелки
//  (requires) рисуются линиями от родителя к потомку; над столбцами — подписи разделов (tab.sections).
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
  constructor({ talents, title = "TALENTS", closeActions = ["talents", "pause"], onLearn = () => {} }) {
    super();
    this.transparent = true;
    this.showToasts = false; // надписи вроде «НОВЫЙ УРОВЕНЬ» закрыли бы заголовок
    this.talents = talents;
    this.title = title;
    this.closeActions = closeActions;
    this.onLearn = onLearn;
    this.tab = talents.visibleTabs()[0]?.id ?? talents.tree.tabs[0].id;
    this.message = null; // почему нельзя вложить очко (последняя попытка)
  }

  get label() {
    return "таланты";
  }

  drawUI(ui) {
    const t = this.talents;
    const th = ui.theme;
    const tabs = t.visibleTabs(); // только вкладки, доступные сейчас (класс героя)
    if (!tabs.some((x) => x.id === this.tab)) this.tab = tabs[0]?.id;
    drawDim(ui, 200);
    const box = drawWindow(ui, { title: this.title, width: Math.min(ui.width - 40, 1240), height: Math.min(ui.height - 30, 680), closeId: "close" });
    const cx = box.cx;

    ui.text(`FREE POINTS: ${t.points}`, cx, box.y, 2, t.points > 0 ? th.accent : th.muted, "center");

    // Вкладки: название и сколько очков вложено
    const tabW = Math.min(200, Math.floor((box.w - (tabs.length - 1) * 8) / tabs.length));
    tabs.forEach((tab, i) => {
      const spent = t.spentIn(tab.id);
      ui.button("tab:" + tab.id, spent ? `${tab.name} ${spent}` : tab.name, cx + (i - (tabs.length - 1) / 2) * (tabW + 8), box.y + 40, tabW, 36, 2, this.tab === tab.id);
    });
    const tab = tabs.find((x) => x.id === this.tab);
    if (tab.note) ui.text(tab.note, cx, box.y + 66, 2, th.muted, "center");

    let hovered = null;
    if (tab.talents.some((x) => x.col !== undefined)) hovered = this.drawTree(ui, tab, box);
    // Ярусы: ряды узлов
    const tiers = tab.talents.some((x) => x.col !== undefined) ? [] : [...new Set(tab.talents.map((x) => x.tier))].sort((a, b) => a - b);
    const nodeW = 214;
    const nodeH = 64;
    tiers.forEach((tier, row) => {
      const y = box.y + 90 + row * (nodeH + 24);
      const need = t.tierRequirement(tier);
      const open = t.spentIn(tab.id) >= need;
      const list = tab.talents.filter((x) => x.tier === tier);
      list.forEach((talent, i) => {
        const x = cx + (i - (list.length - 1) / 2) * (nodeW + 12) - nodeW / 2;
        if (this.drawNode(ui, talent, x, y, nodeW, nodeH, open)) hovered = talent;
      });
      if (need > 0 && !open) ui.text(`TIER ${tier}: NEED ${need} PTS IN TAB`, cx, y + nodeH + 4, 2, th.muted, "center");
    });

    // Описание таланта под мышью — внизу окна
    const pw = Math.min(760, box.w);
    const ph = 90;
    const py = box.y + box.h - ph;
    ui.rect(cx - pw / 2, py, pw, ph, th.window.titleBar, 235);
    ui.frame(cx - pw / 2, py, pw, ph, th.window.border, 2);
    if (hovered) {
      const r = t.rank(hovered.id);
      const ranks = Number.isFinite(hovered.maxRank) ? `${r}/${hovered.maxRank}` : `RANK ${r}, NO LIMIT`;
      ui.text(`${hovered.name}  ${ranks}`, cx, py + 10, 2, th.text, "center");
      const now = r > 0 ? "NOW: " + hovered.describe(r) : "";
      const next = r < hovered.maxRank ? "NEXT: " + hovered.describe(r + 1) : "FULLY LEARNED";
      // Влезает в одну строку — одной, иначе «сейчас» и «дальше» — двумя строками
      const one = [now, next].filter(Boolean).join("   ");
      const lines = measureText(one, 2) <= pw - 20 ? [one] : [now, next].filter(Boolean);
      lines.forEach((line, i) => ui.text(line, cx, py + 30 + i * 20, 2, th.muted, "center"));
      const c = t.check(hovered.id);
      if (!c.ok && r < hovered.maxRank) ui.text(c.reason, cx, py + 30 + lines.length * 20, 2, th.warn, "center");
    } else {
      ui.text(this.message || "HOVER A TALENT TO SEE WHAT IT DOES. CLICK - SPEND A POINT", cx, py + 38, 2, this.message ? th.warn : th.muted, "center");
    }
  }

  // Дерево-схема: узлы по столбцам (col) и рядам (row), линии от требуемых (requires). Вернёт талант под мышью
  drawTree(ui, tab, box) {
    const t = this.talents;
    const th = ui.theme;
    const cols = Math.max(...tab.talents.map((x) => x.col)) + 1;
    const gap = 10;
    const nodeW = Math.min(200, Math.floor((box.w - (cols - 1) * gap) / cols));
    const nodeH = 56;
    const rowGap = 26;
    const left = box.cx - (cols * nodeW + (cols - 1) * gap) / 2;
    const top = box.y + 112;
    const colX = (c) => left + c * (nodeW + gap);
    const rowY = (r) => top + r * (nodeH + rowGap);
    // Подписи разделов (над столбцами)
    for (const sec of tab.sections || []) ui.text(sec.name, colX(sec.col) + nodeW / 2, top - 24, 2, th.accent, "center");
    // Линии: от низа требуемого к верху зависящего (углом), светлые — если требуемый уже выучен
    const byId = new Map(tab.talents.map((x) => [x.id, x]));
    for (const talent of tab.talents) {
      for (const req of talent.requires || []) {
        const from = byId.get(req);
        if (!from) continue;
        const color = t.rank(req) > 0 ? th.accent : LOCKED;
        const x1 = Math.round(colX(from.col) + nodeW / 2), y1 = rowY(from.row) + nodeH;
        const x2 = Math.round(colX(talent.col) + nodeW / 2), y2 = rowY(talent.row);
        const mid = y2 - Math.round(rowGap / 2);
        ui.rect(x1 - 1, y1, 2, mid - y1, color);
        ui.rect(Math.min(x1, x2) - 1, mid - 1, Math.abs(x2 - x1) + 2, 2, color);
        ui.rect(x2 - 1, mid, 2, y2 - mid, color);
      }
    }
    let hovered = null;
    for (const talent of tab.talents) {
      const open = t.missing(talent).length === 0;
      if (this.drawNode(ui, talent, colX(talent.col), rowY(talent.row), nodeW, nodeH, open)) hovered = talent;
    }
    return hovered;
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
    const nameScale = measureText(talent.name, 2) <= w - 8 ? 2 : 1; // длинное название — мельче
    ui.text(talent.name, x + w / 2, y + (nameScale === 2 ? 12 : 15), nameScale, open || hover ? th.text : [120, 126, 142], "center");
    // Бесконечный талант: вместо квадратиков — число вложенных рангов
    if (!Number.isFinite(talent.maxRank)) {
      ui.text(`RANK ${r}`, x + w / 2, y + 38, 2, r > 0 ? th.accent : [120, 126, 142], "center");
      ui.buttons.push({ id: "talent:" + talent.id, x, y, w, h });
      return hover;
    }
    // Ранг: квадратики
    const size = h < 60 ? 10 : 12;
    const gap = h < 60 ? 4 : 6;
    let bx = x + w / 2 - (talent.maxRank * size + (talent.maxRank - 1) * gap) / 2;
    for (let i = 0; i < talent.maxRank; i++) {
      ui.rect(bx, y + (h < 60 ? 34 : 38), size, size, i < r ? th.accent : [40, 44, 56]);
      bx += size + gap;
    }
    const next = r < talent.maxRank ? t.cost(talent.id) : 0;
    if (next > 1) ui.text(`${next} PTS`, x + w - 4, y + h - 12, 1, th.muted, "right"); // дорогой ранг
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
