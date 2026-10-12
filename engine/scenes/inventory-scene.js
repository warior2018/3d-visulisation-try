// ============================================================
//  Экран инвентаря поверх мира. Можно показывать несколько «секций» —
//  например, сумку и хотбар (быструю панель) под ней — и перекладывать между ними.
//
//    new InventoryScene({
//      entity, itemInfo,
//      sections: [                                   // по умолчанию — одна: entity.inventory
//        { inventory: entity.inventory },
//        { inventory: hotbar, title: "ХОТБАР", label: (i) => String(i + 1) }, // cols — ячеек в ряд (5)
//      ],
//      onChange: () => {},                           // что-то переложили или выбросили
//      onDrop: (item, count) => {},                  // выбросили (Q) — игра решает, что с этим делать
//    })
//
//  Мышь: клик по предмету — взять его «в руку» (едет за курсором); клик по ячейке —
//  положить (там другой предмет — поменяются местами, такой же — сложатся в стопку).
//  Q (действие "drop") над ячейкой — выбросить один предмет; Shift+Q — всю стопку из ячейки разом
//  (onDrop получит её целиком: item, count); с предметом в руке — выбросить его.
//  itemInfo(id) → { name, color, drawIcon? } — игра рассказывает, что за предметы.
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim, drawInventoryGrid, inventoryGridSize, drawItem } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

export class InventoryScene extends Scene {
  constructor({ entity, itemInfo, sections = null, title = "ИНВЕНТАРЬ", closeActions = ["inventory", "pause"], dropAction = "drop", dropKey = "Q", onChange = () => {}, onDrop = () => {} }) {
    super();
    this.transparent = true;
    this.showToasts = false; // всплывающие надписи закрыли бы заголовок окна
    this.trackMouse = true; //  предмет в руке едет за курсором
    this.entity = entity;
    this.itemInfo = itemInfo;
    this.sections = sections || [{ inventory: entity.inventory }];
    this.title = title;
    this.closeActions = closeActions;
    this.dropAction = dropAction;
    this.dropKey = dropKey; // подпись клавиши в подсказке
    this.onChange = onChange;
    this.onDrop = onDrop;
    this.held = null; //   { stack: { item, count }, from: { s, i } } — что взяли «в руку»
    this.hover = null; //  { s, i } — ячейка под мышью (с прошлой отрисовки)
  }

  get label() {
    return "инвентарь";
  }

  drawUI(ui) {
    const { hp, maxHp } = this.entity.stats;
    drawDim(ui);
    const t = ui.theme.window;
    const sizes = this.sections.map((sec) => inventoryGridSize(sec.inventory, { cols: sec.cols ?? 5 }));
    const w = Math.max(...sizes.map((s) => s.w));
    const titled = this.sections.filter((s) => s.title).length;
    const h = sizes.reduce((sum, s) => sum + s.h, 0) + (this.sections.length - 1) * 20 + titled * 26;
    const box = drawWindow(ui, { title: this.title, width: w + t.padding * 2, height: h + t.titleHeight + t.padding * 2 + 64, closeId: "close" });
    ui.text(`HP ${hp}/${maxHp}`, box.cx, box.y, 2, ui.theme.muted, "center");

    // Секции одна под другой; запоминаем, какая ячейка под мышью
    let y = box.y + 30;
    this.hover = null;
    this.sections.forEach((sec, s) => {
      if (sec.title) {
        ui.text(sec.title, box.cx, y, 2, ui.theme.accent, "center");
        y += 26;
      }
      const rects = drawInventoryGrid(ui, sec.inventory, this.itemInfo, {
        x: box.cx - sizes[s].w / 2, y, cols: sec.cols ?? 5, hover: this.hoverIndex(ui, s), label: sec.label, buttonId: (i) => `slot:${s}:${i}`,
      });
      sec.rects = rects;
      const r = rects.find((r) => ui.isInside(ui.mouseX, ui.mouseY, r.x, r.y, r.w, r.h));
      if (r) this.hover = { s, i: r.i };
      y += sizes[s].h + 20;
    });

    ui.text(`КЛИК - ВЗЯТЬ / ПОЛОЖИТЬ. ${this.dropKey} - ВЫБРОСИТЬ, SHIFT+${this.dropKey} - ВСЮ СТОПКУ`, box.cx, box.y + box.h - 30, 2, ui.theme.muted, "center");

    // Предмет «в руке» — у курсора
    if (this.held) drawItem(ui, this.itemInfo, this.held.stack, ui.mouseX - 40, ui.mouseY - 40, 80, { name: false });
  }

  hoverIndex(ui, s) {
    const rects = this.sections[s].rects || [];
    const r = rects.find((r) => ui.isInside(ui.mouseX, ui.mouseY, r.x, r.y, r.w, r.h));
    return r ? r.i : -1;
  }

  slotsOf(s) {
    return this.sections[s].inventory.slots;
  }

  onButton(id) {
    if (id === "close") return this.close();
    const [kind, s, i] = id.split(":");
    if (kind === "slot") this.clickSlot(+s, +i);
    this.engine.redraw();
  }

  // Клик по ячейке: взять / положить / поменять / сложить
  clickSlot(s, i) {
    const slots = this.slotsOf(s);
    const here = slots[i];
    if (!this.held) {
      if (!here) return;
      this.held = { stack: here, from: { s, i } };
      slots[i] = null;
      return;
    }
    const stack = this.held.stack;
    if (!here) {
      slots[i] = stack;
      this.held = null;
    } else if (here.item === stack.item) {
      // Тот же предмет — докладываем, сколько влезет; остаток остаётся в руке
      const max = this.sections[s].inventory.maxStack(stack.item);
      const put = Math.min(stack.count, max - here.count);
      here.count += put;
      stack.count -= put;
      if (stack.count <= 0) this.held = null;
    } else {
      // Другой — меняемся: кладём своё, берём то, что лежало
      slots[i] = stack;
      this.held = { stack: here, from: { s, i } };
    }
    this.onChange();
  }

  onPress(actions) {
    if (actions.includes(this.dropAction)) {
      this.drop();
      this.engine.redraw();
      return;
    }
    if (this.closeActions.some((a) => actions.includes(a))) this.close();
  }

  // Q: в руке что-то есть — выбросить всё это; иначе — один предмет из ячейки под мышью (с Shift — всю стопку)
  drop() {
    if (this.held) {
      const { item, count } = this.held.stack;
      this.held = null;
      this.onDrop(item, count);
      this.onChange();
      return;
    }
    if (!this.hover) return;
    const slots = this.slotsOf(this.hover.s);
    const slot = slots[this.hover.i];
    if (!slot) return;
    const n = this.engine.input.shift ? slot.count : 1; // Shift — вся стопка одним предметом
    slot.count -= n;
    if (slot.count <= 0) slots[this.hover.i] = null;
    this.onDrop(slot.item, n);
    this.onChange();
  }

  // Закрываем: предмет из руки — обратно (откуда взяли, иначе в любую свободную ячейку)
  close() {
    if (this.held) {
      const { stack, from } = this.held;
      const slots = this.slotsOf(from.s);
      if (!slots[from.i]) slots[from.i] = stack;
      else {
        let left = stack.count;
        for (const sec of this.sections) if (left > 0) left = sec.inventory.add(stack.item, left);
        if (left > 0) this.onDrop(stack.item, left); // некуда — выпадает
      }
      this.held = null;
      this.onChange();
    }
    this.engine.pop();
  }
}
