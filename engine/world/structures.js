// ============================================================
//  Постройки из кубиков для нового мира: коробки, домики и «где их поставить».
//  Возможность движка: строит в любом VoxelWorld. Сколько построек, какого цвета
//  и размера — решает игра.
//
//    const spots = scatter({ count: 6, area: [-22, -22, 22, 22], size: () => ({ w: 6, d: 5 }),
//      avoid: [{ x: 0, z: 0, r: 6 }] });                // не застраивать место появления
//    buildHouse(world, { ...spots[0], wall: [140, 95, 60], roof: [220, 70, 70] });
//    buildBox(world, { x: 5, y: 0, z: 5, w: 2, h: 2, d: 2, color: [200, 200, 205] });
//
//  random — своя функция случайности (по умолчанию Math.random): с одинаковым
//  «зерном» мир получится одинаковым (см. seededRandom).
// ============================================================

// Предсказуемая случайность: одно зерно — одна и та же последовательность чисел (алгоритм mulberry32)
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Целое от min до max включительно
export const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1));

// Коробка w×h×d от угла (x, y, z). hollow — только стенки (внутри пусто).
// decay — доля кубиков, которых «не хватает» (0.15 — потрёпанная), углы и низ остаются.
export function buildBox(world, { x, y = 0, z, w, h, d, color, hollow = false, decay = 0, random = Math.random }) {
  let placed = 0;
  for (let i = 0; i < w; i++)
    for (let j = 0; j < h; j++)
      for (let k = 0; k < d; k++) {
        const edge = i === 0 || i === w - 1 || j === 0 || j === h - 1 || k === 0 || k === d - 1;
        if (hollow && !edge) continue;
        const corner = (i === 0 || i === w - 1) && (k === 0 || k === d - 1);
        if (decay > 0 && j > 0 && !corner && random() < decay) continue;
        if (world.place(x + i, y + j, z + k, color)) placed++;
      }
  return placed;
}

// Домик: стены высотой h, крыша сверху, дверной проём 1×2 и окна.
// door — сторона двери: "north" | "south" | "east" | "west" (по умолчанию — случайная).
// trim — цвет углов (столбов), по умолчанию как стены. windows — прорубить окна.
// decay — доля выпавших кубиков стен и крыши (заброшенный дом).
export function buildHouse(world, { x, y = 0, z, w, d, h = 3, wall, roof = wall, trim = wall, door = null, windows = true, decay = 0, random = Math.random }) {
  const sides = ["north", "south", "east", "west"];
  const doorSide = door || sides[Math.floor(random() * 4)];
  // Где дверь: посередине своей стены (±1 для разнообразия)
  const along = doorSide === "north" || doorSide === "south" ? w : d;
  const doorAt = Math.max(1, Math.min(along - 2, Math.floor(along / 2) + randomInt(random, -1, 1)));
  let placed = 0;
  const put = (px, py, pz, color) => {
    if (world.place(px, py, pz, color)) placed++;
  };

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) {
        const onX = i === 0 || i === w - 1;
        const onZ = k === 0 || k === d - 1;
        if (!onX && !onZ) continue; // внутри — пусто
        const corner = onX && onZ;
        // Сторона стены и место вдоль неё
        const side = k === 0 ? "north" : k === d - 1 ? "south" : i === 0 ? "west" : "east";
        const pos = side === "north" || side === "south" ? i : k;
        if (!corner && side === doorSide && pos === doorAt && j < 2) continue; // дверной проём
        // Окна: на среднем ряду, через одно, не у углов и не над дверью
        const wallLen = side === "north" || side === "south" ? w : d;
        const isWindow = windows && !corner && j === 1 && h >= 3 && pos > 1 && pos < wallLen - 2 && pos % 2 === 0 && side !== doorSide;
        if (isWindow) continue;
        if (decay > 0 && !corner && j > 0 && random() < decay) continue;
        put(x + i, y + j, z + k, corner ? trim : wall);
      }
    }
  }
  // Плоская крыша с небольшим свесом
  for (let i = -1; i <= w; i++)
    for (let k = -1; k <= d; k++) {
      if (decay > 0 && random() < decay * 0.6) continue;
      put(x + i, y + h, z + k, roof);
    }
  return { placed, door: doorSide };
}

// Сторожевая башня: полая, size×size, высотой h; дверь внизу, бойницы наверху, площадка с зубцами
export function buildTower(world, { x, y = 0, z, size = 4, h = 7, wall, top = wall, door = "south", random = Math.random }) {
  const doorAt = Math.floor(size / 2);
  let placed = 0;
  const put = (px, py, pz, c) => { if (world.place(px, py, pz, c)) placed++; };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < size; i++)
      for (let k = 0; k < size; k++) {
        const edgeX = i === 0 || i === size - 1, edgeZ = k === 0 || k === size - 1;
        if (!edgeX && !edgeZ) continue;
        const side = k === 0 ? "north" : k === size - 1 ? "south" : i === 0 ? "west" : "east";
        const pos = side === "north" || side === "south" ? i : k;
        if (side === door && pos === doorAt && j < 2) continue; //                 дверь
        if (j === h - 2 && !(edgeX && edgeZ) && pos === doorAt) continue; //      бойницы
        put(x + i, y + j, z + k, wall);
      }
  // Площадка наверху (с запасом) и зубцы по краю через один
  for (let i = -1; i <= size; i++)
    for (let k = -1; k <= size; k++) {
      put(x + i, y + h, z + k, top);
      const rim = i === -1 || i === size || k === -1 || k === size;
      if (rim && (i + k) % 2 === 0) put(x + i, y + h + 1, z + k, top);
    }
  return placed;
}

// Куча коробок «как попало»: несколько коробок разного размера, часть стоит на других
export function buildCratePile(world, { x, y = 0, z, w = 4, d = 4, colors, count = 4, random = Math.random }) {
  let placed = 0;
  for (let n = 0; n < count; n++) {
    const s = randomInt(random, 1, 2);
    const bx = x + randomInt(random, 0, Math.max(0, w - s));
    const bz = z + randomInt(random, 0, Math.max(0, d - s));
    // Ставим на самый высокий кубик под коробкой — так они громоздятся друг на друга
    let by = y;
    for (let i = 0; i < s; i++)
      for (let k = 0; k < s; k++)
        while (world.has(bx + i, by, bz + k)) by++;
    const color = colors[Math.floor(random() * colors.length)];
    placed += buildBox(world, { x: bx, y: by, z: bz, w: s, h: s, d: s, color });
  }
  return placed;
}

// Где поставить count построек, чтобы не налезали друг на друга и на запретные места.
// size(random) → { w, d, ...что угодно } — размер очередной постройки (лишние поля вернутся как есть).
// gap — сколько клеток пустоты оставить между постройками; avoid — [{ x, z, r }] — сюда нельзя.
// accept(x, z, spec) → false — это место не подходит (например, склон слишком крутой).
// Возвращает [{ x, z, w, d, ... }] — x, z — угол (наименьшие координаты). Может вернуть меньше count,
// если места не нашлось.
export function scatter({ count, area, size, gap = 2, avoid = [], accept = null, random = Math.random, tries = 60 }) {
  const [x0, z0, x1, z1] = area;
  const placed = [];
  for (let n = 0; n < count; n++) {
    const spec = size(random);
    for (let t = 0; t < tries; t++) {
      const x = Math.floor(x0 + random() * (x1 - x0 - spec.w));
      const z = Math.floor(z0 + random() * (z1 - z0 - spec.d));
      const overlaps = placed.some((o) => x < o.x + o.w + gap && x + spec.w + gap > o.x && z < o.z + o.d + gap && z + spec.d + gap > o.z);
      if (overlaps) continue;
      // Ближайшая к запретной точке клетка прямоугольника — дальше r?
      const blocked = avoid.some((a) => {
        const nx = Math.max(x, Math.min(a.x, x + spec.w));
        const nz = Math.max(z, Math.min(a.z, z + spec.d));
        return Math.hypot(nx - a.x, nz - a.z) < a.r;
      });
      if (blocked) continue;
      if (accept && !accept(x, z, spec)) continue;
      placed.push({ ...spec, x, z });
      break;
    }
  }
  return placed;
}
