// Мачете, прыжок на Q: прыжок вперёд, хитбокс у клинка — коснулся врага: удар ×1.5 одному (первому); никого не
// задел — урона нет; перезарядка; таланты (урон, дальность, кровотечение); фитиль динамита по рангам
export default async function (t, g) {
  const { scene, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const P = g.player.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 95;
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  const home = () => { P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5; g.player.velocity.x = g.player.velocity.y = g.player.velocity.z = 0; };
  home();
  scene.look.yaw = 0;
  scene.look.pitch = 0;
  const a = g.equip("machete");
  await g.frames(40);
  const dir = scene.look.lookDirection();
  const len = Math.hypot(dir.x, dir.z);
  const ahead = (d) => ({ x: P.x + (dir.x / len) * d, y: P.y, z: P.z + (dir.z / len) * d });

  // никого рядом — прыжок вперёд, урона никому
  home();
  const x0 = { ...P };
  a.leap(scene);
  t.check("прыжок: нож обратным хватом", a.held.rotation[0] < 0);
  await g.frames(40);
  const moved = Math.hypot(P.x - x0.x, P.z - x0.z);
  t.check("прыжок: улетел вперёд на ~4.5 м", moved > 3.5 && moved < 6, moved.toFixed(2));
  t.check("прыжок: кончился — обычный хват", a.held.rotation[0] > 0 && !a.busy);
  t.check("прыжок: перезарядка ~5.5 с", a.leapCooldown > 4 && a.leapCooldown <= C.MACHETE_LEAP.cooldown);
  a.leap(scene);
  t.check("прыжок: на перезарядке — нельзя", !a.busy);

  // враг впереди на 3 м — касание клинком: ×1.5, один
  const mk = (d) => {
    const e = scene.spawn("skeleton", ahead(d));
    e.brain = null;
    e.stats.maxHp = e.stats.hp = 5000;
    return e;
  };
  home();
  const near = mk(3), far = mk(4.2);
  await g.frames(1);
  Object.assign(near.position, ahead(3)); Object.assign(far.position, ahead(4.2));
  a.leapReadyAt = 0;
  a.leap(scene);
  await g.frames(40);
  const lostNear = 5000 - near.stats.hp, lostFar = 5000 - far.stats.hp;
  const base = C.ATTACKS.machete.damage * (a.attack.power ?? 1);
  t.check("прыжок: первый задетый получил ×1.5", Math.abs(lostNear - base * C.MACHETE_LEAP.damage) < base * 0.2, `${lostNear} / ${base}`);
  t.check("прыжок: только один (второго не задел)", lostFar === 0, `${lostFar}`);
  t.check("прыжок: на враге остановился", Math.hypot(P.x - x0.x, P.z - x0.z) < 3.2);

  // враг сбоку (клинок не касается) — урона нет
  home();
  near.position.x = P.x + (dir.z / len) * 2.5; near.position.z = P.z - (dir.x / len) * 2.5; near.position.y = P.y;
  far.position.y = P.y + 50;
  const hp0 = near.stats.hp;
  a.leapReadyAt = 0;
  a.leap(scene);
  await g.frames(40);
  t.check("прыжок: никого не коснулся — урона нет", near.stats.hp === hp0);
  scene.removeEntity(near); scene.removeEntity(far);

  // таланты прыжка: урон, дальность, кровотечение
  const stats = scene.talentStats;
  scene.talentStats = { ...(stats || {}), leapDamage: 0.5, leapDistance: 3, leapBleed: 0.15 };
  const L = scene.leapStats();
  t.check("таланты: урон ×1.5 ×1.5, дальность +3, кровотечение", Math.abs(L.mult - 2.25) < 1e-9 && L.distance === 7.5 && L.bleed === 0.15);
  scene.talentStats = stats;

  // динамит: фитиль по рангам — до 0.3 с
  const tal = scene.talents.byId.get("dynamite-fuse")?.talent;
  t.check("динамит: SHORT FUSE 3 ранга, последний — 0.3 с", tal?.maxRank === 3 && tal.stats(3).shortFuse === 0.3 && tal.stats(1).shortFuse === 0.75, JSON.stringify(tal?.stats?.(3)));
  t.check("снайперка: 111 урона, раз в 3 с, обойма 3; граната быстрее", C.ATTACKS.rifle.damage === 111 && C.ATTACKS.rifle.cooldown === 3 && C.ATTACKS.rifle.magazine === 3 && C.ATTACKS.handGrenade.speed === 23.1);
}
