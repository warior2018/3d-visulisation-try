// Рана: попадание оружием — регенерация ×0.5 на 3 с (не складывается, новое попадание — отсчёт заново);
// горение / кровотечение рану не дают
export default async function (t, g) {
  const { scene, E, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const me = g.player;
  const was = scene.regenOff, stats = scene.talentStats;
  scene.regenOff = false;
  scene.talentStats = { ...(stats || {}), regenFlat: 10 };
  const foe = scene.spawn("skeleton", { x: me.position.x, y: me.position.y, z: me.position.z + 20 });
  foe.brain = null;
  await g.frames(10);
  const full = me.regen;
  t.check("регенерация без раны", full > 0, `${full}`);
  me.stats.maxHp = me.stats.hp = 1000;
  new E.RangedAttack({ ...C.ATTACKS.pistol, damage: 5, falloff: null }).hit(foe, me, {});
  await g.frames(2);
  t.check("попали оружием — регенерация ×0.5 (и уже в бою — без бонуса «вне боя»)", Math.abs(me.regen - 10 * C.WOUND.regen) < 1e-6, `${me.regen} / ${full}`);
  await g.frames(Math.ceil(60 * (C.WOUND.time + 0.3)));
  t.check("через 3 с — снова полная (ещё в бою)", Math.abs(me.regen - 10) < 1e-6, `${me.regen}`);
  me.receive(new E.Damage({ amount: 5, source: foe, tags: ["dot"] }));
  await g.frames(2);
  t.check("кровотечение / горение рану не дают", Math.abs(me.regen - 10) < 1e-6, `${me.regen}`);
  scene.removeEntity(foe);
  scene.regenOff = was;
  scene.talentStats = stats;
}
