// Тикрейт в игре: мир считается 60 раз в секунду при любом FPS — прыжок одной высоты на 30, 60 и 144 FPS,
// тиков в секунду всегда 60
export default async function (t, g) {
  const { scene, engine, E } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const p = g.player;
  g.equip("machete");
  const code = E.KEYS[engine.input.bindings.jump.split(":")[1]];
  const results = [];
  for (const fps of [30, 60, 144, 240]) {
    for (let i = 0; i < fps && !p.onGround; i++) await g.frames(1, 1 / fps);
    await g.frames(Math.ceil(fps / 4), 1 / fps); // постоять
    const y0 = p.position.y;
    const ticks0 = engine.fixed.count;
    engine.input.pressedKeys.add(code);
    engine.input.keys.add(code);
    let peak = y0;
    await g.frames(1, 1 / fps);
    engine.input.keys.delete(code);
    for (let i = 0; i < fps * 1.5; i++) {
      await g.frames(1, 1 / fps);
      peak = Math.max(peak, p.position.y);
    }
    const seconds = (fps * 1.5 + 1) / fps;
    results.push({ fps, h: peak - y0, tps: (engine.fixed.count - ticks0) / seconds });
  }
  const base = results.find((r) => r.fps === 60);
  t.check("прыжок вообще был", base.h > 0.5, base.h.toFixed(3));
  for (const r of results) {
    t.check(`${r.fps} FPS: прыжок той же высоты, что на 60`, Math.abs(r.h - base.h) < 1e-6, `${r.h.toFixed(4)} против ${base.h.toFixed(4)}`);
    t.check(`${r.fps} FPS: ~60 тиков в секунду`, Math.abs(r.tps - 60) < 3, r.tps.toFixed(1));
  }

  // Ходьба на 144 Гц: камера (глаза) едет ровно, а не рывками раз в 2–3 кадра (сглаживание между тиками)
  const fwd = E.KEYS[engine.input.bindings.forward.split(":")[1]];
  // ровная дорожка в воздухе (в любом мире ничего не мешает идти): 3 × 60 блоков вдоль +Z
  const bx = Math.floor(p.position.x), bz = Math.floor(p.position.z), by = 90;
  for (let x = -1; x <= 1; x++) for (let z = 0; z < 60; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  p.position.x = bx + 0.5; p.position.y = by + 1; p.position.z = bz + 1.5;
  p.velocity.x = p.velocity.y = p.velocity.z = 0;
  scene.look.yaw = 0; scene.look.pitch = 0;
  for (let i = 0; i < 144 && !p.onGround; i++) await g.frames(1, 1 / 144);
  engine.input.keys.add(fwd);
  await g.frames(72, 1 / 144); // разогнаться
  const steps = [];
  let last = null;
  for (let i = 0; i < 144; i++) {
    await g.frames(1, 1 / 144);
    const c = scene.look.position;
    if (last) steps.push(Math.hypot(c.x - last.x, c.z - last.z));
    last = { x: c.x, z: c.z };
  }
  engine.input.keys.delete(fwd);
  steps.sort((a, b) => a - b);
  const mid = steps[steps.length >> 1], mean = steps.reduce((a, b) => a + b, 0) / steps.length, still = steps.filter((d) => d < mean * 0.3).length;
  t.check("144 Гц, ходьба: камера сдвигается каждый кадр (нет кадров «на месте»)", still <= 3, `кадров без сдвига: ${still} из ${steps.length}`);
  t.check("144 Гц, ходьба: шаги камеры ровные", steps[Math.floor(steps.length * 0.9)] < mid * 1.6, `медиана ${(mid * 100).toFixed(2)} см, 90% ${(steps[Math.floor(steps.length * 0.9)] * 100).toFixed(2)} см`);
}
