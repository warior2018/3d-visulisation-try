// Мост: смотришь вниз за край — блок ставится продолжением ряда под ногами, без «ловли» грани
export default async function (t, g) {
  const { scene } = g;
  const P = g.player.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 110;
  for (let z = 0; z <= 2; z++) scene.world.place(bx, by, bz + z, [90, 90, 90]); // полоса из 3 блоков
  for (let z = 3; z <= 8; z++) scene.world.remove(bx, by, bz + z);
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 2.3; // на последнем блоке, не на самом краю
  g.player.velocity.x = g.player.velocity.y = g.player.velocity.z = 0;
  g.equip("builder");
  await g.frames(20);
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 2.3;
  scene.look.yaw = 0;
  scene.look.pitch = -1.2; // вниз и вперёд
  const dir = scene.look.lookDirection();
  t.check("смотрим вдоль полосы (+z)", dir.z > 0.2);
  scene.giveResource?.(g.C.BUILD.item, 10);
  await g.frames(2);
  t.check("прицел — мост: следующая клетка за краем", scene.target?.bridge && scene.target.place.z === bz + 3 && scene.target.place.y === by, JSON.stringify(scene.target?.place));
  scene.placeBlock();
  t.check("блок поставлен продолжением ряда", scene.world.has(bx, by, bz + 3));
  await g.frames(2);
  t.check("следующий — ещё дальше (стоя на том же месте)", scene.target?.place?.z === bz + 4, JSON.stringify(scene.target?.place));
  scene.look.pitch = 0;
  await g.frames(2);
  t.check("смотрим прямо — моста нет", !scene.target?.bridge);
  for (let z = 0; z <= 4; z++) scene.world.remove(bx, by, bz + z);
}
