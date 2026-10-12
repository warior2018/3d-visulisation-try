// ============================================================
//  Буфер кадра — наш «экран» в памяти.
//  Это просто массив байтов: на каждый пиксель 4 байта (R, G, B, A).
//  Всё, что видно в окне, мы сначала рисуем сюда сами, пиксель за пикселем.
// ============================================================

// Упаковать цвет в одно 32-битное число.
// В памяти байты идут R, G, B, A; процессор (little-endian) читает их задом наперёд,
// поэтому в числе порядок обратный: A B G R.
export function rgb(r, g, b) {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export class Framebuffer {
  constructor(width, height) {
    this.resize(width, height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.stride = width * 4; // сколько байтов в одной строке
    this.buffer = Buffer.alloc(width * height * 4);
    // Тот же кусок памяти, но «по 4 байта за раз» — так быстрее писать целый пиксель
    this.pixels = new Uint32Array(this.buffer.buffer, this.buffer.byteOffset, width * height);
  }

  // Закрасить целую строку одним цветом
  fillRow(y, color) {
    const start = y * this.width;
    this.pixels.fill(color, start, start + this.width);
  }

  // Смешать пиксель с цветом (alpha от 0 до 1) — для полупрозрачных линий
  blendPixel(x, y, r, g, b, alpha) {
    const i = (y * this.width + x) * 4;
    const buf = this.buffer;
    buf[i] += (r - buf[i]) * alpha;
    buf[i + 1] += (g - buf[i + 1]) * alpha;
    buf[i + 2] += (b - buf[i + 2]) * alpha;
  }

  // Линия алгоритмом Брезенхэма: идём по пикселям только целыми числами.
  drawLine(x0, y0, x1, y1, r, g, b, alpha = 1) {
    // Сначала обрезаем линию по краям экрана, иначе почти горизонтальная линия у самой
    // камеры может уйти на миллионы пикселей за экран.
    const c = clipToRect(x0, y0, x1, y1, this.width - 1, this.height - 1);
    if (!c) return;
    x0 = Math.round(c[0]); y0 = Math.round(c[1]);
    x1 = Math.round(c[2]); y1 = Math.round(c[3]);

    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.blendPixel(x0, y0, r, g, b, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

// Обрезка отрезка прямоугольником [0..maxX] × [0..maxY] (алгоритм Лианга — Барски).
// Возвращает [x0, y0, x1, y1] видимой части или null, если линия целиком за экраном.
function clipToRect(x0, y0, x1, y1, maxX, maxY) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0, maxX - x0, y0, maxY - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // параллельна краю и снаружи
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}
