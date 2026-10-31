import { Profiler } from "../../../engine/core/profiler.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// Подставные часы: время задаём сами — проверяем точные цифры
let clock = 0;
const p = new Profiler({ history: 300, statsEvery: 1000, now: () => clock });
const AI = p.register("AI"), PATH = p.register("PATH", AI), HUD = p.register("HUD");
p.enabled = true;
// Кадр: AI = a мс (из них PATH = b), HUD = h, весь кадр = f; в AI — calls вызовов
const frame = (a, b, h, f, calls = 1) => {
  for (let c = 0; c < calls; c++) {
    p.begin(AI); clock += a / calls - b / calls;
    p.begin(PATH); clock += b / calls; p.end(PATH);
    p.end(AI);
  }
  p.begin(HUD); clock += h; p.end(HUD);
  clock += f - a - h; // остальное — не размечено
  p.endFrame(f);
};

// 1. 60 кадров: 59 обычных и один тяжёлый
for (let i = 0; i < 59; i++) frame(4, 1, 2, 10, 2);
frame(40, 30, 2, 50, 2);
clock = 1000; p.computeStats();
const s = p.stats;
check("кадров в статистике 60", s.frames === 60);
check("AI: среднее (59·4+40)/60 = 4.6", near(s.avg[AI], 4.6, 1e-6), s.avg[AI].toFixed(3));
check("AI: максимум 40", near(s.max[AI], 40, 1e-6), s.max[AI]);
check("AI: 95-й процентиль — обычный кадр (4), один выброс его не портит", near(s.p95[AI], 4, 1e-6), s.p95[AI]);
check("кадр: среднее (59·10+50)/60", near(s.frame.avg, (59 * 10 + 50) / 60, 1e-6), s.frame.avg.toFixed(3));
check("кадр: максимум 50", near(s.frame.max, 50, 1e-6));
check("доля AI = 4.6 / 10.667", near(s.share[AI], 4.6 / ((59 * 10 + 50) / 60), 1e-6), (s.share[AI] * 100).toFixed(1) + "%");
check("PATH (вложенная) не считается в «прочее»: прочее = кадр − AI − HUD = 4 мс в обычном кадре", near(s.other.avg, (59 * 4 + 8) / 60, 1e-6), s.other.avg.toFixed(3));
check("вызовов AI в среднем 2 за кадр", near(s.calls[AI], 2, 1e-9), s.calls[AI]);
check("version вырос", s.version === 1);

// 2. Пересчёт берёт только новые кадры
for (let i = 0; i < 30; i++) frame(1, 0, 1, 5);
clock = 2000; p.computeStats();
check("второй пересчёт — 30 новых кадров", s.frames === 30 && near(s.avg[AI], 1, 1e-6) && near(s.max[AI], 1, 1e-6));

// 3. Автопересчёт раз в statsEvery внутри endFrame
const v0 = s.version;
clock = 2990; frame(1, 0, 1, 5); // кадр сам двигает часы на 5 мс → 2995
check("до секунды — не пересчитывает", s.version === v0);
clock = 3000; frame(1, 0, 1, 5);
check("прошла секунда — пересчитал сам", s.version === v0 + 1);

// 4. Кольцо: больше history кадров — хранит последние, frameAgo (автопересчёт здесь выключаем)
p.statsEvery = Infinity;
for (let i = 0; i < 400; i++) frame(1, 0, 1, i);
check("кольцо заполнено до 300", p.filled === 300);
check("frameAgo(0) — последний кадр (399)", p.frameAgo(0) === 399 && p.frameAgo(299) === 100, `${p.frameAgo(0)} / ${p.frameAgo(299)}`);
check("frameAgo дальше истории — 0", p.frameAgo(300) === 0);
clock += 1000; p.computeStats();
check("кадров с прошлого раза больше, чем история — берёт 300", s.frames === 300);

// 5. Выключен — endFrame ничего не делает
const q = new Profiler(); q.register("X"); q.endFrame(10);
check("выключен — буфер пуст", q.filled === 0);

// 6. Мусор: 100 000 кадров записи (без пересчёта)
const m = new Profiler({ statsEvery: Infinity }); for (let i = 0; i < 40; i++) m.register("S" + i); m.enabled = true;
for (let i = 0; i < 1000; i++) m.endFrame(1);
global.gc(); const h0 = process.memoryUsage().heapUsed;
const t0 = performance.now();
for (let i = 0; i < 100000; i++) { for (let id = 0; id < 40; id++) { m.begin(id); m.end(id); } m.endFrame(1); }
const dt = performance.now() - t0;
const h1 = process.memoryUsage().heapUsed;
check("запись кадра (40 систем) — мусора почти нет", h1 - h0 < 1048576, ((h1 - h0) / 1024).toFixed(0) + " КБ на 100 000 кадров");
check("кадр с 40 замерами + запись < 0.02 мс", dt / 100000 < 0.02, (dt / 100000 * 1000).toFixed(1) + " мкс");
// пересчёт раз в секунду: 128 систем × 300 кадров
const big = new Profiler(); for (let i = 0; i < 128; i++) big.register("B" + i); big.enabled = true;
for (let i = 0; i < 300; i++) big.endFrame(16);
big.sinceStats = 300; const t1 = performance.now(); big.computeStats(); const dc = performance.now() - t1;
check("пересчёт (128 систем × 300 кадров) < 5 мс раз в секунду", dc < 5, dc.toFixed(2) + " мс");

console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
