// ============================================================
//  Окно интерфейса: панель с рамкой, тенью и полосой заголовка.
//  Все экраны движка (меню, пауза, настройки, инвентарь, таланты) — это окна,
//  и игра может делать свои. Вид окна задаёт тема (engine/ui/theme.js).
//
//    const box = drawWindow(ui, { title: "ИНВЕНТАРЬ", width: 600, height: 400 });
//    ui.text("...", box.x, box.y, 2, ui.theme.text); // рисуем внутри: box — область содержимого
//
//  Без x/y окно встаёт по центру экрана. Больше экрана окно не бывает: ширина и
//  высота ужимаются, чтобы влезть (с полями 12 пикселей).
//  closeId — нарисовать в заголовке кнопку «X» с таким id.
// ============================================================

export function drawWindow(ui, { title = null, width, height, x, y, closeId = null }) {
  const t = ui.theme.window;
  const w = Math.min(width, ui.width - 24);
  const h = Math.min(height, ui.height - 24);
  const wx = Math.round(x ?? (ui.width - w) / 2);
  const wy = Math.round(y ?? (ui.height - h) / 2);

  if (t.shadow) ui.rect(wx + 6, wy + 8, w, h, [0, 0, 0], t.shadow);
  ui.rect(wx, wy, w, h, t.fill, t.alpha);

  let top = wy;
  if (title !== null) {
    ui.rect(wx, wy, w, t.titleHeight, t.titleBar, 255);
    ui.text(title, wx + w / 2, wy + (t.titleHeight - 7 * t.titleScale) / 2, t.titleScale, t.titleText, "center");
    ui.rect(wx, wy + t.titleHeight, w, t.borderWidth, t.border, 255);
    top = wy + t.titleHeight;
  }
  ui.frame(wx, wy, w, h, t.border, t.borderWidth);
  if (closeId) {
    const s = t.titleHeight - 12;
    ui.button(closeId, "X", wx + w - s / 2 - 6, wy + t.titleHeight / 2, s, s, 2);
  }

  // Область содержимого — внутри отступов
  const p = t.padding;
  return { x: wx + p, y: top + p, w: w - p * 2, h: h - (top - wy) - p * 2, cx: wx + w / 2, window: { x: wx, y: wy, w, h } };
}
