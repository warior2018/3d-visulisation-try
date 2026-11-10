def ed(p,pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s,(p,a[:60]); s=s.replace(a,b,1)
    open(p,'w').write(s)
ed('games/builder/config.js',[
("export const MOB_MIX = { skeleton: 7, zombie: 3, bloater: 1.3 }; // РАЗДУТЫЙ — ~1 из 9",
"""export const MOB_MIX = { skeleton: 7, zombie: 3, bloater: 1.3, ghoul: 1.6, mummy: 1.2, shaman: 0.8, goblin: 1 }; // РАЗДУТЫЙ — ~1 из 13

// Новые мобы (scene/mob-kinds.js; паспорта — creatures.js):
//  УПЫРЬ (ghoul) — быстрый и хрупкий: когти пускают кровь (bleed — доля макс. HP цели за 3 с), лечится на lifesteal
//    от нанесённого. Стоек к стрельбе, взрыв ранит его сильнее.
//  МУМИЯ (mummy) — медленная и крепкая: бинты замедляют (slow — скорость ×factor на time с). Стойка к ближнему бою;
//    горение (ОГНЕННЫЕ ПУЛИ, НАПАЛМ) жжёт её ×burn — сам выстрел / взрыв бьёт как обычно.
//  КОСТЯНОЙ ШАМАН (shaman) — держит дистанцию, бросает порчу; каждые heal.every с лечит мобов рядом (heal.radius м)
//    на heal.amount HP. Стоек к стрельбе, ближний бой ранит сильнее — подбегай.
//  ГОБЛИН-ТРАППЕР (goblin) — мелкий и шустрый: в бою каждые trap.every с ставит капкан (до trap.max), увернулся
//    от выстрела с шансом dodge; ранен ниже flee — убегает (быстрее на fleeSpeed). С него бывает капкан.
//  ЧУМНОЙ ВОЖАК (champion) — минибосс: редко (chance на появление моба после from-го), один на мир. Призывает
//    упырей (summon), вокруг — чумная аура (aura: урон в секунду рядом), добыча богатая
export const MOB_KINDS = {
  ghoul: { bleed: 0.06, lifesteal: 0.5 },
  mummy: { slow: { factor: 0.6, time: 2 }, burn: 2 },
  shaman: { heal: { every: 2, radius: 7, amount: 8 } },
  goblin: { trap: { every: 9, max: 3, lifetime: 45, root: 1.5 }, dodge: 0.2, flee: 0.4, fleeSpeed: 0.35 },
  champion: { chance: 0.012, from: 25, summon: { every: 14, count: 3, max: 6 }, aura: { radius: 4, dps: 4 } },
};"""),
("  zombieClaw: {","""  ghoulClaw: { id: "ghoul-claw", name: "GHOUL CLAW", damage: [5, 9], reach: PUNCH_REACH * 0.75, windup: 0.2, cooldown: 0.9, arc: 90, maxTargets: 1 },
  mummyGrasp: { id: "mummy-grasp", name: "WRAPPING GRASP", damage: [9, 14], reach: PUNCH_REACH * 0.85, windup: 0.5, cooldown: 1.7, arc: 100, maxTargets: 2 },
  shamanStaff: { id: "shaman-staff", name: "BONE STAFF", damage: [4, 7], reach: PUNCH_REACH * 0.8, windup: 0.3, cooldown: 1.4 },
  shamanHex: { id: "shaman-hex", name: "HEX", damage: [8, 12], speed: 16, cooldown: 2.6 },
  goblinStab: { id: "goblin-stab", name: "RUSTY KNIFE", damage: [4, 7], reach: PUNCH_REACH * 0.65, windup: 0.15, cooldown: 0.8, maxTargets: 1 },
  goblinTrap: { id: "goblin-trap", name: "GOBLIN TRAP", damage: 18, radius: 0.6 },
  championCleave: { id: "champion-cleave", name: "PLAGUE CLEAVER", damage: [18, 26], reach: 2.8, windup: 0.45, cooldown: 1.8, arc: 120, maxTargets: 3 },
  zombieClaw: {"""),
("    zombie: [95, 140, 55], bloater: [120, 150, 45],","    zombie: [95, 140, 55], bloater: [120, 150, 45], ghoul: [120, 30, 60], mummy: [200, 185, 140], shaman: [225, 200, 190], goblin: [70, 150, 60], champion: [110, 150, 40],"),
("    { id: \"bring-bone\",","    { id: \"kill-ghoul\", kind: \"kill\", target: \"ghoul\", count: [5, 10], perUnit: 8, title: \"KILL {n} GHOULS\" },\n    { id: \"kill-champion\", kind: \"kill\", target: \"champion\", count: [1, 1], flat: 160, level: 4, title: \"KILL THE PLAGUE CHAMPION\" },\n    { id: \"bring-bone\","),
])
print("ok")
