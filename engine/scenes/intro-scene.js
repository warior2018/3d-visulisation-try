// ============================================================
//  Заставка при запуске (как в Valheim / Dota 2): ролик, который можно пропустить — любая клавиша или клик.
//
//    engine.setScene(new IntroScene({ dir: "assets/intro", fps: 24, onDone: () => engine.setScene(menu()) }));
//
//  Ролик — кадры PNG в папке dir (0001.png, 0002.png...; читаются по одному — память не забивается).
//  Сделать кадры из видео (ffmpeg): ffmpeg -i intro.mp4 -vf "fps=24,scale=960:-1" assets/intro/%04d.png
//  Кадров нет — своя короткая заставка: название проявляется, светится и гаснет (title, subtitle, duration).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { Scene } from "../core/scene.js";
import { loadPNG } from "../ui/png.js";

export class IntroScene extends Scene {
  constructor({ dir = null, fps = 24, title = "VOID", subtitle = "", duration = 3.2, onDone = () => {} } = {}) {
    super();
    this.realtime = true;
    this.fps = fps;
    this.title = title;
    this.subtitle = subtitle;
    this.duration = duration;
    this.onDone = onDone;
    this.t = 0;
    this.done = false;
    this.frames = [];
    this.dir = dir;
    try {
      if (dir && fs.existsSync(dir)) this.frames = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
    } catch {}
    if (this.frames.length) this.duration = this.frames.length / fps;
    this.frameIndex = -1;
    this.frame = null;
  }

  get label() {
    return "заставка";
  }

  update(dt) {
    this.t += dt;
    if (this.t >= this.duration) return this.finish();
    if (this.frames.length) {
      const i = Math.min(this.frames.length - 1, Math.floor(this.t * this.fps));
      if (i !== this.frameIndex) {
        this.frameIndex = i;
        try {
          this.frame = loadPNG(path.join(this.dir, this.frames[i]));
        } catch (e) {
          this.engine.log(`заставка: кадр ${this.frames[i]} не прочитался (${e.message}) — пропускаем ролик`);
          return this.finish();
        }
      }
    }
    this.engine.redraw();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.onDone();
  }

  drawUI(ui) {
    ui.rect(0, 0, ui.width, ui.height, [0, 0, 0], 255);
    if (this.frame) {
      // вписать кадр в экран, сохранив пропорции (полосы по краям — чёрные)
      const k = Math.min(ui.width / this.frame.width, ui.height / this.frame.height);
      const w = this.frame.width * k, h = this.frame.height * k;
      ui.image(this.frame, (ui.width - w) / 2, (ui.height - h) / 2, w, h);
    } else {
      // своя заставка: проявление (0…30 %), держим, гаснем (последние 25 %)
      const p = this.t / this.duration;
      const fade = p < 0.3 ? p / 0.3 : p > 0.75 ? Math.max(0, (1 - p) / 0.25) : 1;
      const c = (v) => Math.round(v * fade);
      const scale = 14 + Math.round(4 * Math.min(1, p / 0.3));
      const y = ui.height / 2 - 60;
      ui.text(this.title, ui.width / 2, y, scale, [c(235), c(225), c(200)], "center");
      // «свечение» — полоса под названием растёт
      const w = Math.round(ui.width * 0.3 * Math.min(1, p / 0.5));
      ui.rect(ui.width / 2 - w / 2, y + scale * 9, w, 3, [c(232), c(196), c(120)], 255);
      if (this.subtitle) ui.text(this.subtitle, ui.width / 2, y + scale * 9 + 20, 2, [c(150), c(140), c(120)], "center");
    }
    ui.text("PRESS ANY KEY TO SKIP", ui.width - 20, ui.height - 30, 2, [90, 90, 90], "right");
  }

  onKey() {
    this.finish();
  }

  onMouseDown() {
    this.finish();
    return true;
  }
}
