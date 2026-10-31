// Движок и тикрейт: сцена с fixedUpdate получает ровно engine.fixed.rate тиков в секунду при любом FPS,
// потом frameUpdate раз в кадр; сцена без fixedUpdate — по-старому update раз в кадр
export default async function (t, g) {
  const { engine } = g;
  const log = { fixed: 0, frame: 0, update: 0, dts: new Set(), alpha: [] };
  const tickScene = {
    fixedUpdate(dt) { log.fixed++; log.dts.add(dt); },
    frameUpdate(dt, alpha) { log.frame++; log.alpha.push(alpha); },
    update() { log.update++; },
  };
  engine.prevLiveEnd = 1; // как будто прошлый кадр был живым
  engine.fixed.reset();
  for (let i = 0; i < 144 * 2; i++) engine.updateScene(tickScene, undefined, 1 / 144, 1 / 144);
  t.check("144 FPS, 2 с: 120 тиков", Math.abs(log.fixed - 120) <= 1, `${log.fixed}`);
  t.check("dt тика всегда 1/60", log.dts.size === 1 && Math.abs([...log.dts][0] - 1 / 60) < 1e-12);
  t.check("frameUpdate — раз в кадр, update не зовётся", log.frame === 288 && log.update === 0, `${log.frame} / ${log.update}`);
  t.check("alpha в пределах 0…1", log.alpha.every((a) => a >= 0 && a < 1));
  log.fixed = 0;
  for (let i = 0; i < 30 * 2; i++) engine.updateScene(tickScene, undefined, 1 / 30, 1 / 30);
  t.check("30 FPS, 2 с: тоже 120 тиков", Math.abs(log.fixed - 120) <= 1, `${log.fixed}`);
  // после меню / паузы (prevLiveEnd = 0) — не больше одного тика, даже если «прошло» много
  log.fixed = 0;
  engine.prevLiveEnd = 0;
  engine.updateScene(tickScene, undefined, 0.1, 0.1);
  t.check("первый кадр после паузы: 1 тик, а не 6", log.fixed === 1, `${log.fixed}`);
  // старая сцена без fixedUpdate
  const old = { n: 0, dt: 0, update(dt) { this.n++; this.dt = dt; } };
  engine.updateScene(old, undefined, 0.02, 0.017);
  t.check("сцена без fixedUpdate: update раз в кадр со сглаженным dt", old.n === 1 && old.dt === 0.017);
  t.check("тикрейт движка по умолчанию — 60", engine.fixed.rate === 60);
}
