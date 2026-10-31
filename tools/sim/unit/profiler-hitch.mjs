import { Profiler } from "../../../engine/core/profiler.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

let clock = 0, ctxCalls = 0;
const p = new Profiler({ now: () => clock, watchGc: false, statsEvery: Infinity, memoryEvery: Infinity, graceFrames: 5, hitchSlots: 3 });
const AI = p.register("AI"), PATH = p.register("PATH", AI), HUD = p.register("HUD");
p.hitchContext = () => { ctxCalls++; return "MOBS 52  INVASION"; };
p.enabled = true;
// кадр: работа work (AI = ai, из них PATH = path, HUD = hud), начинается через gap после прошлого
const frame = (gap, ai, path, hud, work) => {
  clock += gap - work; // ждём до начала кадра
  p.begin(AI); clock += ai - path; p.begin(PATH); clock += path; p.end(PATH); p.end(AI);
  p.begin(HUD); clock += hud; p.end(HUD);
  clock += work - ai - hud;
  p.endFrame(work, gap);
};

// 1. Разгон: первые 5 кадров не ловим, даже тяжёлые
for (let i = 0; i < 5; i++) frame(100, 80, 0, 1, 90);
check("разгон — рывков нет", p.hitchCount === 0 && ctxCalls === 0);
// 2. Обычные кадры — не рывок
for (let i = 0; i < 20; i++) frame(16, 4, 1, 2, 8);
check("обычные кадры — не рывок, контекст не спрашивали", p.hitchCount === 0 && ctxCalls === 0);
// 3. Рывок по работе кадра
frame(70, 55, 40, 2, 60);
let h = p.hitches(1)[0];
check("рывок по работе пойман", p.hitchCount === 1 && near(h.frame, 60) && near(h.gap, 70));
check("в снимке — системы верхнего уровня по убыванию (AI 55, HUD 2), без вложенных", h.top.length === 2 && h.top[0].name === "AI" && near(h.top[0].ms, 55) && h.top[1].name === "HUD", JSON.stringify(h.top));
check("контекст игры записан", h.context === "MOBS 52  INVASION" && ctxCalls === 1);
// 4. Рывок по промежутку: кадр лёгкий, но между кадрами прошло 120 мс (например, сборка мусора)
frame(120, 3, 0, 2, 6);
h = p.hitches(1)[0];
check("рывок по промежутку пойман (работа 6, промежуток 120)", p.hitchCount === 2 && near(h.frame, 6) && near(h.gap, 120));
// пауза сборщика в окне этого рывка (окно — последние 120 мс до конца кадра)
p.addGc(clock - 100, 70, 4);
check("пауза сборщика в окне рывка — в снимке", near(p.hitches(1)[0].gc, 70), p.hitches(1)[0].gc);
check("и не попала в прошлый рывок", near(p.hitches(2)[1].gc, 0));
// 5. Промежуток 0 (вышли из меню) — по промежутку не ловим
frame(0, 3, 0, 2, 6); clock += 500; p.endFrame(6, 0);
check("промежуток неизвестен (0) — не рывок", p.hitchCount === 2);
// 6. Кольцо на 3: старые вытесняются, порядок — новые первыми
for (let i = 0; i < 4; i++) frame(16, 52 + i, 0, 1, 60 + i);
const list = p.hitches();
check("кольцо хранит 3 последних, новые первыми", list.length === 3 && near(list[0].frame, 63) && near(list[2].frame, 61), list.map((x) => x.frame).join(", "));
check("всего поймано 6", p.hitchCount === 6);
// 7. За минуту
check("за минуту — 6", p.hitchesPerMinute() === 6);
clock += 61000;
check("через минуту — 0", p.hitchesPerMinute() === 0);
// 8. Порог настраивается
p.hitchMs = 100;
frame(16, 70, 0, 1, 80);
check("порог 100 — кадр 80 не рывок", p.hitchCount === 6);
// 9. Ошибка в контексте не роняет
p.hitchContext = () => { throw new Error("boom"); };
frame(16, 150, 0, 1, 160);
check("ошибка в контексте — снимок есть, игра цела", p.hitches(1)[0].context.startsWith("context error"));
// 10. Повторное включение — снова разгон
p.enabled = false; p.enabled = true;
frame(16, 150, 0, 1, 160);
check("после выключения/включения — снова разгон", p.hitchCount === 7);
// 11. Мусор: снимок не выделяет памяти, кроме строки контекста
const m = new Profiler({ watchGc: false, statsEvery: Infinity, memoryEvery: Infinity, graceFrames: 0 });
for (let i = 0; i < 40; i++) m.register("S" + i);
m.enabled = true;
for (let i = 0; i < 100; i++) m.endFrame(80, 90);
global.gc(); const h0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 10000; i++) m.endFrame(80, 90);
const h1 = process.memoryUsage().heapUsed;
check("10 000 рывков подряд (без контекста) — мусора почти нет", h1 - h0 < 1048576, ((h1 - h0) / 1024).toFixed(0) + " КБ");

console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
