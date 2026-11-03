// ============================================================
//  Словарь языков: проверить и привести в порядок перевод интерфейса.
//
//    npm run lang                 — что в коде есть, а в словаре нет (надо перевести), и где это
//    npm run lang -- --write      — то же + переписать словарь ровно и по алфавиту
//    npm run lang -- --prune      — то же + выкинуть переводы надписей, которых в коде больше нет
//
//  Как устроено. В коде все надписи интерфейса — на английском, БОЛЬШИМИ буквами: "NO CLIPS",
//  `HP ${hp}/${max}`. Русский словарь (games/builder/lang/ru.js) — пары «английская надпись → перевод»;
//  движок переводит прямо при рисовании (engine/ui/i18n.js). ${...} в ключе — подставляемая часть: она
//  переносится в перевод как есть (и сама тоже переводится).
//
//  Новая надпись в коде: запусти npm run lang — увидишь её в списке «НЕ ПЕРЕВЕДЕНО», допиши пару в ru.js
//  (ключ — точно как в коде, вместе с ${...}) и запусти npm run lang -- --write.
//
//  Что считается надписью интерфейса: строка в кавычках или `шаблон` из кода движка и игры, в которой
//  есть хотя бы два латинских слова-символа подряд и нет маленьких латинских букв (имена в коде
//  маленькими — это не надписи). Привязки клавиш ("key:W") и строки с русскими буквами — не надписи.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const DICT = path.join(ROOT, "games/builder/lang/ru.js");
const SCAN = ["engine", "games/builder"]; //                                  где искать надписи
const SKIP = ["engine/ui/font.js", "engine/ui/i18n.js", "games/builder/lang", "engine/core/console.js", "games/builder/scene/commands.js", "engine/ui/png.js"]; // где не искать (консоль разработчика — по-английски, как в Source)
// Надписи, которые переводить не нужно (клавиши, служебное, имена)
// Тех. панель (F3) — служебные строки, не переводим
const TECH = /^(VOID ENGINE|VOID PROFILER|FRAME |TICK |CHUNKS |RAM |GPU |WORLD {2}|ENTITIES |PICKUPS |SPAWNED |XYZ |VIEW |DISK {2}|SYSTEM {2}|GC |HEAP |HITCHES |LAST |MARKUP |OTHER \(|MOBS |\$\{name\} |\$\{"OTHER|  TOP: |  \$\{last)/;
// Имена систем профайлера (страница F3 «производительность» — техническая, всегда по-английски) и строка рывка
const PROFILER = /^(?:\[PROFILER\] |PROFILER REPORT|PROFILER: NO DATA|GC: |HITCHES: |\$\{"  "\.repeat|(?:PATHFINDING|AI|UPDATE|TICK|UI|VIEW|RENDER|PRESENT|SPAWN|PROJECTILES|TRAPS|WORLD EVENTS|CREATURES|PHYSICS|ANIMATION|CAMERA|HUD CHECK|HUD DRAW)$|\$\{this\.invasion)/;
const IGNORE = [TECH, PROFILER, /^(FPS \$\{this\.fps|SOLO GAME|HOST, PORT|  \$\{q\.name\}: PING|GUEST, PING)/ /* консоль: stats / net */, /^E[A-Z]{3,}$/ /* коды ошибок Node (EPERM...) */, /^[LR]-\w+$/, /^ESC$/, /^BACKSPACE$/, /^HP$/, /^ENTER$/, /^LINEAR$/, /^CUBICSPLINE$/, /^STEP$/, /^VOID$/, /^ENGLISH$/, /^FPS \$\{this\.fps\}$/, /^\$\{e\.name\} → /];
// Этих символов нет в шрифте движка — в переводе заменяем
const FONT_FIX = [["«", '"'], ["»", '"'], ["—", "-"]];

const args = new Set(process.argv.slice(2));
const write = args.has("--write") || args.has("--prune");
const prune = args.has("--prune");

// ---------- 1. Все строки из кода ----------

// Строки JS: "..", '..', `..` (в шаблоне ${...} — как есть), комментарии пропускаем
function literals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (src.startsWith("//", i)) {
      const j = src.indexOf("\n", i);
      i = j < 0 ? n : j;
      continue;
    }
    if (src.startsWith("/*", i)) {
      const j = src.indexOf("*/", i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, buf = "";
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\") {
          buf += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        buf += src[j++];
      }
      out.push(buf);
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1, buf = "";
      while (j < n && src[j] !== "`") {
        if (src[j] === "\\") {
          buf += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (src.startsWith("${", j)) {
          // подставляемая часть — целиком, со вложенными скобками и шаблонами
          let depth = 0, k = j;
          for (; k < n; k++) {
            if (src[k] === "{") depth++;
            else if (src[k] === "}" && --depth === 0) break;
            else if (src[k] === "`") k = src.indexOf("`", k + 1);
          }
          buf += src.slice(j, k + 1);
          j = k + 1;
          continue;
        }
        buf += src[j++];
      }
      out.push(buf);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// Надпись интерфейса или нет (см. шапку)
function isUiText(s) {
  if (/[А-Яа-яЁё]/.test(s)) return false;
  if (s.startsWith("key:") || s.startsWith("mouse:")) return false;
  const letters = s.replace(/\$\{[^}]*\}/g, "");
  return /[A-Z]{2}/.test(letters) && !/[a-z]/.test(letters);
}

function* jsFiles(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) yield* jsFiles(p);
    else if (d.name.endsWith(".js")) yield p;
  }
}

const found = new Map(); // надпись → файл, где впервые встретилась
for (const dir of SCAN) {
  for (const file of jsFiles(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (SKIP.some((s) => rel.startsWith(s))) continue;
    for (const s of literals(fs.readFileSync(file, "utf8"))) {
      if (isUiText(s) && !found.has(s)) found.set(s, rel);
    }
  }
}

// ---------- 2. Словарь ----------

const { RU } = await import(pathToFileURL(DICT).href + "?t=" + Date.now());
const dict = { ...RU };

const placeholders = (s) => s.match(/\$\{[^}]*\}/g) || [];
const missing = [...found.keys()].filter((k) => !(k in dict) && !IGNORE.some((re) => re.test(k)));
const unused = Object.keys(dict).filter((k) => !found.has(k));
// В переводе ${...}, которого нет в ключе, подставить нечем (лишнюю часть ключа перевод может и опустить)
const badParts = Object.entries(dict).filter(([k, v]) => placeholders(v).some((p) => !placeholders(k).includes(p)));

// ---------- 3. Отчёт ----------

console.log(`надписей в коде: ${found.size}, в словаре: ${Object.keys(dict).length}`);
if (missing.length) {
  console.log(`\nНЕ ПЕРЕВЕДЕНО (${missing.length}) — допиши в ${path.relative(ROOT, DICT)}:`);
  for (const k of missing) console.log(`  ${JSON.stringify(k)}   ← ${found.get(k)}`);
} else console.log("\nвсё переведено");
if (badParts.length) {
  console.log(`\nВ ПЕРЕВОДЕ ЕСТЬ ${"${...}"}, КОТОРЫХ НЕТ В КЛЮЧЕ (${badParts.length}) — подставить нечем:`);
  for (const [k, v] of badParts) console.log(`  ${JSON.stringify(k)}\n    → ${JSON.stringify(v)}`);
}
if (unused.length) {
  console.log(`\nв словаре, но в коде не найдено (${unused.length})${prune ? " — убираю" : " — возможно, надпись собирается в коде по частям; убрать: --prune"}:`);
  for (const k of unused.slice(0, 40)) console.log(`  ${JSON.stringify(k)}`);
  if (unused.length > 40) console.log(`  ... и ещё ${unused.length - 40}`);
}

// ---------- 4. Переписать словарь ----------

if (write) {
  if (prune) for (const k of unused) delete dict[k];
  for (const k of Object.keys(dict)) for (const [from, to] of FONT_FIX) dict[k] = dict[k].split(from).join(to);
  const keys = Object.keys(dict).sort();
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(dict[k])},`).join("\n");
  fs.writeFileSync(DICT, `// ============================================================
//  Русский язык интерфейса (движок: engine/ui/i18n.js). Ключ — английская надпись из кода игры
//  (как написана в исходнике, \${...} — подставляемое), значение — перевод. Чего нет — остаётся по-английски.
//  Включается в настройках: INTERFACE → LANGUAGE.
//  Проверить, что всё переведено, и привести файл в порядок: npm run lang (см. tools/lang.js)
// ============================================================

export const RU = {
${body}
};
`);
  console.log(`\nсловарь переписан: ${keys.length} пар${prune ? `, убрано ${unused.length}` : ""}`);
}
