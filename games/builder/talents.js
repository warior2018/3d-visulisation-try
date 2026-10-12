// ============================================================
//  Дерево талантов «Стройки». Правила (очки, ранги, ярусы) — в движке
//  (engine/progression/talents.js), здесь — сами таланты.
//
//  6 вкладок: 5 — по видам атак (engine/combat/attacks.js). Таланты вкладки
//  действуют только на атаки своего вида: «Ближний» не усиливает пистолет.
//  6-я — «Выживание»: не атаки, а сам герой (stats: здоровье, регенерация, броня, скорость).
//  Как применить stats к герою, решает игра (game-scene.js → applyTalents).
//  7-я — «Кабан»: таланты для приручённых кабанов (stats с приставкой boar — game-scene.js → applyPetTalents).
//  Ярусы: 1 — открыт сразу, 2 — после 2 очков во вкладке, 3 — после 4.
//
//  В игре пока есть только ближний бой (рука) и дальний (пистолет). Таланты
//  магии, предметов и ловушек уже можно учить — заработают, когда появятся такие атаки.
// ============================================================

import { BOAR_GROWTH } from "./config.js";
import {
  flatDamage, damageMultiplier, cooldownReduction, reachBonus, lifesteal, executioner, firstStrike,
  critical, guaranteedCrit, against, convertTo, withStatus, chill, poison,
} from "../../engine/index.js";

const pct = (x) => `${Math.round(x * 100)}%`;

// Скорость ближнего боя: 3/3 ранга ускоряют кулак с 1.1 с до 0.6 с между ударами.
// 0.6 / 1.1 = 0.545 → перезарядка короче на 45.5 % за 3 ранга, то есть ~15.2 % за ранг.
// Это проценты, поэтому так же ускоряется любое оружие ближнего боя: мачете 1.4 с → 0.76 с
const MELEE_CDR = (1 - 0.6 / 1.1) / 3;

// Трофеи: сколько уже набрано за убитых мобов. Игра обновляет и сохраняет,
// здесь — чтобы описания талантов показывали текущие цифры.
//  «ТРОФЕИ» (Выживание) — hp: +1 % макс. HP каждого убитого (share);
//  трофеи урона — у КАЖДОГО вида атак свой талант (последний во вкладке): +perKill % к урону
//  этого вида за убийство, добитое именно этим видом (кулаком/мачете — ближний, пистолетом — дальний).
//  pct — набрано по видам, в процентах.
export const TROPHY = { share: 0.01, hp: 0, perKill: 0.3, pct: { melee: 0, ranged: 0, magic: 0, item: 0, trap: 0 } };

// Какой талант копит трофеи урона для какого вида атак
export const TROPHY_TALENTS = { melee: "fighter-trophies", ranged: "marksman-trophies", magic: "mage-trophies", item: "thrower-trophies", trap: "trapper-trophies" };

// Набранное — красиво: 1.2 (без «1.2000000001»)
export const trophyPct = (kind) => +TROPHY.pct[kind].toFixed(1);

// Талант трофеев урона для вида kind (что убивать — how: «БЛИЖНИМ БОЕМ»)
const damageTrophy = (kind, name, how) => ({
  id: TROPHY_TALENTS[kind], name, tier: 4, maxRank: 1, cost: 3,
  describe: () => `+${TROPHY.perKill}% УРОНА ЗА УБИЙСТВО ${how} (НАБРАНО +${trophyPct(kind)}%)`,
});

export const TALENT_TREE = {
  tierPoints: [0, 2, 4, 6], // ярус 4 — трофеи (последний, самый дорогой талант вкладки)
  tabs: [
    {
      id: "melee", name: "БЛИЖНИЙ", kind: "melee",
      talents: [
        { id: "heavy-hand", name: "ТЯЖЁЛАЯ РУКА", tier: 1, maxRank: 4,
          describe: (r) => `+${3 * r} УРОНА, РАДИУС УДАРА +${6 * r}%`, modifiers: (r) => [flatDamage(3 * r), reachBonus(0.06 * r)] },
        { id: "fast-fists", name: "БЫСТРЫЕ УДАРЫ", tier: 1, maxRank: 3,
          describe: (r) => `ПЕРЕЗАРЯДКА УДАРОВ -${pct(MELEE_CDR * r)}`, modifiers: (r) => [cooldownReduction(MELEE_CDR * r)] },
        { id: "vampire", name: "ВАМПИРИЗМ", tier: 2, maxRank: 2,
          describe: (r) => `${pct(0.1 * r)} УРОНА - В ЗДОРОВЬЕ`, modifiers: (r) => [lifesteal(0.1 * r)] },
        { id: "finisher", name: "ДОБИВАНИЕ", tier: 2, maxRank: 2,
          describe: (r) => `X${1 + 0.25 * r} ПО ЦЕЛИ С HP < 30%`, modifiers: (r) => [executioner(0.3, 1 + 0.25 * r)] },
        { id: "crush", name: "СОКРУШЕНИЕ", tier: 3, maxRank: 1,
          describe: () => "20% ШАНС КРИТА X2", modifiers: () => [critical(0.2, 2)] },
        // Гарантированный крит раз в 5 с — на весь взмах (катана: все задетые получают крит)
        { id: "death-cut", name: "СМЕРТЕЛЬНЫЙ РАЗРЕЗ", tier: 3, maxRank: 1, cost: 3,
          describe: () => "РАЗ В 5 С - КРИТ X3 ВСЕМ ЗАДЕТЫМ", modifiers: () => [guaranteedCrit(3, 5)] },
        damageTrophy("melee", "ТРОФЕИ БОЙЦА", "БЛИЖНИМ БОЕМ"),
      ],
    },
    {
      id: "ranged", name: "ДАЛЬНИЙ", kind: "ranged",
      talents: [
        { id: "aim", name: "МЕТКОСТЬ", tier: 1, maxRank: 3,
          describe: (r) => `+${pct(0.1 * r)} УРОНА`, modifiers: (r) => [damageMultiplier(1 + 0.1 * r)] },
        { id: "quick-slide", name: "БЫСТРЫЙ ЗАТВОР", tier: 1, maxRank: 4,
          describe: (r) => `ВЫСТРЕЛЫ НА ${pct(0.08 * r)} ЧАЩЕ`, modifiers: (r) => [cooldownReduction(0.08 * r)] },
        { id: "hunter", name: "ОХОТНИК", tier: 2, maxRank: 2,
          describe: (r) => `X${1 + 0.2 * r} ПО СКЕЛЕТАМ`, modifiers: (r) => [against("skeleton", 1 + 0.2 * r)] },
        { id: "first-shot", name: "ПЕРВЫЙ ВЫСТРЕЛ", tier: 2, maxRank: 1,
          describe: () => "X1.5 ПО ЦЕЛИ С ПОЛНЫМ HP", modifiers: () => [firstStrike(1.5)] },
        // Огонь поджигает (шанс 50 %): горение жжёт долю МАКС. HP цели в секунду (engine/combat/status.js → BURN_LEVELS)
        { id: "fire-rounds", name: "ОГНЕННЫЕ ПУЛИ", tier: 3, maxRank: 2,
          describe: (r) => (r === 1 ? "ОГОНЬ: ПОДЖОГ 7.5% HP/С, 4 С" : "ОГОНЬ: ПОДЖОГ 15% HP/С, 5 С"),
          modifiers: () => [convertTo("fire")], stats: (r) => ({ burnLevel: r }) },
        // Ярус 4 (после 6 очков во вкладке), 3 очка: урон растёт с каждым убийством — только дальние атаки
        damageTrophy("ranged", "ТРОФЕИ СТРЕЛКА", "ДАЛЬНИМ БОЕМ"),
      ],
    },
    {
      id: "magic", name: "МАГИЯ", kind: "magic", note: "ПОКА НЕТ МАГИЧЕСКИХ АТАК",
      talents: [
        { id: "elements", name: "СИЛА СТИХИЙ", tier: 1, maxRank: 3,
          describe: (r) => `+${pct(0.15 * r)} УРОНА`, modifiers: (r) => [damageMultiplier(1 + 0.15 * r)] },
        { id: "focus", name: "КОНЦЕНТРАЦИЯ", tier: 1, maxRank: 3,
          describe: (r) => `ЗАКЛИНАНИЯ НА ${pct(0.1 * r)} ЧАЩЕ`, modifiers: (r) => [cooldownReduction(0.1 * r)] },
        { id: "frost-touch", name: "ЛЕДЯНОЕ КАСАНИЕ", tier: 2, maxRank: 2,
          describe: (r) => `${pct(0.25 * r)} ШАНС ЗАМЕДЛИТЬ`, modifiers: (r) => [withStatus(chill, 0.25 * r)] },
        { id: "toxins", name: "ТОКСИНЫ", tier: 2, maxRank: 2,
          describe: (r) => `${pct(0.25 * r)} ШАНС ОТРАВИТЬ`, modifiers: (r) => [withStatus(poison, 0.25 * r)] },
        { id: "overload", name: "ПЕРЕГРУЗКА", tier: 3, maxRank: 1,
          describe: () => "25% ШАНС КРИТА X2.5", modifiers: () => [critical(0.25, 2.5)] },
        damageTrophy("magic", "ТРОФЕИ МАГА", "МАГИЕЙ"),
      ],
    },
    {
      id: "items", name: "ПРЕДМЕТЫ", kind: "item", note: "БРОСКИ: КАМНИ (Q С КАМНЕМ В РУКЕ)",
      talents: [
        { id: "heavy-throw", name: "ТЯЖЁЛЫЙ БРОСОК", tier: 1, maxRank: 3,
          describe: (r) => `+${2 * r} УРОНА БРОСКАМ`, modifiers: (r) => [flatDamage(2 * r)] }, // камень 6–12: +2 — заметно
        { id: "nimble", name: "ЛОВКИЕ РУКИ", tier: 1, maxRank: 3,
          describe: (r) => `БРОСКИ НА ${pct(0.1 * r)} ЧАЩЕ`, modifiers: (r) => [cooldownReduction(0.1 * r)] },
        { id: "poison-mix", name: "ЯДОВИТЫЕ СМЕСИ", tier: 2, maxRank: 2,
          describe: (r) => `${pct(0.3 * r)} ШАНС ОТРАВИТЬ`, modifiers: (r) => [withStatus(poison, 0.3 * r)] },
        { id: "cold-blood", name: "ХЛАДНОКРОВИЕ", tier: 2, maxRank: 2,
          describe: (r) => `X${1 + 0.3 * r} ПО ЦЕЛИ С HP < 30%`, modifiers: (r) => [executioner(0.3, 1 + 0.3 * r)] },
        { id: "thirst", name: "ЖАЖДА", tier: 3, maxRank: 1,
          describe: () => "15% УРОНА - В ЗДОРОВЬЕ", modifiers: () => [lifesteal(0.15)] },
        damageTrophy("item", "ТРОФЕИ МЕТАТЕЛЯ", "ПРЕДМЕТОМ"),
      ],
    },
    {
      id: "traps", name: "ЛОВУШКИ", kind: "trap", note: "ПОКА НЕТ ЛОВУШЕК",
      talents: [
        { id: "sharp-spikes", name: "ОСТРЫЕ ШИПЫ", tier: 1, maxRank: 3,
          describe: (r) => `+${5 * r} УРОНА`, modifiers: (r) => [flatDamage(5 * r)] },
        { id: "ambush", name: "ЗАСАДА", tier: 1, maxRank: 2,
          describe: (r) => `X${1 + 0.25 * r} ПО ЦЕЛИ С ПОЛНЫМ HP`, modifiers: (r) => [firstStrike(1 + 0.25 * r)] },
        { id: "venom-spikes", name: "ЯДОВИТЫЕ ШИПЫ", tier: 2, maxRank: 2,
          describe: (r) => `${pct(0.4 * r)} ШАНС ОТРАВИТЬ`, modifiers: (r) => [withStatus(poison, 0.4 * r)] },
        { id: "frost-spikes", name: "ЛЕДЯНЫЕ ШИПЫ", tier: 2, maxRank: 2,
          describe: (r) => `${pct(0.4 * r)} ШАНС ЗАМЕДЛИТЬ`, modifiers: (r) => [withStatus(chill, 0.4 * r)] },
        { id: "death-trap", name: "КАПКАН СМЕРТИ", tier: 3, maxRank: 1,
          describe: () => "X2 ПО ЦЕЛИ С HP < 50%", modifiers: () => [executioner(0.5, 2)] },
        damageTrophy("trap", "ТРОФЕИ ОХОТНИКА", "ЛОВУШКОЙ"),
      ],
    },
    {
      id: "survival", name: "ВЫЖИВАНИЕ", note: "ДЕЙСТВУЕТ ВСЕГДА",
      talents: [
        { id: "tough-bones", name: "КРЕПКИЕ КОСТИ", tier: 1, maxRank: 3,
          describe: (r) => `+${10 * r} К МАКС. HP`, stats: (r) => ({ maxHp: 10 * r }) },
        { id: "regen", name: "РЕГЕНЕРАЦИЯ", tier: 1, maxRank: 4, // 0.5 / 1 / 1.5 / 2 % макс. HP в секунду
          describe: (r) => `+${0.5 * r}% МАКС. HP В СЕКУНДУ`, stats: (r) => ({ regenPct: 0.005 * r }) },
        { id: "thick-skin", name: "ТОЛСТАЯ КОЖА", tier: 2, maxRank: 2,
          describe: (r) => `-${pct(0.1 * r)} ФИЗИЧЕСКОГО УРОНА`, stats: (r) => ({ resist: { physical: 0.1 * r } }) },
        { id: "light-step", name: "ЛЁГКИЙ ШАГ", tier: 2, maxRank: 4,
          describe: (r) => `+${pct(0.05 * r)} К СКОРОСТИ`, stats: (r) => ({ speed: 0.05 * r }) },
        { id: "unbreakable", name: "НЕСОКРУШИМЫЙ", tier: 3, maxRank: 1,
          describe: () => "+25 К МАКС. HP", stats: () => ({ maxHp: 25 }) },
        // Последний и самый дорогой: растёт с каждым убийством (считает game-scene.js → onDeath)
        { id: "trophies", name: "ТРОФЕИ", tier: 4, maxRank: 1, cost: 3,
          describe: () => `+1% МАКС. HP КАЖДОГО УБИТОГО (НАБРАНО +${Math.floor(TROPHY.hp)} HP)` },
      ],
    },
    {
      id: "boar", name: "КАБАН", note: "ДЛЯ ТВОИХ ПРИРУЧЁННЫХ КАБАНОВ",
      talents: [
        { id: "boar-speed", name: "РЕЗВОСТЬ", tier: 1, maxRank: 3,
          describe: (r) => `+${pct(0.1 * r)} К СКОРОСТИ`, stats: (r) => ({ boarSpeed: 0.1 * r }) },
        { id: "boar-regen", name: "ЗАЖИВЛЕНИЕ", tier: 1, maxRank: 5,
          describe: (r) => `+${r} HP В СЕКУНДУ`, stats: (r) => ({ boarRegen: r }) },
        { id: "boar-hp", name: "ТОЛСТАЯ ШКУРА", tier: 2, maxRank: 3,
          describe: (r) => `+${30 * r} К МАКС. HP`, stats: (r) => ({ boarMaxHp: 30 * r }) },
        { id: "boar-armor", name: "БРОНЯ ИЗ ЩЕТИНЫ", tier: 2, maxRank: 2,
          describe: (r) => `-${pct(0.1 * r)} ФИЗИЧЕСКОГО УРОНА`, stats: (r) => ({ boarResist: { physical: 0.1 * r } }) },
        // Растёт сам: раз в минуту +10 к макс. HP, навсегда (считает game-scene.js → growPets)
        { id: "boar-growth", name: "РОСТ", tier: 3, maxRank: 1, cost: 2,
          describe: () => `КАЖДУЮ МИНУТУ +${BOAR_GROWTH.growHp} К МАКС. HP`, stats: () => ({ boarGrowth: 1 }) },
      ],
    },
  ],
};
