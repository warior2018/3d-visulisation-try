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

import { HALF, HALF_TOP } from "./voxel-world.js";

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
// floor — цвет пола (по умолчанию trim): пол во всю площадь на y − 1 и фундамент вниз до опоры (до foundation блоков, 3) —
// дом не висит над ямой / обрывом и в полу нет дыр. Детали полублоками: подоконники, свес крыши (полублок сверху),
// второй ярус крыши (полублок) — крыша ступенькой
export function buildHouse(world, { x, y = 0, z, w, d, h = 3, wall, roof = wall, trim = wall, floor = trim, door = null, windows = true, decay = 0, foundation = 3, random = Math.random }) {
  const sides = ["north", "south", "east", "west"];
  const doorSide = door || sides[Math.floor(random() * 4)];
  // Где дверь: посередине своей стены (±1 для разнообразия)
  const along = doorSide === "north" || doorSide === "south" ? w : d;
  const doorAt = Math.max(1, Math.min(along - 2, Math.floor(along / 2) + randomInt(random, -1, 1)));
  let placed = 0;
  const put = (px, py, pz, color, surface = null) => {
    if (world.place(px, py, pz, color, surface)) placed++;
  };
  // Пол и фундамент: на y − 1 — пол (что было — заменяем), ниже — до опоры
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) {
    world.remove(x + i, y - 1, z + k);
    put(x + i, y - 1, z + k, floor);
    for (let j = y - 2; j > y - 2 - foundation && !world.has(x + i, j, z + k); j--) put(x + i, j, z + k, trim);
  }

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
        if (isWindow) { // подоконник — полублок в низу проёма
          put(x + i, y + j, z + k, trim, HALF);
          continue;
        }
        if (decay > 0 && !corner && j > 0 && random() < decay) continue;
        put(x + i, y + j, z + k, corner ? trim : wall);
      }
    }
  }
  // Крыша: над стенами — целая, свес по краю — тонкий (полублок сверху), над серединой — второй ярус полублоком.
  // roof: false — без крыши (нижний этаж большого дома, руины)
  if (roof !== false) for (let i = -1; i <= w; i++)
    for (let k = -1; k <= d; k++) {
      if (decay > 0 && random() < decay * 0.6) continue;
      const eave = i === -1 || i === w || k === -1 || k === d;
      put(x + i, y + h, z + k, roof, eave ? HALF_TOP : null);
      if (!eave && i > 0 && i < w - 1 && k > 0 && k < d - 1) put(x + i, y + h + 1, z + k, roof, HALF);
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

// Большой дом: floors этажей (2) по h, внутри — стенка с проходом (комнаты, если дом широкий), лестница на
// второй этаж вдоль западной стены (дыра в полу над ней). Остальное — как buildHouse
export function buildBigHouse(world, { x, y = 0, z, w, d, h = 3, floors = 2, wall, roof = wall, trim = wall, floor = trim, decay = 0, random = Math.random }) {
  const base = { x, z, w, d, h, wall, trim, floor, decay, random };
  const first = buildHouse(world, { ...base, y, roof: floors > 1 ? false : roof });
  // перегородка посередине (широкий дом): проход 1×2 посередине
  if (w >= 8) {
    const ix = x + Math.floor(w / 2), door = z + Math.floor(d / 2);
    for (let k = 1; k < d - 1; k++) for (let j = 0; j < h; j++) if (!(k + z === door && j < 2)) world.place(ix, y + j, z + k, wall);
  }
  for (let f = 1; f < floors; f++) {
    const fy = y + f * (h + 1);
    // лестница шириной 2: от пола этажа ниже вверх вдоль западной стены (x + 1, x + 2), по ступеньке на клетку;
    // дверь на западной стене — лестница у восточной (не загораживает вход)
    const lanes = first.door === "west" ? [x + w - 2, x + w - 3] : [x + 1, x + 2];
    const sz0 = z + 1, below = fy - h - 1;
    for (const sx of lanes) for (let s = 0; s < h + 1; s++) world.place(sx, below + s, sz0 + 1 + s, trim);
    buildHouse(world, { ...base, y: fy, roof: f === floors - 1 ? roof : false, foundation: 0, door: first.door });
    // дыра в полу над всеми ступеньками (с прыжком голова не бьётся); над последней ступенькой — пол (сходишь на него)
    for (const sx of lanes) for (let s = 0; s < h; s++) world.remove(sx, fy - 1, sz0 + 1 + s);
  }
  return first;
}

// Руины: стены дома, сильно выкрошенные, без крыши; внутри — обломки (полублоки)
export function buildRuins(world, { x, y = 0, z, w, d, h = 3, wall, trim = wall, random = Math.random }) {
  buildHouse(world, { x, y, z, w, d, h, wall, trim, floor: trim, roof: false, windows: false, decay: 0.45 + random() * 0.2, random });
  const n = Math.round(w * d * 0.12);
  for (let i = 0; i < n; i++) world.place(x + 1 + Math.floor(random() * (w - 2)), y, z + 1 + Math.floor(random() * (d - 2)), wall, HALF);
}

// Замок: квадрат size × size — стены высотой h с зубцами, башни по углам (выше стен), ворота 3 × 3 посередине
// стороны gate, в середине двора — большой дом (keep)
export function buildCastle(world, { x, y = 0, z, size = 24, h = 5, wall, top = wall, keepWall = wall, roof = top, gate = "south", random = Math.random }) {
  const T = 5; // башня
  const last = size - 1, mid = Math.floor(size / 2);
  for (let i = 0; i < size; i++) for (let k = 0; k < size; k++) {
    const edge = i === 0 || i === last || k === 0 || k === last;
    if (!edge) continue;
    const side = k === last ? "south" : k === 0 ? "north" : i === 0 ? "west" : "east";
    const pos = side === "north" || side === "south" ? i : k;
    for (let j = 0; j < h; j++) {
      if (side === gate && Math.abs(pos - mid) <= 1 && j < 3) continue; // ворота
      world.place(x + i, y + j, z + k, wall);
    }
    if ((i + k) % 2 === 0) world.place(x + i, y + h, z + k, top); // зубцы
  }
  // башни по углам (дверью во двор)
  const corners = [[0, 0, "south"], [size - T, 0, "south"], [0, size - T, "north"], [size - T, size - T, "north"]];
  for (const [i, k, door] of corners) {
    for (let a = 0; a < T; a++) for (let b = 0; b < T; b++) for (let j = 0; j < h + 3; j++) world.remove(x + i + a, y + j, z + k + b);
    buildTower(world, { x: x + i, y, z: z + k, size: T, h: h + 3, wall, top, door, random });
  }
  // главный дом во дворе
  const kw = Math.max(7, size - 2 * T - 4), kd = Math.max(7, size - 2 * T - 6);
  buildBigHouse(world, { x: x + Math.floor((size - kw) / 2), y, z: z + Math.floor((size - kd) / 2) - 1, w: kw, d: kd, h: 3, floors: 2, wall: keepWall, trim: wall, roof, random });
}
