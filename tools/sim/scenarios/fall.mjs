// Урон от падения: с 3 блоков; таланты на прыжок поднимают порог и режут урон; удар молотом с прыжка не ранит
export const immortal = false; // здоровье считаем сами
export default async function (t, g) {
  const { scene, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
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
    let landed = null;
    const was = scene.controller.onLand;
    scene.controller.onLand = (l) => { landed = l; was(l); };
    for (let i = 0; i < 240 && !landed; i++) await g.frames(1);
    scene.controller.onLand = was;
    await g.frames(2);
    return { fall: landed?.fall ?? 0, lost: p.stats.maxHp - p.stats.hp };
  };
  const F = C.FALL_DAMAGE, max = p.stats.maxHp;
  let r = await drop(2.5);
  t.check("2.5 блока — без урона", r.lost === 0, `упал ${r.fall.toFixed(1)}, потерял ${r.lost}`);
  r = await drop(8);
  const want = Math.round((r.fall - F.from) * F.perBlock * max);
  t.check(`8 блоков — ${(F.perBlock * 100).toFixed(0)}% макс. HP за каждый блок выше ${F.from}`, Math.abs(r.lost - want) <= 1, `упал ${r.fall.toFixed(2)}, потерял ${r.lost} из ${max}, ждали ${want}`);
  // HIGH GROUND: порог выше, урон вдвое меньше
  highGround = 1;
  r = await drop(4.5);
  t.check("HIGH GROUND: 4.5 блока — без урона (порог 3 + 2)", r.lost === 0, `потерял ${r.lost}`);
  r = await drop(8);
  const want2 = Math.round((r.fall - F.from - F.highGround.from) * F.perBlock * max * F.highGround.mult);
  t.check("HIGH GROUND: 8 блоков — меньше и вдвое слабее", Math.abs(r.lost - want2) <= 1 && r.lost < want, `потерял ${r.lost}, ждали ${want2}`);
  highGround = 0;
  // Удар молотом с прыжка — не ранит
  const a = g.equip("war-hammer");
  p.stats.hp = p.stats.maxHp;
  p.position.y += 8;
  p.velocity.y = 0;
  await g.frames(2);
  a.attack.cooldownLeft = 0;
  a.primary(scene); // удар в воздухе — ждёт земли
  let landed = false;
  const was = scene.controller.onLand;
  scene.controller.onLand = (l) => { landed = true; was(l); };
  for (let i = 0; i < 240 && !landed; i++) { a.attack.update(1 / 60); await g.frames(1); }
  scene.controller.onLand = was;
  await g.frames(2);
  t.check("удар молотом с прыжка 8 блоков — героя не ранит", p.stats.hp === p.stats.maxHp, `HP ${p.stats.hp}/${p.stats.maxHp}`);
  // То же без удара — ранит (молот в руках, но талант JUMP SLAM выключен)
  r = await drop(8);
  t.check("без удара то же падение — ранит", r.lost > 0, `потерял ${r.lost}`);
  scene.talentStats.hammerLeap = true; // JUMP SLAM с молотом в руках: порог выше, урон вдвое меньше
  r = await drop(8);
  const want3 = Math.round(Math.max(0, r.fall - F.from - F.jumpSlam.from) * F.perBlock * max * F.jumpSlam.mult);
  t.check("JUMP SLAM (молот в руках): 8 блоков — меньше и вдвое слабее", Math.abs(r.lost - want3) <= 1 && r.lost < want, `потерял ${r.lost}, ждали ${want3}`);
}
