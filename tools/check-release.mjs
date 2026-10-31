// ============================================================
//  Проверка перед отправкой на GitHub: заработает ли игра у того, кто её СКАЧАЕТ (друг на Windows
//  через VOID-windows.cmd получает ровно то, что лежит в репозитории — без твоих несохранённых в git файлов).
//
//    node tools/check-release.mjs          — проверить
//    node tools/check-release.mjs --quick  — без автотестов
//
//  Что смотрит:
//   1. какие файлы уйдут в репозиторий (отслеживаемые + новые, кроме .gitignore) и какие НОВЫЕ ещё не добавлены
//      в git (их надо добавить: git add -A — иначе у друга игра не найдёт модуль и не запустится);
//   2. имена файлов, которые не годятся для Windows (символы <>:"|?*, CON, NUL..., точка/пробел в конце,
//      слишком длинный путь), и файлы, отличающиеся только регистром букв;
//   3. импорты: каждый import "./..." находит свой файл ТОЧНО с тем же регистром букв;
//   4. синтаксис всех .js / .mjs;
//   5. автотесты — в чистой копии этих файлов (как у скачавшего), с новым миром.
// ============================================================

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const quick = process.argv.includes("--quick");
const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let problems = 0;
const bad = (msg) => { problems++; console.log("  ✗ " + msg); };
const ok = (msg) => console.log("  ✓ " + msg);

// 1. Файлы
console.log("1. Что уйдёт в репозиторий");
const files = git("ls-files -co --exclude-standard -z").split("\0").filter((f) => f && fs.existsSync(path.join(ROOT, f)));
const untracked = git("ls-files -o --exclude-standard -z").split("\0").filter(Boolean);
ok(`файлов: ${files.length}`);
if (untracked.length) {
  console.log(`  ! новые файлы, ещё не добавленные в git (${untracked.length}) — перед отправкой: git add -A`);
  for (const f of untracked.slice(0, 40)) console.log("      " + f);
  if (untracked.length > 40) console.log(`      ... и ещё ${untracked.length - 40}`);
}
try {
  const remote = git("ls-remote origin refs/heads/main").split(/\s/)[0];
  const head = git("rev-parse HEAD").trim();
  if (remote && remote !== head) console.log(`  ! на GitHub (main) сейчас ${remote.slice(0, 7)}, у тебя ${head.slice(0, 7)} — друг скачает старую версию, пока не отправишь (git push)`);
  else if (remote) ok("на GitHub — тот же коммит, что у тебя");
} catch {
  console.log("  (GitHub не ответил — не проверил, что там лежит)");
}
const dirty = git("status --porcelain").split("\n").filter((l) => l && !l.startsWith("??")).length;
if (dirty) console.log(`  ! изменённых файлов, не закоммиченных: ${dirty} — git add -A && git commit`);

// 2. Имена для Windows
console.log("2. Имена файлов для Windows");
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const BASE = "C:\\Users\\username-20-chars\\AppData\\Local\\VOID\\game\\".length; // куда кладёт VOID-windows.cmd
const lower = new Map();
for (const f of files) {
  for (const part of f.split("/")) {
    if (/[<>:"|?*\\]/.test(part)) bad(`недопустимый символ в имени: ${f}`);
    if (RESERVED.test(part)) bad(`зарезервированное имя Windows: ${f}`);
    if (/[. ]$/.test(part)) bad(`имя кончается точкой или пробелом: ${f}`);
  }
  if (BASE + f.length > 250) bad(`слишком длинный путь для Windows (${BASE + f.length} > 250): ${f}`);
  const l = f.toLowerCase();
  if (lower.has(l) && lower.get(l) !== f) bad(`отличаются только регистром: ${lower.get(l)} и ${f}`);
  lower.set(l, f);
}
if (!problems) ok("всё годится");

// 3. Импорты (с точным регистром)
console.log("3. Импорты");
const set = new Set(files);
const before = problems;
for (const f of files.filter((x) => /\.(m?js)$/.test(x))) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n"); // примеры в комментариях — не импорты
  for (const m of src.matchAll(/(?:import|export)\s[^"']*?from\s*["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
    const spec = m[1] || m[2];
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    if (!set.has(target)) bad(`${f}: импорт "${spec}" — файла ${target} нет в репозитории${fs.existsSync(path.join(ROOT, target)) ? " (есть на диске под другим регистром или в .gitignore)" : ""}`);
  }
}
if (problems === before) ok("все файлы на месте");

// 4. Синтаксис
console.log("4. Синтаксис");
const before4 = problems;
for (const f of files.filter((x) => /\.(m?js)$/.test(x))) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
  if (r.status !== 0) bad(`${f}: ${r.stderr.split("\n").find((l) => /Error/.test(l)) || "ошибка"}`);
}
if (problems === before4) ok("без ошибок");

// 5. Автотесты в чистой копии
if (!quick) {
  console.log("5. Автотесты в чистой копии (как у скачавшего, новый мир)");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-release-"));
  for (const f of files) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "junction");
  const r = spawnSync(process.execPath, ["tools/sim/run.mjs"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const total = (r.stdout || "").split("\n").filter((l) => /ИТОГО|FAIL|✗/.test(l));
  for (const l of total) console.log("  " + l.trim());
  if (r.status !== 0) bad("автотесты в чистой копии не прошли");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(problems ? `\nПРОБЛЕМ: ${problems} — до отправки поправить` : "\nГОТОВО К ОТПРАВКЕ" + (untracked.length || dirty ? " (не забудь git add -A, commit и push)" : ""));
process.exit(problems ? 1 : 0);
