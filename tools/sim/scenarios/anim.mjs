// Анимация: автомат состояний героя (стоим → шаг → бег → в воздухе → верхом), плавные переходы
// (сменили посреди перехода — без рывка), разовый клип входит плавно, павший валится и замирает
export default async function (t, g) {
  const { scene, E } = g;
  const p = g.player;
  const a = p.view.animator;
  t.check("у героя есть клипы Run / Air / Fallen", ["Run", "Air", "Fallen"].every((c) => a.clips.has(c)));
  const m = new E.AnimStates({ states: [{ id: "air", clip: "Air", when: (c) => c.air }, { id: "run", clip: "Run", when: (c) => c.run }, { id: "walk", clip: "Walk", when: (c) => c.moving }, { id: "idle", clip: "Idle" }], fades: { "walk>run": 0.3 } });
  m.update(a, {});
  t.check("стоим — Idle", m.state === "idle" && a.base.name === "Idle");
  m.update(a, { moving: true });
  t.check("идём — Walk", m.state === "walk" && a.base.name === "Walk");
  m.update(a, { moving: true, run: true });
  t.check("бег: свой переход 0.3 с", m.state === "run" && Math.abs(a.fadeLen - 0.3) < 1e-6);
  // посреди перехода — снова сменили: смешиваем от текущей позы (frozen), а не от клипа
  a.update(0.1);
  const before = a.pose.map((x) => [...x.r]);
  m.update(a, { air: true });
  t.check("сменили посреди перехода — от текущей позы", a.frozen === true);
  a.update(0);
  const jump = a.pose.reduce((mx, x, i) => Math.max(mx, Math.abs(x.r[0] - before[i][0]) + Math.abs(x.r[1] - before[i][1])), 0);
  t.check("без рывка (поза почти та же в первый миг)", jump < 0.05, jump.toFixed(3));
  // разовый клип — плавный вход
  a.playOnce("Attack");
  a.update(0.01);
  t.check("разовый клип идёт", !!a.oneShot);
  // игра: герой на земле и стоит — idle; в воздухе дольше 0.18 с — air
  await g.frames(10);
  t.check("в игре: автомат героя работает", !!scene.heroAnim?.state, scene.heroAnim?.state);
  p.position.y += 6;
  p.velocity.y = 0;
  await g.frames(20);
  t.check("в воздухе — поза Air", scene.heroAnim.state === "air", scene.heroAnim.state);
  await g.frames(200);
  t.check("приземлились — снова на ногах", scene.heroAnim.state !== "air", scene.heroAnim.state);
  // павший: валится, поза Fallen, потом замирает
  const mob = scene.spawn("skeleton", { x: p.position.x + 4, y: p.position.y, z: p.position.z });
  mob.stats.hp = 0;
  for (let i = 0; i < 60; i++) { mob.deadTime += 1 / 60; scene.game.models.update([mob], 1 / 60); }
  t.check("павший: поза Fallen", mob.view.animator.base.name === "Fallen");
  const frozen = mob.view.animator.base.time;
  scene.game.models.update([mob], 0.5);
  t.check("лежит — анимация замерла", mob.view.animator.base.time === frozen);
  scene.removeEntity(mob);
}
