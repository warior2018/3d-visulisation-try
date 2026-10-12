// ============================================================
//  Портрет героя: круглая рамка, внутри — лицо (пиксельная картинка),
//  вокруг — круговая шкала (например, опыт), снизу справа — значок уровня.
//
//  Картинку даёт игра: строки одинаковой длины, каждый символ — цвет из palette
//  («.» — прозрачный, видно фон). Так лицо можно нарисовать прямо в коде.
//
//    drawPortrait(ui, { x, y, radius: 40, sprite, palette, ring: 0.35, level: 3 })
// ============================================================



export function drawPortrait(ui, {
  x, y, radius = 40, sprite, palette, background = [30, 36, 52],
  ring = null, ringColor = [240, 196, 80], ringBack = [40, 34, 22], level = null,
}) {
  const cx = x + radius;
  const cy = y + radius;
  const inner = radius - 7; // внутри кольца шкалы

  // Шкала вокруг: тёмная подложка и заполненная часть
  if (ring !== null) {
    ui.ring(cx, cy, inner + 1, radius, ringBack, 235);
    if (ring > 0) ui.ring(cx, cy, inner + 1, radius, ringColor, 255, Math.min(1, ring));
  }
  ui.ring(cx, cy, inner - 1, inner + 1, [12, 14, 20], 255); // тонкая тёмная обводка
  ui.circle(cx, cy, inner - 1, background, 245);

  // Лицо: картинка вписана в круг (что вылезает за круг — обрезаем)
  if (sprite) {
    const h = sprite.length;
    const w = sprite[0].length;
    const scale = Math.floor(((inner - 1) * 2 * 0.86) / Math.max(w, h)); // чуть меньше круга
    const ox = Math.round(cx - (w * scale) / 2);
    const oy = Math.round(cy - (h * scale) / 2) + 2;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const color = palette[sprite[row][col]];
        if (!color) continue;
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const X = ox + col * scale + px;
            const Y = oy + row * scale + py;
            if (Math.hypot(X + 0.5 - cx, Y + 0.5 - cy) <= inner - 1) ui.pixel(X, Y, color);
          }
        }
      }
    }
  }

  // Уровень — кружок внизу справа
  if (level !== null) {
    const bx = cx + radius * 0.68;
    const by = cy + radius * 0.68;
    ui.circle(bx, by, 13, [12, 14, 20], 255);
    ui.circle(bx, by, 11, ringColor, 255);
    ui.text(String(level), bx + 1, by - 6, 2, [20, 16, 8], "center");
  }
  return { cx, cy };
}

