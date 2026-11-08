// Броня: нагрудник и штаны — основная защита, ботинки — скорость, шлем — меньше урона в голову (выше тир — больше).
// В дуэли магазин продаёт только броню и дешевле: на монеты раунда — 1–2 части
export default async function (t, g) {
  const { scene, E, C } = g;
  const me = g.player;
  const A = C.ARMOR.sets;
  t.check("нагрудник/штаны — ×2.5 (кожа 15 % / 10 %)", A.leather.parts.chest.armor === 0.15 && A.leather.parts.legs.armor === 0.1);
  t.check("ботинки: скорость растёт с тиром (7.5 / 10 / 12.5 %)", A.leather.parts.boots.speed === 0.075 && A.bone.parts.boots.speed === 0.1 && A.iron.parts.boots.speed === 0.125);
  t.check("шлем: меньше урона в голову (15 / 20 / 25 %)", A.leather.parts.helmet.headshot === 0.15 && A.bone.parts.helmet.headshot === 0.2 && A.iron.parts.helmet.headshot === 0.25);

  // надели кожаные ботинки и шлем
  for (let i = 0; i < 4; i++) me.armor.slots[i] = null;
  scene.giveItem("leather-boots");
  scene.giveItem("leather-helmet");
  scene.applyTalents();
  t.check("кожаные ботинки: +7.5 % скорости", Math.abs(me.speedBonuses.armor - 0.075) < 1e-9, `${me.speedBonuses.armor}`);
  me.stats.resist = {};
  me.stats.maxHp = me.stats.hp = 1000;
  const foe = scene.spawn("skeleton", { x: me.position.x, y: me.position.y, z: me.position.z + 5 });
  foe.brain = null;
  const gun = new E.RangedAttack({ ...C.ATTACKS.pistol, damage: 40, falloff: null });
  gun.hit(foe, me, { part: { id: "head", multiplier: 2 } });
  t.check("кожаный шлем: в голову 80 → 68 (−15 %)", me.stats.hp === 1000 - 68, `${1000 - me.stats.hp}`);
  me.stats.hp = 1000;
  gun.hit(foe, me, {});
  t.check("в тело шлем не помогает", me.stats.hp === 960, `${1000 - me.stats.hp}`);
  scene.removeEntity(foe);
  for (let i = 0; i < 4; i++) me.armor.slots[i] = null;
  scene.applyTalents();

  // дуэль: только броня, по ценам дуэли
  const was = scene.duel;
  scene.duel = true;
  const shop = scene.shop;
  const slot = (id) => shop.slots.find((s) => s.id === id);
  const on = (id) => { const s = slot(id); return !s.when || s.when(scene); };
  t.check("дуэль: оружие и прочее не продаются", !on("pistol") && !on("medkit") && !on("bear-trap"));
  t.check("дуэль: броня продаётся", on("leather-chest") && on("iron-helmet"));
  const price = (id) => shop.priceOf(slot(id));
  const R = C.DUEL.rounds;
  t.check("дуэль: 1-й раунд (120) — 1–2 части кожи", price("leather-chest") <= R[0].coins && price("leather-helmet") + price("leather-boots") <= R[0].coins, `${price("leather-chest")}, ${price("leather-helmet")}+${price("leather-boots")}`);
  t.check("дуэль: 2-й раунд (200) — 1–2 части кости", price("bone-chest") <= R[1].coins && price("bone-helmet") + price("bone-boots") <= R[1].coins);
  t.check("дуэль: 3-й раунд (600) — 1–2 части железа", price("iron-chest") <= R[2].coins && price("iron-helmet") + price("iron-boots") <= R[2].coins, `${price("iron-chest")}`);
  scene.duel = was;
  t.check("вне дуэли — обычные цены", price("leather-chest") === A.leather.parts.chest.price && on("medkit"));
}
