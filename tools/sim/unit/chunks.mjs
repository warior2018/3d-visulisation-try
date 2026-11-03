// Чанки: блоки раскладываются по кускам 16×16; изменение — новая version только у своего куска (и у соседа,
// если блок на краю); рисуются только кубики с открытой гранью; куски вне кадра и за дымкой отсекаются
import { VoxelWorld, CHUNK, chunkOf } from "../../../engine/world/voxel-world.js";
import { exposedCubes, exposedFaces, facesFacing, viewOf, chunkInView, lightOf, LIGHT } from "../../../engine/graphics/chunk-mesh.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const C = [10, 20, 30];

check("номер чанка: 0..15 → 0, 16 → 1, −1 → −1, −16 → −1, −17 → −2", chunkOf(0) === 0 && chunkOf(15) === 0 && chunkOf(16) === 1 && chunkOf(-1) === -1 && chunkOf(-16) === -1 && chunkOf(-17) === -2);
const w = new VoxelWorld();
w.place(3, 0, 3, C); w.place(20, 5, -4, C); w.place(-1, 0, -1, C);
check("блоки разложены по своим кускам", w.chunks.size === 3 && w.chunk(0, 0).blocks.size === 1 && w.chunk(1, -1).blocks.size === 1 && w.chunk(-1, -1).blocks.size === 1);
// случайные place / remove: каждый блок мира — ровно в своём куске
let seed = 5;
const rnd = (n) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * n);
for (let i = 0; i < 5000; i++) { const x = rnd(80) - 40, y = rnd(6), z = rnd(80) - 40; if (rnd(3)) w.place(x, y, z, C); else w.remove(x, y, z); }
let inChunks = 0, wrong = 0;
for (const c of w.chunks.values()) for (const b of c.blocks) { inChunks++; if (chunkOf(b.x) !== c.cx || chunkOf(b.z) !== c.cz || !w.has(b.x, b.y, b.z)) wrong++; }
check("после 5000 случайных place/remove: блоков в кусках = в мире, все на своих местах", inChunks === w.blocks.size && wrong === 0, `${inChunks} / ${w.blocks.size}, не на месте ${wrong}`);
// version: свой кусок и сосед на краю
const v = new VoxelWorld();
for (let x = 0; x < 48; x++) v.place(x, 0, 0, C);
const ver = () => [v.chunk(0, 0).version, v.chunk(1, 0).version, v.chunk(2, 0).version];
let a = ver(); v.place(20, 1, 0, C); let b = ver();
check("блок в середине куска — новая version только у него", b[0] === a[0] && b[1] === a[1] + 1 && b[2] === a[2]);
a = ver(); v.remove(16, 0, 0); b = ver();
check("блок на краю куска — и у соседа (там открылась грань)", b[0] === a[0] + 1 && b[1] === a[1] + 1 && b[2] === a[2]);
// открытые грани: сплошной куб 16×4×16 — рисуем только «кожу»
const s = new VoxelWorld();
for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 4; y++) s.place(x, y, z, C);
const solid = exposedCubes(s, s.chunk(0, 0));
// кожа: верхний слой 256 + боковые стенки нижних 3 слоёв (60 на слой) = 436; низ лежит на полу мира
check("сплошной кусок 16×4×16: рисуем только кожу", solid.count === 256 + 60 * 3, `${solid.count} из ${s.chunk(0, 0).blocks.size}`);
s.remove(8, 3, 8);
const holed = exposedCubes(s, s.chunk(0, 0), solid.data);
check("дыра сверху: открылся блок под ней и 4 соседа", holed.count === 256 - 1 + 60 * 3 + 1, `${holed.count}`);
check("черновик данных переиспользуется", holed.data === solid.data);
check("данные кубика: x, y, z, цвет 0..1", (() => { const d = exposedCubes(w, w.chunk(1, -1)).data; return d[0] === 20 && d[1] === 5 && d[2] === -4 && Math.abs(d[3] - 10 / 255) < 1e-6; })());
// отсечение
const cam = (x, z, yaw, pitch = 0) => ({ position: { x, y: 2, z }, yaw, pitch, fov: (70 * Math.PI) / 180 });
const far = new VoxelWorld();
far.place(8, 0, 40, C); far.place(8, 0, -40, C); far.place(60, 0, 8, C); far.place(8, 0, 8, C); far.place(8, 0, 300, C);
const see = (c, x, z) => chunkInView(viewOf(c, 16 / 9, 70), far.chunkAt(x, z));
const look = cam(8, 8, 0); // смотрим вдоль +Z
check("кусок впереди — в кадре", see(look, 8, 40));
check("кусок за спиной — нет", !see(look, 8, -40));
check("кусок сбоку под 90° — нет", !see(look, 60, 8));
check("кусок, в котором стоим, — в кадре, куда ни смотри", see(cam(8, 8, Math.PI), 8, 8) && see(cam(8, 8, 1.2, -1.4), 8, 8));
check("кусок за дымкой — нет", !see(look, 8, 300));
check("смотрим вниз (pitch −80°): кусок рядом под ногами — в кадре", see(cam(8, 20, 0, -1.4), 8, 8) || see(cam(8, 10, 0, -1.4), 8, 8));
// освещение: открытое небо — 1; под крышей — темнее; глубже — ещё темнее; у стены — чуть темнее
{
  const L = new VoxelWorld();
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) L.place(x, 0, z, C);
  const open = lightOf(L, -5, 0, -5);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) L.place(x, 4, z, C); // крыша 3×3 над (0,0)
  const roof = lightOf(L, 0, 0, 0);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) L.place(x, 14, z, C); // ещё выше — глубже
  L.place(0, 1, 3, C);
  const wall = lightOf(L, 0, 0, 2);
  check("свет: открытое небо — полная яркость", Math.abs(open - 1) < 1e-9, open.toFixed(2));
  check("свет: под крышей — темнее, но не темнее минимума", roof < 0.85 && roof >= LIGHT.minSky * (1 - 4 * LIGHT.ao), roof.toFixed(2));
  check("свет: у стены (сосед сверху-сбоку) — чуть темнее открытого", wall < 1 && wall > 0.8, wall.toFixed(2));
  const lit = exposedCubes(L, L.chunk(0, 0), null, true), flat = exposedCubes(L, L.chunk(0, 0), null, false);
  check("запекание: цвета с освещением не ярче исходных", lit.count === flat.count && [...lit.data.slice(0, lit.count * 6)].every((v, i) => i % 6 < 3 || v <= flat.data[i] + 1e-6));
}
// ---------- По граням (exposedFaces) и грани спиной к камере (facesFacing) ----------
{
  const F = new VoxelWorld();
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) F.place(x, 0, z, [100, 100, 100]); // ровный пол куска
  const f = exposedFaces(F, F.chunk(0, 0));
  check("ровная земля: открыт только верх (+ края куска)", f.counts[2] === 256 && f.counts[3] === 0, f.counts.join(","));
  check("граней намного меньше, чем 6 на кубик", f.total < 256 * 2, `${f.total} граней на 256 кубиков`);
  check("списки подряд: starts", f.starts[1] === f.counts[0] && f.starts[5] === f.total - f.counts[5]);
  check("в списке верха — кубики куска", f.data[f.starts[2] * 6 + 1] === 0);
  const ch = F.chunk(0, 0);
  const above = facesFacing({ x: 8, y: 10, z: 8 }, ch);
  check("камера над куском: верх виден, низ — нет", (above & 4) && !(above & 8));
  const left = facesFacing({ x: -20, y: 10, z: 8 }, ch);
  check("камера левее куска: грани +X спиной — не рисуем", !(left & 1) && (left & 2));
}

console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
