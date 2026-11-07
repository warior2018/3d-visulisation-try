// Арбалет стреляет болтом-снарядом: болт летит (не мгновенно), чуть падает (слабая тяжесть), попал — урон,
// пробивает насквозь (второй на линии тоже получает, но меньше)
export default async function (t, g) {
  const { scene, engine, C } = g;
  const p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  // ровная дорожка: ничего на пути болта (мир — копия сохранения игрока, там может быть холм)
  const bx = Math.floor(p.position.x), by = Math.floor(p.position.y), bz = Math.floor(p.position.z);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 24; dz++) {
    for (let y = by; y <= by + 8; y++) scene.world.remove(bx + dx, y, bz + dz);
    scene.world.place(bx + dx, by - 1, bz + dz, [120, 120, 120]);
  }
  scene.look.yaw = 0;
  const a = g.equip("crossbow");
  t.check("у арбалета — снаряд", !!a.attack.projectile);
  scene.look.pitch = 0;
  await g.frames(30); // достать оружие
  const cam = scene.rig.camera, dir = cam.lookDirection();
  const at = (d) => ({ x: cam.position.x + dir.x * d, y: p.position.y, z: cam.position.z + dir.z * d });
  const m1 = scene.spawn("skeleton", at(14)), m2 = scene.spawn("skeleton", at(16));
  for (const m of [m1, m2]) { m.stats.maxHp = m.stats.hp = 5000; m.brain = null; }
  const n0 = scene.projectiles.list.length;
  scene.useAttack(a.attack, { anim: "Shoot", sound: "snap" });
  const bolt = scene.projectiles.list[n0];
  t.check("выстрел — болт в полёте", !!bolt && bolt.item === "bolt");
  t.check("урона сразу нет (летит)", m1.stats.hp === 5000);
  const v0 = bolt?.velocity.y ?? 0;
  await g.frames(30);
  t.check("болт падает (тяжесть)", bolt && bolt.velocity.y < v0 - 0.5 * C.ATTACKS.crossbow.projectile.gravity * 0.2);
  const d1 = 5000 - m1.stats.hp, d2 = 5000 - m2.stats.hp;
  t.check("первый получил урон", d1 > 0, d1);
  t.check("насквозь — второй тоже, но меньше", d2 > 0 && d2 < d1, `${d1} / ${d2}`);
}
