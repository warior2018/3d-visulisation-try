// Чувство боя: молот отбрасывает моба; хедшот — звук; по герою попали — дуга
// в сторону того, кто бил (справа — справа), гаснет
export default async function (t, g) {
  const { scene, C, E, engine } = g;
  const p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  const at = (dx, dz) => ({ x: p.position.x + dx, y: p.position.y, z: p.position.z + dz });
  const mob = scene.spawn("skeleton", at(0, 2));
  mob.stats.maxHp = mob.stats.hp = 5000;
  // молот: отлёт от героя
  const hammer = { id: "war-hammer", kind: "melee" };
  const z0 = mob.position.z;
  mob.receive(new E.Damage({ amount: 20, source: p, attack: hammer }));
  t.check("молот — толчок от героя", mob.knock && mob.knock.z > 0);
  await g.frames(20);
  t.check("моба отбросило назад", mob.position.z - z0 > 0.5, (mob.position.z - z0).toFixed(2));
  // хедшот — звук
  const played = [];
  const orig = engine.sound.play.bind(engine.sound);
  engine.sound.play = (n, o) => { played.push(n); return orig(n, o); };
  const d = new E.Damage({ amount: 30, source: p }); d.part = "head";
  mob.receive(d);
  engine.sound.play = orig;
  t.check("хедшот — свой звук", played.includes(C.HIT_FEEL.headSound));
  scene.removeEntity(mob);
  // по герою справа
  scene.camera ||= null;
  const cam = scene.rig.camera; cam.yaw = 0;
  const right = scene.spawn("skeleton", at(4, 0));
  p.receive(new E.Damage({ amount: 1, source: right }));
  scene.removeEntity(right);
  const arcs = scene.damageArcs();
  t.check("дуга появилась", arcs.length === 1);
  t.check("бьют справа — дуга справа (~90°)", Math.abs(arcs[0].angle - Math.PI / 2) < 0.2, (arcs[0].angle * 180 / Math.PI).toFixed(0));
  await g.frames(Math.ceil(C.DAMAGE_DIR.time * 60) + 10);
  t.check("дуга погасла", scene.damageArcs().length === 0);
}
