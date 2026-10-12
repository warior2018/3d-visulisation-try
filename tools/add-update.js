// ============================================================
//  Добавить запись обновления в CHANGELOG.json (наверх) — запущенная игра это заметит
//  и предложит обновиться (engine/core/updates.js).
//
//    node tools/add-update.js 0.16.0 "Заголовок" "изменение 1" "изменение 2" ...
//    node tools/add-update.js patch "Заголовок" "..."   — следующая версия сама: 0.15.0 -> 0.15.1
//    node tools/add-update.js minor "Заголовок" "..."   — 0.15.0 -> 0.16.0
// ============================================================

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readChangelog, compareVersions } from "../engine/core/updates.js";

const FILE = fileURLToPath(new URL("../CHANGELOG.json", import.meta.url));
const [kind, title, ...changes] = process.argv.slice(2);
if (!kind || !title) {
  console.log('Как: node tools/add-update.js <версия | patch | minor> "Заголовок" "изменение" ...');
  process.exit(1);
}

const list = readChangelog(FILE);
const last = list[0]?.version || "0.0.0";
const [ma, mi, pa] = last.split(".").map(Number);
const version = kind === "patch" ? `${ma}.${mi}.${pa + 1}` : kind === "minor" ? `${ma}.${mi + 1}.0` : kind;
if (compareVersions(version, last) <= 0) {
  console.log(`Версия ${version} не новее последней (${last})`);
  process.exit(1);
}
const date = new Date().toISOString().slice(0, 10);
list.unshift({ version, date, title, changes });
fs.writeFileSync(FILE, JSON.stringify(list, null, 2) + "\n");
console.log(`Записано: ${version} — ${title}`);
