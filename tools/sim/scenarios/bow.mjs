// Лук: зажал ЛКМ — натягивается (до 3 с), отпустил — стрела; урон и скорость растут с натяжением; пауза 1 с;
// Q — залп из 3 стрел веером; таланты: пробивание, урон за натяжение, взрывная стрела, быстрое натяжение.
// Снайперка — раз в 1.75 с
export default async function (t, g) {
  const { scene, engine, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const P = g.player.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 95;
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 20; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5;
  const a = g.equip("bow");
  await g.frames(30);
  t.check("лук: способность и модели", a?.id === "bow" && g.game.models.has?.("fp-bow") !== false);
  scene.look.yaw = 0;
  scene.look.pitch = 0;
  const dir = scene.look.lookDirection();
  const target = (d) => {
    const e = scene.spawn("skeleton", { x: P.x + dir.x * d, y: P.y, z: P.z + dir.z * d });
    e.brain = null;
    e.stats.maxHp = e.stats.hp = 5000;
    return e;
  };
  const foe = target(8);
  await g.frames(2);
  Object.assign(foe.position, { x: P.x + dir.x * 8, y: P.y, z: P.z + dir.z * 8 });
  scene.updateRig?.();
  let held = false;
  const isDown = engine.input.isDown.bind(engine.input);
  engine.input.isDown = (x) => (x === "primary" ? held : isDown(x));
  const shot = async (sec) => {
    a.readyAt = 0;
    held = true;
    a.primary(scene);
    await g.frames(Math.round(sec * 60));
    held = false;
    await g.frames(40);
  };
  // короткий натяг — слабо
  let hp = foe.stats.hp;
  await shot(0.1);
  const weak = hp - foe.stats.hp;
  hp = foe.stats.hp;
  await shot(3.2);
  const strong = hp - foe.stats.hp;
  t.check("лук: урон растёт с натяжением (58 → 126)", weak > 0 && strong > weak * 1.8 && Math.abs(strong - C.ATTACKS.bow.damage) < 15, `${weak} → ${strong}`);
  a.readyAt = performance.now() / 1000 + C.ATTACKS.bow.cooldown; // как сразу после выстрела
  a.primary(scene);
  t.check("лук: сразу после выстрела не натянуть (пауза 1 с)", !a.drawing);
  // залп
  hp = foe.stats.hp;
  a.volleyReadyAt = 0;
  a.volley(scene);
  await g.frames(40);
  t.check("залп: стрелы летят (хотя бы одна попала)", foe.stats.hp < hp);
  t.check("залп: перезарядка 8 с", a.volleyLeft > 6);
  // таланты
  const stats0 = scene.talentStats;
  scene.talentStats = { ...(stats0 || {}), bowDraw: 2, bowPower: 0.45, bowBlast: 1, bowPierce: 2 };
  const S = a.bowStats(scene);
  t.check("таланты: натяжение 2 с, урон, пробивание, взрыв", S.draw === 2 && S.power === 0.45 && S.pierce === 2 && S.blast);
  hp = foe.stats.hp;
  await shot(2.1);
  t.check("урон за натяжение: +45% на полном", hp - foe.stats.hp > C.ATTACKS.bow.damage * 1.3, `${hp - foe.stats.hp}`);
  scene.talentStats = stats0;
  engine.input.isDown = isDown;
  scene.removeEntity(foe);
  t.check("снайперка: раз в 1.75 с", C.ATTACKS.rifle.cooldown === 1.75);
  // стрела смотрит носом по полёту (дуга — нос опускается)
  const pr = scene.projectiles;
  scene.look.pitch = 0.3;
  a.readyAt = 0;
  a.shoot(scene, 0.2, [0]);
  await g.frames(20);
  const arrow = pr.list.at(-1);
  t.check("стрела поворачивается по полёту", arrow && arrow.align && Math.abs(arrow.tilt - Math.atan2(-arrow.velocity.y, Math.hypot(arrow.velocity.x, arrow.velocity.z))) < 1e-6, arrow ? `${arrow.tilt}` : "нет стрелы");
  const tab = scene.talents.tree.tabs.find((x) => x.id === "w-bow");
  t.check("вкладка талантов ЛУК", tab && ["bow-pierce", "bow-power", "bow-blast", "bow-quick", "bow-mastery"].every((id) => tab.talents.some((x) => x.id === id)));
}
