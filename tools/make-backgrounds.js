// ============================================================
//  Пиксель-арт фонов главного меню: 192×108 PNG (растягиваются на весь экран «по пикселям»).
//  Запуск: node tools/make-backgrounds.js -> games/builder/assets/backgrounds/*.png
//  Свои фоны можно класть туда же (любой PNG, лучше 16:9) — меню подхватит все файлы папки.
// ============================================================

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../engine/ui/png.js";

const DIR = fileURLToPath(new URL("../games/builder/assets/backgrounds/", import.meta.url));
const W = 192, H = 108;

// случайное с зерном — каждый запуск те же картинки
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas() {
  const d = new Uint8Array(W * H * 4);
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  };
  const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); };
  const disc = (cx, cy, rx, ry, c) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i / rx) ** 2 + (j / ry) ** 2 <= 1) set(cx + i, cy + j, c); };
  const mixc = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  // градиент до строки to, ниже — нижний цвет (под горами не остаётся пустых, чёрных дыр)
  const sky = (top, bottom, to = H) => { for (let y = 0; y < H; y++) rect(0, y, W, 1, mixc(top, bottom, Math.min(1, y / to))); };
  const stars = (n, c, maxY = H * 0.6) => { for (let i = 0; i < n; i++) set(rnd() * W, rnd() * maxY, c); };
  // летающий остров: верх — трава, низ — конус камня
  const island = (cx, cy, r, grass, rock, dark) => {
    disc(cx, cy, r, Math.max(2, Math.round(r / 4)), grass);
    for (let k = 0; k < r * 1.3; k++) {
      const w = Math.round(r * (1 - k / (r * 1.3)));
      rect(cx - w, cy + 2 + k, w * 2, 1, k % 3 ? rock : dark);
    }
  };
  // горы-силуэт по шуму
  const ridge = (base, amp, c, step = 0.05) => {
    let h = 0;
    for (let x = 0; x < W; x++) {
      h = Math.sin(x * step) * amp * 0.6 + Math.sin(x * step * 2.7 + 1) * amp * 0.3 + Math.sin(x * step * 7.1) * amp * 0.1;
      rect(x, Math.round(base - h), 1, H, c);
    }
  };
  return { d, set, rect, disc, sky, stars, island, ridge, mixc };
}

const BACKGROUNDS = {
  // Ночь над летающими островами
  void(c) {
    c.sky([10, 12, 30], [40, 50, 95]);
    c.stars(120, [200, 210, 255]);
    c.disc(150, 22, 7, 7, [230, 230, 200]);
    c.disc(153, 20, 6, 6, [30, 36, 70]); // месяц
    c.island(60, 62, 22, [60, 120, 70], [80, 78, 90], [55, 52, 65]);
    c.island(140, 75, 12, [55, 110, 65], [75, 72, 85], [50, 48, 60]);
    c.island(24, 40, 7, [50, 100, 60], [70, 68, 80], [45, 44, 55]);
    c.rect(58, 50, 2, 10, [90, 60, 40]); c.disc(59, 48, 5, 3, [40, 100, 50]); // дерево
  },
  // Закат над горами
  sunset(c) {
    c.sky([60, 40, 90], [250, 150, 90], 80);
    c.disc(96, 70, 16, 16, [255, 215, 140]);
    c.ridge(85, 14, [70, 45, 70], 0.04);
    c.ridge(95, 9, [40, 28, 45], 0.07);
    c.rect(0, 100, W, 8, [25, 18, 30]);
  },
  // Пещера с кристаллами
  cave(c) {
    c.sky([14, 12, 18], [30, 26, 36]);
    for (let x = 0; x < W; x += 6) { const h = 6 + rnd() * 18; for (let k = 0; k < h; k++) c.rect(x + k / 4, k, Math.max(1, 6 - k / 3), 1, [45, 40, 52]); }
    c.ridge(92, 6, [40, 36, 48], 0.12);
    for (let i = 0; i < 9; i++) {
      const x = 15 + rnd() * 160, y = 80 + rnd() * 15, h = 6 + rnd() * 10, col = [rnd() > 0.5 ? 140 : 90, 120 + rnd() * 80, 255];
      for (let k = 0; k < h; k++) c.rect(x - (h - k) / 4, y - k, Math.max(1, (h - k) / 2), 1, col);
    }
  },
  // Лес днём
  forest(c) {
    c.sky([110, 170, 230], [200, 230, 250], 70);
    c.ridge(70, 8, [120, 160, 130], 0.05);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = 72 + rnd() * 20, h = 14 + rnd() * 14;
      c.rect(x, y - h * 0.3, 2, h * 0.3 + 4, [90, 60, 40]);
      for (let k = 0; k < h; k++) c.rect(x + 1 - (h - k) / 3, y - h * 0.3 - k, (h - k) / 1.5, 1, k % 4 ? [45, 110, 55] : [35, 90, 45]);
    }
    c.rect(0, 92, W, 16, [70, 130, 60]);
  },
  // Кладбище скелетов (луна и кресты)
  graveyard(c) {
    c.sky([20, 24, 40], [70, 75, 95]);
    c.stars(60, [180, 190, 220]);
    c.disc(40, 24, 10, 10, [220, 220, 200]);
    c.ridge(88, 4, [35, 38, 45], 0.1);
    for (let i = 0; i < 12; i++) {
      const x = 10 + i * 15 + rnd() * 6, y = 86 + rnd() * 8;
      c.rect(x, y - 10, 2, 10, [150, 150, 160]); c.rect(x - 3, y - 7, 8, 2, [150, 150, 160]);
    }
    c.rect(0, 98, W, 10, [25, 28, 34]);
  },
};

fs.mkdirSync(DIR, { recursive: true });
for (const [name, draw] of Object.entries(BACKGROUNDS)) {
  const c = canvas();
  draw(c);
  fs.writeFileSync(DIR + name + ".png", encodePNG(W, H, Buffer.from(c.d)));
  console.log("фон:", name);
}
