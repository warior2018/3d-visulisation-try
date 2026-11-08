// Баланс оружия (config.js → ATTACKS, WEAPON_UPGRADES): урон в секунду с перезарядкой. Второе оружие (10 уровень)
// сильнее базового своего класса в 1.3–2.2 раза (кроме снайперки и динамита — они про разовый урон, а не про поток); «освоенное» базовое с улучшениями — наравне со вторым по одной цели
export default async function (t, g) {
  const { ATTACKS: A, WEAPON_UPGRADES: U, SUBCLASS } = g.C;
  const gun = (a) => (a.magazine * (a.pellets || 1) * a.damage) / ((a.magazine - 1) * a.cooldown + a.reloadTime);
  const hit = (a) => a.damage / (a.cooldown + (a.windup || 0));
  const dps = { pistol: gun(A.pistol), auto: gun(A.auto), shotgun: gun(A.shotgun), rifle: gun(A.rifle), crossbow: gun(A.crossbow), bow: A.bow.damage / (3 + A.bow.cooldown), // лук: полный натяг 3 с + пауза
    machete: hit(A.machete), "war-hammer": hit(A.warHammer), katana: hit(A.katana), spear: hit(A.spear),
    grenades: hit(A.handGrenade), launcher: hit(A.launcher), dynamite: hit(A.dynamite) };
  const base = { ranged: "pistol", melee: "machete", demo: "grenades" };
  const second = 1 + U.second.prices.length * U.second.bonus;
  const mastered = 1 + U.primary.prices.length * U.primary.bonus + U.primaryPick + U.second.prices.length * U.second.bonus;
  for (const [cls, list] of Object.entries(SUBCLASS.weapons)) {
    const b = dps[base[cls]];
    for (const w of list) {
      if (w === "rifle") continue; // снайперка — урон за выстрел (в голову 222 из 220 HP в дуэли), не урон в секунду: 111 раз в 3 с, обойма 3
      if (w === "bow") continue; //      лук — разовый урон за натяг (50–110), не поток: числа задал дизайнер
      if (w === "dynamite") continue; // динамит — разовый взрыв по площади (105 в радиусе 4), не поток урона по одной цели
      const r = dps[w] / b;
      t.check(`${w}: ${dps[w].toFixed(0)}/с = ${r.toFixed(2)}× ${base[cls]}`, r >= 1.3 && r <= 2.2);
      const m = (b * mastered) / (dps[w] * second);
      t.check(`освоенное ${base[cls]} против ${w} с улучшениями: ${m.toFixed(2)}`, m >= 0.75 && m <= 1.25);
    }
  }
  t.check("базовые классы близки (25–40/с по одной цели)", Object.values(base).every((w) => dps[w] >= 25 && dps[w] <= 40));
  await g.frames(1);
}
