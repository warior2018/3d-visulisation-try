// Блок отражает выстрелы: пуля (луч) и снаряд (болт, камень) спереди — проходит половина, отбитая половина
// летит туда, куда смотрит блокирующий; попал во врага — урон этой половины. Удар сбоку не отбивается
export default async function (t, g) {
  const { scene, E, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const P = g.player.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 95;
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5;
  scene.look.yaw = 0;
  scene.look.pitch = 0;
  g.equip("machete");
  await g.frames(30);
  const dir = scene.look.lookDirection();
  const len = Math.hypot(dir.x, dir.z);
  const foe = scene.spawn("skeleton", { x: P.x + (dir.x / len) * 6, y: P.y, z: P.z + (dir.z / len) * 6 });
  foe.brain = null;
  foe.stats.maxHp = foe.stats.hp = 5000;
  await g.frames(2);
  Object.assign(foe.position, { x: P.x + (dir.x / len) * 6, y: P.y, z: P.z + (dir.z / len) * 6 });
  scene.updateRig?.();
  const me = g.player;
  me.stats.maxHp = me.stats.hp = 1000;
  me.stats.resist = {};
  const gun = new E.RangedAttack({ ...C.ATTACKS.pistol, damage: 40, falloff: null });

  // пуля спереди без блока — весь урон, отражения нет
  gun.hit(foe, me, {});
  t.check("без блока: пуля — весь урон", me.stats.hp === 960 && foe.stats.hp === 5000, `${me.stats.hp} / ${foe.stats.hp}`);

  // блок: пуля — половина нам, половина — лучом во врага (смотрим на него)
  me.stats.hp = 1000;
  scene.blockCooldown = 0;
  scene.tryBlock();
  gun.hit(foe, me, {});
  t.check("блок: пуля — проходит половина", me.stats.hp === 980, `${me.stats.hp}`);
  t.check("блок: отражённая половина попала во врага лучом", foe.stats.hp === 4980, `${foe.stats.hp}`);

  // блок: снаряд (камень моба) — половина нам, отражённый снаряд долетает до врага
  me.stats.hp = 1000;
  foe.stats.hp = 5000;
  scene.blockCooldown = 0;
  scene.tryBlock();
  const stone = new E.ThrowAttack({ ...C.ATTACKS.stoneThrow, damage: 30 });
  stone.hit(foe, me, { shot: { projectile: { item: "stone", speed: 20, gravity: 0 } } });
  t.check("блок: снаряд — проходит половина", me.stats.hp === 985, `${me.stats.hp}`);
  for (let i = 0; i < 40 && foe.stats.hp === 5000; i++) await g.frames(1);
  t.check("блок: отражённый снаряд долетел до врага", foe.stats.hp === 4985, `${foe.stats.hp}`);

  // отвернулись: блок не ловит пулю со спины — весь урон
  me.stats.hp = 1000;
  scene.look.yaw += Math.PI;
  await g.frames(2);
  scene.blockCooldown = 0;
  scene.tryBlock();
  gun.hit(foe, me, {});
  t.check("пуля со спины — блок не ловит", me.stats.hp === 960, `${me.stats.hp}`);
}
