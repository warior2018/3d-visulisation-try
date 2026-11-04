// Горячая перезагрузка модуля настроек: объекты меняются на месте (кто импортировал — видит новое),
// отдельные числа — в skipped, опечатка в файле — старое цело
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { watchModule, applyLive } from "../../../engine/core/hot-reload.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };

const a = { x: 1, inner: { y: [1, 2], z: "a" }, list: [{ d: 1 }, { d: 2 }] };
const keep = a.inner, keepItem = a.list[1];
const n = applyLive(a, { x: 2, inner: { y: [1, 2, 3], z: "a" }, list: [{ d: 1 }, { d: 5 }] });
check("значения поменялись на месте", a.x === 2 && a.inner === keep && a.inner.y.length === 3 && keepItem.d === 5, n);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-hot-"));
const file = path.join(dir, "cfg.mjs");
fs.writeFileSync(file, "export const A = { dmg: 10, list: [1, 2] };\nexport const N = 5;\n");
const live = await import(pathToFileURL(file).href);
const A = live.A;
const results = [];
const hot = watchModule(file, { live, onReload: (r) => results.push(r), delay: 20 });
fs.writeFileSync(file, "export const A = { dmg: 25, list: [1, 2, 3] };\nexport const N = 6;\n");
await hot.reload();
check("объект подхвачен", A.dmg === 25 && A.list.length === 3 && live.A === A);
check("отдельное число — нужен перезапуск", results.at(-1)?.skipped.includes("N") && live.N === 5);
fs.writeFileSync(file, "export const A = { dmg: 99, ;\n");
await hot.reload();
check("ошибка в файле — старое цело", !!results.at(-1)?.error && A.dmg === 25);
hot.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`итого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
