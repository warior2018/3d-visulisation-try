import { Profiler } from "../../../engine/core/profiler.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };

// 1. Регистрация
const p = new Profiler();
const AI = p.register("AI"), PATH = p.register("PATH", AI), PHYS = p.register("PHYS"), SUB = p.register("SUB", "PHYS");
check("номера по порядку", AI === 0 && PATH === 1 && PHYS === 2 && SUB === 3);
check("повторная регистрация — тот же номер", p.register("AI") === AI && p.count === 4);
check("родитель по номеру и по имени", p.parent[PATH] === AI && p.parent[SUB] === PHYS && p.parent[AI] === -1);

// 2. Выключен — ничего не считает
p.begin(AI); busy(2); p.end(AI);
check("выключен — время 0", p.time[AI] === 0 && p.calls[AI] === 0);

// 3. Время и вложенность
p.enabled = true;
p.begin(AI); busy(5); p.begin(PATH); busy(10); p.end(PATH); p.end(AI);
check("ребёнок ~10 мс", Math.abs(p.time[PATH] - 10) < 1.5, p.time[PATH].toFixed(2));
check("родитель включает ребёнка ~15 мс", Math.abs(p.time[AI] - 15) < 2, p.time[AI].toFixed(2));
check("чистое время родителя ~5 мс", Math.abs(p.selfTime(AI) - 5) < 1.5, p.selfTime(AI).toFixed(2));
check("глубина вернулась в 0", p.depth === 0);

// 4. Несколько вызовов копятся
for (let i = 0; i < 3; i++) { p.begin(PHYS); busy(1); p.end(PHYS); }
check("3 вызова, ~3 мс", p.calls[PHYS] === 3 && Math.abs(p.time[PHYS] - 3) < 1, `${p.calls[PHYS]} / ${p.time[PHYS].toFixed(2)}`);

// 5. Ошибки разметки не ломают
p.end(SUB); // не открывали
check("end неоткрытого — mismatch, без падения", p.mismatches === 1 && p.depth === 0);
p.begin(PHYS); p.begin(SUB); busy(1); p.end(PHYS); // забыли end(SUB)
check("забытый end внутри — закрылся, mismatch", p.mismatches === 2 && p.depth === 0 && p.time[SUB] > 0);
const deep = new Profiler({ maxDepth: 4 }); deep.enabled = true; const D = deep.register("D");
for (let i = 0; i < 6; i++) deep.begin(D);
for (let i = 0; i < 6; i++) deep.end(D);
check("слишком глубоко — без падения", deep.depth === 0 && deep.mismatches >= 2, "mismatches " + deep.mismatches);

// 6. measure и сброс кадра
const r = p.measure(AI, () => 42);
check("measure возвращает результат", r === 42);
try { p.measure(AI, () => { throw new Error("x"); }); } catch {}
check("measure с ошибкой — замер закрыт", p.depth === 0);
p.begin(AI); p.resetFrame();
check("resetFrame: время, счётчики, стек — 0", p.time[AI] === 0 && p.calls[AI] === 0 && p.depth === 0);

// 7. Цена: выключенный и включённый, мусор
const N = 2_000_000;
const loop = (prof) => { const t = performance.now(); for (let i = 0; i < N; i++) { prof.begin(AI); prof.end(AI); } return performance.now() - t; };
const off = new Profiler(); off.register("AI"); loop(off);
const tOff = loop(off);
const on = new Profiler(); on.register("AI"); on.enabled = true; loop(on); on.resetFrame();
global.gc?.();
const h0 = process.memoryUsage().heapUsed;
const tOn = loop(on);
const h1 = process.memoryUsage().heapUsed;
check("выключен: < 5 нс на пару begin/end", (tOff / N) * 1e6 < 5, ((tOff / N) * 1e6).toFixed(2) + " нс");
check("включён: < 150 нс на пару begin/end", (tOn / N) * 1e6 < 150, ((tOn / N) * 1e6).toFixed(1) + " нс");
check("включён: мусора почти нет (< 1 МБ на 2 млн замеров)", h1 - h0 < 1048576, ((h1 - h0) / 1024).toFixed(0) + " КБ");

console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
