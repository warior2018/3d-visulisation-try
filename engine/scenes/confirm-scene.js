// ============================================================
//  Подтверждение опасного действия (удалить мир, сбросить прогресс...) — три уровня строгости:
//    1 — сразу: без окна, onConfirm вызывается тут же
//    2 — окно «точно?»: ДА — сразу делаем, НЕТ / Esc — отмена
//    3 — окно «точно?», а после ДА — ещё отсчёт wait секунд с кнопкой ОТМЕНА (передумал — успеешь);
//        дошёл до нуля — делаем
//  Все надписи — свои (title, text, yes, no, waitText — "{s}" заменится на оставшиеся секунды, cancel, done).
//
//    confirmAction(engine, {
//      level: 3, wait: 5, title: "DELETE WORLD", text: "WORLD 1 WILL BE GONE",
//      yes: "DELETE", no: "KEEP", waitText: "DELETING IN {s} S", cancel: "CANCEL",
//      onConfirm: () => deleteWorld(id), onCancel: () => {},
//    });
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { measureText } from "../ui/font.js";
import { translate } from "../ui/i18n.js";

const DANGER = [200, 60, 50];

// Подтвердить действие по уровню (1 — сразу, 2 — окно, 3 — окно и отсчёт). Вернёт сцену окна или null
export function confirmAction(engine, opts) {
  const level = Math.max(1, Math.min(3, Math.round(opts.level ?? 2)));
  if (level === 1) {
    opts.onConfirm?.();
    return null;
  }
  const scene = new ConfirmScene({ ...opts, level });
  engine.push(scene);
  return scene;
}

export class ConfirmScene extends Scene {
  constructor({ level = 2, wait = 3, title = "ARE YOU SURE?", text = "", yes = "YES", no = "NO", waitText = "IN {s} S", cancel = "CANCEL", danger = true, onConfirm = () => {}, onCancel = () => {} }) {
    super();
    this.transparent = true;
    this.showToasts = false;
    Object.assign(this, { level, wait, title, text, yes, no, waitText, cancel, danger, onConfirm, onCancel });
    this.left = null; // уровень 3: сколько секунд осталось (null — ещё не подтвердили)
  }

  get label() {
    return `подтверждение «${this.title}»`;
  }

  get counting() {
    return this.left !== null;
  }

  // Отсчёт идёт, только пока окно открыто (realtime — нужен каждый кадр)
  update(dt) {
    if (!this.counting) return;
    this.left -= dt;
    if (this.left <= 0) return this.finish(true);
    this.engine.redraw();
  }

  finish(ok) {
    if (this.done) return;
    this.done = true;
    if (this.engine.scene === this) this.engine.pop();
    (ok ? this.onConfirm : this.onCancel)?.();
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 200);
    const box = drawWindow(ui, { title: this.title, width: 620, height: 260, closeId: "no" });
    // текст — по словам в строки
    const words = translate(String(this.text)).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (measureText(next, 2) > box.w - 40 && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 4).forEach((l, i) => ui.text(l, box.cx, box.y + 14 + i * 26, 2, th.text, "center"));
    const by = box.y + box.h - 30;
    if (this.counting) {
      const s = Math.ceil(this.left);
      ui.text(translate(this.waitText).replace("{s}", String(s)), box.cx, by - 62, 3, DANGER, "center");
      // полоска отсчёта
      const w = box.w - 80, k = Math.max(0, this.left / this.wait);
      ui.rect(box.cx - w / 2, by - 30, w, 8, th.window.border, 200);
      ui.rect(box.cx - w / 2, by - 30, Math.round(w * k), 8, DANGER, 255);
      ui.button("cancel", this.cancel, box.cx, by + 4, 260, 48, 3, true);
      return;
    }
    ui.button("yes", this.yes, box.cx - 140, by, 240, 48, 3, false);
    if (this.danger) ui.frame(box.cx - 260, by - 24, 240, 48, DANGER, 3); // опасная кнопка — красная рамка
    ui.button("no", this.no, box.cx + 140, by, 240, 48, 3, true);
  }

  onButton(id) {
    if (id === "yes") {
      if (this.level >= 3) {
        this.left = Math.max(0.5, this.wait);
        this.realtime = true; // отсчёт — каждый кадр
        return this.engine.redraw();
      }
      return this.finish(true);
    }
    if (id === "no" || id === "cancel") return this.finish(false);
  }

  onPress(actions) {
    if (actions.includes("pause")) this.finish(false); // Esc — отмена (и во время отсчёта)
  }
}
