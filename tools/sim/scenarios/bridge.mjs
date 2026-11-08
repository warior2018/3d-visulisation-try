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
  // в воздух: рядом с блоком — можно (призрак показывает клетку)
  scene.world.place(bx, by + 3, bz + 5, [90, 90, 90]); // одиночный блок в воздухе впереди
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5;
  scene.world.place(bx, by, bz, [90, 90, 90]);
  scene.look.yaw = 0;
  const eye = scene.look.position;
  const to = { x: bx + 0.5 - eye.x, y: by + 3.5 - eye.y, z: bz + 4.5 - eye.z }; // в клетку перед блоком
  scene.look.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
  await g.frames(2);
  const c = scene.target?.place;
  t.check("в воздух: клетка рядом с блоком", scene.target?.air && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([x, y, z]) => scene.world.has(c.x + x, c.y + y, c.z + z)), JSON.stringify(scene.target));
  t.check("в воздух: предпросмотр (призрак)", !!scene.ghost);
  scene.look.pitch = 0.9;
  await g.frames(2);
  t.check("в пустое небо (рядом блоков нет) — некуда", !scene.target);
  scene.world.remove(bx, by + 3, bz + 5);
  scene.world.remove(bx, by, bz);
}
