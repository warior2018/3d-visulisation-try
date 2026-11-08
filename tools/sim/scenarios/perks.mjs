// Таланты на оружии с мобов (WEAPON_PERKS): выпало с прокачанными талантами своей ветки — пока оружие в ячейке
// оружия, эти ранги действуют (talents.bonus), очков не тратят; убрал в сумку — перестали
export default async function (t, g) {
  const { scene, C } = g;
  const { rollPerks, perksText } = await import(g.root + "games/builder/scene/loot.js");
  const leg = rollPerks("katana", "legendary");
  t.check("легендарная катана — 2 таланта её ветки", leg && Object.keys(leg).length === 2 && Object.keys(leg).every((id) => id.startsWith("katana-")), JSON.stringify(leg));
  t.check("у оружия без своей ветки талантов — нет", rollPerks("machete", "legendary") === null);
  t.check("подпись талантов", perksText({ "katana-mastery": 2 }) === "MASTERY 2", perksText({ "katana-mastery": 2 }));
  // в руки: мастерство катаны 3 → урон катаной ×1.3
  scene.chooseClass("melee");
  await g.frames(2);
  const before = scene.talents.points;
  scene.player.hotbar.slots[0] = null;
  scene.giveItem("katana", 1, { perks: { "katana-mastery": 3 } });
  scene.syncAbilities();
  t.check("в ячейке оружия — ранги действуют", scene.talents.effectiveRank("katana-mastery") === 3 && scene.talents.rank("katana-mastery") === 0);
  t.check("очки талантов не тратятся", scene.talents.points === before);
  t.check("модификатор урона катаны есть", scene.player.modifiers.length > 0);
  // убрал в сумку — не действуют
  const slot = scene.player.hotbar.slots[0];
  scene.player.hotbar.slots[0] = null;
  scene.player.inventory.add(slot.item, 1, { data: slot.data });
  scene.syncAbilities();
  t.check("в сумке — не действуют", scene.talents.effectiveRank("katana-mastery") === 0);
  // выбор второго оружия — сразу в ячейку оружия
  scene.experience.level = C.SUBCLASS.level;
  scene.player.inventory.slots = scene.player.inventory.slots.map((s) => (s?.item === "katana" ? null : s));
  scene.giveItem("machete");
  scene.equipWeapon("machete");
  scene.chooseSubclass("war-hammer");
  await g.frames(2);
  t.check("выбранное второе оружие — сразу в ячейке оружия", scene.player.hotbar.slots[0]?.item === "war-hammer", scene.player.hotbar.slots[0]?.item);
  t.check("прежнее — в сумке", scene.itemCount("machete") > 0);
}
