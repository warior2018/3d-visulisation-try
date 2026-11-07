// ============================================================
//  Экран инвентаря поверх мира. Можно показывать несколько «секций» —
//  например, сумку и хотбар (быструю панель) под ней — и перекладывать между ними.
//
//    new InventoryScene({
//      entity, itemInfo,
//      sections: [                                   // по умолчанию — одна: entity.inventory
//        { inventory: entity.inventory },
//        { inventory: hotbar, title: "ХОТБАР", label: (i) => String(i + 1) }, // cols — ячеек в ряд (5)
//        // refuse: (item, i) => "ТОЛЬКО ОРУЖИЕ" — что сказать, если inventory.accepts(i, item) запретил
//        // indices: [1, 2] — показать только эти ячейки инвентаря (одна сумка — несколько секций)
//        // area: "left" | "right" — раскладка «персонаж»: слева — секции одна под другой (сумка), справа —
//        //   колонки рядом слева направо (оружие, броня, вещи), каждая по центру по высоте. Без area — все одна под другой
//      ],
//      onChange: () => {},                           // что-то переложили или выбросили
//      onDrop: (item, count, data) => {},            // выбросили (Q) — игра решает, что с этим делать (data — свои данные предмета)
//      canDrop: (item, data) => true | "ПОЧЕМУ НЕТ",  // можно ли выбросить (нельзя — предмет остаётся, надпись внизу)
//    })
//
//  Мышь: ЛКМ по предмету — взять всю ячейку «в руку» (едет за курсором); ЛКМ по ячейке —
//  положить всё (там другой предмет — поменяются местами, такой же — сложатся в стопку).
//  ПКМ — по одной штуке: по стопке — взять одну (ещё ПКМ по тому же предмету — ещё одну в руку),
//  с предметом в руке по пустой ячейке — положить одну. Так стопки и делят.
//  Q (действие "drop") над ячейкой — выбросить один предмет; Shift+Q — всю стопку из ячейки разом
//  (onDrop получит её целиком: item, count); с предметом в руке — выбросить его.
//  itemInfo(id) → { name, color, drawIcon? } — игра рассказывает, что за предметы.
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim, drawInventoryGrid, inventoryGridSize, drawItem } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

export class InventoryScene extends Scene {
  constructor({ entity, itemInfo, sections = null, title = "INVENTORY", closeActions = ["inventory", "pause"], dropAction = "drop", dropKey = "Q", onChange = () => {}, onDrop = () => {}, canDrop = () => true }) {
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
    this.canDrop = canDrop;
    this.held = null; //   { stack: { item, count }, from: { s, i } } — что взяли «в руку»
    this.hover = null; //  { s, i } — ячейка под мышью (с прошлой отрисовки)
  }

  get label() {
    return "инвентарь";
  }

  drawUI(ui) {
    if (this.sections.some((s) => s.area)) return this.drawSides(ui);
    const { hp, maxHp } = this.entity.stats;
    drawDim(ui);
    const t = ui.theme.window;
    const cell = this.cellSize(ui, (k) => this.sections.reduce((sum, sec) => sum + inventoryGridSize(sec.inventory, { cols: sec.cols ?? 5, indices: sec.indices, size: k, gap: Math.round(k / 10) }).h + (sec.title ? 26 : 0) + 20, -20));
    const grid = { size: cell, gap: Math.round(cell / 10) };
    const sizes = this.sections.map((sec) => inventoryGridSize(sec.inventory, { cols: sec.cols ?? 5, indices: sec.indices, ...grid }));
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
        x: box.cx - sizes[s].w / 2, y, cols: sec.cols ?? 5, ...grid, hover: this.hoverIndex(ui, s), label: sec.label, buttonId: (i) => `slot:${s}:${i}`, indices: sec.indices,
      });
      sec.rects = rects;
      const r = rects.find((r) => ui.isInside(ui.mouseX, ui.mouseY, r.x, r.y, r.w, r.h));
      if (r) this.hover = { s, i: r.i };
      y += sizes[s].h + 20;
    });

    const warn = this.warning && performance.now() < this.warning.until ? this.warning.text : null;
    ui.text(warn || `LMB - WHOLE SLOT, RMB - ONE BY ONE. ${this.dropKey} - DROP, SHIFT+${this.dropKey} - WHOLE STACK`, box.cx, box.y + box.h - 30, 2, warn ? ui.theme.warn : ui.theme.muted, "center", 255, box.w);

    // Предмет «в руке» — у курсора
    if (this.held) drawItem(ui, this.itemInfo, this.held.stack, ui.mouseX - 40, ui.mouseY - 40, 80, { name: false });
  }

  // Размер ячейки: 100, а если окно с такими ячейками выше экрана — меньше (не меньше 60). heightOf(k) —
  // высота содержимого при ячейке k
  cellSize(ui, heightOf) {
    const t = ui.theme.window;
    const room = ui.height - 24 - (t.titleHeight + t.padding * 2 + 64);
    for (let k = 100; k > 60; k -= 4) if (heightOf(k) <= room) return k;
    return 60;
  }

  // Раскладка «персонаж»: слева — секции area "left" одна под другой; справа — секции area "right" колонками
  drawSides(ui) {
    const { hp, maxHp } = this.entity.stats;
    drawDim(ui);
    const t = ui.theme.window;
    const GAP = 20, SIDE_GAP = 50, TITLE = 26;
    // Ячейки 100 точек; окно не влезает по высоте (маленький экран) — ячейки мельче, чтобы подсказка снизу
    // не наезжала на них (окно сжимается до экрана, а сетка — нет)
    const cell = this.cellSize(ui, (k) => {
      const sz = (sec) => inventoryGridSize(sec.inventory, { cols: sec.cols ?? 5, indices: sec.indices, size: k, gap: Math.round(k / 10) });
      const l = this.sections.filter((x) => x.area !== "right");
      const r = this.sections.filter((x) => x.area === "right");
      return Math.max(l.reduce((sum, x) => sum + sz(x).h + (x.title ? TITLE : 0), 0) + Math.max(0, l.length - 1) * GAP, ...r.map((x) => sz(x).h + (x.title ? TITLE : 0)));
    });
    const grid = { size: cell, gap: Math.round(cell / 10) };
    const size = (sec) => inventoryGridSize(sec.inventory, { cols: sec.cols ?? 5, indices: sec.indices, ...grid });
    const left = this.sections.map((sec, s) => ({ sec, s, ...size(sec) })).filter((o) => o.sec.area !== "right");
    const right = this.sections.map((sec, s) => ({ sec, s, ...size(sec) })).filter((o) => o.sec.area === "right");
    const leftW = Math.max(0, ...left.map((o) => o.w));
    const leftH = left.reduce((sum, o) => sum + o.h + (o.sec.title ? TITLE : 0), 0) + Math.max(0, left.length - 1) * GAP;
    const rightW = right.reduce((sum, o) => sum + o.w, 0) + Math.max(0, right.length - 1) * GAP;
    const rightH = Math.max(0, ...right.map((o) => o.h + (o.sec.title ? TITLE : 0)));
    const w = leftW + (right.length ? SIDE_GAP + rightW : 0);
    const h = Math.max(leftH, rightH);
    const box = drawWindow(ui, { title: this.title, width: w + t.padding * 2, height: h + t.titleHeight + t.padding * 2 + 64, closeId: "close" });
    ui.text(`HP ${hp}/${maxHp}`, box.cx, box.y, 2, ui.theme.muted, "center");
    this.hover = null;
    const top = box.y + 30;
    const x0 = Math.round(box.cx - w / 2);
    const place = (o, x, y) => {
      if (o.sec.title) {
        ui.text(o.sec.title, x + o.w / 2, y, 2, ui.theme.accent, "center");
        y += TITLE;
      }
      const rects = drawInventoryGrid(ui, o.sec.inventory, this.itemInfo, {
        x, y, cols: o.sec.cols ?? 5, ...grid, hover: this.hoverIndex(ui, o.s), label: o.sec.label, buttonId: (i) => `slot:${o.s}:${i}`, indices: o.sec.indices,
      });
      o.sec.rects = rects;
      const r = rects.find((r) => ui.isInside(ui.mouseX, ui.mouseY, r.x, r.y, r.w, r.h));
      if (r) this.hover = { s: o.s, i: r.i };
    };
    let y = top;
    for (const o of left) {
      place(o, x0, y);
      y += o.h + (o.sec.title ? TITLE : 0) + GAP;
    }
    let x = x0 + leftW + SIDE_GAP;
    for (const o of right) {
      const ch = o.h + (o.sec.title ? TITLE : 0);
      place(o, x, top + Math.round((h - ch) / 2)); // колонка — по центру по высоте
      x += o.w + GAP;
    }
    const warn = this.warning && performance.now() < this.warning.until ? this.warning.text : null;
    ui.text(warn || `LMB - WHOLE SLOT, RMB - ONE BY ONE. ${this.dropKey} - DROP, SHIFT+${this.dropKey} - WHOLE STACK`, box.cx, box.y + box.h - 30, 2, warn ? ui.theme.warn : ui.theme.muted, "center", 255, box.w);
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

  onButton(id, { right = false } = {}) {
    if (id === "close") return this.close();
    const [kind, s, i] = id.split(":");
    if (kind === "slot") (right ? this.rightClickSlot(+s, +i) : this.clickSlot(+s, +i));
    this.engine.redraw();
  }

  // ПКМ по ячейке: по одной штуке (см. выше). Предметы со своими данными (неполная обойма) — целиком
  rightClickSlot(s, i) {
    const sec = this.sections[s];
    const slots = this.slotsOf(s);
    const here = slots[i];
    const held = this.held?.stack;
    const one = (from) => (from.data ? { ...from } : { item: from.item, count: 1 });
    const takeOne = () => {
      here.count -= 1;
      if (here.count <= 0 || here.data) slots[i] = null;
    };
    if (!held) {
      if (!here) return;
      this.held = { stack: one(here), from: { s, i } };
      takeOne();
    } else if (here && here.item === held.item && !here.data && !held.data) {
      // Тот же предмет: ещё одну — в руку (сколько влезет в одну стопку)
      if (held.count >= sec.inventory.maxStack(held.item)) return;
      held.count += 1;
      takeOne();
    } else if (!here) {
      // Пустая ячейка: положить одну
      if (!sec.inventory.accepts(i, held.item)) {
        this.warning = { text: sec.refuse?.(held.item, i) || "CAN'T PUT IT HERE", until: performance.now() + 1500 };
        setTimeout(() => this.engine?.redraw(), 1600);
        return;
      }
      slots[i] = one(held);
      held.count -= 1;
      if (held.count <= 0 || held.data) this.held = null;
    } else return;
    this.onChange();
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
    // В эту ячейку такое класть нельзя (хотбар: оружие — по краям, расходники — в середину)
    if (!this.sections[s].inventory.accepts(i, stack.item)) {
      this.warning = { text: this.sections[s].refuse?.(stack.item, i) || "CAN'T PUT IT HERE", until: performance.now() + 1500 };
      setTimeout(() => this.engine?.redraw(), 1600);
      return;
    }
    if (!here) {
      slots[i] = stack;
      this.held = null;
    } else if (here.item === stack.item && !here.data && !stack.data) { // со своими данными (неполная обойма) — не складываем
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
  // Выбросить нельзя (canDrop) — надпись внизу на 1.5 с; вернёт true, если нельзя
  refuseDrop(item, data) {
    const ok = this.canDrop(item, data);
    if (ok === true) return false;
    this.warning = { text: typeof ok === "string" ? ok : "CAN'T DROP IT", until: performance.now() + 1500 };
    this.engine.redraw();
    return true;
  }

  drop() {
    if (this.held) {
      const { item, count, data } = this.held.stack;
      if (this.refuseDrop(item, data)) return;
      this.held = null;
      this.onDrop(item, count, data);
      this.onChange();
      return;
    }
    if (!this.hover) return;
    const slots = this.slotsOf(this.hover.s);
    const slot = slots[this.hover.i];
    if (!slot) return;
    if (this.refuseDrop(slot.item, slot.data)) return;
    const n = this.engine.input.shift ? slot.count : 1; // Shift — вся стопка одним предметом
    slot.count -= n;
    if (slot.count <= 0) slots[this.hover.i] = null;
    this.onDrop(slot.item, n, slot.data);
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
        for (const sec of this.sections) if (left > 0) left = sec.inventory.add(stack.item, left, { data: stack.data });
        if (left > 0) this.onDrop(stack.item, left, stack.data); // некуда — выпадает
      }
      this.held = null;
      this.onChange();
    }
    this.engine.pop();
  }
}
