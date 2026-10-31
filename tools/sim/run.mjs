// ============================================================
//  Автотесты VOID: npm run test
//    npm run test                    — всё: модульные тесты движка (unit/) и сценарии игры (scenarios/)
//    npm run test -- invasion        — только то, в имени чего есть «invasion» (можно несколько слов)
//    npm run test -- --verbose       — печатать каждую проверку, а не только упавшие
//    npm run test -- --update-baseline — записать новые эталонные цифры производительности (perf)
//  Каждый файл — в своём процессе (свои синглтоны, свой мир во временной папке). Код выхода: 0 — всё прошло.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const updateBaseline = args.includes("--update-baseline");
const filters = args.filter((a) => !a.startsWith("--"));

const list = (dir) => fs.readdirSync(path.join(HERE, dir)).filter((f) => f.endsWith(".mjs")).sort().map((f) => ({ kind: dir, name: `${dir}/${f.replace(/\.mjs$/, "")}`, file: path.join(HERE, dir, f) }));
const all = [...list("unit"), ...list("scenarios")].filter((x) => !filters.length || filters.some((w) => x.name.includes(w)));

if (!all.length) {
  console.log("нет тестов под фильтр: " + filters.join(" "));
  process.exit(1);
}

let ok = 0, fail = 0, broken = 0;
const t0 = performance.now();
console.log(`VOID автотесты: ${all.length} файлов\n`);
for (const x of all) {
  const node = ["--expose-gc"];
  const argv = x.kind === "unit" ? [...node, x.file] : [...node, "--import", path.join(HERE, "register.mjs"), path.join(HERE, "scenario-runner.mjs"), x.file];
  const s = performance.now();
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", env: { ...process.env, VOID_UPDATE_BASELINE: updateBaseline ? "1" : "" }, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/итого: (\d+) OK, (\d+) FAIL/);
  const sec = ((performance.now() - s) / 1000).toFixed(1);
  if (!m) {
    broken++;
    console.log(`✗ ${x.name.padEnd(28)} УПАЛ (нет итога, код ${r.status}) ${sec} с`);
    console.log(out.split("\n").slice(-12).map((l) => "    " + l).join("\n"));
    continue;
  }
  const [o, f] = [+m[1], +m[2]];
  ok += o;
  fail += f;
  console.log(`${f ? "✗" : "✓"} ${x.name.padEnd(28)} ${String(o).padStart(3)} OK${f ? `, ${f} FAIL` : ""}  ${sec} с`);
  const lines = out.split("\n").filter((l) => l.trim() && !l.startsWith("итого"));
  if (verbose) for (const l of lines) console.log("    " + l);
  else for (const l of lines.filter((l2) => l2.startsWith("FAIL") || /Error|at /.test(l2.slice(0, 12)))) console.log("    " + l);
}
const total = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`\nИТОГО: ${ok} проверок OK, ${fail} FAIL${broken ? `, упавших файлов ${broken}` : ""} — ${total} с`);
process.exit(fail || broken ? 1 : 0);
