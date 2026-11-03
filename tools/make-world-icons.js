// ============================================================
//  Пиксель-арт значков миров (круглые картинки в меню «ИГРАТЬ»): 32×32 PNG.
//  Запуск: node tools/make-world-icons.js -> games/builder/assets/world-icons/*.png
//  Свои картинки можно класть туда же (любой PNG, лучше квадратный) — меню подхватит все файлы папки.
// ============================================================

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../engine/ui/png.js";

const DIR = fileURLToPath(new URL("../games/builder/assets/world-icons/", import.meta.url));
const N = 32;

function canvas() {
  const d = new Uint8Array(N * N * 4);
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  };
  const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); };
  const disc = (cx, cy, rx, ry, c) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i / rx) ** 2 + (j / ry) ** 2 <= 1) set(cx + i, cy + j, c); };
  const sky = (top, bottom) => { for (let y = 0; y < N; y++) rect(0, y, N, 1, top.map((v, k) => Math.round(v + (bottom[k] - v) * (y / N)))); };
  return { d, set, rect, disc, sky };
}

const ICONS = {
  // Остров с пальмой посреди моря
  island(c) {
    c.sky([70, 140, 210], [150, 205, 240]);
    c.rect(0, 20, N, 12, [40, 100, 190]);
    for (let x = 0; x < N; x += 4) c.rect(x + ((x / 4) % 2) * 2, 22 + ((x / 4) % 3), 2, 1, [120, 180, 240]); // блики волн
    c.disc(16, 22, 10, 4, [230, 205, 130]); //   песок
    c.disc(16, 21, 7, 2, [210, 180, 110]);
    c.rect(17, 9, 2, 12, [120, 80, 45]); //      ствол
    for (const [dx, dy] of [[-6, 0], [-4, -2], [4, -2], [6, 0], [0, -3]]) c.disc(18 + dx, 9 + dy, 3, 1, [60, 160, 70]); // листья
    c.disc(18, 9, 2, 2, [40, 130, 55]);
  },
  // Гора со снежной шапкой
  mountain(c) {
    c.sky([110, 150, 210], [200, 220, 240]);
    for (let y = 6; y < N; y++) { const half = (y - 6) * 0.75; c.rect(16 - half, y, half * 2, 1, [120, 120, 130]); }
    for (let y = 14; y < N; y++) { const half = (y - 14) * 0.9; c.rect(26 - half, y, half * 2, 1, [95, 95, 108]); }
    for (let y = 6; y < 12; y++) { const half = (y - 6) * 0.75; c.rect(16 - half, y, half * 2, 1, [240, 245, 250]); }
    c.rect(0, 28, N, 4, [70, 130, 60]);
  },
  // Большое дерево на холме
  tree(c) {
    c.sky([120, 190, 230], [210, 235, 245]);
    c.disc(16, 31, 18, 6, [80, 160, 70]);
    c.rect(14, 16, 4, 12, [110, 70, 40]);
    c.disc(16, 12, 9, 7, [50, 140, 60]);
    c.disc(11, 14, 5, 4, [60, 155, 65]);
    c.disc(21, 14, 5, 4, [45, 130, 55]);
    for (const [x, y] of [[12, 9], [19, 8], [16, 14], [22, 12]]) c.set(x, y, [200, 60, 60]); // яблоки
  },
  // Озеро в лесу
  lake(c) {
    c.sky([90, 160, 220], [180, 215, 240]);
    c.rect(0, 16, N, 16, [75, 150, 65]);
    c.disc(16, 23, 12, 5, [40, 110, 200]);
    c.disc(13, 22, 5, 1, [140, 200, 245]);
    for (const x of [3, 8, 25, 29]) { c.rect(x, 12, 1, 6, [100, 65, 35]); c.disc(x, 11, 2, 3, [35, 110, 50]); }
  },
  // Монстрик: зелёный слизень с глазом
  monster(c) {
    c.sky([60, 40, 90], [130, 80, 140]);
    c.rect(0, 26, N, 6, [70, 50, 60]);
    c.disc(16, 21, 11, 8, [100, 200, 80]);
    c.disc(16, 24, 11, 4, [80, 170, 60]);
    c.disc(16, 18, 4, 4, [250, 250, 240]);
    c.disc(17, 18, 2, 2, [30, 20, 30]);
    for (const x of [9, 13, 19, 23]) c.rect(x, 26, 2, 2, [240, 240, 230]); // зубы
  },
};

fs.mkdirSync(DIR, { recursive: true });
for (const [name, draw] of Object.entries(ICONS)) {
  const c = canvas();
  draw(c);
  fs.writeFileSync(DIR + name + ".png", encodePNG(N, N, c.d));
  console.log("world-icons/" + name + ".png");
}
