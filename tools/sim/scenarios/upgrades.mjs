// Цены и улучшения оружия: на 10 уровне выбранное второе оружие — сразу в руки; в магазине — его улучшения
// (200 / 400 / 600, +15 %) и улучшения базового (50 / 100, +10 %); выбрал базовое — оно сразу +70 %
export default async function (t, g) {
  const { scene, C } = g;
  const U = C.WEAPON_UPGRADES;
  const slot = (id) => scene.shop.slots.find((s) => s.id === id);
  const buy = (id) => scene.shop.buy(id, g.player, scene);
  const coins = (n) => scene.giveResource ? scene.giveResource("coin", n) : scene.giveItem("coin", n);
  // стрелок: базовое — пистолет
  scene.playerClass = null; scene.subclass = null; scene.upgrades = { primary: 0, second: 0 };
  scene.chooseClass("ranged");
  const pistol = () => scene.abilityCache.get("pistol")?.attack.power;
  const p0 = pistol();
  t.check("улучшение базового в магазине: 50", slot("upgrade-primary").when() && scene.shop.priceOf(slot("upgrade-primary")) === U.primary.prices[0]);
  t.check("улучшения второго — пока нет", !slot("upgrade-second").when());
  coins(1000);
  t.check("купили +1 базового", buy("upgrade-primary").ok && scene.upgrades.primary === 1);
  t.check("пистолет сильнее на 10 %", Math.abs(pistol() / p0 - 1.1) < 1e-6, (pistol() / p0).toFixed(3));
  t.check("второй уровень — 100", scene.shop.priceOf(slot("upgrade-primary")) === U.primary.prices[1]);
  buy("upgrade-primary");
  t.check("базовое — 2 уровня, больше нет", !slot("upgrade-primary").when());
  // 10 уровень: арбалет — сразу в руках, не за 3000
  scene.experience.level = C.SUBCLASS.level;
  scene.chooseSubclass("crossbow");
  t.check("арбалет выдан сразу", scene.itemCount("crossbow") > 0 || scene.pickups.list.some((p) => p.item === "crossbow"));
  t.check("в магазине арбалет не продаётся (уже есть)", !slot("crossbow").when());
  t.check("улучшение арбалета — 200", slot("upgrade-second").when() && scene.shop.priceOf(slot("upgrade-second")) === 200);
  coins(2000);
  buy("upgrade-second"); buy("upgrade-second");
  t.check("арбалет +30 % после двух улучшений", Math.abs(scene.upgradeBonus("crossbow") - 0.3) < 1e-6);
  t.check("третье — 600", scene.shop.priceOf(slot("upgrade-second")) === 600);
  // выбрать базовое вместо нового — сразу +70 % и дальше улучшения как у второго
  scene.playerClass = null; scene.subclass = null; scene.upgrades = { primary: 0, second: 0 };
  scene.chooseClass("ranged");
  scene.experience.level = C.SUBCLASS.level;
  scene.chooseSubclass("pistol");
  t.check("выбрал базовое — +70 %", Math.abs(scene.upgradeBonus("pistol") - U.primaryPick) < 1e-6);
  t.check("и его улучшения второго уровня (200)", slot("upgrade-second").when() && slot("upgrade-second").name().includes("PISTOL"));
  await g.frames(5);
}
