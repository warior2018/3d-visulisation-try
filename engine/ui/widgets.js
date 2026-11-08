// ============================================================
//  Готовые кусочки интерфейса: фон, затемнение, всплывающая надпись,
//  прицел, полоска здоровья, сетка инвентаря. Из них игры собирают свои экраны.
// ============================================================

export const TEXT = [235, 240, 250]; //  основной цвет текста
import { measureText } from "./font.js";
import { translate } from "./i18n.js";

export const MUTED = [140, 155, 180]; // приглушённый (подсказки)
export const WARN = [240, 200, 110]; //  жёлтый (внимание)
export const DIM = [10, 14, 22]; //      тёмная подложка

// Фоны-картинки: игра даёт setBackgroundSource((page) => картинка или null) — для страницы page ("play",
// "skins", "settings"...) своя картинка (engine/ui/png.js). Нет — градиент темы, как раньше
let bgSource = null;
export function setBackgroundSource(fn) {
  bgSource = fn;
}
// Растянутая на экран (с обрезкой по краям, «по пикселям») и чуть затемнённая картинка — считаем один раз
// на размер экрана, дальше просто копируем строки (меню перерисовывается каждый кадр)
const cover = { img: null, w: 0, h: 0, px: null };
function drawCover(ui, img, dim = 0.42) {
  const { fb } = ui;
  if (cover.img !== img || cover.w !== fb.width || cover.h !== fb.height) {
    const k = Math.max(fb.width / img.width, fb.height / img.height);
    const w = img.width * k, h = img.height * k;
    fb.pixels.fill(0xff000000);
    ui.image(img, (fb.width - w) / 2, (fb.height - h) / 2, w, h, { dim });
    Object.assign(cover, { img, w: fb.width, h: fb.height, px: fb.pixels.slice() });
  } else fb.pixels.set(cover.px);
  ui.dirty = true;
}

// Непрозрачный фон для экранов без мира: картинка страницы page (setBackgroundSource) или градиент темы
export function drawBackground(ui, page = "default") {
  const img = bgSource?.(page);
  if (img) return drawCover(ui, img);
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
  const w = Math.min(ui.width - 20, measureText(text, 3) + 40); // ширина — по переводу, не по исходному тексту
  const t = ui.theme.window;
  ui.rect(ui.width / 2 - w / 2, 18, w, 42, t.fill, 225);
  ui.frame(ui.width / 2 - w / 2, 18, w, 42, t.border, 2);
  ui.text(text, ui.width / 2, 29, 3, ui.theme.text, "center", 255, w - 20);
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
// indices — показать только эти ячейки (по порядку; например, ячейки 1 и 2 хотбара отдельной колонкой)
export function inventoryGridSize(inventory, { cols = 5, size = 100, gap = 10, indices = null } = {}) {
  const rows = Math.ceil((indices?.length ?? inventory.size) / cols);
  return { w: cols * size + (cols - 1) * gap, h: rows * size + (rows - 1) * gap };
}

// Сетка инвентаря. Вернёт прямоугольники ячеек [{ i, x, y, w, h }] — чтобы понять, какая под мышью.
//   hover — номер ячейки под мышью (подсветить), picked — ячейка, из которой взяли предмет (тусклая),
//   label(i) — подпись в углу ячейки (например, клавиша хотбара), buttonId(i) — id кнопки ячейки (клик).
//   itemInfo(id) → { name, color, drawIcon?(ui, x, y, size) } — свой значок предмета, если есть.
//   indices — показать только эти ячейки (по порядку): в прямоугольниках i — настоящий номер ячейки
export function drawInventoryGrid(ui, inventory, itemInfo, { cols = 5, size = 100, gap = 10, top = 0, x, y, hover = -1, picked = -1, label = null, buttonId = null, indices = null } = {}) {
  const list = indices ?? inventory.slots.map((_, i) => i);
  const rows = Math.ceil(list.length / cols);
  const x0 = x ?? ui.width / 2 - (cols * size + (cols - 1) * gap) / 2;
  const y0 = y ?? Math.max(top, ui.height / 2 - (rows * (size + gap)) / 2);
  const rects = [];
  list.forEach((i, n) => {
    const slot = inventory.slots[i];
    const x = x0 + (n % cols) * (size + gap);
    const y = y0 + Math.floor(n / cols) * (size + gap);
    rects.push({ i, x, y, w: size, h: size });
    const hot = i === hover;
    ui.rect(x, y, size, size, hot ? [44, 56, 82] : [30, 38, 56], 220);
    ui.frame(x, y, size, size, hot ? [200, 210, 230] : [70, 85, 115], hot ? 3 : 2);
    if (buttonId) ui.buttons.push({ id: buttonId(i), x, y, w: size, h: size });
    const tag = label?.(i);
    if (tag) ui.text(tag, x + 6, y + 6, 2, MUTED, "left", 255, size - 10); // подпись пустой ячейки — внутри неё
    if (!slot || i === picked) return;
    drawItem(ui, itemInfo, slot, x, y, size);
  });
  return rects;
}

// Предмет в ячейке: значок (свой или цветной квадрат), название, количество
export function drawItem(ui, itemInfo, slot, x, y, size, { name = true } = {}) {
  const info = itemInfo(slot.item);
  // Цвет экземпляра (редкость: data.color) — рамка по краю ячейки
  if (slot.data?.color) ui.frame(x + 2, y + 2, size - 4, size - 4, slot.data.color, 3);
  const icon = Math.round(size * 0.48);
  const ix = x + size / 2 - icon / 2;
  const iy = y + size * 0.14;
  if (info.drawIcon) info.drawIcon(ui, ix, iy, icon);
  else ui.rect(ix, iy, icon, icon, info.color || [255, 0, 255], 255); // неизвестный — ярко-розовый
  // Название: не влезает крупно — пишем мелко
  if (name) {
    const big = measureText(info.name, 2) <= size - 8;
    ui.text(info.name, x + size / 2, y + size * (big ? 0.68 : 0.72), big ? 2 : 1, TEXT, "center", 255, size - 6);
  }
  if (slot.count > 1) ui.text(String(slot.count), x + size - 8, y + 6, 2, [255, 255, 255], "right");
  else if (slot.data?.label) ui.text(String(slot.data.label), x + size - 8, y + 6, 2, [255, 200, 90], "right"); // свои данные (неполная обойма: патроны)
}

// Панель способностей: ячейки в ряд внизу по центру. В ячейке — значок способности
// (его рисует сама способность), сверху слева — клавиша. Пустые ячейки — тусклые.
//   keyLabel(i) — подпись клавиши ячейки i
// above(i) — необязательно: короткая надпись над ячейкой (например, «3/30» — сколько ловушек стоит).
// Выбранная ячейка крупнее (bar.grow — плавно, grow × 20 %), ячейки стоят по нижнему краю.
export function drawAbilityBar(ui, bar, { keyLabel, ctx, size = 56, gap = 8, bottom = 18, above = null } = {}) {
  const sizes = bar.slots.map((_, i) => Math.round(size * (1 + 0.2 * (bar.grow?.[i] ?? (i === bar.index ? 1 : 0)))));
  const total = sizes.reduce((a, b) => a + b, 0) + (bar.size - 1) * gap;
  let x = Math.round(ui.width / 2 - total / 2);
  const base = ui.height - bottom; // низ ячеек
  bar.slots.forEach((ability, i) => {
    const s = sizes[i];
    const y = base - s;
    const active = i === bar.index;
    const filled = ability && !ability.empty; // «пустая» способность (рука) — ячейка как пустая
    ui.rect(x, y, s, s, active ? [52, 66, 96] : [24, 30, 44], filled || active ? 215 : 120);
    ui.frame(x, y, s, s, active ? [255, 255, 255] : [70, 85, 115], active ? 3 : 2);
    if (filled) ability.drawIcon(ui, x, y, s, ctx);
    const key = keyLabel(i);
    if (key && key !== "-") ui.text(key, x + 5, y + 5, 2, filled ? [255, 255, 255] : MUTED);
    const top = above?.(i);
    if (top) ui.text(top, x + s / 2, y - 18, 2, [230, 230, 230], "center");
    x += s + gap;
  });
  const tallest = Math.max(...sizes);
  return { x: Math.round(ui.width / 2 - total / 2), y: base - tallest, width: total, height: tallest }; // где нарисовали (чтобы поставить что-то над)
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
    // label — своя подпись (например, «+30%» у баффа скорости); иначе заряды или сколько секунд осталось
    const left = s.label ?? (s.charges > 0 ? `X${s.charges}` : Number.isFinite(s.left) ? `${Math.ceil(s.left)}S` : "");
    if (left) ui.text(left, cx + size / 2, y + size + 3, 1, border, "center");
    cx += size + gap;
  }
  return statuses.length ? statuses.length * (size + gap) - gap : 0;
}

// Перезарядки «часиками»: значок, по которому по часовой стрелке (от 12 часов) заполняется готовая часть,
// а ещё не готовая — затемнена; в середине — сколько секунд осталось. list: [{ icon, color, progress 0…1,
// left — секунд, draw(ui, x, y, size) — свой рисунок значка (иначе — надпись icon) }]. Вернёт ширину ряда.
export function drawCooldowns(ui, list, { x, y, size = 32, gap = 6 } = {}) {
  let cx = x;
  const step = 2; // затемнение — квадратиками 2×2 пикселя
  for (const c of list) {
    const color = c.color || [200, 200, 210];
    ui.rect(cx, y, size, size, [16, 18, 24], 230);
    if (c.draw) c.draw(ui, cx + 3, y + 3, size - 6);
    else {
      const text = c.icon || "?";
      ui.text(text, cx + size / 2, y + 4, measureText(text, 1) <= size - 4 ? 1 : 1, color, "center");
    }
    // Не готовая часть — темнее: угол точки от «12 часов» по часовой больше, чем доля готовности
    const p = Math.max(0, Math.min(1, c.progress ?? 0));
    const r = size / 2, ox = cx + r, oy = y + r;
    for (let py = 0; py < size; py += step) {
      for (let px = 0; px < size; px += step) {
        const dx = px + step / 2 - r, dy = py + step / 2 - r;
        let a = Math.atan2(dx, -dy) / (Math.PI * 2); // 0 — вверх, по часовой
        if (a < 0) a += 1;
        if (a >= p) ui.rect(cx + px, y + py, step, step, [0, 0, 0], 150);
      }
    }
    ui.frame(cx, y, size, size, color, 2);
    if (Number.isFinite(c.left)) {
      const t = c.left >= 10 ? String(Math.ceil(c.left)) : c.left.toFixed(1);
      ui.text(t, ox, oy + 2, 2, [255, 255, 255], "center");
    }
    cx += size + gap;
  }
  return list.length ? list.length * (size + gap) - gap : 0;
}

// Ультимейт в стиле Overwatch: круг с процентами, по кругу — заряд (по часовой от «12 часов»).
// Готов — кольцо цвета color и надпись key (клавиша). { x, y — центр, r, percent (0…100), key, color }
export function drawUltimate(ui, { x, y, r = 30, percent = 0, key = "", color = [255, 210, 90] }) {
  const ready = percent >= 100;
  const w = Math.max(5, Math.round(r * 0.14)); // толщина кольца — по размеру
  const scale = r >= 40 ? 3 : 2; //               крупный круг — крупные цифры
  ui.circle(x, y, r, [16, 18, 24], 210);
  ui.ring(x, y, r - w, r, [60, 66, 80], 255);
  if (percent > 0) ui.ring(x, y, r - w, r, ready ? color : [235, 240, 250], 255, Math.min(1, percent / 100));
  if (ready) {
    ui.ring(x, y, r + 2, r + 5, color, 160);
    ui.text(key || "ULT", x, y - 3.5 * scale, scale, color, "center");
  } else {
    ui.text(`${percent}%`, x, y - 3.5 * scale, scale, TEXT, "center");
  }
}

// Разбить текст на строки не шире width пикселей (по словам). Сначала переводим целиком (язык интерфейса),
// иначе куски строки не нашлись бы в словаре
export function wrapText(text, width, scale = 2) {
  const lines = [];
  let line = "";
  for (const word of translate(String(text)).split(/\s+/).filter(Boolean)) {
    const next = line ? line + " " + word : word;
    if (line && measureText(next, scale) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Справка поверх игры (держишь F1, как в Overwatch): полупрозрачный экран, колонки-карточки.
// columns: [{ title, rows: [{ key, name, text }], compact?, empty? }]; title, footer — необязательно.
// compact — мелкий текст (длинный список: таланты); empty — надпись, если строк нет. Не влезло по высоте — «...»
export function drawHelpOverlay(ui, { title = "", columns = [], footer = "", alpha = 185 } = {}) {
  ui.rect(0, 0, ui.width, ui.height, DIM, alpha);
  if (title) ui.text(title, ui.width / 2, 40, 3, TEXT, "center");
  const n = Math.max(1, columns.length);
  const gap = 20;
  const cardW = Math.min(380, Math.floor((ui.width - 80 - gap * (n - 1)) / n));
  let x = Math.round(ui.width / 2 - (cardW * n + gap * (n - 1)) / 2);
  const top = 100;
  const scale = cardW >= 300 ? 2 : 1;
  const bottom = ui.height - 70; // ниже — подпись (footer)
  for (const col of columns) {
    let y = top + 16;
    const body = []; // сначала разметка — чтобы знать высоту карточки
    y += 30;
    const sc = col.compact ? 1 : scale, lh = 8 * sc + 4;
    let cut = false;
    const rows = col.rows?.length ? col.rows : col.empty ? [{ key: "", name: "", text: col.empty }] : [];
    for (const r of rows) {
      const keyW = r.key ? Math.max(36, measureText(r.key, 2) + 12) : 0;
      const lines = wrapText(r.text || "", cardW - 28, sc);
      const hgt = (r.key || r.name ? 26 : 0) + lines.length * lh + (col.compact ? 6 : 10);
      if (y + hgt > bottom) {
        cut = true;
        break;
      }
      body.push({ r, y, keyW, lines, sc, lh });
      y += hgt;
    }
    if (cut) y += 20;
    const h = y - top + 6;
    ui.rect(x, top, cardW, h, [20, 26, 38], 200);
    ui.frame(x, top, cardW, h, [90, 105, 135], 2);
    ui.text(col.title || "", x + cardW / 2, top + 16, 2, WARN, "center"); // поверх подложки
    for (const { r, y: ry, keyW, lines, sc, lh } of body) {
      const head = r.key || r.name ? 26 : 0;
      if (r.key) {
        ui.rect(x + 12, ry - 4, keyW, 24, [52, 66, 96], 255);
        ui.text(r.key, x + 12 + keyW / 2, ry + 2, 2, TEXT, "center");
      }
      if (r.name) ui.text(r.name, x + 12 + (keyW ? keyW + 10 : 0), ry + 2, 2, TEXT);
      lines.forEach((l, i) => ui.text(l, x + 14, ry + head + i * lh, sc, MUTED));
    }
    if (cut) ui.text("...", x + cardW / 2, y - 22, 2, MUTED, "center");
    x += cardW + gap;
  }
  if (footer) ui.text(footer, ui.width / 2, ui.height - 40, 2, MUTED, "center");
}

// Одна ячейка панели (оружие, скилл, предмет): подложка, значок, клавиша в углу, перезарядка «часиками».
//   drawIcon(ui, x, y, size) — значок (или text — короткая надпись по центру, например имя скилла)
//   key — клавиша сверху слева; top — надпись над ячейкой; active — выбрана (белая рамка);
//   empty — пустая (тусклая); cooldown — { progress 0…1 (сколько прошло), left — секунд } или null;
//   skew — наклон в пикселях: верх ячейки сдвинут вправо на skew относительно низа (параллелограмм, 0 — квадрат).
//   x — левый край НИЗА ячейки; вся ячейка занимает по ширине size + skew
export function drawSlot(ui, { x, y, size = 56, drawIcon = null, text = null, key = "", top = null, active = false, empty = false, cooldown = null, color = null, skew = 0 }) {
  const shift = (py) => Math.round(skew * (1 - py / size)); // сдвиг строки py (0 — верх) вправо
  const band = 2; //                                           рисуем полосами по 2 пикселя
  const fill = active ? [52, 66, 96] : [24, 30, 44];
  const alpha = empty && !active ? 120 : 215;
  for (let py = 0; py < size; py += band) ui.rect(x + shift(py), y + py, size, band, fill, alpha);
  const cx = x + skew / 2; // значок — по середине наклонной ячейки
  if (!empty) {
    if (drawIcon) drawIcon(ui, cx, y, size);
    else if (text) ui.text(text, cx + size / 2, y + size / 2 - 7, 2, color || TEXT, "center");
  }
  if (cooldown && cooldown.left > 0) {
    const p = Math.max(0, Math.min(1, cooldown.progress ?? 0));
    const r = size / 2;
    for (let py = 0; py < size; py += band) {
      for (let px = 0; px < size; px += band) {
        let a = Math.atan2(px + band / 2 - r, -(py + band / 2 - r)) / (Math.PI * 2); // 0 — вверх, по часовой
        if (a < 0) a += 1;
        if (a >= p) ui.rect(x + shift(py) + px, y + py, band, band, [0, 0, 0], 150);
      }
    }
    const t = cooldown.left >= 10 ? String(Math.ceil(cooldown.left)) : cooldown.left.toFixed(1);
    ui.text(t, cx + size / 2, y + size / 2 - 7, 2, [255, 255, 255], "center");
  }
  // Рамка: верх и низ — полосы, бока — по строкам (наклонные)
  const edge = active ? [255, 255, 255] : color && !empty ? color : [70, 85, 115];
  const t = active ? 3 : 2;
  ui.rect(x + shift(0), y, size, t, edge);
  ui.rect(x, y + size - t, size, t, edge);
  for (let py = 0; py < size; py += band) {
    ui.rect(x + shift(py), y + py, t, band, edge);
    ui.rect(x + shift(py) + size - t, y + py, t, band, edge);
  }
  if (key && key !== "-") ui.text(key, x + shift(0) + 6, y + 5, 2, empty ? MUTED : [255, 255, 255]);
  if (top) ui.text(top, cx + size / 2, y - 18, 2, [230, 230, 230], "center");
}

// Тех. панель (F3): строки мелким шрифтом на тёмной подложке, слева сверху. Пустая строка — отступ
export function drawTechPanel(ui, lines, { x = 6, y = 6, scale = 2 } = {}) {
  const lh = 8 * scale + 4;
  const w = Math.max(...lines.map((l) => measureText(l, scale))) + 16;
  ui.rect(x, y, w, lines.length * lh + 10, [8, 10, 16], 185);
  lines.forEach((l, i) => ui.text(l, x + 8, y + 6 + i * lh, scale, i === 0 ? WARN : TEXT));
}

// Индикатор урона: красная дуга по кругу вокруг центра экрана в сторону angle (рад: 0 — вверх, по часовой).
// k — яркость (0…1), radius — радиус круга в пикселях, spread — полуширина дуги (рад)
export function drawDamageArc(ui, angle, k, { radius, spread = 0.38, thick = 12, color = [230, 40, 30] } = {}) {
  if (k <= 0) return;
  const cx = ui.width / 2, cy = ui.height / 2;
  const r = radius ?? Math.min(ui.width, ui.height) * 0.3;
  const steps = Math.max(8, Math.round((r * spread * 2) / 4));
  for (let i = 0; i <= steps; i++) {
    const t = -spread + (2 * spread * i) / steps;
    const edge = 1 - Math.abs(t) / spread; // к краям дуги — тоньше и прозрачнее
    const a = angle + t, sx = Math.sin(a), sy = -Math.cos(a);
    const w = Math.max(2, Math.round(thick * (0.45 + 0.55 * edge)));
    for (let j = 0; j < w; j += 2) {
      const rr = r + j - w / 2;
      ui.rect(Math.round(cx + sx * rr) - 2, Math.round(cy + sy * rr) - 2, 4, 4, color, Math.round(255 * k * (0.35 + 0.65 * edge)));
    }
  }
}

// Плашка с информацией у курсора (подсказка): lines — [{ text, color?, size? }] (первая — заголовок, крупнее).
// Встаёт справа-снизу от точки (x, y); не влезает в экран — сдвигается внутрь
export function drawTooltip(ui, x, y, lines) {
  if (!lines?.length) return;
  const th = ui.theme;
  const PAD = 12, maxW = Math.min(520, ui.width - 40);
  // длинные строки — переносим по словам (ширина плашки не больше maxW)
  const rows = [];
  lines.filter(Boolean).forEach((l, i) => {
    const size = l.size ?? (i === 0 ? 2 : 1);
    let cur = "";
    for (const word of translate(String(l.text)).split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && measureText(next, size) > maxW - PAD * 2) {
        rows.push({ ...l, text: cur, size });
        cur = word;
      } else cur = next;
    }
    rows.push({ ...l, text: cur, size });
  });
  const w = Math.min(maxW, Math.max(...rows.map((r) => measureText(translate(String(r.text)), r.size))) + PAD * 2);
  const h = rows.reduce((sum, r) => sum + r.size * 9 + 6, 0) + PAD * 2 - 6;
  let bx = Math.round(x + 18), by = Math.round(y + 18);
  if (bx + w > ui.width - 8) bx = Math.round(x - 18 - w);
  if (by + h > ui.height - 8) by = Math.max(8, ui.height - 8 - h);
  bx = Math.max(8, bx);
  ui.rect(bx, by, w, h, th.window?.fill || [16, 20, 28], 240);
  ui.frame(bx, by, w, h, rows[0].color || th.window?.border || [90, 100, 120], 2);
  let ty = by + PAD;
  for (const r of rows) {
    ui.text(r.text, bx + PAD, ty, r.size, r.color || th.text, "left", 255, w - PAD * 2);
    ty += r.size * 9 + 6;
  }
}
