// Мир по частям: в памяти — только куски рядом; идём — близкие подгружаются, дальние выгружаются;
// изменённый кусок перед выгрузкой записывается; ничего не теряется, файлы выгруженных не стираются
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VoxelWorld } from "../../../engine/world/voxel-world.js";
import { ChunkStore } from "../../../engine/core/chunk-store.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-stream-"));
// длинная полоса 60 кусков по X: по блоку-маркеру в каждом куске
const full = new VoxelWorld();
for (let cx = 0; cx < 60; cx++) for (let i = 0; i < 4; i++) full.place(cx * 16 + i, 0, 3, [cx, i, 0]);
new ChunkStore(dir).save(full, { sync: true });

const w = new VoxelWorld();
const s = new ChunkStore(dir);
s.load(w, [], { around: { x: 8, z: 8 }, radius: 3 });
check("загрузка по частям: в памяти только куски в радиусе", w.chunks.size === 4 && s.onDisk.size === 60, `${w.chunks.size} из ${s.onDisk.size}`);
// меняем кусок 1 и уходим далеко
w.place(16 + 7, 5, 7, [1, 2, 3]);
w.remove(16, 0, 3);
for (let x = 8; x <= 40 * 16; x += 16) s.stream(w, x, 8, 3);
check("ушли на 40 кусков: в памяти — только рядом", w.chunks.size <= 3 * 2 + 1 + 4 && !w.chunk(0, 0) && !!w.chunk(40, 0), `${w.chunks.size}`);
check("подгрузилось по пути, выгружено", s.streamed.loaded > 30 && s.streamed.unloaded > 25, `${s.streamed.loaded} / ${s.streamed.unloaded}`);
check("блоки в памяти — только загруженных кусков", w.blocks.size === [...w.chunks.values()].reduce((n, c) => n + c.blocks.size, 0));
check("файлы выгруженных кусков на месте", fs.readdirSync(path.join(dir, "chunks")).filter((f) => f.endsWith(".bin")).length === 60);
// обычное сохранение во время подгрузки не стирает выгруженные куски
s.save(w, { sync: true });
check("сохранение по частям не трогает выгруженные файлы", fs.readdirSync(path.join(dir, "chunks")).filter((f) => f.endsWith(".bin")).length === 60);
// вернулись — изменения на месте
for (let x = 40 * 16; x >= 8; x -= 16) s.stream(w, x, 8, 3);
check("вернулись: изменения куска 1 сохранились при выгрузке", w.has(23, 5, 7) && !w.has(16, 0, 3) && w.has(17, 0, 3));
check("маркеры всех кусков рядом — на месте", [0, 1, 2, 3].every((cx) => w.has(cx * 16 + 3, 0, 3)));
// полное чтение — весь мир цел
const all = new VoxelWorld();
new ChunkStore(dir).load(all);
check("весь мир на диске цел (60 кусков, одно изменение)", all.chunks.size === 60 && all.blocks.size === 60 * 4 - 1 + 1, `${all.blocks.size}`);
// во время фоновой записи выгрузка ждёт
s.pending = 1;
const before = w.chunks.size;
s.stream(w, 50 * 16, 8, 3);
check("идёт фоновая запись — выгрузка ждёт", w.chunks.size === before);
s.pending = 0;
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
