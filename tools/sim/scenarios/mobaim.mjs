// Стрелок-моб с пистолетом целится преимущественно в голову, с небольшой отдачей: с 8 м большинство пуль
// попадает, заметная часть — хедшоты, но не все
export default async function (t, g) {
  const { scene, E, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const P = g.player.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 95;
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5;
  await g.frames(5);
  const me = g.player;
  me.invulnerable = false;
  const gunner = scene.spawn("skeleton", { x: P.x, y: P.y, z: P.z + 8, yaw: Math.PI });
  gunner.brain = null;
  gunner.ranged = C.MOB_RANGED.weapons.pistol;
  gunner.rangedDamage = [8, 8];
  const attack = new E.ThrowAttack({ ...C.ATTACKS.mobPistol });
  await g.frames(2);
  Object.assign(gunner.position, { x: P.x, y: P.y, z: P.z + 8 });
  gunner.yaw = Math.PI;
  let hits = 0, heads = 0;
  const recv = me.receive.bind(me);
  me.receive = (d) => { hits++; if (d.part === "head") heads++; me.stats.hp = me.stats.maxHp; return recv(d); };
  const N = 300;
  for (let i = 0; i < N; i++) { me.stats.hp = me.stats.maxHp; scene.mobGunshot(gunner, me, attack); }
  me.receive = recv;
  t.check("стрелок попадает чаще, чем мажет (8 м)", hits / N > 0.6, `${hits}/${N}`);
  t.check("стрелок: хедшотов много, но не все (отдача)", heads / N > 0.3 && heads / N < 0.85, `${heads}/${N}`);
  scene.removeEntity(gunner);
}
