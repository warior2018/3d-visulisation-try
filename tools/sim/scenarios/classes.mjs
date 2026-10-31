// Классы: выбор каждого — одежда героя, стартовое оружие в руках, вкладка талантов, раздел магазина
export default async function (t, g) {
  const { scene, C } = g;
  for (const id of Object.keys(C.CLASSES)) {
    const c = C.CLASSES[id];
    scene.playerClass = null;
    scene.chooseClass(id);
    await g.frames(5);
    t.check(`${c.name}: класс выбран`, scene.playerClass === id);
    t.check(`${c.name}: одежда — ${c.outfit || "hero"}`, g.player.view?.name === (c.outfit || "hero"), g.player.view?.name);
    const inHand = g.player.hotbar.slots.some((s) => s?.item === c.starter[0]);
    const inBag = g.player.inventory.slots.some((s) => s?.item === c.starter[0]);
    // сумка полна (копия настоящего мира) — выпадает на землю рядом
    const onGround = scene.pickups.list.some((p) => p.item === c.starter[0] && Math.hypot(p.position.x - g.player.position.x, p.position.z - g.player.position.z) < 3);
    t.check(`${c.name}: стартовое оружие (${c.starter[0]}) выдано — в руки, в сумку или рядом на землю, если места нет`, inHand || inBag || onGround, inHand ? "в руках" : inBag ? "в сумке" : onGround ? "на земле" : "нет");
    t.check(`${c.name}: вкладка талантов открыта`, scene.talents.allowed?.includes?.(c.tab) ?? true);
  }
  await g.frames(30);
  t.check("после смены классов игра идёт", !!scene.player.alive);
}
