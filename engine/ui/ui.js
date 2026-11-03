// ============================================================
//  Интерфейс поверх сцены: панели, текст, кнопки.
//  Рисуем процессором в прозрачный буфер (тот самый Framebuffer),
//  а видеокарта накладывает его поверх 3D-картинки.
//
//  Подход «immediate mode»: каждый раз, когда что-то поменялось,
//  интерфейс рисуется заново целиком — просто и без путаницы.
// ============================================================

import { translate } from "./i18n.js";
import { Framebuffer } from "./framebuffer.js";
import { glyph, measureText, GLYPH_W, GLYPH_H } from "./font.js";
import { DEFAULT_THEME } from "./theme.js";

export class UI {
  constructor(width, height) {
    this.fb = new Framebuffer(width, height);
    this.buttons = []; // кнопки, нарисованные в последний раз: { id, x, y, w, h }
    this.mouseX = -1;
    this.mouseY = -1;
    this.dirty = true; // нужно ли заново отправить картинку на видеокарту
    this.theme = DEFAULT_THEME; // цвета и размеры (engine/ui/theme.js); игра может поменять
  }

  get width() { return this.fb.width; }
  get height() { return this.fb.height; }

  resize(width, height) {
    this.fb.resize(width, height);
    this.dirty = true;
  }

  // Начать новый кадр интерфейса: всё прозрачное, кнопок нет
  begin() {
    this.fb.pixels.fill(0);
    this.buttons = [];
    this.dirty = true;
  }

  // Прямоугольник цветом [r, g, b] и непрозрачностью alpha (0–255).
  // Пиксель — 4 байта RGBA, их можно записать одним 32-битным числом: тогда целую
  // строку прямоугольника заполняет один вызов fill — в разы быстрее, чем по байту
  // (затемнение во весь экран 1512×982 — это полтора миллиона пикселей).
  rect(x, y, w, h, color, alpha = 255) {
    const { fb } = this;
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(fb.width, Math.round(x + w));
    const y1 = Math.min(fb.height, Math.round(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    // Байты в памяти идут R, G, B, A — в числе это A·2²⁴ + B·2¹⁶ + G·2⁸ + R (порядок «little-endian»)
    const value = ((alpha << 24) | (color[2] << 16) | (color[1] << 8) | color[0]) >>> 0;
    const px = fb.pixels;
    for (let py = y0; py < y1; py++) {
      const row = py * fb.width;
      px.fill(value, row + x0, row + x1);
    }
  }

  // Картинка (engine/ui/png.js: { width, height, data RGBA }) в прямоугольник w × h — «по пикселям» (пиксель-арт
  // остаётся чётким). circle — вписать в круг (что за кругом — не рисуем); alpha — общая прозрачность 0…1;
  // dim — затемнить (0…1). Полностью прозрачные пиксели картинки пропускаем, остальные — как есть
  image(img, x, y, w, h, { circle = false, alpha = 1, dim = 0 } = {}) {
    if (!img) return;
    const { fb } = this;
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(fb.width, Math.round(x + w)), y1 = Math.min(fb.height, Math.round(y + h));
    const cx = x + w / 2, cy = y + h / 2, r2 = (Math.min(w, h) / 2) ** 2;
    const px = fb.pixels, d = img.data, k = 1 - dim;
    for (let py = y0; py < y1; py++) {
      const sy = Math.min(img.height - 1, Math.floor(((py - y) / h) * img.height));
      const row = py * fb.width;
      for (let qx = x0; qx < x1; qx++) {
        if (circle && (qx + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 > r2) continue;
        const sx = Math.min(img.width - 1, Math.floor(((qx - x) / w) * img.width));
        const i = (sy * img.width + sx) * 4;
        const a = Math.round(d[i + 3] * alpha);
        if (a === 0) continue;
        px[row + qx] = ((a << 24) | (Math.round(d[i + 2] * k) << 16) | (Math.round(d[i + 1] * k) << 8) | Math.round(d[i] * k)) >>> 0;
      }
    }
    this.dirty = true;
  }

  // Один пиксель
  pixel(x, y, color, alpha = 255) {
    const { fb } = this;
    if (x < 0 || y < 0 || x >= fb.width || y >= fb.height) return;
    const i = ((y | 0) * fb.width + (x | 0)) * 4;
    fb.buffer[i] = color[0];
    fb.buffer[i + 1] = color[1];
    fb.buffer[i + 2] = color[2];
    fb.buffer[i + 3] = alpha;
  }

  // Закрашенный круг (центр cx, cy, радиус r)
  circle(cx, cy, r, color, alpha = 255) {
    this.ring(cx, cy, 0, r, color, alpha);
  }

  // Кольцо между радиусами r0 и r1. fraction (0..1) — какая часть кольца:
  // от «12 часов» по часовой стрелке (для круговой шкалы, как опыт вокруг портрета)
  ring(cx, cy, r0, r1, color, alpha = 255, fraction = 1) {
    const { fb } = this;
    const px = fb.pixels;
    const value = ((alpha << 24) | (color[2] << 16) | (color[1] << 8) | color[0]) >>> 0;
    const limit = fraction * Math.PI * 2;
    const yA = Math.max(0, Math.floor(cy - r1)), yB = Math.min(fb.height - 1, Math.ceil(cy + r1));
    for (let y = yA; y <= yB; y++) {
      const dy = y + 0.5 - cy;
      if (dy * dy > r1 * r1) continue;
      // Пиксель (x, y) в кольце, если r0 ≤ расстояние от его середины до центра ≤ r1. В строке это один или
      // два отрезка: [L, R] без «дырки» (−hi, hi) — считаем их концы и заливаем строку целиком (fill), а не
      // по пикселю с корнем на каждый (кольца ульты, портрета и значков — тысячи пикселей на перерисовку)
      const ho = Math.sqrt(r1 * r1 - dy * dy);
      const L = Math.max(0, Math.ceil(cx - ho - 0.5)), R = Math.min(fb.width - 1, Math.floor(cx + ho - 0.5));
      if (R < L) continue;
      const hole = r0 * r0 > dy * dy ? Math.sqrt(r0 * r0 - dy * dy) : -1;
      const spans = hole < 0 ? [[L, R]] : [[L, Math.min(R, Math.floor(cx - hole - 0.5))], [Math.max(L, Math.ceil(cx + hole - 0.5)), R]];
      const row = y * fb.width;
      for (const [x0, x1] of spans) {
        if (x1 < x0) continue;
        if (fraction >= 1) {
          px.fill(value, row + x0, row + x1 + 1);
          continue;
        }
        for (let x = x0; x <= x1; x++) { // часть кольца — по углу (от «12 часов» по часовой)
          let a = Math.atan2(x + 0.5 - cx, -dy);
          if (a < 0) a += Math.PI * 2;
          if (a <= limit) px[row + x] = value;
        }
      }
    }
  }

  // Запомнить кусок картинки интерфейса (x, y, w, h) — чтобы потом вернуть его paste без перерисовки
  // (дорогая часть HUD, которая меняется реже, чем весь HUD: миникарта)
  grab(x, y, w, h) {
    const { fb } = this;
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(fb.width, Math.round(x + w)), y1 = Math.min(fb.height, Math.round(y + h));
    const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0);
    const data = new Uint32Array(W * H);
    for (let r = 0; r < H; r++) data.set(fb.pixels.subarray((y0 + r) * fb.width + x0, (y0 + r) * fb.width + x0 + W), r * W);
    return { x: x0, y: y0, w: W, h: H, width: fb.width, height: fb.height, data };
  }

  // Вернуть запомненный кусок на место. false — окно с тех пор поменяло размер (рисуй заново)
  paste(img) {
    const { fb } = this;
    if (!img || img.width !== fb.width || img.height !== fb.height) return false;
    for (let r = 0; r < img.h; r++) fb.pixels.set(img.data.subarray(r * img.w, (r + 1) * img.w), (img.y + r) * fb.width + img.x);
    return true;
  }

  // Рамка толщиной t
  frame(x, y, w, h, color, t = 2, alpha = 255) {
    this.rect(x, y, w, t, color, alpha);
    this.rect(x, y + h - t, w, t, color, alpha);
    this.rect(x, y, t, h, color, alpha);
    this.rect(x + w - t, y, t, h, color, alpha);
  }

  // Текст пиксельным шрифтом. align: "left" — x это левый край, "center" — середина, "right" — правый край
  // alpha — непрозрачность 0–255 (для гаснущих надписей)
  text(str, x, y, scale, color, align = "left", alpha = 255) {
    str = translate(String(str)); // язык интерфейса (engine/ui/i18n.js); measureText ниже переводит ещё раз — из кэша
    if (align === "center") x -= measureText(str, scale) / 2;
    if (align === "right") x -= measureText(str, scale);
    x = Math.round(x);
    y = Math.round(y);
    for (const ch of str) {
      const rows = glyph(ch);
      for (let gy = 0; gy < GLYPH_H; gy++) {
        for (let gx = 0; gx < GLYPH_W; gx++) {
          if (rows[gy][gx] === "#") this.rect(x + gx * scale, y + gy * scale, scale, scale, color, alpha);
        }
      }
      x += (GLYPH_W + 1) * scale;
    }
  }

  // Кнопка с центром в (cx, cy). Подсвечивается, если над ней мышь.
  // active — кнопка «выбрана» (например, открытая вкладка) или ждёт нажатия клавиши.
  button(id, label, cx, cy, w, h, scale = 3, active = false) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const hover = this.isInside(this.mouseX, this.mouseY, x, y, w, h);
    const b = this.theme.button;
    const fill = active ? b.active : hover ? b.hover : b.fill;
    const border = active ? b.activeBorder : hover ? b.hoverBorder : b.border;
    this.rect(x, y, w, h, fill, b.alpha);
    this.frame(x, y, w, h, border);
    this.text(label, cx, cy - (GLYPH_H * scale) / 2, scale, b.text, "center");
    this.buttons.push({ id, x, y, w, h });
  }

  isInside(px, py, x, y, w, h) {
    return px >= x && px < x + w && py >= y && py < y + h;
  }

  // На какую кнопку попали? Вернёт её id или null
  hitTest(px, py) {
    const b = this.buttons.find((b) => this.isInside(px, py, b.x, b.y, b.w, b.h));
    return b ? b.id : null;
  }

  // Мышь сдвинулась — если она перешла на другую кнопку, интерфейс надо перерисовать
  setMouse(px, py) {
    const before = this.hitTest(this.mouseX, this.mouseY);
    this.mouseX = px;
    this.mouseY = py;
    return this.hitTest(px, py) !== before;
  }
}
