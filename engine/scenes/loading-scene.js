// ============================================================
//  Экран загрузки: тёмный фон и «LOADING…» — пока следующая сцена тяжело создаётся (новый мир: рельеф, постройки;
//  загрузка мира с диска). Сначала показывает себя (пара кадров — чтобы экран успел нарисоваться), потом зовёт
//  load() — создать и поставить настоящую сцену (оно и подвисает, но игрок видит «LOADING», а не застывший кадр).
//
//    engine.setScene(new LoadingScene({ text: "LOADING WORLD", load: () => engine.setScene(new GameScene(game)) }));
// ============================================================

import { Scene } from "../core/scene.js";

export class LoadingScene extends Scene {
  constructor({ text = "LOADING", hint = "", load }) {
    super();
    this.text = text;
    this.hint = hint;
    this.load = load;
    this.frames = 0;
    this.done = false;
    this.realtime = true; // кадр за кадром: иначе движок не зовёт update (сцена «спит», пока ничего не нажали)
  }

  enter() {
    this.engine.redraw();
  }

  update() {
    this.engine.redraw();
    // 2 кадра — экран загрузки точно нарисован; дальше — тяжёлая работа (один раз)
    if (++this.frames < 3 || this.done) return;
    this.done = true;
    this.load?.();
  }

  drawUI(ui) {
    const th = ui.theme;
    ui.rect(0, 0, ui.width, ui.height, [10, 10, 14], 255);
    const dots = ".".repeat(1 + (this.frames % 3));
    ui.text(this.text + dots, ui.width / 2, ui.height / 2 - 10, 4, th?.text || [235, 235, 240], "center");
    if (this.hint) ui.text(this.hint, ui.width / 2, ui.height / 2 + 40, 2, th?.muted || [150, 150, 160], "center");
  }
}
