// Аптечка (держать ЛКМ 2.5 с — лечит, отпустил раньше — не тратится) и броня (комплекты, бонусы)
export default async function (t, g) {
  const { scene, engine } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e); // никто не мешает
  const p = g.player;
  // --- аптечка ---
  scene.giveResource("medkit", 2);
  scene.abilities.select(p.hotbar.slots.findIndex((s) => s?.item === "medkit"), scene);
  let held = true;
  const isDown = engine.input.isDown.bind(engine.input);
  engine.input.isDown = (a) => (a === "primary" ? held : isDown(a));
  const hpMax = p.stats.maxHp;
  const tickHurt = () => { engine.lastTime = performance.now() - 1000 / 60; engine.tick(); };
  p.stats.hp = 30;
  for (let i = 0; i < 60; i++) tickHurt(); // 1 с — отпускаем раньше
  const midProgress = scene.abilities.current?.progress;
  held = false;
  tickHurt();
  t.check("аптечка: за 1 с круг заполнился частично", midProgress > 0.2 && midProgress < 0.6, midProgress?.toFixed(2));
  t.check("аптечка: отпустил раньше — не потратилась и не вылечила", scene.itemCount("medkit") === 2 && p.stats.hp <= 31, `аптечек ${scene.itemCount("medkit")}, HP ${p.stats.hp}`);
  t.check("аптечка: пока держишь — медленнее, отпустил — скорость вернулась", p.speedBonuses.medkit === undefined);
  held = true;
  for (let i = 0; i < 170; i++) tickHurt(); // 2.8 с
  t.check("аптечка: через 2.5 с — +HP и потрачена", p.stats.hp >= Math.min(hpMax, 30 + g.C.SHOP.medkitHeal) - 1 && scene.itemCount("medkit") === 1, `HP ${p.stats.hp}, аптечек ${scene.itemCount("medkit")}`);
  t.check("аптечка: после лечения — снова оружие в руках", scene.abilities.index === 0);
  held = false;
  // --- броня ---
  const parts = ["helmet", "chest", "legs", "boots"];
  for (const [set, expect] of [["leather", { speed: 0.05 }], ["iron", { hp: 40 }], ["bone", { attackSpeed: 0.1 }]]) {
    parts.forEach((part, i) => (p.armor.slots[i] = { item: `${set}-${part}`, count: 1 }));
    p.armor.slots.forEach(() => {});
    const before = p.modifiers?.length || 0;
    scene.applyTalents();
    const S = g.C.ARMOR.sets[set];
    const armor = Object.values(S.parts).reduce((s, x) => s + x.armor, 0);
    const speed = Object.values(S.parts).reduce((s, x) => s + (x.speed || 0), 0) + (S.full.speed || 0);
    t.check(`${set}: полный комплект узнан`, scene.armorFullSet() === set);
    t.check(`${set}: защита ${(armor * 100).toFixed(0)}%`, Math.abs(scene.armorValue() - armor) < 1e-9, scene.armorValue().toFixed(3));
    t.check(`${set}: скорость ${(speed * 100).toFixed(0)}% (части + бонус)`, Math.abs((p.speedBonuses.armor || 0) - speed) < 1e-9, p.speedBonuses.armor);
    if (expect.hp) t.check(`${set}: +${expect.hp} макс. HP`, scene.permanentBuffs().some((b) => b.name.includes("SET") && b.text.includes("HP")));
    if (expect.attackSpeed) t.check(`${set}: +10% скорости атаки (модификатор добавлен)`, (p.modifiers?.length || 0) > 0 && (p.modifiers.length >= before));
  }
  p.armor.slots[3] = { item: "leather-boots", count: 1 };
  scene.applyTalents();
  t.check("смешанные части — не комплект, бонуса нет", scene.armorFullSet() === null);
}
