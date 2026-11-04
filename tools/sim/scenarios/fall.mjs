// Урон от падения: с 3 блоков; таланты на прыжок поднимают порог и режут урон; удар молотом с прыжка не ранит
export const immortal = false; // здоровье считаем сами
export default async function (t, g) {
  const { scene, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  scene.spawner.update = scene.boarSpawner.update = () => {}; // новые мобы не появляются (их удар — не падение)
  const p = g.player;
  scene.regenOff = true;
  p.regen = 0;
  // Нейтральный герой: без талантов на прыжок (в копии мира они могут быть) и с мачете в руках
  const rank = scene.talents.rank.bind(scene.talents);
  let highGround = 0;
  scene.talents.rank = (id) => (id === "sniper-jump" ? highGround : rank(id));
  scene.talentStats.hammerLeap = false;
  g.equip("machete");
  await g.frames(90); // прошла «первая секунда в мире», герой стоит на земле
  const drop = async (h) => {
    p.stats.hp = p.stats.maxHp;
    p.regen = 0;
    p.position.y += h;
    p.velocity.y = 0;
    scene.groundY = p.position.y; // как будто шагнули с уступа высотой h
    let landed = null;
    const was = scene.controller.onLand;
    scene.controller.onLand = (l) => { landed = l; was(l); };
    for (let i = 0; i < 240 && !landed; i++) await g.frames(1);
    scene.controller.onLand = was;
    await g.frames(2);
    return { fall: landed?.fall ?? 0, lost: p.stats.maxHp - p.stats.hp };
  };
  const F = C.FALL_DAMAGE, max = p.stats.maxHp;
  const res = () => 1 - Math.min(0.9, p.stats.resist?.physical || 0); // физ. сопротивление режет и падение
  let r = await drop(4.5);
  t.check("4.5 блока — без урона (порог 5)", r.lost === 0, `упал ${r.fall.toFixed(1)}, потерял ${r.lost}`);
  r = await drop(10);
  const want = Math.round((r.fall - F.from) * F.perBlock * max * res());
  t.check(`10 блоков — ${(F.perBlock * 100).toFixed(0)}% макс. HP за каждый блок выше ${F.from}`, Math.abs(r.lost - want) <= 1, `упал ${r.fall.toFixed(2)}, потерял ${r.lost} из ${max}, ждали ${want}`);
  // HIGH GROUND: порог выше, урон вдвое меньше
  highGround = 1;
  r = await drop(6.5);
  t.check("HIGH GROUND: 6.5 блока — без урона (порог 5 + 2)", r.lost === 0, `потерял ${r.lost}`);
  r = await drop(10);
  const want2 = Math.round((r.fall - F.from - F.highGround.from) * F.perBlock * max * F.highGround.mult * res());
  t.check("HIGH GROUND: 10 блоков — меньше и вдвое слабее", Math.abs(r.lost - want2) <= 1 && r.lost < want, `потерял ${r.lost}, ждали ${want2}`);
  highGround = 0;
  // Прыжок на ровном месте с HIGH GROUND (высоко) — урона нет: считаем от места прыжка, а не от верхней точки
  highGround = 1;
  scene.applyTalents();
  p.stats.hp = p.stats.maxHp;
  const hp0 = p.stats.hp;
  p.velocity.y = 14; // как сильный прыжок
  for (let i = 0; i < 180; i++) await g.frames(1);
  t.check("высокий прыжок на ровном месте — без урона", p.stats.hp === hp0, `HP ${hp0} → ${p.stats.hp}`);
  highGround = 0;
  scene.applyTalents();
  // Удар молотом с прыжка — не ранит
  const a = g.equip("war-hammer");
  p.stats.hp = p.stats.maxHp;
  p.position.y += 10;
  p.velocity.y = 0;
  scene.groundY = p.position.y;
  await g.frames(2);
  a.attack.cooldownLeft = 0;
  a.primary(scene); // удар в воздухе — ждёт земли
  let landed = false;
  const was = scene.controller.onLand;
  scene.controller.onLand = (l) => { landed = true; was(l); };
  for (let i = 0; i < 240 && !landed; i++) { a.attack.update(1 / 60); await g.frames(1); }
  scene.controller.onLand = was;
  await g.frames(2);
  t.check("удар молотом с прыжка 10 блоков — героя не ранит", p.stats.hp === p.stats.maxHp, `HP ${p.stats.hp}/${p.stats.maxHp}`);
  // То же без удара — ранит (молот в руках, но талант JUMP SLAM выключен)
  r = await drop(10);
  t.check("без удара то же падение — ранит", r.lost > 0, `потерял ${r.lost}`);
  scene.talentStats.hammerLeap = true; // JUMP SLAM с молотом в руках: порог выше, урон вдвое меньше
  r = await drop(8);
  const want3 = Math.round(Math.max(0, r.fall - F.from - F.jumpSlam.from) * F.perBlock * max * F.jumpSlam.mult);
  t.check("JUMP SLAM (молот в руках): 8 блоков — меньше и вдвое слабее", Math.abs(r.lost - want3) <= 1 && r.lost < want, `потерял ${r.lost}, ждали ${want3}`);
}
