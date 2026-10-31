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
//   base      — сколько кубиков земли лежит везде внутри круга (1 — сплошной травяной покров, без «дыр»);
//   islands   — { count: [от, до], radius, distance, edge, hills, mountainChance, mountain }: небольшие острова
//               вокруг главного (на distance от центра), на каждом с шансом mountainChance — своя горка;
//   bossChance — шанс, что в горе (любой) логово босса: внутри выдолблен зал с проходом наружу
//               (terrain.lairs — [{ x, y, z, r }]: где зал; босса ставит игра).
// ============================================================

import { valueNoise2D, fbm, smoothstep } from "../math/noise.js";
import { seededRandom } from "./structures.js";

export class Terrain {
  constructor({ seed = 1, radius = 50, center = { x: 0, z: 0 }, edge = 14, flatCenter = 8, base = 1,
    hills = { amp: 3, scale: 22 }, plateaus = { count: 2, radius: [6, 9], height: [4, 6], edge: 4 },
    mountains = { count: 1, radius: [14, 18], height: [13, 18], distance: [24, 34] },
    islands = null, bossChance = 0, minLairs = 0, maxLairs = Infinity } = {}) {
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
    // Земля — круги: главный остров и маленькие вокруг (между ними — пустой пол мира)
    this.discs = [{ x: center.x, z: center.z, r: radius, edge, main: true, amp: hills.amp }];
    if (islands) {
      const [a, b] = islands.count;
      const n = a + Math.floor(rnd() * (b - a + 1));
      const start = rnd() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        // по кругу вокруг главного, примерно поровну, с разбросом — чтобы не налезали друг на друга
        const ang = start + ((i + 0.5 * rnd()) / n) * Math.PI * 2;
        const dist = between(islands.distance);
        const d = { x: center.x + Math.sin(ang) * dist, z: center.z + Math.cos(ang) * dist, r: between(islands.radius), edge: islands.edge ?? 5, main: false, amp: islands.hills ?? 2 };
        this.discs.push(d);
        if (rnd() < (islands.mountainChance ?? 0)) {
          const m = islands.mountain || { radius: [6, 9], height: [7, 11] };
          this.mountains.push({ x: d.x, z: d.z, r: Math.min(d.r - 1, between(m.radius)), h: between(m.height) });
        }
      }
    }
    // Логова боссов: в горе с шансом bossChance — зал у подножья, в самой толще (проход — к центру мира).
    // minLairs / maxLairs — сколько логов обязательно и самое большее: не хватает — логово в самых больших
    // горах из оставшихся; лишние — гора без логова (всё по зерну, мир тот же при той же загрузке)
    for (const m of this.mountains) m.boss = rnd() < bossChance;
    let chosen = this.mountains.filter((m) => m.boss);
    if (chosen.length < minLairs) {
      const rest = this.mountains.filter((m) => !m.boss).sort((a, b) => b.r - a.r);
      chosen = [...chosen, ...rest.slice(0, minLairs - chosen.length)];
    }
    chosen = chosen.slice(0, maxLairs);
    for (const m of this.mountains) m.boss = chosen.includes(m);
    this.lairs = this.mountains.filter((m) => m.boss).map((m) => ({ x: Math.round(m.x), y: 1, z: Math.round(m.z), r: Math.max(4, Math.round(m.r * 0.28)), mountain: m })); // не меньше 4: босс ростом ~2.5 м
  }

  // Сколько кубиков в столбике (x, z): 0 — ровная земля (пол мира). Самый высокий из островов
  height(x, z) {
    let best = 0;
    for (const disc of this.discs) best = Math.max(best, this.discHeight(disc, x, z));
    return best;
  }

  // Высота на одном острове (круг disc); вне его — 0
  discHeight(disc, x, z) {
    const d = Math.hypot(x - disc.x, z - disc.z);
    if (d >= disc.r) return 0;
    // Холмы: шум, только «плюс» (впадины ниже пола не бывают)
    let h = Math.max(0, (fbm(this.noise, x / this.hills.scale, z / this.hills.scale, 3) * 0.5 + 0.35) * disc.amp * 1.6);
    // Плато: плоский верх, покатый край (только на главном)
    for (const p of disc.main ? this.plateaus : []) {
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
    // К краю круга — плавно в ноль; в центре главного — ровно (там появляется герой)
    h *= smoothstep(disc.r, disc.r - disc.edge, d);
    if (disc.main) h *= smoothstep(this.flatCenter * 0.5, this.flatCenter * 1.5, d);
    return Math.max(this.base, Math.round(this.base + h));
  }

  // Уложить рельеф в мир: столбики кубиков. Сверху — трава (на высоте — камень, на вершинах — снег),
  // под ней пара слоёв земли, глубже — камень. Вернёт, сколько кубиков поставлено
  build(world, { grass = [96, 160, 72], dirt = [130, 96, 62], stone = [140, 140, 146], snow = [236, 240, 246], rockLine = 10, snowLine = 14 } = {}) {
    let placed = 0;
    const done = new Set(); // столбики, уже уложенные (острова не перекрываются, но на всякий случай)
    for (const disc of this.discs) {
      const r = Math.ceil(disc.r);
      const cx = Math.round(disc.x), cz = Math.round(disc.z);
      for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
        const key = x + "," + z;
        if (done.has(key)) continue;
        done.add(key);
        const h = this.height(x + 0.5, z + 0.5);
        for (let y = 0; y < h; y++) {
          const top = y === h - 1;
          let color = y >= h - 3 ? dirt : stone;
          if (top) color = h > snowLine ? snow : h > rockLine ? stone : grass;
          if (world.place(x, y, z, color)) placed++;
        }
      }
    }
    for (const lair of this.lairs) this.carveLair(world, lair);
    return placed;
  }

  // Логово босса: зал-купол радиуса r у подножья горы и проход высотой 3 наружу, к центру мира
  // Зал логова и проход наружу. В lair.tunnel — где проход начался и где вышел (x0, z0 → x1, z1): игре — не
  // ставить у выхода постройки и деревья
  carveLair(world, lair) {
    const { x, y, z, r } = lair;
    for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) for (let j = 0; j <= r; j++) {
      if (Math.hypot(i, j * 1.3, k) <= r) world.remove(x + i, y + j, z + k);
    }
    // Проход к центру мира: «кистью» — все клетки ближе HALF от линии, шаг полклетки. Так и наискосок проход
    // сплошной (раньше по диагонали получалась «шахматка» — клетки касались только углами). Высота — 3 блока.
    // Идём, пока не вышли наружу: земля над проходом не выше пола + 1 (дальше можно просто зайти / запрыгнуть)
    const dx = this.center.x - x, dz = this.center.z - z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const HALF = 1.45;
    for (let t = r - 1; t < r + 80; t += 0.5) {
      const cx = x + 0.5 + ux * t, cz = z + 0.5 + uz * t; // точка на линии (середина клетки лога — x + 0.5)
      for (let i = Math.floor(cx - HALF); i <= Math.floor(cx + HALF); i++) {
        for (let k = Math.floor(cz - HALF); k <= Math.floor(cz + HALF); k++) {
          if (Math.hypot(i + 0.5 - cx, k + 0.5 - cz) > HALF) continue;
          for (let j = 0; j < 3; j++) world.remove(i, y + j, k);
        }
      }
      lair.tunnel = { x0: x + 0.5, z0: z + 0.5, x1: cx, z1: cz };
      if (this.height(cx, cz) <= y + 1) break; // вышли из горы: дальше — открытая земля
    }
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
