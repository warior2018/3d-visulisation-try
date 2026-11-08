// ============================================================
//  Дерево талантов «Стройки» — по схемам классов. Правила (очки, ранги, требования) — в движке
//  (engine/progression/talents.js), здесь — сами таланты.
//
//  2 вкладки классов (видна только вкладка своего класса) + ВЫЖИВАНИЕ (всем).
//  Вкладка класса — дерево: по краям ветки оружия (боковые, по 2 очка за ранг), в середине — GENERAL
//  (ранги 1–2 по 1 очку, с 3-го — по 2). Стрелки схемы — requires: чтобы открыть талант, нужен хотя бы
//  1 ранг каждого из требуемых. Внизу каждого дерева — трофеи: +% урона за каждое убийство.
//  col / row — где узел на экране; sections — подписи веток.
//
//  Таланты вкладки с kind действуют только на атаки этого вида (БОЕЦ — ближний бой и т. д.).
//  Что не модификатор урона, а правило игры (радиус молота, граната, магма...) — stats: их читает игра
//  (game-scene.js → applyTalents и места, где это работает).
// ============================================================

import { HAMMER, FALL_DAMAGE, SUBCLASS, DEMO } from "./config.js";
import {
  damageMultiplier, cooldownReduction, lifesteal, guaranteedCrit, withStatus, convertTo, bleed, stun, Slow,
  firstHit, vsStunned, headshotBonus, rampPerHit, onlyAttack, reachBonus,
} from "../../engine/index.js";

const pct = (x) => `${Math.round(x * 1000) / 10}%`;
// Цена ранга: GENERAL — первые два по 1 очку, дальше по 2; ветки оружия — по 2 за ранг
const GENERAL = (r) => (r >= 3 ? 2 : 1);
const SIDE = 2;
// «На X % быстрее» → во сколько раз короче перезарядка: 1 / (1 + X)
const faster = (x) => cooldownReduction(1 - 1 / (1 + x));
// Значение ранга r из списка (ранг 1 — первое)
const at = (list, r) => list[Math.min(r, list.length) - 1];

// Трофеи: сколько уже набрано за убитых. Игра обновляет и сохраняет, здесь — чтобы описания показывали цифры.
//  «ТРОФЕИ» (Выживание) — hp: +hpPerKill макс. HP за каждое убийство;
//  трофеи урона — у каждого класса свой (внизу дерева): +perKill % к урону его вида за убийство этим видом.
// hpPerKill — талант «ТРОФЕИ»: +столько макс. HP за каждое убийство (без предела)
export const TROPHY = { hpPerKill: 1, hp: 0, perKill: 0.3, pct: { melee: 0, ranged: 0, blast: 0 } };

// Какой талант копит трофеи урона для какого вида атак
export const TROPHY_TALENTS = { melee: "fighter-trophies", ranged: "marksman-trophies", blast: "demo-trophies" };

export const trophyPct = (kind) => +TROPHY.pct[kind].toFixed(1);

const damageTrophy = (kind, name, how, col, row, requires) => ({
  id: TROPHY_TALENTS[kind], name, maxRank: 1, cost: 3, col, row, requires,
  describe: () => `+${TROPHY.perKill}% DMG PER KILL ${how} (NOW +${trophyPct(kind)}%)`,
});

// Урон GENERAL: +10/15/20/25(/30) %
const damageTalent = (id, list, col = 2) => ({
  id, name: "DAMAGE", maxRank: list.length, cost: GENERAL, col, row: 0,
  describe: (r) => `+${pct(at(list, r))} DMG`, modifiers: (r) => [damageMultiplier(1 + at(list, r))],
});

// ---------- ПОДКЛАСС: вкладки оружия ----------
// Ветки покупного оружия вынесены из вкладок классов в свои вкладки "w-<предмет>": видна (и действует) только
// вкладка оружия, выбранного на SUBCLASS.level уровне (scene/progression.js → askSubclass). В каждой — свои
// таланты оружия + MASTERY (+урон этим оружием)
export const weaponTab = (item) => `w-${item}`;
const WEAPON_BRANCH = { // предмет → [id атаки, имя вкладки, приставка id талантов, которые туда переезжают]
  "war-hammer": ["war-hammer", "WAR HAMMER", "hammer-"], katana: ["katana", "KATANA", "katana-"], spear: [["spear", "spear-charge"], "SPEAR", "spear-"],
  auto: ["auto", "ASSAULT RIFLE", "rifle-"], shotgun: ["shotgun", "SHOTGUN", "shotgun-"], rifle: ["rifle", "SNIPER", "sniper-head"], crossbow: ["crossbow", "CROSSBOW", null],
  launcher: ["launcher", "LAUNCHER", "launcher-"], dynamite: ["dynamite", "DYNAMITE", "dynamite-"],
};
// Свои таланты у оружия, у которого их было мало
const EXTRA = () => ({ // функция: у каждого дерева (режима) — свои объекты (shiftCols их двигает)
  crossbow: [{ id: "crossbow-head", name: "HEADSHOT", maxRank: 2, cost: SIDE, col: 0, row: 0,
    describe: (r) => `CROSSBOW HEADSHOTS X${at([1.5, 2], r)} MORE`, modifiers: (r) => [onlyAttack("crossbow", headshotBonus(at([1.5, 2], r)))] }],
});
const shiftCols = (list) => {
  const min = Math.min(...list.map((t) => t.col));
  for (const t of list) t.col -= min;
  return min;
};
// ---------- Деревья талантов по режимам ----------
// Для каждого режима (обычная игра — "classic", дуэль — "duel") своё дерево: те же таланты, но числа можно задать
// свои (MODE_TALENTS ниже — поверх общих). Пока числа одинаковые: таблицы для дуэли — потом
export const TALENT_MODES = ["classic", "duel"];
// Поправки режима: { "id таланта": { maxRank, describe, modifiers, stats, ... } } — заменяют поля общего таланта
export const MODE_TALENTS = { classic: {}, duel: {} };
// Каких талантов в режиме нет совсем (вкладка опустела — её тоже нет). Дуэль: что там не прокачать или не работает
// (трофеи за убийства, удача на добычу, маунт) и сильные множители, пока для дуэли нет своих чисел
export const MODE_REMOVED = {
  classic: [],
  duel: [
    "trophies", "fighter-trophies", "marksman-trophies", "demo-trophies", // трофеи: копятся за убийства мобов
    "fortune", "mount-saddle", "mount-swift", "mount-call", //               удача на добычу, маунт — в дуэли их нет
    "katana-iai", "sniper-head", "crossbow-head", "r-first", "f-crit", //     множители урона
  ],
};

function buildTree(mode) {
  const TALENT_TREE = {
    tabs: [
      // ---------- БОЕЦ ----------
      {
        id: "melee", name: "FIGHTER", kind: "melee", note: "BASE: MACHETE. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB",
        sections: [{ name: "MACHETE", col: 0.5 }, { name: "GENERAL", col: 2.5 }, { name: "KATANA", col: 4.5 }, { name: "SPEAR", col: 6 }],
        talents: [
          { id: "hammer-stun", name: "STUN", maxRank: 3, cost: SIDE, col: 0, row: 0,
            describe: (r) => `HAMMER STUNS ${at([0.5, 0.75, 1], r)} S, +${pct(at([0.05, 0.1, 0.15], r))} DMG VS STUNNED`,
            modifiers: (r) => [onlyAttack("war-hammer", withStatus(stun(at([0.5, 0.75, 1], r)))), onlyAttack("war-hammer", vsStunned(1 + at([0.05, 0.1, 0.15], r)))] },
          { id: "hammer-slam", name: "SPLASH SLAM", maxRank: 3, cost: SIDE, col: 1, row: 0,
            describe: (r) => `HAMMER SLAM RADIUS ${at([1.5, 2, 2.5], r)} BLOCKS (BASE 1)`,
            stats: (r) => ({ hammerSlam: at([1.5, 2, 2.5], r) }) },
          { id: "hammer-leap", name: "JUMP SLAM", maxRank: 1, cost: SIDE, col: 0.5, row: 1, requires: ["hammer-slam"],
            describe: () => `WITH THE HAMMER: JUMP 80% HIGHER, SLAM X${HAMMER.perStep} DMG MORE PER ${HAMMER.step} BLOCK FALLEN (UP TO X${HAMMER.maxMult}). FALL DMG FROM +${FALL_DAMAGE.jumpSlam.from} BLOCKS HIGHER, X${FALL_DAMAGE.jumpSlam.mult}`, stats: () => ({ hammerLeap: true }) },
          // Мачете (базовое оружие бойца): прыжок на Q — abilities.js → MacheteAbility.leap, progression.js → leapStats
          { id: "machete-leap-dmg", name: "LEAP DAMAGE", maxRank: 2, cost: SIDE, col: 0, row: 0,
            describe: (r) => `MACHETE LEAP +${pct(at([0.25, 0.5], r))} DMG`, stats: (r) => ({ leapDamage: at([0.25, 0.5], r) }) },
          { id: "machete-leap-far", name: "LONG LEAP", maxRank: 2, cost: SIDE, col: 1, row: 0,
            describe: (r) => `MACHETE LEAP +${at([1.5, 3], r)} M FURTHER`, stats: (r) => ({ leapDistance: at([1.5, 3], r) }) },
          { id: "machete-leap-bleed", name: "LEAP BLEED", maxRank: 2, cost: SIDE, col: 0.5, row: 1, requires: ["machete-leap-dmg", "machete-leap-far"],
            describe: (r) => `MACHETE LEAP BLEEDS ${pct(at([0.1, 0.15], r))} MAX HP IN 3 S`, stats: (r) => ({ leapBleed: at([0.1, 0.15], r) }) },
          damageTalent("f-damage", [0.1, 0.15, 0.2, 0.25, 0.3]),
          { id: "f-speed", name: "ATTACK SPEED", maxRank: 5, cost: GENERAL, col: 3, row: 0,
            describe: (r) => `+${pct(at([0.1, 0.2, 0.3, 0.4, 0.5], r))} ATTACK SPEED`, modifiers: (r) => [faster(at([0.1, 0.2, 0.3, 0.4, 0.5], r))] },
          { id: "f-lifesteal", name: "LIFESTEAL", maxRank: 3, cost: GENERAL, col: 2, row: 1, requires: ["f-damage"],
            describe: (r) => `${pct(at([0.1, 0.2, 0.3], r))} OF DMG AS HEALTH`, modifiers: (r) => [lifesteal(at([0.1, 0.2, 0.3], r))] },
          { id: "f-bleed", name: "BLEED", maxRank: 3, cost: GENERAL, col: 3, row: 1, requires: ["f-speed"],
            describe: (r) => `HITS BLEED ${pct(at([0.08, 0.12, 0.16], r))} MAX HP IN 3 S (UP TO 3 STACKS)`, modifiers: (r) => [withStatus(bleed(at([0.08, 0.12, 0.16], r)))] },
          { id: "f-crit", name: "CRIT", maxRank: 2, cost: GENERAL, col: 2.5, row: 2, requires: ["f-lifesteal", "f-bleed"],
            describe: (r) => `CRIT X${at([2, 3], r)} ONCE EVERY ${at([8, 7], r)} S`, modifiers: (r) => [guaranteedCrit(at([2, 3], r), at([8, 7], r), "fighter-crit")] },
          damageTrophy("melee", "FIGHTER TROPHIES", "IN MELEE", 3, 3, ["f-crit"]),
          // Дальность ударов ближнего боя (reachFor: мачете, катана, копьё, кулак): 1 очко за ранг
          // Блок отражает выстрелы: отбитая доля летит туда, куда смотришь (combat.js → reflectShot)
          { id: "f-reflect", name: "REFLECT", maxRank: 2, cost: GENERAL, col: 2, row: 4, requires: ["f-reach"],
            describe: (r) => `BLOCKED SHOTS FLY BACK WHERE YOU LOOK: ${pct(at([0.5, 1], r))} OF THE BLOCKED DMG`, stats: (r) => ({ reflect: at([0.5, 1], r) }) },
          { id: "f-reach", name: "REACH", maxRank: 3, cost: 1, col: 2, row: 3,
            describe: (r) => `+${pct(at([0.1, 0.2, 0.3], r))} MELEE REACH`, modifiers: (r) => [reachBonus(at([0.1, 0.2, 0.3], r))] },
          { id: "katana-iai", name: "IAI MULTIPLIER", maxRank: 3, cost: SIDE, col: 4, row: 0,
            describe: (r) => `IAI STRIKE X${at([2, 2.5, 3], r)} DMG`, stats: (r) => ({ iaiMult: at([2, 2.5, 3], r) }) },
          { id: "katana-speed", name: "IAI SPEED", maxRank: 3, cost: SIDE, col: 5, row: 0,
            describe: (r) => `+${pct(at([0.1, 0.15, 0.2], r))} SPEED WHILE IAI IS CHARGED`, stats: (r) => ({ iaiSpeed: at([0.1, 0.15, 0.2], r) }) },
          { id: "katana-reset", name: "IAI RESET", maxRank: 1, cost: SIDE, col: 4.5, row: 1, requires: ["katana-iai", "katana-speed"],
            describe: () => "A KILL BY THE IAI DASH RESETS ITS COOLDOWN", stats: () => ({ iaiReset: true }) }, // abilities.js → cutAlong
          { id: "spear-momentum", name: "MOMENTUM", maxRank: 3, cost: SIDE, col: 6, row: 0,
            describe: (r) => `CHARGE SPEEDS UP TO +${pct(at([0.3, 0.6, 0.9], r))} (FASTER - MORE DMG), PIERCES +${at([2, 4, 6], r)} ENEMIES` }, // game-scene.js → startSpearCharge
        ],
      },
      // ---------- СТРЕЛОК ----------
      {
        id: "ranged", name: "RANGER", kind: "ranged", note: "BASE: PISTOL. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB",
        sections: [{ name: "RIFLE", col: 0.5 }, { name: "GENERAL", col: 2.5 }, { name: "SHOTGUN", col: 4 }, { name: "SNIPER", col: 5 }],
        talents: [
          { id: "rifle-grenade", name: "GRENADE", maxRank: 1, cost: SIDE, col: 0, row: 0,
            describe: () => "EVERY 15 RIFLE SHOTS - A SMALL GRENADE: 200% RIFLE DMG, 2.5 BLOCKS RADIUS", stats: () => ({ rifleGrenade: 1 }) },
          { id: "rifle-refund", name: "AMMO REFUND", maxRank: 1, cost: SIDE, col: 1, row: 0,
            describe: () => "RIFLE KILLS PUT 15 ROUNDS BACK INTO ITS MAGAZINE", stats: () => ({ rifleRefund: 15 }) },
          damageTalent("r-damage", [0.1, 0.15, 0.2, 0.25, 0.3]),
          { id: "r-mag", name: "MAGAZINE", maxRank: 4, cost: GENERAL, col: 3, row: 0,
            describe: (r) => `+${pct(at([0.15, 0.25, 0.35, 0.45], r))} MAGAZINE SIZE`, stats: (r) => ({ magBonus: at([0.15, 0.25, 0.35, 0.45], r) }) },
          { id: "r-speed", name: "ATTACK SPEED", maxRank: 4, cost: GENERAL, col: 2, row: 1, requires: ["r-damage"],
            describe: (r) => `+${pct(at([0.1, 0.2, 0.3, 0.4], r))} ATTACK SPEED`, modifiers: (r) => [faster(at([0.1, 0.2, 0.3, 0.4], r))] },
          { id: "r-first", name: "FIRST HIT", maxRank: 4, cost: GENERAL, col: 3, row: 1, requires: ["r-mag"],
            describe: (r) => `FIRST HIT ON A TARGET +${pct(at([0.25, 0.5, 0.75, 1], r))} DMG`, modifiers: (r) => [firstHit(1 + at([0.25, 0.5, 0.75, 1], r))] },
          // Огонь поджигает: горение жжёт долю МАКС. HP цели в секунду (engine/combat/status.js → BURN_LEVELS)
          { id: "fire-rounds", name: "FIRE BULLETS", maxRank: 2, cost: GENERAL, col: 2.5, row: 2, requires: ["r-speed", "r-first"],
            describe: (r) => (r === 1 ? "FIRE: BURNS 7.5% HP/S, MAX 30% HP" : "FIRE: BURNS 15% HP/S, MAX 30% HP"),
            modifiers: () => [convertTo("fire")], stats: (r) => ({ burnLevel: r }) },
          damageTrophy("ranged", "RANGER TROPHIES", "AT RANGE", 2.5, 3, ["fire-rounds"]),
          { id: "shotgun-ramp", name: "PELLET CHAIN", maxRank: 1, cost: SIDE, col: 4, row: 0,
            describe: () => "EACH PELLET IN A TARGET: NEXT ONE +2.5% DMG", modifiers: () => [onlyAttack("shotgun", rampPerHit(0.025))] },
          { id: "sniper-head", name: "HEADSHOT", maxRank: 3, cost: SIDE, col: 5, row: 0,
            describe: (r) => `SNIPER HEADSHOTS X${at([1.5, 2.5, 3.5], r)} MORE`, modifiers: (r) => [onlyAttack("rifle", headshotBonus(at([1.5, 2.5, 3.5], r)))] },
        ],
      },
      // ---------- ПОДРЫВНИК ----------
      // Всё — взрывы (вид атак "blast"): гранаты (база), гранатомёт и динамит (магазин). Правила (радиус, фитиль,
      // бомбочки кассеты) — stats, их читает game-scene.js → throwBomb и abilities.js
      {
        id: "demo", name: "DEMOLITIONIST", kind: "blast", note: "BASE: GRENADES. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB",
        sections: [{ name: "GRENADES", col: 0.5 }, { name: "GENERAL", col: 2.5 }, { name: "LAUNCHER", col: 4 }, { name: "DYNAMITE", col: 5 }],
        talents: [
          { id: "grenade-shrapnel", name: "SHRAPNEL", maxRank: 2, cost: SIDE, col: 0, row: 0,
            describe: (r) => `GRENADES BLEED ${pct(at([0.1, 0.15], r))} MAX HP IN 3 S (UP TO 3 STACKS)`,
            modifiers: (r) => [onlyAttack("hand-grenade", withStatus(bleed(at([0.1, 0.15], r))))] },
          { id: "grenade-hands", name: "QUICK HANDS", maxRank: 2, cost: SIDE, col: 1, row: 0,
            describe: (r) => `THROW GRENADES ${pct(at([0.2, 0.4], r))} FASTER`, modifiers: (r) => [onlyAttack("hand-grenade", faster(at([0.2, 0.4], r)))] },
          damageTalent("d-damage", [0.1, 0.15, 0.2, 0.25, 0.3]),
          { id: "d-radius", name: "BLAST RADIUS", maxRank: 3, cost: GENERAL, col: 3, row: 0,
            describe: (r) => `+${pct(at([0.1, 0.2, 0.3], r))} EXPLOSION RADIUS`, stats: (r) => ({ blastRadius: at([0.1, 0.2, 0.3], r) }) },
          { id: "d-speed", name: "ATTACK SPEED", maxRank: 4, cost: GENERAL, col: 2, row: 1, requires: ["d-damage"],
            describe: (r) => `+${pct(at([0.1, 0.2, 0.3, 0.4], r))} ATTACK SPEED`, modifiers: (r) => [faster(at([0.1, 0.2, 0.3, 0.4], r))] },
          { id: "d-napalm", name: "NAPALM", maxRank: 1, cost: GENERAL, col: 3, row: 1, requires: ["d-radius"],
            describe: () => "EXPLOSIONS SET ON FIRE: BURNS 7.5% HP/S, MAX 30% HP", modifiers: () => [convertTo("fire")], stats: () => ({ burnLevel: 1 }) },
          { id: "d-concussion", name: "CONCUSSION", maxRank: 2, cost: GENERAL, col: 2.5, row: 2, requires: ["d-speed", "d-napalm"],
            describe: (r) => `EXPLOSIONS STUN FOR ${at([0.3, 0.6], r)} S`, modifiers: (r) => [withStatus(stun(at([0.3, 0.6], r)))] },
          damageTrophy("blast", "DEMO TROPHIES", "WITH EXPLOSIVES", 2.5, 3, ["d-concussion"]),
          { id: "launcher-cluster", name: "BIG CLUSTER", maxRank: 2, cost: SIDE, col: 4, row: 0,
            describe: (r) => `CLUSTER SKILL: +${at([2, 4], r)} BOMBLETS`, stats: (r) => ({ clusterExtra: at([2, 4], r) }) },
          // Фитиль динамита по рангам (config.js → DEMO.shortFuse): 1 с → 0.75 / 0.5 / 0.3 с
          { id: "dynamite-fuse", name: "SHORT FUSE", maxRank: DEMO.shortFuse.length, cost: SIDE, col: 5, row: 0,
            describe: (r) => `DYNAMITE FUSE ${at(DEMO.shortFuse, r)} S (BASE ${DEMO.fuse} S)`, stats: (r) => ({ shortFuse: at(DEMO.shortFuse, r) }) },
        ],
      },
      // ---------- ВЫЖИВАНИЕ (всем) ----------
      {
        id: "survival", name: "SURVIVAL", note: "ALWAYS ACTIVE",
        talents: [
          { id: "tough-bones", name: "TOUGH BONES", tier: 1, maxRank: 3,
            describe: (r) => `+${10 * r} MAX HP`, stats: (r) => ({ maxHp: 10 * r }) },
          { id: "regen", name: "REGENERATION", tier: 1, maxRank: 4, // 0.5 / 1 / 1.5 / 2 % макс. HP в секунду
            describe: (r) => `+${0.5 * r}% MAX HP PER SECOND`, stats: (r) => ({ regenPct: 0.005 * r }) },
          { id: "thick-skin", name: "THICK SKIN", tier: 2, maxRank: 2,
            describe: (r) => `-${pct(0.1 * r)} PHYSICAL DMG`, stats: (r) => ({ resist: { physical: 0.1 * r } }) },
          { id: "fortune", name: "FORTUNE", tier: 2, maxRank: 3,
            describe: (r) => `+${20 * r}% LUCK: GEAR DROPS MORE OFTEN AND RARER`, stats: (r) => ({ luck: 0.2 * r }) },
          { id: "light-step", name: "LIGHT STEP", tier: 2, maxRank: 4,
            describe: (r) => `+${pct(0.05 * r)} SPEED`, stats: (r) => ({ speed: 0.05 * r }) },
          { id: "unbreakable", name: "UNBREAKABLE", tier: 3, maxRank: 1,
            describe: () => "+25 MAX HP", stats: () => ({ maxHp: 25 }) },
          // Был у снайперки — теперь общий (id прежний: выученный в старых сохранениях остаётся)
          { id: "sniper-jump", name: "HIGH GROUND", tier: 3, maxRank: 1, cost: 2,
            describe: () => `JUMP HEIGHT X1.5 + DOUBLE JUMP. FALL DMG FROM +${FALL_DAMAGE.highGround.from} BLOCKS HIGHER, X${FALL_DAMAGE.highGround.mult}`, stats: () => ({ jumpMult: 0.5, extraJumps: 1 }) },
          // Последний и самый дорогой: растёт с каждым убийством (считает game-scene.js → onDeath)
          { id: "trophies", name: "TROPHIES", tier: 4, maxRank: 1, cost: 3,
            describe: () => `+${TROPHY.hpPerKill} MAX HP PER KILL (NOW +${Math.floor(TROPHY.hp)} HP)` },
          // Ветеранские (уровни 46–60): дорогие, на поздний мир, где мобы уже очень крепкие
          { id: "veteran", name: "VETERAN", tier: 5, maxRank: 5, cost: 2,
            describe: (r) => `+${15 * r} MAX HP`, stats: (r) => ({ maxHp: 15 * r }) },
          { id: "iron-will", name: "IRON WILL", tier: 5, maxRank: 3, cost: 2,
            describe: (r) => `-${pct(0.04 * r)} PHYSICAL AND MAGICAL DMG`, stats: (r) => ({ resist: { physical: 0.04 * r, magical: 0.04 * r } }) },
          { id: "second-wind", name: "SECOND WIND", tier: 5, maxRank: 2, cost: 2,
            describe: (r) => `+${0.25 * r}% MAX HP PER SECOND`, stats: (r) => ({ regenPct: 0.0025 * r }) },
        ],
      },
    ],
    tierPoints: [0, 2, 4, 6, 12], // ярусы — только у ВЫЖИВАНИЯ (у классов — стрелки requires); 5-й — ветеранский
  };

  const extra = EXTRA();
  for (const [cls, items] of Object.entries(SUBCLASS.weapons)) {
    const tab = TALENT_TREE.tabs.find((t) => t.id === cls);
    for (const item of items) {
      const [attack, name, prefix] = WEAPON_BRANCH[item];
      const moved = prefix ? tab.talents.filter((t) => t.id.startsWith(prefix)) : [];
      tab.talents = tab.talents.filter((t) => !moved.includes(t));
      const talents = [...moved, ...(extra[item] || [])];
      if (talents.length) shiftCols(talents);
      const row = talents.length ? Math.max(...talents.map((t) => t.row)) + 1 : 0;
      const cols = talents.length ? Math.max(...talents.map((t) => t.col)) : 0;
      talents.push({ id: `${item}-mastery`, name: "MASTERY", maxRank: 3, cost: SIDE, col: cols / 2, row,
        describe: (r) => `+${pct(at([0.1, 0.2, 0.3], r))} DMG WITH THE ${name}`, modifiers: (r) => [onlyAttack(attack, damageMultiplier(1 + at([0.1, 0.2, 0.3], r)))] });
      TALENT_TREE.tabs.splice(TALENT_TREE.tabs.indexOf(tab) + 1 + items.indexOf(item), 0, {
        id: weaponTab(item), name, kind: tab.kind, weapon: item, note: "SUBCLASS WEAPON: ITS OWN BRANCH", talents,
      });
    }
    // Оружие, убранное из игры (нет в SUBCLASS.weapons — сейчас копьё): его таланты в классе не показываем
    const offered = new Set(Object.values(SUBCLASS.weapons).flat());
    for (const [item, [, , prefix]] of Object.entries(WEAPON_BRANCH)) {
      if (!offered.has(item) && prefix) tab.talents = tab.talents.filter((t) => !t.id.startsWith(prefix));
    }
    // В классе остались общие ветки (и базовое оружие) — сдвигаем к левому краю, подписи — следом
    const min = shiftCols(tab.talents);
    tab.sections = tab.sections.filter((sec) => tab.talents.some((t) => Math.abs(t.col - (sec.col - min)) <= 0.5)).map((sec) => ({ ...sec, col: sec.col - min }));
  }

  // ---------- МАУНТ (видна, когда маунт куплен: config.js → MOUNT) ----------
  // Правила читает scene/mount.js: mountGuard — доля макс. HP героя, урон меньше которой не сбрасывает с седла
  TALENT_TREE.tabs.splice(TALENT_TREE.tabs.length - 1, 0, {
    id: "mount", name: "MOUNT", note: "BOUGHT IN THE SHOP. Z - CALL / DISMOUNT",
    talents: [
      { id: "mount-saddle", name: "STEADY SADDLE", tier: 1, maxRank: 3,
        describe: (r) => `HITS UNDER ${at([4, 8, 12], r)}% OF YOUR MAX HP DON'T THROW YOU OFF`, stats: (r) => ({ mountGuard: at([0.04, 0.08, 0.12], r) }) },
      { id: "mount-swift", name: "SWIFT HOOVES", tier: 1, maxRank: 2,
        describe: (r) => `+${pct(at([0.1, 0.2], r))} MOUNTED SPEED`, stats: (r) => ({ mountSpeed: at([0.1, 0.2], r) }) },
      { id: "mount-call", name: "QUICK CALL", tier: 2, maxRank: 2,
        describe: (r) => `MOUNT COOLDOWN -${at([2, 4], r)} S`, stats: (r) => ({ mountCooldown: at([2, 4], r) }) },
    ],
  });
  // поправки режима — поверх общих; убранные — убрать (и из требований других талантов), пустые вкладки — тоже
  const gone = new Set(MODE_REMOVED[mode] || []);
  for (const tab of TALENT_TREE.tabs) {
    tab.talents = tab.talents.filter((t) => !gone.has(t.id))
      .map((t) => (MODE_TALENTS[mode]?.[t.id] ? { ...t, ...MODE_TALENTS[mode][t.id] } : t))
      .map((t) => (t.requires?.some((r) => gone.has(r)) ? { ...t, requires: t.requires.filter((r) => !gone.has(r)) } : t));
    for (const t of tab.talents) if (t.requires && !t.requires.length) delete t.requires;
  }
  TALENT_TREE.tabs = TALENT_TREE.tabs.filter((tab) => tab.talents.length);
  TALENT_TREE.mode = mode;
  return TALENT_TREE;
}

export const TALENT_TREES = Object.fromEntries(TALENT_MODES.map((m) => [m, buildTree(m)]));
export const TALENT_TREE = TALENT_TREES.classic; // обычная игра (и всё, что не знает про режим)
// Дерево режима игры: дуэль — своё, остальное — обычное
export const talentTree = (mode) => TALENT_TREES[mode] || TALENT_TREES.classic;
