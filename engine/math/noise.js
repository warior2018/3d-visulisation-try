// ============================================================
//  Шум — плавная случайность для рельефа (холмы, облака, пятна).
//  valueNoise2D: в узлах сетки — случайные числа, между узлами — плавный переход
//  (smoothstep), поэтому соседние точки похожи, а дальние — нет.
//  fbm («фрактальный» шум): несколько слоёв шума — крупные холмы + помельче + ещё мельче.
//
//    const n = valueNoise2D(12345);
//    n(x / 20, z / 20);                  // −1…1, «размер» холмов ~20 клеток
//    fbm(n, x / 30, z / 30, 3);          // три слоя: крупно + детали
//  Одно и то же зерно (seed) — один и тот же шум: мир можно восстановить по числу.
// ============================================================

// Целое → псевдослучайное 0…1 (хеш), зависит от зерна
function hash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise2D(seed = 1) {
  return (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = smooth(x - ix), fz = smooth(z - iz);
    const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
    const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return (top + (bottom - top) * fz) * 2 - 1;
  };
}

// Сумма octaves слоёв: каждый следующий — вдвое мельче и вдвое слабее. Результат −1…1
export function fbm(noise, x, z, octaves = 3) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * f + i * 17.3, z * f - i * 9.1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// Плавная ступенька: 0 до edge0, 1 после edge1, между — S-образно (edge0 > edge1 — наоборот)
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
