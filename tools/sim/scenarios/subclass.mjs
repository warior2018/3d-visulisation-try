// Подкласс: на SUBCLASS.level уровне — второе оружие своего класса. Только его можно купить, видна его вкладка
// талантов, очки из веток другого покупного оружия класса возвращаются
export default async function (t, g) {
  const { scene, C } = g;
  scene.playerClass = null;
  scene.subclass = null;
  scene.chooseClass("melee");
  scene.experience.level = 1;
  t.check("до 10 уровня второе оружие не спрашивают", !scene.needsSubclass());
  t.check("до выбора катану не купить", !scene.shop.slots.find((s) => s.id === "katana").when());
  t.check("вкладки оружия класса скрыты", !scene.talents.isAllowed("w-katana") && !scene.talents.isAllowed("w-spear"));
  scene.experience.level = C.SUBCLASS.level;
  t.check("на 10 уровне — пора выбрать", scene.needsSubclass());
  // очки, вложенные в молот (старое сохранение), вернутся при выборе катаны (копьё пока убрано из игры)
  scene.talents.ranks["hammer-stun"] = 2;
  const before = scene.talents.points;
  scene.chooseSubclass("katana");
  await g.frames(3);
  t.check("подкласс выбран", scene.subclass === "katana");
  t.check("катана выдана сразу; копьё и молот не продаются", scene.itemCount("katana") + scene.pickups.list.filter((p) => p.item === "katana").length > 0 && !scene.shop.slots.find((s) => s.id === "spear")?.when?.() && !scene.shop.slots.find((s) => s.id === "war-hammer").when());
  t.check("вкладка катаны открыта, копья — нет", scene.talents.isAllowed("w-katana") && !scene.talents.isAllowed("w-spear"));
  t.check("очки из ветки молота вернулись", scene.talents.rank("hammer-stun") === 0 && scene.talents.points > before, `${before} → ${scene.talents.points}`);
  t.check("больше не спрашивает", !scene.needsSubclass());
  scene.chooseSubclass("rifle");
  t.check("чужое оружие подклассом не стать", scene.subclass === "katana");
}
