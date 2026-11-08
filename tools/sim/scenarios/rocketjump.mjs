// Ракетный прыжок: выстрел гранатомётом себе под ноги — героя подкидывает вверх и от взрыва, урона себе нет;
// взрыв далеко — не толкает
export default async function (t, g) {
  const { scene } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const P = g.player.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 95;
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  const home = () => { P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5; g.player.velocity.x = g.player.velocity.y = g.player.velocity.z = 0; g.player.dash = null; };
  home();
  const me = g.player;
  const a = g.equip("launcher");
  await g.frames(40);
  home();
  await g.frames(5);
  const hp0 = me.stats.hp, y0 = P.y;
  scene.look.yaw = 0;
  scene.look.pitch = -1.45; // под ноги, чуть вперёд
  scene.updateRig?.();
  a.attack.cooldownLeft = 0;
  a.primary(scene);
  let top = P.y;
  for (let i = 0; i < 60; i++) { await g.frames(1); top = Math.max(top, P.y); }
  t.check("гранатомёт под ноги: подкинуло вверх (до 5 блоков — без урона от падения)", top - y0 > 1.5 && top - y0 < 5, `+${(top - y0).toFixed(2)} м`);
  t.check("ракетный прыжок: урона себе нет", me.stats.hp >= hp0, `${hp0} → ${me.stats.hp}`);

  // взрыв далеко — не толкает
  for (let i = 0; i < 120 && !me.onGround; i++) await g.frames(1);
  home();
  await g.frames(3);
  scene.rocketJump({ x: P.x + 8, y: P.y, z: P.z }, 2);
  t.check("взрыв далеко — не толкает", !me.dash);
  // взрыв сбоку вплотную — отбрасывает от взрыва
  scene.rocketJump({ x: P.x + 0.6, y: P.y + 0.3, z: P.z }, 2);
  t.check("взрыв сбоку — отбрасывает в другую сторону и вверх", me.dash && me.dash.x < 0 && me.dash.y > 0, JSON.stringify(me.dash && { x: me.dash.x, y: me.dash.y }));
}
