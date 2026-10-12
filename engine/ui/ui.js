// ============================================================
//  Интерфейс поверх сцены: панели, текст, кнопки.
//  Рисуем процессором в прозрачный буфер (тот самый Framebuffer),
//  а видеокарта накладывает его поверх 3D-картинки.
//
//  Подход «immediate mode»: каждый раз, когда что-то поменялось,
//  интерфейс рисуется заново целиком — просто и без путаницы.
// ============================================================

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
    const limit = fraction * Math.PI * 2;
    for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
      for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d < r0 || d > r1) continue;
        if (fraction < 1) {
          let a = Math.atan2(dx, -dy); // 0 — вверх, по часовой
          if (a < 0) a += Math.PI * 2;
          if (a > limit) continue;
        }
        this.pixel(x, y, color, alpha);
      }
    }
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
