// ============================================================
//  Отчёт о падении: ошибка в кадре — не «молча в журнал», а окно поверх игры.
//  В окне — сама ошибка, где она (первые строки стека) и конец журнала. Кнопки:
//    COPY     — весь отчёт в буфер обмена (вставил в чат — сразу видно причину)
//    CONTINUE — закрыть окно и играть дальше (та же ошибка в этот раз окно больше не откроет)
//    MENU     — engine.onCrashMenu?.() (игра решает: сохраниться и выйти в главное меню)
//    QUIT     — закрыть игру (сцены сохраняются через onQuit)
//  Отчёт ещё и пишется в файл crashes/crash-<время>.txt рядом с настройками.
//
//    engine.crash(error)   — показать (движок зовёт сам из frame())
// ============================================================

import { Scene } from "../core/scene.js";
import { drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";
import { GLYPH_W } from "../ui/font.js";

const RED = [220, 80, 70];

// Текст отчёта: ошибка, стек, конец журнала, версия
export function crashReport(error, { log = [], version = "", scene = "" } = {}) {
  const stack = String(error?.stack || error);
  return [
    `Void crash report, ${new Date().toISOString()}`,
    version ? `version: ${version}` : null,
    scene ? `scene: ${scene}` : null,
    "",
    stack,
    "",
    "--- log tail ---",
    ...log,
  ].filter((l) => l !== null).join("\n");
}

// Разбить строку на куски по ширине (шрифт моноширинный)
function wrap(text, width, scale) {
  const per = Math.max(8, Math.floor((width + scale) / ((GLYPH_W + 1) * scale)));
  const out = [];
  for (const raw of String(text).split("\n")) {
    let s = raw.replace(/\t/g, "  ");
    if (!s) { out.push(""); continue; }
    while (s.length > per) { out.push(s.slice(0, per)); s = "  " + s.slice(per); }
    out.push(s);
  }
  return out;
}

export class CrashScene extends Scene {
  constructor({ error, report, file = null }) {
    super();
    this.transparent = true;
    this.showToasts = true;
    this.error = error;
    this.report = report;
    this.file = file;
    this.copied = false;
  }

  get label() {
    return "отчёт о падении";
  }

  drawUI(ui) {
    const th = ui.theme;
    drawDim(ui, 210);
    const box = drawWindow(ui, { title: "SOMETHING BROKE", width: 1100, height: 720 });
    const msg = String(this.error?.message || this.error).toUpperCase();
    let y = box.y + 6;
    for (const l of wrap(msg, box.w, 3).slice(0, 3)) { ui.text(l, box.x, y, 3, RED); y += 28; }
    y += 6;
    // где: первые строки стека (пути — короче)
    const stack = String(this.error?.stack || "").split("\n").slice(1, 6).map((l) => l.trim().replace(/\(?file:\/\/.*\/(engine|games|tools|_shots)\//, "$1/").replace(/\)$/, ""));
    for (const l of stack.flatMap((s) => wrap(s.toUpperCase(), box.w, 2)).slice(0, 7)) { ui.text(l, box.x, y, 2, th.text); y += 18; }
    y += 10;
    ui.text("LOG:", box.x, y, 2, th.muted); y += 20;
    const tail = this.report.split("--- log tail ---\n")[1] || "";
    const lines = tail.split("\n").slice(-200).flatMap((s) => wrap(s.toUpperCase(), box.w, 2));
    const fit = Math.max(0, Math.floor((box.y + box.h - 76 - y) / 18));
    for (const l of lines.slice(-fit)) { ui.text(l, box.x, y, 2, th.muted, "left", 200); y += 18; }
    const by = box.y + box.h - 24;
    const bw = Math.min(240, (box.w - 60) / 4);
    const xs = [-1.5, -0.5, 0.5, 1.5].map((k) => box.cx + k * (bw + 16));
    ui.button("copy", this.copied ? "COPIED" : "COPY", xs[0], by, bw, 44, 3, true);
    ui.button("continue", "CONTINUE", xs[1], by, bw, 44, 3);
    ui.button("menu", "MENU", xs[2], by, bw, 44, 3);
    ui.button("quit", "QUIT", xs[3], by, bw, 44, 3);
    if (this.file) ui.text(("SAVED: crashes/" + this.file.split(/[\\/]/).pop()).toUpperCase(), box.cx, box.y + box.h - 64, 2, th.muted, "center", 180);
  }

  onButton(id) {
    const e = this.engine;
    if (id === "copy") {
      this.copied = e.copyText(this.report);
      if (!this.copied) e.toast("CLIPBOARD UNAVAILABLE - SEE THE CRASH FILE", 2500);
      return e.redraw();
    }
    if (id === "continue") return e.pop();
    if (id === "menu") {
      e.pop();
      return e.onCrashMenu ? e.onCrashMenu() : null;
    }
    if (id === "quit") return e.quit();
  }

  onPress(actions) {
    if (actions.includes("pause")) this.engine.pop();
  }
}
