// Добыча: редкость и удача, вещи по тирам, редкое оружие сильнее, продажа стражу, страж возвращается
export default async function (t, g) {
  const { scene, E, C } = g;
  await g.frames(5);
  // 1. Удача сдвигает редкость (движок)
  let seed = 9;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const count = (luck) => { const c = {}; for (let i = 0; i < 20000; i++) { const r = E.rollRarity(luck, rnd); c[r] = (c[r] || 0) + 1; } return c; };
  const c0 = count(0), c1 = count(1);
  t.check("без удачи легендарка ~1.5 %", Math.abs(c0.legendary / 20000 - 0.015) < 0.005, `${(c0.legendary / 200).toFixed(2)} %`);
  t.check("удача +100 %: редких больше, легендарок — в разы", c1.legendary > c0.legendary * 2.5 && c1.common < c0.common, `легендарок ${c0.legendary} → ${c1.legendary}`);
  // 2. Цены по тирам
  t.check("цены по тирам: T1 100, T2 2000, T3 3000, T4 4500", C.SHOP.machete === 100 && C.SHOP.auto === 2000 && C.SHOP.crossbow === 3000 && C.SHOP.katana === 4500);
  // 3. С мобов падают вещи (шанс с удачей); у босса — всегда
  scene.luckBonus = 0;
  const L = await import(g.root + "games/builder/scene/loot.js");
  let drops = 0;
  const mob = { position: { x: 0, y: 0, z: 0 }, name: "TEST" };
  for (let i = 0; i < 4000; i++) if (scene.rollGear(mob)) drops++;
  t.check("моб роняет вещь ~1.5 % (без удачи)", drops > 30 && drops < 100, `${drops} из 4000`);
  scene.luckBonus = 1;
  let lucky = 0;
  for (let i = 0; i < 4000; i++) if (scene.rollGear(mob)) lucky++;
  t.check("удача +100 % — вдвое чаще", lucky > drops * 1.6, `${drops} → ${lucky}`);
  scene.luckBonus = 0;
  t.check("босс — всегда", [1, 2, 3, 4, 5].every(() => !!scene.rollGear({ ...mob, boss: true })));
  // 4. Редкое оружие сильнее
  for (const s of g.player.hotbar.slots.keys()) if (g.player.hotbar.slots[s]?.item === "machete") g.player.hotbar.slots[s] = null;
  scene.syncAbilities();
  scene.giveItem("machete", 1, L.rarityData("legendary"));
  const legend = scene.abilityCache.get("machete")?.attack.power;
  t.check("легендарное мачете: сила ×1.35", Math.abs(legend - 1.35) < 1e-9, `${legend}`);
  const slot = [...g.player.hotbar.slots, ...g.player.inventory.slots].find((s) => s?.item === "machete");
  t.check("в ячейке — редкость, цвет и буква", slot?.data?.rarity === "legendary" && slot.data.label === "L" && Array.isArray(slot.data.color));
  // 5. Продажа стражу
  const bag = g.player.inventory;
  const free = bag.slots.findIndex((s) => !s);
  if (free >= 0) {
    bag.slots[free] = { item: "katana", count: 1, data: L.rarityData("epic") };
    const price = scene.sellPrice(bag.slots[free]);
    t.check("цена продажи: катана T4 эпик = 4500 × 25 % × 4", price === Math.floor(4500 * C.LOOT.sell * 4), `${price}`);
    const coins = scene.itemCount("coin");
    const warden = scene.entities.list.find((e) => e.type === "warden" && e.alive);
    scene.openTrade(warden || { name: "WARDEN" });
    const trade = g.engine.scene;
    t.check("окно торговли открылось", trade instanceof E.TradeScene);
    const row = trade.rows().find((r) => r.key === free);
    t.check("катана в списке продажи", !!row && row.price === price);
    trade.onSell(free);
    t.check("продано: монеты пришли, катаны нет", scene.itemCount("coin") === coins + price && !bag.slots.some((s) => s?.item === "katana" && s.data?.rarity === "epic"), `${coins} → ${scene.itemCount("coin")}`);
    g.engine.pop();
  } else t.check("в сумке есть место для проверки продажи", false);
  // 6. Страж погиб — через минуту вернулся
  const w = scene.entities.list.find((e) => e.type === "warden");
  if (w) {
    w.damage(w.stats.hp);
    await g.frames(5);
    t.check("страж погиб", !scene.entities.list.some((e) => e.type === "warden" && e.alive));
    scene.residentTimers.warden = 59.5;
    await g.frames(60);
    t.check("через минуту страж вернулся", scene.entities.list.some((e) => e.type === "warden" && e.alive));
  } else t.check("в мире есть страж", false);
}
