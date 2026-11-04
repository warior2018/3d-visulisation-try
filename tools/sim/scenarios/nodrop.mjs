// Оружие выбросить нельзя (в игре закрыто; движок: InventoryScene canDrop), остальное — можно
export default async function (t, g) {
  const { scene, engine } = g;
  g.equip("pistol");
  scene.giveResource?.("bone", 3) ?? scene.giveItem("bone", 3);
  scene.openInventory();
  const inv = engine.scene;
  const before = g.player.hotbar.slots[0]?.item;
  inv.hover = { s: inv.sections.findIndex((x) => x.title === "WEAPON"), i: 0 };
  inv.drop();
  t.check("оружие не выбросилось", g.player.hotbar.slots[0]?.item === before && before === "pistol");
  t.check("внизу — почему нельзя", /CAN'T BE DROPPED/.test(inv.warning?.text || ""));
  const bag = inv.sections.findIndex((x) => x.title === "BAG");
  const i = g.player.inventory.slots.findIndex((s) => s?.item === "bone");
  const n = g.player.inventory.slots[i].count;
  inv.hover = { s: bag, i };
  inv.drop();
  t.check("кость выбросилась", (g.player.inventory.slots[i]?.count || 0) === n - 1);
  inv.close();
}
