// Фиксированный шаг (тикрейт): тиков ровно rate в секунду при любом FPS; заминки не догоняем; alpha — доля до тика
import { FixedStep } from "../../../engine/core/fixed-step.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };

// одна секунда игры на разных FPS — всегда 60 тиков, dt тика всегда 1/60
for (const fps of [30, 60, 75, 144, 240]) {
  const f = new FixedStep({ rate: 60 });
  let ticks = 0, sumDt = 0, badDt = 0;
  for (let i = 0; i < fps * 10; i++) f.advance(1 / fps, (dt) => { ticks++; sumDt += dt; if (Math.abs(dt - 1 / 60) > 1e-12) badDt++; });
  check(`${fps} FPS: за 10 с ровно 600 тиков по 1/60`, Math.abs(ticks - 600) <= 1 && badDt === 0, `${ticks} тиков`);
}
// неровные кадры (дрожь 5–25 мс) — тики всё равно идут по настоящему времени
{
  const f = new FixedStep({ rate: 60 });
  let seed = 7, t = 0, ticks = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (t < 10) { const d = 0.005 + rnd() * 0.02; t += d; f.advance(d, () => ticks++); }
  check("неровные кадры: тиков = время × 60", Math.abs(ticks - Math.floor(t * 60)) <= 1, `${ticks} при ${t.toFixed(3)} с`);
}
// 128 тиков
{
  const f = new FixedStep({ rate: 128 });
  let ticks = 0;
  for (let i = 0; i < 600; i++) f.advance(1 / 60, () => ticks++);
  check("тикрейт 128: за 10 с — 1280 тиков", Math.abs(ticks - 1280) <= 1, `${ticks}`);
}
// заминка в 2 с — не больше maxSteps тиков за кадр, остальное выброшено
{
  const f = new FixedStep({ rate: 60, maxSteps: 8 });
  const n = f.advance(2, () => {});
  check("заминка 2 с: за кадр не больше 8 тиков", n === 8, `${n}`);
  check("заминка: остаток выброшен (не догоняем в следующих кадрах)", f.acc < f.dt && f.dropped >= 100, `acc ${f.acc.toFixed(4)}, выброшено ${f.dropped}`);
  const next = f.advance(1 / 60, () => {});
  check("следующий обычный кадр — снова 1 тик", next === 1, `${next}`);
}
// alpha: между тиками растёт от 0 к 1; reset
{
  const f = new FixedStep({ rate: 60 });
  f.advance(1 / 144, () => {});
  const a1 = f.alpha;
  f.advance(1 / 144, () => {});
  const a2 = f.alpha;
  check("alpha растёт между тиками", a1 > 0 && a2 > a1 && a2 < 1, `${a1.toFixed(2)} → ${a2.toFixed(2)}`);
  f.reset();
  check("reset: накопленное забыто", f.acc === 0 && f.alpha === 0);
  f.advance(-1, () => {});
  check("отрицательное время не ломает", f.acc === 0);
}
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
