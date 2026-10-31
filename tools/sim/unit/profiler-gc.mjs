import { Profiler } from "../../../engine/core/profiler.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- 1. Раскладка пауз по кадрам (подставные часы, паузы подаём сами) ----
let clock = 0;
const p = new Profiler({ now: () => clock, watchGc: false, statsEvery: Infinity, memoryEvery: Infinity });
p.register("X");
p.enabled = true;
// 5 кадров по 10 мс подряд: [0,10) [10,20) [20,30) [30,40) [40,50); между 50 и 60 — простой; кадр [60,70)
for (let i = 0; i < 5; i++) { clock += 10; p.endFrame(10); }
clock = 70; p.endFrame(10);
p.addGc(12, 3, 1); //  мелкая, целиком в кадре 2 ([10,20))
p.addGc(28, 5, 4); //  полная, на стыке: 2 мс в кадре [20,30) и 3 мс в [30,40)
p.addGc(52, 4, 1); //  в простое между кадрами — ни один кадр не задела
p.addGc(66, 8, 4); //  4 мс в последнем кадре [60,70), 4 мс после него
check("кадр [10,20): 3 мс сборки", near(p.frameGc(4), 3), p.frameGc(4));
check("пауза на стыке делится: 2 мс + 3 мс", near(p.frameGc(3), 2) && near(p.frameGc(2), 3), `${p.frameGc(3)} + ${p.frameGc(2)}`);
check("кадр без сборки — 0", p.frameGc(1) === 0 && p.frameGc(5) === 0);
check("последний кадр — 4 мс (вторая половина паузы после кадра)", near(p.frameGc(0), 4), p.frameGc(0));
clock = 1000; p.computeStats();
const g = p.stats.gc;
check("за секунду: 4 паузы, 20 мс, самая длинная 8", g.count === 4 && near(g.ms, 20) && near(g.max, 8), JSON.stringify(g));
check("мелкие 7 мс, полные 13 мс", near(g.minor, 7) && near(g.major, 13));
check("между кадрами: 4 (простой) + 4 (после кадра) = 8 мс", near(g.between, 8), g.between);
check("кадров со сборкой — 4", g.frames === 4, g.frames);
clock = 2000; p.computeStats();
check("следующая секунда без пауз — всё обнулилось", p.stats.gc.count === 0 && p.stats.gc.ms === 0 && p.stats.gc.frames === 0);
// пересчёт без кадров (окно на паузе) — сборщик всё равно считается
p.addGc(1500, 2, 1); clock = 3000; p.computeStats();
check("сборка без кадров — учтена, кадров 0", p.stats.gc.count === 1 && p.stats.frames === 0 && p.stats.gc.between === 2);
const q = new Profiler({ watchGc: false }); q.addGc(0, 5, 1);
check("выключен — паузы не копит", q.gcSum.count === 0);

// ---- 2. Настоящий сборщик и память (реальные часы) ----
const r = new Profiler({ statsEvery: Infinity, memoryEvery: 1 });
r.register("ALLOC");
r.enabled = true;
check("включили — слушаем сборщик", r.observer !== null);
let keep = null;
const t0 = performance.now();
for (let f = 0; f < 120; f++) {
  const fs = performance.now();
  r.begin(0);
  for (let i = 0; i < 2000; i++) keep = new Array(64).fill(f); // мусор: ~1 МБ на кадр
  r.end(0);
  r.endFrame(performance.now() - fs);
  await new Promise((res) => setImmediate(res)); // кадры, как в движке: между ними приходят паузы сборщика
}
await new Promise((res) => setTimeout(res, 50));
r.computeStats();
const rg = r.stats.gc, mem = r.stats.memory;
const secs = (performance.now() - t0) / 1000;
console.log(`     реально: ${secs.toFixed(2)} с, сборок ${rg.count}, ${rg.ms.toFixed(1)} мс, макс ${rg.max.toFixed(2)}, мелких ${rg.minor.toFixed(1)} / полных ${rg.major.toFixed(1)}, кадров со сборкой ${rg.frames}, alloc ≈ ${mem.alloc.toFixed(0)} МБ/с, heap ${mem.heap.toFixed(0)} МБ`);
check("сборки пойманы", rg.count > 0);
check("паузы легли на кадры", rg.frames > 0 && rg.frames <= 120);
check("выделение памяти видно (> 5 МБ/с)", mem.alloc > 5, mem.alloc.toFixed(0) + " МБ/с");
check("heap и rss заполнены", mem.heap > 1 && mem.rss > mem.heap);
r.enabled = false;
check("выключили — перестали слушать", r.observer === null);
void keep;

console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
