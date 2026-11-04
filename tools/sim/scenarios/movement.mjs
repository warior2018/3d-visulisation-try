// Разгон (MOVEMENT, как в Overwatch): до полной скорости — за доли секунды, разворот — не мгновенный,
// в воздухе управление мягче; отпустил — тормозит быстро
export default async function (t, g) {
  const { scene, engine, E, C } = g;
  const p = g.player, M = C.MOVEMENT;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  g.equip("machete");
  await g.frames(30);
  scene.look.yaw = 0;
  const hs = () => Math.hypot(p.velocity.x, p.velocity.z);
  const W = E.KEYS.W, S = E.KEYS.S;
  engine.input.keys.add(W);
  await g.frames(2);
  const early = hs();
  await g.frames(Math.ceil(M.ground * 60) + 4);
  const full = hs();
  t.check("разгон не мгновенный", early < full * 0.5, `${early.toFixed(2)} из ${full.toFixed(2)}`);
  t.check(`за ~${M.ground} с — полная скорость`, full > scene.controller.speed * 0.95 * (p.speedMultiplier || 1) - 0.2, full.toFixed(2));
  // разворот назад: сначала тормозим, потом разгоняемся (проходит через ноль)
  engine.input.keys.delete(W);
  engine.input.keys.add(S);
  await g.frames(3);
  const dir = Math.sign(p.velocity.z);
  t.check("разворот: в первый миг ещё едем вперёд", dir === Math.sign(scene.controller.speed) || p.velocity.z > 0, p.velocity.z.toFixed(2));
  await g.frames(Math.ceil((M.stop + M.ground) * 60 * 1.6) + 6);
  t.check("через долю секунды — уже назад", p.velocity.z < 0, p.velocity.z.toFixed(2));
  engine.input.keys.delete(S);
  await g.frames(Math.ceil(M.stop * 60) + 4);
  t.check("отпустил — остановился", hs() < 0.05, hs().toFixed(3));
  // спринта нет: Shift зажат — скорость та же (на Shift — способность 3)
  engine.input.keys.add(W);
  engine.input.keys.add(E.KEYS.LSHIFT);
  await g.frames(Math.ceil(M.ground * 60) + 6);
  t.check("Shift — не бег (спринта нет)", Math.abs(hs() - scene.controller.speed * (p.speedMultiplier || 1)) < 0.3, hs().toFixed(2));
  engine.input.keys.delete(E.KEYS.LSHIFT);
  engine.input.keys.delete(W);
  await g.frames(10);
  // мгновенный режим (0) — как раньше
  const keep = { ...scene.controller.accel };
  scene.controller.accel = null;
  engine.input.keys.add(W);
  await g.frames(1);
  t.check("accel = null — мгновенно", hs() > 1, hs().toFixed(2));
  engine.input.keys.delete(W);
  scene.controller.accel = keep;
  await g.frames(10);
}
