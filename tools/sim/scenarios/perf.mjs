// Бюджет производительности: нашествие (3 отрезка по 10 с) с профайлером, средний кадр и 95-й процентиль сравниваются
// с эталоном ЭТОЙ машины (perf-baseline.json, ключ — имя компьютера и процессор). Эталона нет — создаётся.
// Допуск — на шум: среднее +35 % (и не меньше +0.2 мс), 95-й процентиль ×2 (и не меньше +1 мс): он шумнее.
// Новый эталон (после оптимизации или если машина другая): npm run test -- perf --update-baseline
import fs from "node:fs";
import os from "node:os";

const FILE = new URL("../perf-baseline.json", import.meta.url);

export default async function (t, g) {
  const { scene, engine } = g;
  const p = engine.profiler;
  scene.invasion.start(1e9);
  await g.frames(600); // разгон: мобы подходят, JIT прогревается
  p.enabled = true;
  // Три отрезка по 10 с: от шума (другие программы, система) спасает лучший из отрезков по среднему
  // и средний (медиана) по 95-му процентилю — один «плохой» отрезок не валит тест
  const segs = [];
  for (let k = 0; k < 3; k++) {
    const times = [];
    await g.frames(600, 1 / 60, (i) => {
      if (i % 60 === 0) {
        const pp = g.player.position;
        let best = null, bd = Infinity;
        for (const e of g.mobs()) if (!e.boss) { const d = Math.hypot(e.position.x - pp.x, e.position.z - pp.z); if (d < bd) { bd = d; best = e; } }
        best?.damage(1e6);
      }
      if (i > 0) times.push(p.frameAgo(0));
    });
    times.sort((x, y) => x - y);
    segs.push({ avg: times.reduce((x, y) => x + y, 0) / times.length, p95: times[Math.floor(times.length * 0.95)] });
  }
  const med = (arr) => arr.slice().sort((x, y) => x - y)[1];
  const now = { avg: Math.min(...segs.map((x) => x.avg)), p95: med(segs.map((x) => x.p95)), mobs: g.mobs().length };
  t.log(`отрезки: ${segs.map((x) => `${x.avg.toFixed(2)}/${x.p95.toFixed(2)}`).join("  ")} (среднее/95-й, мс)`);
  const key = `${os.hostname()} | ${os.cpus()[0]?.model || "?"}`;
  const all = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  t.log(`кадр: среднее ${now.avg.toFixed(3)} мс, 95-й процентиль ${now.p95.toFixed(3)} мс, мобов ${now.mobs}`);
  if (!all[key] || process.env.VOID_UPDATE_BASELINE) {
    all[key] = { ...now, date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
    t.check(`эталон записан для «${key}»`, true);
    return;
  }
  const b = all[key];
  t.log(`эталон (${b.date}): среднее ${b.avg.toFixed(3)} мс, 95-й процентиль ${b.p95.toFixed(3)} мс`);
  t.check("средний кадр не хуже эталона (+35 %)", now.avg <= Math.max(b.avg * 1.35, b.avg + 0.2), `${now.avg.toFixed(3)} против ${b.avg.toFixed(3)}`);
  t.check("95-й процентиль не хуже эталона (×2)", now.p95 <= Math.max(b.p95 * 2, b.p95 + 1), `${now.p95.toFixed(3)} против ${b.p95.toFixed(3)}`);
  t.check("профайлер: ошибок разметки нет", p.mismatches === 0);
}
