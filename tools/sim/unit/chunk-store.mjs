// Мир на диске по кускам: запись → чтение даёт тот же мир (цвета, поверхности, отрицательные координаты,
// высота); пишутся только изменившиеся куски; опустевший кусок — файл стирается; испорченный файл не роняет
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VoxelWorld } from "../../../engine/world/voxel-world.js";
import { ChunkStore, encodeChunk, decodeChunk } from "../../../engine/core/chunk-store.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-chunks-"));
const same = (a, b) => {
  if (a.blocks.size !== b.blocks.size) return `блоков ${a.blocks.size} / ${b.blocks.size}`;
  for (const x of a.blocks.values()) {
    const y = b.blocks.get([...b.blocks.keys()][0]) && [...b.chunkAt(x.x, x.z)?.blocks || []].find((q) => q.x === x.x && q.y === x.y && q.z === x.z);
    if (!y || y.color.join() !== x.color.join() || (y.surface || null) !== (x.surface || null)) return `блок ${x.x},${x.y},${x.z}`;
  }
  return "";
};
let seed = 3;
const rnd = (n) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * n);
const w = new VoxelWorld();
for (let i = 0; i < 3000; i++) w.place(rnd(100) - 50, rnd(40) - 5 >= 0 ? rnd(40) : rnd(2000), rnd(100) - 50, [rnd(256), rnd(256), rnd(256)], rnd(10) === 0 ? "slip" : rnd(25) === 0 ? "bouncy" : null);
const store = new ChunkStore(dir);
const r1 = store.save(w, { sync: true });
const files = fs.readdirSync(path.join(dir, "chunks")).filter((f) => f.endsWith(".bin")).length;
check("первая запись — все непустые куски", r1.chunks === files && files === [...w.chunks.values()].filter((c) => c.blocks.size).length, `${r1.chunks} кусков, ${(r1.bytes / 1024).toFixed(0)} КБ`);
check("размер: 8 байт на блок + 8 на кусок", r1.bytes === w.blocks.size * 8 + r1.chunks * 8);
const w2 = new VoxelWorld();
const back = new ChunkStore(dir);
back.load(w2, store.surfaces);
check("чтение → тот же мир (цвета, поверхности, координаты < 0, высоты)", same(w, w2) === "", same(w, w2));
check("поверхности: slip и bouncy — по именам", w2.surfaces === w.surfaces && store.surfaces.includes("slip") && store.surfaces.includes("bouncy"));
// только изменившиеся
check("без изменений — 0 кусков", store.save(w, { sync: true }).chunks === 0);
w.place(500, 3, 500, [1, 2, 3]);
w.place(501, 3, 500, [1, 2, 3]);
check("два блока в одном новом месте — 1 кусок", store.save(w, { sync: true }).chunks === 1);
w.remove(500, 3, 500); w.remove(501, 3, 500);
const r3 = store.save(w, { sync: true });
check("кусок опустел — файл стёрт", r3.removed === 1 && !fs.existsSync(path.join(dir, "chunks", "31_31.bin")));
// другой мир — полная запись, лишние файлы убраны
const small = new VoxelWorld();
small.place(0, 0, 0, [9, 9, 9]);
const r4 = store.save(small, { sync: true });
check("другой мир — пишется целиком, чужие куски стёрты", r4.chunks === 1 && fs.readdirSync(path.join(dir, "chunks")).filter((f) => f.endsWith(".bin")).length === 1, `${r4.chunks} / убрано ${r4.removed}`);
// в фоне
small.place(40, 0, 40, [9, 9, 9]);
store.save(small);
await store.idle();
check("запись в фоне доходит до диска", fs.existsSync(path.join(dir, "chunks", "2_2.bin")));
// испорченный кусок
fs.writeFileSync(path.join(dir, "chunks", "7_7.bin"), "мусор");
const w3 = new VoxelWorld();
const s3 = new ChunkStore(dir);
s3.load(w3);
check("испорченный кусок пропущен, остальные прочитаны, файл отложен", w3.blocks.size === 2 && s3.broken.length === 1 && !fs.existsSync(path.join(dir, "chunks", "7_7.bin")));
// кодек напрямую: отрицательный кусок
const neg = new VoxelWorld();
neg.place(-17, 1999, -1, [255, 0, 128], "slip");
const c = neg.chunkAt(-17, -1), surf = [];
const w4 = new VoxelWorld();
decodeChunk(encodeChunk(c, surf), c.cx, c.cz, w4, surf);
const b4 = [...w4.blocks.values()][0];
check("кодек: x −17, y 1999, z −1, цвет и лёд", b4.x === -17 && b4.y === 1999 && b4.z === -1 && b4.color.join() === "255,0,128" && b4.surface === "slip");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
