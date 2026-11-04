// Свет ламп и тени от солнца (chunk-mesh.js): у граней рядом с лампой glow > 0, вдали — 0; сломали лампу — кусок
// пересобирается и света нет; солнце закрыто блоком — кубик темнее (тень), солнца нет — теней нет
import { VoxelWorld } from "../../../engine/world/voxel-world.js";
import { exposedFaces, FLOATS_PER_CUBE, lightOf, inShadow } from "../../../engine/graphics/chunk-mesh.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const LAMP = [255, 214, 130], STONE = [200, 200, 205];
const w = new VoxelWorld();
w.setEmitters([{ color: LAMP, power: 1, radius: 8 }]);
for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.place(x, 0, z, STONE);
w.place(3, 1, 3, LAMP);
check("лампа в списке света", w.lightCount === 1);
const glowAt = (x, z) => {
  const { data, total } = exposedFaces(w, w.chunk(0, 0), null, true);
  for (let i = 0; i < total; i++) { const o = i * FLOATS_PER_CUBE; if (data[o] === x && data[o + 1] === 0 && data[o + 2] === z) return data[o + 6]; }
  return -1;
};
const near = glowAt(4, 3), far = glowAt(15, 15);
check("рядом с лампой — светло", near > 0.4, near.toFixed(2));
check("вдали — темно", far === 0, far);
const v0 = w.chunk(0, 0).version;
w.remove(3, 1, 3);
check("сломали лампу — света нет, кусок пересобрать", w.lightCount === 0 && w.chunk(0, 0).version > v0 && glowAt(4, 3) === 0);
// соседний кусок тоже получает свет (лампа у края)
w.place(15, 1, 8, LAMP);
const v1 = w.chunk(1, 0)?.version ?? 0;
for (let z = 0; z < 16; z++) w.place(16, 0, z, STONE);
check("лампа у края светит и в соседний кусок", (() => { const { data, total } = exposedFaces(w, w.chunk(1, 0), null, true); for (let i = 0; i < total; i++) if (data[i * FLOATS_PER_CUBE + 6] > 0.3) return true; return false; })(), v1);
// тени: солнце косо (с +X), плита сбоку-сверху от (8, 0, 12) — на луче к солнцу; над самим кубиком — открыто
w.sun = { x: 0.6, y: 0.8, z: 0 };
const open = lightOf(w, 8, 0, 12);
for (let x = 9; x <= 12; x++) w.place(x, 4, 12, STONE);
check("под плитой — тень от солнца", inShadow(w, 8, 0, 12, w.sun) && lightOf(w, 8, 0, 12) < open, `${lightOf(w, 8, 0, 12).toFixed(2)} < ${open.toFixed(2)}`);
w.sun = null;
check("солнца нет — тени нет", !inShadow(w, 8, 0, 12, w.sun));
console.log(`итого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
