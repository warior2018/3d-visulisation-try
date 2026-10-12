// ============================================================
//  Миникарта: вид мира сверху вокруг игрока — как карты в песочницах.
//  Ничего не рисуем заранее: карта каждый раз «сканирует» мир — для каждой
//  клетки вокруг игрока берёт верхний блок столбика и красит её его цветом
//  (чем выше блок, тем светлее). Пусто — тёмный пол.
//
//  Север (+Z) — вверх карты, +X — вправо. Игрок — стрелка в центре,
//  остальное — метки: { x, z, icon: "skull" | "dot" | "cross" | "pebble", color, label?, clamp? }.
//  clamp: true — если метка за краем карты, она прижимается к краю (видно, в какой она стороне).
// ============================================================

import { TEXT } from "./widgets.js";

// Значки меток, 5×5 пикселей ("#" — закрашено)
const ICONS = {
  skull: [".###.", "#####", "#.#.#", "#####", ".#.#."], // череп: глазницы и зубы
  dot: [".###.", "#####", "#####", "#####", ".###."],
  cross: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  pebble: ["##", "##"], // маленькая точка — для мелочи (камни на земле): не забивает карту
};

const FLOOR = [26, 30, 38];

export function drawMinimap(ui, { world, center, yaw, markers = [], x, y, size = 168, radius = 20 }) {
  const scale = size / (radius * 2); // пикселей на один блок
  const cx = x + size / 2;
  const cy = y + size / 2;

  // Рамка и пол
  ui.rect(x - 3, y - 3, size + 6, size + 6, [8, 10, 16], 220);
  ui.rect(x, y, size, size, FLOOR, 230);

  // Клетки: верхний блок каждого столбика в радиусе. Положение — с дробной частью
  // координат игрока, чтобы карта ехала плавно, а не прыгала по клетке.
  const x0 = Math.floor(center.x - radius) - 1;
  const z0 = Math.floor(center.z - radius) - 1;
  for (let bx = x0; bx <= x0 + radius * 2 + 2; bx++) {
    for (let bz = z0; bz <= z0 + radius * 2 + 2; bz++) {
      const b = world.topBlock(bx, bz);
      if (!b) continue;
      // Экранный квадрат клетки (+Z — вверх, поэтому по вертикали знак минус)
      const sx = cx + (bx - center.x) * scale;
      const sy = cy - (bz + 1 - center.z) * scale;
      const light = Math.min(1, 0.65 + b.y * 0.12); // выше — светлее
      clippedRect(ui, sx, sy, scale, scale, b.color.map((c) => Math.round(c * light)), x, y, size);
    }
  }

  // Метки (враги и т. п.) — только те, что попадают на карту
  for (const m of markers) {
    let sx = cx + (m.x - center.x) * scale;
    let sy = cy - (m.z - center.z) * scale;
    const inside = sx >= x + 7 && sx <= x + size - 7 && sy >= y + 7 && sy <= y + size - 7;
    if (!inside) {
      if (!m.clamp) continue;
      sx = Math.max(x + 7, Math.min(x + size - 7, sx));
      sy = Math.max(y + 7, Math.min(y + size - 7, sy));
    }
    drawIcon(ui, ICONS[m.icon] || ICONS.dot, sx, sy, m.color || [255, 255, 255]);
    if (m.label && inside) ui.text(m.label, sx, sy + 8, 1, m.color || TEXT, "center");
  }

  // Игрок: точка и «нос» в сторону взгляда
  const dx = Math.sin(yaw);
  const dy = -Math.cos(yaw);
  for (let t = 0; t <= 8; t++) ui.rect(cx + dx * t - 1, cy + dy * t - 1, 2, 2, [255, 255, 255]);
  ui.rect(cx - 3, cy - 3, 6, 6, [255, 255, 255]);
  ui.rect(cx - 2, cy - 2, 4, 4, [70, 160, 255]);

  ui.text("N", cx, y + 4, 2, TEXT, "center"); // где север
}

// Прямоугольник, обрезанный рамкой карты
function clippedRect(ui, rx, ry, w, h, color, x, y, size) {
  const x1 = Math.max(rx, x);
  const y1 = Math.max(ry, y);
  const x2 = Math.min(rx + w, x + size);
  const y2 = Math.min(ry + h, y + size);
  if (x2 > x1 && y2 > y1) ui.rect(x1, y1, x2 - x1, y2 - y1, color, 240);
}

// Значок N×N (обычно 5×5) крупностью 2 пикселя с тёмной обводкой — виден на любом фоне
function drawIcon(ui, rows, cx, cy, color) {
  const s = 2;
  const n = rows.length;
  const ox = Math.round(cx - n);
  const oy = Math.round(cy - n);
  ui.rect(ox - 1, oy - 1, n * s + 2, n * s + 2, [0, 0, 0], 180);
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) if (row[rx] === "#") ui.rect(ox + rx * s, oy + ry * s, s, s, color);
  });
}
