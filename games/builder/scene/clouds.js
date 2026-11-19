// ============================================================
//  Облака второго слоя (CLOUDS): белые полупрозрачные параллелепипеды на высоте y, размер size × height × size
//  (случайно), всегда плывут с севера на юг (+z). Бесплотные: сквозь них ходят, стреляют, летают. Камера внутри
//  облака — обзор CLOUDS.inside блоков (рендерер: fogLimit) и белая пелена. У каждого игрока свои (не по сети).
//  Рисует рендерер (render → boxes) тем же конвейером, что и воду (engine/graphics/water-mesh.js).
// ============================================================

import { CLOUDS } from "../config.js";
import { FLOATS_PER_WATER } from "../../../engine/index.js";

export class CloudsPart {
  // Облака над миром: сколько — по площади (CLOUDS.density), область — остров + запас
  initClouds() {
    const C = CLOUDS, L = (this.worldgen?.terrain?.radius || 75) + C.margin;
    this.cloudArea = L;
    const n = Math.max(4, Math.round((2 * L) ** 2 * C.density));
    this.clouds = Array.from({ length: n }, () => this.newCloud(L, true));
  }

  newCloud(L, anywhere = false) {
    const C = CLOUDS, r = ([a, b]) => a + Math.random() * (b - a);
    const w = r(C.size), d = r(C.size), h = Math.min(C.height[1], r(C.height));
    return { x: r([-L, L]), z: anywhere ? r([-L, L]) : -L - d, y: r(C.y), w, d, h, speed: r(C.speed) };
  }

  // Каждый кадр: плывут на юг; ушли за край — новое с севера. Камера внутри — обзор меньше
  updateClouds(camera) {
    if (!this.clouds) this.initClouds();
    const now = performance.now() / 1000, dt = Math.min(0.1, now - (this.cloudT ?? now));
    this.cloudT = now;
    const L = this.cloudArea;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.z += c.speed * dt;
      if (c.z - c.d / 2 > L) this.clouds[i] = this.newCloud(L);
    }
    const p = camera?.position;
    this.inCloud = !!p && this.clouds.some((c) => Math.abs(p.x - c.x) < c.w / 2 && Math.abs(p.z - c.z) < c.d / 2 && p.y > c.y && p.y < c.y + c.h);
    const r = this.engine.renderer;
    if (r) r.fogLimit = this.inCloud ? CLOUDS.inside : null;
  }

  // Коробки облаков для рендерера (render → boxes)
  cloudBoxes() {
    const list = this.clouds || [];
    const need = list.length * FLOATS_PER_WATER;
    if (!this.cloudData || this.cloudData.length < need) this.cloudData = new Float32Array(Math.max(64, need));
    const D = this.cloudData, col = CLOUDS.color;
    list.forEach((c, n) => {
      const i = n * FLOATS_PER_WATER;
      D[i] = c.x; D[i + 1] = c.y + c.h / 2; D[i + 2] = c.z;
      D[i + 3] = c.w; D[i + 4] = c.h; D[i + 5] = c.d;
      D[i + 6] = col[0] / 255; D[i + 7] = col[1] / 255; D[i + 8] = col[2] / 255; D[i + 9] = 2 + CLOUDS.alpha; D[i + 10] = 63; // +2 — не таять вдали (water-mesh.js)
    });
    return { data: D, count: list.length };
  }

  // Внутри облака — белая пелена поверх экрана
  drawCloudVeil(ui) {
    if (this.inCloud) ui.rect(0, 0, ui.width, ui.height, CLOUDS.color, CLOUDS.veil);
  }
}
