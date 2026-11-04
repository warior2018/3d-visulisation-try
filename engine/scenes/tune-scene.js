// ============================================================
//  Окно настройки баланса прямо в игре: вкладки, в каждой — строки «название — число  [-] [+]».
//  Нажал — число меняется сразу (row.set), игра уже живёт с ним; изменённые — жёлтым. ЗАПИСАТЬ — onSave(список
//  изменённых строк): игра пишет их в свой config.js (engine/core/config-patch.js). СБРОС — вернуть, как было.
//  Шаг: [-] / [+] — step, [--] / [++] — ×10. Колесо — прокрутка.
//
//    engine.push(new TuneScene({
//      tabs: [{ id: "move", name: "MOVE", rows: [{ id: "MOVEMENT.ground", label: "GROUND ACCEL", get, set, step: 0.01, min: 0 }] }],
//      onSave: (changed) => "SAVED 3 VALUES",   // вернёт текст для всплывающей надписи
//      onChange: (row) => {},                    // после каждого изменения (пересобрать оружие и т. п.)
//    }));
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

const YELLOW = [240, 200, 90];
const ROW = 30;

export class TuneScene extends Scene {
  constructor({ title = "BALANCE", tabs = [], onSave = () => "", onChange = () => {} }) {
    super();
    this.transparent = true;
    this.title = title;
    this.tabs = tabs;
    this.tab = tabs[0]?.id;
    this.onSave = onSave;
    this.onChange = onChange;
    this.scroll = 0;
    this.start = new Map(); // id → значение при открытии (что изменено, СБРОС)
    for (const t of tabs) for (const r of t.rows) this.start.set(r.id, r.get());
  }

  get label() {
    return "баланс";
  }

  get rows() {
    return this.tabs.find((t) => t.id === this.tab)?.rows || [];
  }

  changed() {
    return this.tabs.flatMap((t) => t.rows).filter((r) => r.get() !== this.start.get(r.id));
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 120);
    const box = drawWindow(ui, { title: this.title, width: 900, height: Math.min(ui.height - 40, 760), closeId: "close" });
    // вкладки
    const tw = Math.min(150, (box.w - 10 * (this.tabs.length - 1)) / Math.max(1, this.tabs.length));
    this.tabs.forEach((t, i) => ui.button("tab:" + t.id, t.name, box.x + tw / 2 + i * (tw + 10), box.y + 20, tw, 36, 2, t.id === this.tab));
    const top = box.y + 54, bottom = box.y + box.h - 84;
    this.page = Math.max(1, Math.floor((bottom - top) / ROW));
    const rows = this.rows;
    this.scroll = Math.max(0, Math.min(this.scroll, rows.length - this.page));
    rows.slice(this.scroll, this.scroll + this.page).forEach((r, k) => {
      const y = top + k * ROW, v = r.get(), changed = v !== this.start.get(r.id);
      ui.text(r.label, box.x, y + 8, 2, changed ? YELLOW : th.text);
      ui.text(format(v), box.x + box.w - 250, y + 6, 3, changed ? YELLOW : th.text, "right");
      const bx = box.x + box.w - 210;
      [["--", -10], ["-", -1], ["+", 1], ["++", 10]].forEach(([l, k2], j) => ui.button(`step:${r.id}:${k2}`, l, bx + j * 52 + 22, y + 12, 46, 26, 2));
    });
    if (rows.length > this.page) ui.text(`${this.scroll + 1}-${Math.min(rows.length, this.scroll + this.page)} / ${rows.length}`, box.x + box.w, box.y + 14, 1, th.muted, "right");
    const n = this.changed().length, by = box.y + box.h - 26;
    ui.button("save", n ? `SAVE TO CONFIG (${n})` : "SAVE TO CONFIG", box.cx - 170, by, 320, 44, 2, n > 0);
    ui.button("reset", "RESET", box.cx + 150, by, 160, 44, 2);
    ui.text("APPLIED RIGHT AWAY. SAVE - WRITE INTO CONFIG.JS", box.cx, by - 34, 1, th.muted, "center");
  }

  onButton(id) {
    const [kind, ...rest] = id.split(":");
    if (kind === "close") return this.engine.pop();
    if (kind === "tab") {
      this.tab = rest[0];
      this.scroll = 0;
    }
    if (kind === "step") {
      const k = Number(rest.pop()), rid = rest.join(":");
      const r = this.tabs.flatMap((t) => t.rows).find((x) => x.id === rid);
      if (r) this.nudge(r, k);
    }
    if (kind === "reset") {
      for (const r of this.changed()) {
        r.set(this.start.get(r.id));
        this.onChange(r);
      }
    }
    if (kind === "save") {
      const list = this.changed();
      if (!list.length) return;
      const msg = this.onSave(list);
      for (const r of list) this.start.set(r.id, r.get());
      if (msg) this.engine.toast(msg, 2500);
    }
    this.engine.redraw();
  }

  // Шаг: step из строки или по величине числа (≈ 1–2 % от него)
  nudge(r, k) {
    const v = r.get();
    const step = r.step ?? autoStep(v);
    let next = round(v + step * k, step);
    if (r.min !== undefined) next = Math.max(r.min, next);
    if (r.max !== undefined) next = Math.min(r.max, next);
    r.set(next);
    this.onChange(r);
  }

  onWheel({ dy }) {
    this.scroll = Math.max(0, this.scroll + (dy > 0 ? -3 : 3));
    this.engine.redraw();
    return true;
  }

  onPress(actions) {
    if (actions.includes("pause")) this.engine.pop();
  }
}

export function autoStep(v) {
  const a = Math.abs(v);
  if (a >= 200) return 10;
  if (a >= 20) return 1;
  if (a >= 2) return 0.1;
  if (a >= 0.2) return 0.01;
  return 0.005;
}

const round = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(6, d)));
};
const format = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));
