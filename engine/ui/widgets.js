// ============================================================
//  Готовые кусочки интерфейса: фон, затемнение, всплывающая надпись,
//  прицел, полоска здоровья, сетка инвентаря. Из них игры собирают свои экраны.
// ============================================================

export const TEXT = [235, 240, 250]; //  основной цвет текста
import { measureText } from "./font.js";

export const MUTED = [140, 155, 180]; // приглушённый (подсказки)
export const WARN = [240, 200, 110]; //  жёлтый (внимание)
export const DIM = [10, 14, 22]; //      тёмная подложка

// Непрозрачный фон для экранов без мира: сверху светлее, книзу темнее (цвета — из темы)
export function drawBackground(ui) {
  const h = ui.height;
  const { top, bottom } = ui.theme.backdrop;
  for (let y = 0; y < h; y += 4) {
    const t = y / h;
    ui.rect(0, y, ui.width, 4, top.map((c, i) => Math.round(c + (bottom[i] - c) * t)));
  }
}

// Полупрозрачное затемнение поверх мира (пауза, инвентарь)
export function drawDim(ui, alpha = ui.theme.overlay.alpha) {
  ui.rect(0, 0, ui.width, ui.height, ui.theme.overlay.color, alpha);
}

// Всплывающая надпись сверху по центру
export function drawToast(ui, text) {
  const w = text.length * 18 + 40;
  const t = ui.theme.window;
  ui.rect(ui.width / 2 - w / 2, 18, w, 42, t.fill, 225);
  ui.frame(ui.width / 2 - w / 2, 18, w, 42, t.border, 2);
  ui.text(text, ui.width / 2, 29, 3, ui.theme.text, "center");
}

// Прицел — маленький крестик в центре
export function drawCrosshair(ui) {
  const cx = Math.round(ui.width / 2);
  const cy = Math.round(ui.height / 2);
  ui.rect(cx - 7, cy - 1, 14, 2, [255, 255, 255], 220);
  ui.rect(cx - 1, cy - 7, 2, 14, [255, 255, 255], 220);
}

// Полоска здоровья: красная часть — сколько осталось
export function drawBar(ui, x, y, w, h, value, max, color = [200, 50, 50]) {
  ui.rect(x, y, w, h, [20, 10, 12], 200);
  ui.rect(x + 2, y + 2, Math.round((w - 4) * Math.max(0, value / max)), h - 4, color, 235);
}

// Сетка инвентаря. itemInfo(id) -> { name, color } — что за предмет, решает игра.
// x, y — левый верхний угол (по умолчанию — по центру экрана, не выше top)
export function inventoryGridSize(inventory, { cols = 5, size = 100, gap = 10 } = {}) {
  const rows = Math.ceil(inventory.size / cols);
  return { w: cols * size + (cols - 1) * gap, h: rows * size + (rows - 1) * gap };
}

// Сетка инвентаря. Вернёт прямоугольники ячеек [{ i, x, y, w, h }] — чтобы понять, какая под мышью.
//   hover — номер ячейки под мышью (подсветить), picked — ячейка, из которой взяли предмет (тусклая),
//   label(i) — подпись в углу ячейки (например, клавиша хотбара), buttonId(i) — id кнопки ячейки (клик).
//   itemInfo(id) → { name, color, drawIcon?(ui, x, y, size) } — свой значок предмета, если есть.
export function drawInventoryGrid(ui, inventory, itemInfo, { cols = 5, size = 100, gap = 10, top = 0, x, y, hover = -1, picked = -1, label = null, buttonId = null } = {}) {
  const rows = Math.ceil(inventory.size / cols);
  const x0 = x ?? ui.width / 2 - (cols * size + (cols - 1) * gap) / 2;
  const y0 = y ?? Math.max(top, ui.height / 2 - (rows * (size + gap)) / 2);
  const rects = [];
  inventory.slots.forEach((slot, i) => {
    const x = x0 + (i % cols) * (size + gap);
    const y = y0 + Math.floor(i / cols) * (size + gap);
    rects.push({ i, x, y, w: size, h: size });
    const hot = i === hover;
    ui.rect(x, y, size, size, hot ? [44, 56, 82] : [30, 38, 56], 220);
    ui.frame(x, y, size, size, hot ? [200, 210, 230] : [70, 85, 115], hot ? 3 : 2);
    if (buttonId) ui.buttons.push({ id: buttonId(i), x, y, w: size, h: size });
    const tag = label?.(i);
    if (tag) ui.text(tag, x + 6, y + 6, 2, MUTED);
    if (!slot || i === picked) return;
    drawItem(ui, itemInfo, slot, x, y, size);
  });
  return rects;
}

// Предмет в ячейке: значок (свой или цветной квадрат), название, количество
export function drawItem(ui, itemInfo, slot, x, y, size, { name = true } = {}) {
  const info = itemInfo(slot.item);
  const icon = Math.round(size * 0.48);
  const ix = x + size / 2 - icon / 2;
  const iy = y + size * 0.14;
  if (info.drawIcon) info.drawIcon(ui, ix, iy, icon);
  else ui.rect(ix, iy, icon, icon, info.color || [255, 0, 255], 255); // неизвестный — ярко-розовый
  // Название: не влезает крупно — пишем мелко
  if (name) {
    const big = measureText(info.name, 2) <= size - 8;
    ui.text(info.name, x + size / 2, y + size * (big ? 0.68 : 0.72), big ? 2 : 1, TEXT, "center");
  }
  if (slot.count > 1) ui.text(String(slot.count), x + size - 8, y + 6, 2, [255, 255, 255], "right");
}

// Панель способностей: ячейки в ряд внизу по центру. В ячейке — значок способности
// (его рисует сама способность), сверху слева — клавиша. Пустые ячейки — тусклые.
//   keyLabel(i) — подпись клавиши ячейки i
export function drawAbilityBar(ui, bar, { keyLabel, ctx, size = 56, gap = 8, bottom = 18 } = {}) {
  const total = bar.size * size + (bar.size - 1) * gap;
  let x = Math.round(ui.width / 2 - total / 2);
  const y = ui.height - size - bottom;
  bar.slots.forEach((ability, i) => {
    const active = i === bar.index;
    const filled = ability && !ability.empty; // «пустая» способность (рука) — ячейка как пустая
    ui.rect(x, y, size, size, active ? [52, 66, 96] : [24, 30, 44], filled || active ? 215 : 120);
    ui.frame(x, y, size, size, active ? [255, 255, 255] : [70, 85, 115], active ? 3 : 2);
    if (filled) ability.drawIcon(ui, x, y, size, ctx);
    const key = keyLabel(i);
    if (key && key !== "-") ui.text(key, x + 5, y + 5, 2, filled ? [255, 255, 255] : MUTED);
    x += size + gap;
  });
  return { x: Math.round(ui.width / 2 - total / 2), y, width: total }; // где нарисовали (чтобы поставить что-то над)
}

// Красная рамка по краям экрана (получили урон). strength — от 0 до 1
export function drawVignette(ui, strength, color = [200, 20, 20]) {
  if (strength <= 0) return;
  const w = ui.width;
  const h = ui.height;
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    // Полосы по 10 пикселей от края внутрь: у края ярче, к центру прозрачнее
    const a = Math.round(strength * 120 * (1 - i / bands));
    const o = i * 10;
    ui.rect(o, o, w - o * 2, 10, color, a);
    ui.rect(o, h - o - 10, w - o * 2, 10, color, a);
    ui.rect(o, o + 10, 10, h - o * 2 - 20, color, a);
    ui.rect(w - o - 10, o + 10, 10, h - o * 2 - 20, color, a);
  }
}

// Кружки-значки с числами в ряд (накопленные бонусы и т. п.):
//   badges: [{ value: "+20", color: [r, g, b], label: "HP" }] — label (необязательно) — мелко под кружком.
// x, y — левый край и центр по высоте; вернёт ширину ряда.
export function drawBadges(ui, badges, { x, y, r = 21, gap = 10 } = {}) {
  let cx = x + r;
  for (const b of badges) {
    ui.circle(cx, y, r, [16, 18, 24], 225); //           фон
    ui.ring(cx, y, r - 3, r, b.color, 255); //          цветной ободок
    const text = String(b.value);
    const scale = measureText(text, 2) <= r * 2 - 4 ? 2 : 1; // длинное число — мельче
    ui.text(text, cx, y - (scale === 2 ? 7 : 3), scale, [255, 255, 255], "center");
    if (b.label) ui.text(b.label, cx, y + r + 3, 1, b.color, "center");
    cx += r * 2 + gap;
  }
  return badges.length ? badges.length * (r * 2 + gap) - gap : 0;
}

// Баффы и дебаффы сущности (статусы, engine/combat/status.js) — квадратные значки в ряд от (x, y):
// зелёная рамка — бафф, красная — дебафф; внутри — icon (или первые буквы имени), под значком —
// сколько секунд осталось или зарядов. progress(status) → 0…1 — необязательная полоска «копится» под значком.
export function drawStatuses(ui, statuses, { x, y, size = 40, gap = 8 } = {}) {
  let cx = x;
  for (const s of statuses) {
    const border = s.color || (s.positive ? [110, 220, 120] : [235, 80, 70]);
    ui.rect(cx, y, size, size, [16, 18, 24], 225);
    ui.frame(cx, y, size, size, border, 3);
    const text = s.icon || (s.name || s.id || "?").slice(0, 2);
    ui.text(text, cx + size / 2, y + size / 2 - 7, measureText(text, 2) <= size - 6 ? 2 : 1, [255, 255, 255], "center");
    const left = s.charges > 0 ? `X${s.charges}` : Number.isFinite(s.left) ? `${Math.ceil(s.left)}С` : "";
    if (left) ui.text(left, cx + size / 2, y + size + 3, 1, border, "center");
    cx += size + gap;
  }
  return statuses.length ? statuses.length * (size + gap) - gap : 0;
}
