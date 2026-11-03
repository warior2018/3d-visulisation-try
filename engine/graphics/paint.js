// ============================================================
//  Перекраска моделей и значков — «скины»: одна модель (сетка, кости, анимации) — разные цвета.
//  Кисть — функция (r, g, b) → [r, g, b] или null (этот цвет не трогаем); цвета 0…1.
//
//    models.load("hero@gold", file, { paint: metal([0.35, 0.2, 0.05], [1, 0.85, 0.35]) });
//    ui.paintRegion(x, y, w, h, () => drawIcon(...), brush); // значок той же кистью
//
//  Кисти складываются: chain(a, b) — сначала a, что не тронула — b.
// ============================================================

export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export const saturation = (r, g, b) => {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
  return hi <= 0 ? 0 : (hi - lo) / hi;
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Цвет по яркости из градиента stops (тёмный → светлый): [[0, цвет], [0.5, цвет], [1, цвет]] или просто [цвет, цвет]
export function gradient(stops) {
  // [позиция, цвет] — как есть; просто цвет — позиции поровну
  const list = stops.map((s, i, all) => (typeof s[0] === "number" && Array.isArray(s[1]) ? s : [i / Math.max(1, all.length - 1), s]));
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      const [p1, c1] = list[i], [p0, c0] = list[i - 1];
      if (t <= p1) return mix(c0, c1, (t - p0) / Math.max(1e-6, p1 - p0));
    }
    return list.at(-1)[1];
  };
}

// Все цвета (кроме тех, что отсекает keep) — по яркости в градиент: «золото», «обсидиан»...
export function gradientMap(stops, { keep = null, gain = 1 } = {}) {
  const g = gradient(stops);
  return (r, gg, b) => (keep?.(r, gg, b) ? null : g(Math.min(1, luma(r, gg, b) * gain)));
}

// Только «металл» — серые, почти бесцветные части (насыщенность < maxSat): ствол, клинок, болты
export function metal(dark, light, { maxSat = 0.2 } = {}) {
  const g = gradient([dark, light]);
  return (r, gg, b) => (saturation(r, gg, b) < maxSat ? g(luma(r, gg, b)) : null);
}

// Только цветное (насыщенность ≥ minSat): ткань, дерево, краска — сдвиг оттенка на deg, насыщенность ×sat, яркость ×light
export function hueShift(deg, { sat = 1, light = 1, minSat = 0.2 } = {}) {
  return (r, g, b) => {
    if (saturation(r, g, b) < minSat) return null;
    const [h, s, l] = toHsl(r, g, b);
    return fromHsl((h + deg / 360 + 1) % 1, Math.min(1, s * sat), Math.min(1, l * light));
  };
}

// Цветное → в один цвет (оттенок color, яркость своя): «весь плащ — чёрный»
export function dye(color, { minSat = 0.2, keepLight = true } = {}) {
  const [h, s, l0] = toHsl(...color);
  return (r, g, b) => {
    if (saturation(r, g, b) < minSat) return null;
    const l = toHsl(r, g, b)[2];
    return fromHsl(h, s, keepLight ? Math.min(1, l * (l0 / 0.5)) : l0);
  };
}

// Цепочка кистей: первая, что вернула цвет, — побеждает
export function chain(...brushes) {
  return (r, g, b) => {
    for (const fn of brushes) {
      const c = fn?.(r, g, b);
      if (c) return c;
    }
    return null;
  };
}

// Покрасить массив цветов вершин (r, g, b подряд, 0…1) кистью — на месте
export function paintColors(colors, brush) {
  for (let i = 0; i < colors.length; i += 3) {
    const c = brush(colors[i], colors[i + 1], colors[i + 2]);
    if (c) { colors[i] = c[0]; colors[i + 1] = c[1]; colors[i + 2] = c[2]; }
  }
}

function toHsl(r, g, b) {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2;
  if (hi === lo) return [0, 0, l];
  const d = hi - lo, s = l > 0.5 ? d / (2 - hi - lo) : d / (hi + lo);
  let h = hi === r ? (g - b) / d + (g < b ? 6 : 0) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
