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
  t.check("дуэль: оружие, улучшения, маунт не продаются", !on("pistol") && !on("mount") && !on("upgrade-primary"));
  t.check("дуэль: аптечка, ловушки, молоток продаются по ценам дуэли", on("medkit") && on("bear-trap") && on("spikes") && on("builder") && shop.priceOf(slot("medkit")) === C.DUEL.shop.medkit);
  t.check("дуэль: вкладки — броня и полезное", shop.categoriesFor(scene).map((c) => c.id).join() === "armor,utility");
  t.check("дуэль: броня продаётся", on("leather-chest") && on("iron-helmet"));
  const price = (id) => shop.priceOf(slot(id));
  const R = C.DUEL.rounds;
  const parts = Object.entries(A).flatMap(([set, x]) => Object.keys(x.parts).map((part) => price(`${set}-${part}`))).sort((a, b) => a - b);
  t.check("дуэль: на монеты раунда — любая часть, но не 3 части (1–2)", R.every((r) => parts.at(-1) <= r.coins) && parts[0] + parts[1] + parts[2] > R[0].coins, parts.join(","));
  // дуэль: лучшее оружие и броня — сами, остальное в утиль
  const all = () => [...me.hotbar.slots, ...me.inventory.slots, ...me.armor.slots].filter(Boolean).map((x) => x.item);
  for (let i = 0; i < 4; i++) me.armor.slots[i] = null;
  scene.giveItem("machete");
  scene.equipWeapon("machete");
  scene.giveItem("katana", 1, { rarity: "legendary" }); // в дуэли редкости нет
  const anyRare = () => [...me.hotbar.slots, ...me.inventory.slots, ...me.armor.slots].some((x) => x?.data?.rarity);
  t.check("дуэль: оружие выдаётся без редкости", !anyRare());
  me.inventory.slots[me.inventory.slots.findIndex((x) => !x)] = { item: "iron-helmet", count: 1, data: { rarity: "epic" } }; // уже было редким
  scene.giveItem("leather-chest");
  scene.giveItem("iron-chest");
  scene.giveItem("bone-boots");
  const sub = scene.subclass;
  scene.subclass = "katana";
  scene.duelOutfit();
  t.check("дуэль: в руках лучшее оружие (второе), прежнее — в утиль", me.hotbar.slots[0]?.item === "katana" && !all().includes("machete"), all().join(","));
  t.check("дуэль: редкость снята (всё обычное)", !anyRare() && Math.abs((scene.abilityCache.get("katana")?.attack.power ?? 1) - (1 + (scene.upgradeBonus?.("katana") || 0))) < 1e-9);
  t.check("дуэль: надета лучшая броня, хуже — в утиль", me.armor.slots[1]?.item === "iron-chest" && me.armor.slots[3]?.item === "bone-boots" && !all().includes("leather-chest"), JSON.stringify(me.armor.slots.map((x) => x?.item)));
  scene.subclass = sub;
  for (let i = 0; i < 4; i++) me.armor.slots[i] = null;
  scene.applyTalents();
  scene.duel = was;
  // окно магазина: позиций больше, чем влезает, — листается (колесо, стрелки)
  const theme = scene.engine.ui?.theme;
  const mk = (h) => new Proxy({ width: 1280, height: h, mouseX: 0, mouseY: 0, theme }, { get: (o, k) => (k in o ? o[k] : () => false) });
  const sc = new E.ShopScene({ shop, buyer: me, ctx: scene });
  sc.engine = scene.engine;
  sc.tab = "armor";
  sc.drawUI(mk(720));
  t.check("магазин: вкладка брони — 3 столбца (кожа, кость, железо), 4 ряда влезают без прокрутки", shop.visible(scene, "armor").length === 12 && sc.maxScroll === 0 && shop.categories.find((c) => c.id === "armor").headers.join() === "LEATHER,BONE,IRON", `${shop.visible(scene, "armor").length} ${sc.maxScroll} ${shop.categories.find((c) => c.id === "armor").headers}`);
  t.check("магазин: ряды брони — шлем, нагрудник, штаны, ботинки", shop.visible(scene, "armor").map((x) => x.id.split("-")[1]).join() === "helmet,helmet,helmet,chest,chest,chest,legs,legs,legs,boots,boots,boots");
  sc.drawUI(mk(560));
  t.check("магазин: не влезает — листается", sc.maxScroll > 0, `${sc.maxScroll}`);
  sc.onWheel({ dy: -1 });
  sc.drawUI(mk(560));
  t.check("магазин: колесо листает вниз", sc.scroll === 1);
}
