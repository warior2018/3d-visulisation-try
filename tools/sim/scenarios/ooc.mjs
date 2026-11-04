// Вне боя: нет мобов-охотников рядом и 5 с без урона (по герою и героем) — +10 % скорости, регенерация ×3
export const immortal = false;
export default async function (t, g) {
  const { scene, C, E } = g;
  const O = C.OUT_OF_COMBAT, p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  scene.talentStats.regenPct = 0.01; // как с талантом REGENERATION: 1 % HP в секунду
  scene.lastHurt = scene.lastHit = -1e9;
  await g.frames(10);
  t.check("никого рядом — вне боя", scene.outOfCombat === true);
  t.check("бонус скорости +10 %", Math.abs(p.speedBonuses.ooc - O.speed) < 1e-9);
  t.check("регенерация ×3", Math.abs(p.regen - p.stats.maxHp * 0.01 * O.regenMult) < 1e-9);
  t.check("значок OOC среди эффектов", scene.buffList().some((b) => b.icon === "OOC"));
  // моб ударил — в бою, 5 с
  const mob = scene.spawn("skeleton", { x: p.position.x + 20, y: p.position.y, z: p.position.z });
  p.receive(new E.Damage({ amount: 1, source: mob }));
  await g.frames(2);
  t.check("получил урон от моба — в бою", scene.outOfCombat === false && !p.speedBonuses.ooc);
  t.check("регенерация обычная", Math.abs(p.regen - p.stats.maxHp * 0.01) < 1e-9);
  await g.frames(Math.ceil(O.delay * 60) + 5);
  t.check("через 5 с — снова вне боя", scene.outOfCombat === true);
  // сам ударил — в бою
  mob.receive(new E.Damage({ amount: 1, source: p }));
  await g.frames(2);
  t.check("ранил моба — в бою", scene.outOfCombat === false);
  await g.frames(Math.ceil(O.delay * 60) + 5);
  // моб охотится рядом (ближе 5 блоков) — в бою, даже без урона
  mob.position.x = p.position.x + 3;
  mob.aggro = p;
  await g.frames(2);
  t.check("моб-охотник ближе 5 блоков — в бою", scene.outOfCombat === false);
  // все ушли (и случайно появившиеся рядом мобы тоже), урона давно не было — вне боя
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  scene.lastHurt = scene.lastHit = -1e9;
  await g.frames(2);
  t.check("ушёл — вне боя", scene.outOfCombat === true);
}
