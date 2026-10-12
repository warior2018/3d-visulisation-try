// ============================================================
//  Рельеф из кубиков — возможность движка: холмы, плато, горы в круге радиуса radius
//  вокруг center. К краю круга рельеф ПЛАВНО сходит на нет (никакого обрыва), около центра
//  (место появления) — ровно. Всё по зерну seed: одно зерно — один и тот же рельеф,
//  поэтому в сохранении достаточно хранить seed, а высоту всегда можно спросить: terrain.height(x, z).
//
//    const terrain = new Terrain({ seed: 42, radius: 50 });
//    terrain.build(world, { grass, dirt, stone, snow });   // уложить кубики
//    terrain.height(10, -5);                               // сколько кубиков в столбике (0 — ровная земля)
//
//  Состав (всё в параметрах):
//   hills     — { amp, scale }: мягкие холмы (шум fbm), amp — высота, scale — ширина холма в клетках;
//   plateaus  — { count, radius: [от, до], height: [от, до], edge }: плоские возвышенности с покатым краем;
//   mountains — { count, radius: [от, до], height: [от, до], distance: [от, до] }: горы (от центра на distance);
//   edge      — ширина полосы у края, где рельеф сходит на нет; flatCenter — ровный круг в центре;
//   base      — сколько кубиков земли лежит везде внутри круга (1 — сплошной травяной покров, без «дыр»).
// ============================================================

import { valueNoise2D, fbm, smoothstep } from "../math/noise.js";
import { seededRandom } from "./structures.js";

export class Terrain {
  constructor({ seed = 1, radius = 50, center = { x: 0, z: 0 }, edge = 14, flatCenter = 8, base = 1,
    hills = { amp: 3, scale: 22 }, plateaus = { count: 2, radius: [6, 9], height: [4, 6], edge: 4 },
    mountains = { count: 1, radius: [14, 18], height: [13, 18], distance: [24, 34] } } = {}) {
    this.seed = seed;
    this.radius = radius;
    this.center = center;
    this.edge = edge;
    this.flatCenter = flatCenter;
    this.base = base;
    this.hills = hills;
    this.noise = valueNoise2D(seed);
    this.rough = valueNoise2D(seed + 7);
    // Где плато и горы — тоже по зерну
    const rnd = seededRandom(seed * 31 + 5);
    const between = ([a, b]) => a + rnd() * (b - a);
    const around = (dist) => {
      const a = rnd() * Math.PI * 2;
      return { x: center.x + Math.sin(a) * dist, z: center.z + Math.cos(a) * dist };
    };
    this.plateaus = Array.from({ length: plateaus.count }, () => ({
      ...around(between([radius * 0.3, radius * 0.65])), r: between(plateaus.radius), h: Math.round(between(plateaus.height)), edge: plateaus.edge,
    }));
    this.mountains = Array.from({ length: mountains.count }, () => ({
      ...around(between(mountains.distance)), r: between(mountains.radius), h: between(mountains.height),
    }));
  }

  // Сколько кубиков в столбике (x, z): 0 — ровная земля (пол мира)
  height(x, z) {
    const d = Math.hypot(x - this.center.x, z - this.center.z);
    if (d >= this.radius) return 0;
    // Холмы: шум, только «плюс» (впадины ниже пола не бывают)
    let h = Math.max(0, (fbm(this.noise, x / this.hills.scale, z / this.hills.scale, 3) * 0.5 + 0.35) * this.hills.amp * 1.6);
    // Плато: плоский верх, покатый край
    for (const p of this.plateaus) {
      const pd = Math.hypot(x - p.x, z - p.z);
      h = Math.max(h, p.h * smoothstep(p.r + p.edge, p.r, pd));
    }
    // Горы: к вершине круче, у подножья — плавно; немного неровностей
    for (const m of this.mountains) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md >= m.r) continue;
      const k = 1 - md / m.r;
      const bumps = this.rough(x / 4, z / 4) * 1.2 * k;
      h = Math.max(h, m.h * k * k * (3 - 2 * k) + bumps);
    }
    // К краю круга — плавно в ноль; в центре — ровно (там появляется герой)
    h *= smoothstep(this.radius, this.radius - this.edge, d);
    h *= smoothstep(this.flatCenter * 0.5, this.flatCenter * 1.5, d);
    return Math.max(this.base, Math.round(this.base + h));
  }

  // Уложить рельеф в мир: столбики кубиков. Сверху — трава (на высоте — камень, на вершинах — снег),
  // под ней пара слоёв земли, глубже — камень. Вернёт, сколько кубиков поставлено
  build(world, { grass = [96, 160, 72], dirt = [130, 96, 62], stone = [140, 140, 146], snow = [236, 240, 246], rockLine = 10, snowLine = 14 } = {}) {
    let placed = 0;
    const r = Math.ceil(this.radius);
    for (let x = this.center.x - r; x <= this.center.x + r; x++) {
      for (let z = this.center.z - r; z <= this.center.z + r; z++) {
        const h = this.height(x + 0.5, z + 0.5);
        for (let y = 0; y < h; y++) {
          const top = y === h - 1;
          let color = y >= h - 3 ? dirt : stone;
          if (top) color = h > snowLine ? snow : h > rockLine ? stone : grass;
          if (world.place(x, y, z, color)) placed++;
        }
      }
    }
    return placed;
  }
}

// Выровнять площадку под постройку: столбики в прямоугольнике (x, z, w, d) — ровно высотой y
// (лишнее срезаем, недостающее досыпаем), с запасом margin клеток вокруг
export function flattenArea(world, { x, z, w, d, y, margin = 1, top = [96, 160, 72], fill = [130, 96, 62], clearAbove = 24 }) {
  for (let i = x - margin; i < x + w + margin; i++) {
    for (let k = z - margin; k < z + d + margin; k++) {
      for (let j = y; j < y + clearAbove; j++) world.remove(i, j, k);
      for (let j = 0; j < y; j++) if (!world.has(i, j, k)) world.place(i, j, k, j === y - 1 ? top : fill);
    }
  }
}

// Дерево: ствол height кубиков и шапка листвы (шар радиуса crown, без углов — покруглее)
export function buildTree(world, { x, y = 0, z, height = 4, crown = 2, trunk = [110, 78, 48], leaves = [70, 140, 60], random = Math.random }) {
  for (let j = 0; j < height; j++) world.place(x, y + j, z, trunk);
  const cy = y + height;
  for (let i = -crown; i <= crown; i++)
    for (let j = -crown; j <= crown; j++)
      for (let k = -crown; k <= crown; k++) {
        const r = Math.hypot(i, j * 1.2, k);
        if (r > crown + 0.3 || (r > crown - 0.6 && random() < 0.35)) continue; // край — с проплешинами
        world.place(x + i, cy + j, z + k, leaves);
      }
}
