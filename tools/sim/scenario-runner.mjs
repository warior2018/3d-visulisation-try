// Запуск одного сценария в отдельном процессе (run.mjs зовёт): своя игра, свой мир во временной папке
import { pathToFileURL } from "node:url";
import { createGame } from "./harness.mjs";
import { createChecker } from "./lib.mjs";

const file = process.argv[2];
const mod = await import(pathToFileURL(file).href);
const t = createChecker();
const g = await createGame({ world: mod.world || "copy", immortal: mod.immortal ?? true }); // immortal = false — сценарий сам следит за здоровьем
const t0 = performance.now();
try {
  await mod.default(t, g);
} catch (e) {
  t.check("сценарий дошёл до конца без ошибки", false, e.stack.split("\n").slice(0, 4).join(" | "));
}
g.cleanup();
console.log(`итого: ${t.ok} OK, ${t.fail} FAIL (${((performance.now() - t0) / 1000).toFixed(1)} с)`);
process.exit(t.fail ? 1 : 0);
