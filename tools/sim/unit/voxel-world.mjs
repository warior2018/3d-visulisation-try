// Мир из кубиков: числовые ключи клеток и запомненный «верхний блок столбика» (миникарта) — совпадают
// с честным перебором после любых place / remove
import { VoxelWorld } from "../../../engine/world/voxel-world.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const w = new VoxelWorld();
let seed = 3;
const rnd = (n) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * n);
const C = [1, 2, 3];
const honestTop = (x, z) => { let best = null; for (const b of w.blocks.values()) if (b.x === x && b.z === z && (!best || b.y > best.y)) best = b; return best; };
let wrong = 0;
for (let i = 0; i < 4000; i++) {
  const x = rnd(12) - 6, y = rnd(10), z = rnd(12) - 6;
  if (rnd(3)) w.place(x, y, z, C); else w.remove(x, y, z);
  if (i % 7 === 0) { const qx = rnd(12) - 6, qz = rnd(12) - 6; if ((w.topBlock(qx, qz)?.y ?? null) !== (honestTop(qx, qz)?.y ?? null)) wrong++; }
}
for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) if ((w.topBlock(x, z)?.y ?? null) !== (honestTop(x, z)?.y ?? null)) wrong++;
check("верхний блок столбика после 4000 случайных place/remove — как честный перебор", wrong === 0, `расхождений ${wrong}`);
check("has / isSolid по числовому ключу", (() => { const v = new VoxelWorld(); v.place(-300, 5, 4000, C); return v.has(-300, 5, 4000) && v.isSolid(-300, 5, 4000) && !v.has(-300, 4, 4000) && !v.has(4000, 5, -300) && v.isSolid(0, -1, 0); })());
const v = new VoxelWorld(); v.place(1, 1, 1, C); v.clear();
check("clear: ни блоков, ни запомненных верхушек", v.blocks.size === 0 && v.topBlock(1, 1) === null);
const s = new VoxelWorld(); s.loadFrom([{ x: 1, y: 2, z: 3, color: [9, 9, 9] }, { x: 1.5, y: 0, z: 0, color: [1, 1, 1] }]);
check("сохранение → загрузка: целые клетки — да, дробные — отброшены", s.blocks.size === 1 && JSON.stringify(s.toJSON()) === JSON.stringify([{ x: 1, y: 2, z: 3, color: [9, 9, 9] }]));
const sf = new VoxelWorld(); sf.place(0, 0, 0, C, "slip"); sf.place(1, 0, 0, C, "slip"); sf.place(2, 0, 0, C); sf.place(0, 0, 0, C, "slip");
const sfA = sf.surfaces; sf.remove(0, 0, 0); sf.remove(2, 0, 0); sf.remove(5, 5, 5); const sfB = sf.surfaces; sf.loadFrom(sf.toJSON()); const sfC = sf.surfaces; sf.clear();
check("счётчик особых блоков (surfaces): place / remove / loadFrom / clear", sfA === 2 && sfB === 1 && sfC === 1 && sf.surfaces === 0, `${sfA} ${sfB} ${sfC} ${sf.surfaces}`);
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
