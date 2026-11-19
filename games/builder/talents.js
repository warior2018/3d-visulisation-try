// ============================================================
//  Дерево талантов «Стройки». Правила (очки, ранги, требования) — в движке (engine/progression/talents.js),
//  здесь — вкладки и сами таланты.
//
//  СЕЙЧАС ТАЛАНТОВ НЕТ: ветки переделываются (2026-11-19). Остались вкладки и система — новые таланты
//  дописываются в talents: [] нужной вкладки.
//
//  Вкладки: классы (видна только вкладка своего класса) + вкладки покупного оружия ("w-<предмет>", видна вкладка
//  оружия, выбранного на SUBCLASS.level уровне) + МАУНТ (когда куплен) + ВЫЖИВАНИЕ (всем).
//
//  Как писать талант:
//    { id, name, maxRank, cost (число или (ранг) => цена), describe: (r) => "...",
//      modifiers: (r) => [модификаторы урона движка],   — урон, крит, статусы...
//      stats: (r) => ({ ... }) }                         — правила игры, их читает игра (game-scene.js → applyTalents)
//    Расположение — дерево: col / row (узел на экране) и requires: ["id", ...] (стрелки: нужен хотя бы 1 ранг
//    каждого), подписи веток — sections вкладки. Или ярусы: tier (1, 2, ...) + tierPoints у дерева (как ВЫЖИВАНИЕ).
//    Таланты вкладки с kind действуют только на атаки этого вида (БОЕЦ — ближний бой и т. д.).
//  Трофеи (TROPHY): копятся за убийства, если выучен талант с id из TROPHY_TALENTS (или "trophies" — здоровье).
// ============================================================

import { SUBCLASS, HAMMER, FALL_DAMAGE, DEMO, PARRY, KILL_BUFF, EVASION } from "./config.js";
// Модификаторы движка — для новых талантов (пока не используются)
import {
  damageMultiplier, cooldownReduction, lifesteal, guaranteedCrit, withStatus, convertTo, bleed, stun, Slow,
  vsStunned, headshotBonus, rampPerHit, onlyAttack, reachBonus, critical, Modifier, DamageOverTime,
} from "../../engine/index.js";

// ---------- Помощники для описаний и цен (для новых талантов) ----------
const pct = (x) => `${Math.round(x * 1000) / 10}%`; //   0.15 → "15%"
const at = (list, r) => list[Math.min(r, list.length) - 1]; // значение для ранга r из списка
const GENERAL = (r) => (r >= 3 ? 2 : 1); //                   цена: ранги 1–2 по 1 очку, с 3-го — по 2
const SIDE = 2; //                                            цена боковых веток (оружия): 2 очка за ранг
const faster = (x) => cooldownReduction(1 - 1 / (1 + x)); //  +x к скорости атаки (перезарядка короче)

// Трофеи: сколько уже набрано за убитых. Игра обновляет и сохраняет, здесь — чтобы описания показывали цифры.
// hpPerKill — +макс. HP за убийство (талант "trophies"); perKill — +% урона своего вида за убийство этим видом
export const TROPHY = { hpPerKill: 0.5, hp: 0, perKill: 0.3, pct: { melee: 0, ranged: 0, blast: 0 } };
// Какой талант копит трофеи урона для какого вида атак
export const TROPHY_TALENTS = { melee: "fighter-trophies", ranged: "marksman-trophies", blast: "demo-trophies" };
export const trophyPct = (kind) => +TROPHY.pct[kind].toFixed(1);

// ---------- ПОДКЛАСС: вкладки оружия ----------
export const weaponTab = (item) => `w-${item}`;
const WEAPON_NAMES = {
  "war-hammer": "WAR HAMMER", katana: "KATANA", auto: "ASSAULT RIFLE", shotgun: "SHOTGUN", rifle: "SNIPER",
  crossbow: "CROSSBOW", bow: "BOW", launcher: "LAUNCHER", dynamite: "DYNAMITE",
};

// Таланты покупного оружия (прежние, до переделки веток): у каждого — свои, внизу — MASTERY (+урон этим оружием).
// attack — id атаки оружия (для MASTERY). Функция: у каждого дерева (режима) — свои объекты
const WEAPON_ATTACK = { "war-hammer": "war-hammer", katana: "katana", auto: "auto", shotgun: "shotgun", rifle: "rifle", crossbow: "crossbow", bow: "bow", launcher: "launcher", dynamite: "dynamite" };
const WEAPON_TALENTS = () => ({
  "war-hammer": [
    { id: "hammer-stun", name: "STUN", maxRank: 3, cost: SIDE, col: 0, row: 0,
      describe: (r) => `HAMMER STUNS ${at([0.5, 0.75, 1], r)} S, +${pct(at([0.05, 0.1, 0.15], r))} DMG VS STUNNED`,
      modifiers: (r) => [onlyAttack("war-hammer", withStatus(stun(at([0.5, 0.75, 1], r)))), onlyAttack("war-hammer", vsStunned(1 + at([0.05, 0.1, 0.15], r)))] },
    { id: "hammer-slam", name: "SPLASH SLAM", maxRank: 3, cost: SIDE, col: 1, row: 0,
      describe: (r) => `HAMMER SLAM RADIUS ${at([1.5, 2, 2.5], r)} BLOCKS (BASE 1)`, stats: (r) => ({ hammerSlam: at([1.5, 2, 2.5], r) }) },
    { id: "hammer-leap", name: "JUMP SLAM", maxRank: 1, cost: SIDE, col: 0.5, row: 1, requires: ["hammer-slam"],
      describe: () => `WITH THE HAMMER: JUMP ${Math.round(HAMMER.leap * 100)}% HIGHER, SLAM X${HAMMER.perStep} DMG MORE PER ${HAMMER.step} BLOCK FALLEN (UP TO X${HAMMER.maxMult}). FALL DMG FROM +${FALL_DAMAGE.jumpSlam.from} BLOCKS HIGHER, X${FALL_DAMAGE.jumpSlam.mult}`, stats: () => ({ hammerLeap: true }) },
  ],
  katana: [
    { id: "katana-iai", name: "IAI MULTIPLIER", maxRank: 3, cost: SIDE, col: 0, row: 0,
      describe: (r) => `IAI STRIKE X${at([2, 2.5, 3], r)} DMG`, stats: (r) => ({ iaiMult: at([2, 2.5, 3], r) }) },
    { id: "katana-speed", name: "IAI SPEED", maxRank: 3, cost: SIDE, col: 1, row: 0,
      describe: (r) => `+${pct(at([0.1, 0.15, 0.2], r))} SPEED WHILE IAI IS CHARGED`, stats: (r) => ({ iaiSpeed: at([0.1, 0.15, 0.2], r) }) },
    { id: "katana-reset", name: "IAI RESET", maxRank: 1, cost: SIDE, col: 0.5, row: 1, requires: ["katana-iai", "katana-speed"],
      describe: () => "A KILL BY THE IAI DASH RESETS ITS COOLDOWN", stats: () => ({ iaiReset: true }) }, // abilities.js → cutAlong
  ],
  auto: [
    { id: "rifle-grenade", name: "GRENADE", maxRank: 1, cost: SIDE, col: 0, row: 0,
      describe: () => "EVERY 15 RIFLE SHOTS - A SMALL GRENADE: 200% RIFLE DMG, 2.5 BLOCKS RADIUS", stats: () => ({ rifleGrenade: 1 }) },
    { id: "rifle-refund", name: "AMMO REFUND", maxRank: 1, cost: SIDE, col: 1, row: 0,
      describe: () => "RIFLE KILLS PUT 15 ROUNDS BACK INTO ITS MAGAZINE", stats: () => ({ rifleRefund: 15 }) },
  ],
  shotgun: [
    { id: "shotgun-ramp", name: "PELLET CHAIN", maxRank: 1, cost: SIDE, col: 0, row: 0,
      describe: () => "EACH PELLET IN A TARGET: NEXT ONE +2.5% DMG", modifiers: () => [onlyAttack("shotgun", rampPerHit(0.025))] },
  ],
  rifle: [
    { id: "sniper-head", name: "HEADSHOT", maxRank: 3, cost: SIDE, col: 0, row: 0,
      describe: (r) => `SNIPER HEADSHOTS X${at([1.5, 2.5, 3.5], r)} MORE`, modifiers: (r) => [onlyAttack("rifle", headshotBonus(at([1.5, 2.5, 3.5], r)))] },
  ],
  crossbow: [
    { id: "crossbow-head", name: "HEADSHOT", maxRank: 2, cost: SIDE, col: 0, row: 0,
      describe: (r) => `CROSSBOW HEADSHOTS X${at([1.5, 2], r)} MORE`, modifiers: (r) => [onlyAttack("crossbow", headshotBonus(at([1.5, 2], r)))] },
  ],
  // Лук: правила читает abilities.js → BowAbility (stats)
  bow: [
    { id: "bow-pierce", name: "PIERCE", maxRank: 2, cost: SIDE, col: 0, row: 0, describe: (r) => `ARROWS GO THROUGH +${r} ENEMIES`, stats: (r) => ({ bowPierce: r }) },
    { id: "bow-power", name: "DRAW POWER", maxRank: 3, cost: SIDE, col: 1, row: 0,
      describe: (r) => `FULL DRAW +${pct(at([0.15, 0.3, 0.45], r))} DMG`, stats: (r) => ({ bowPower: at([0.15, 0.3, 0.45], r) }) },
    { id: "bow-blast", name: "EXPLOSIVE ARROW", maxRank: 1, cost: SIDE, col: 2, row: 0,
      describe: () => "ARROWS EXPLODE WHERE THEY HIT: 30 DMG IN 1.5 BLOCKS", stats: () => ({ bowBlast: 1 }) },
    { id: "bow-quick", name: "QUICK DRAW", maxRank: 2, cost: SIDE, col: 1, row: 1, describe: (r) => `FULL DRAW IN ${at([2.5, 2], r)} S (BASE 3 S)`, stats: (r) => ({ bowDraw: at([2.5, 2], r) }) },
  ],
  launcher: [
    { id: "launcher-cluster", name: "BIG CLUSTER", maxRank: 2, cost: SIDE, col: 0, row: 0,
      describe: (r) => `CLUSTER SKILL: +${at([2, 4], r)} BOMBLETS`, stats: (r) => ({ clusterExtra: at([2, 4], r) }) },
  ],
  // Фитиль динамита по рангам (config.js → DEMO.shortFuse)
  dynamite: [
    { id: "dynamite-fuse", name: "SHORT FUSE", maxRank: DEMO.shortFuse.length, cost: SIDE, col: 0, row: 0,
      describe: (r) => `DYNAMITE FUSE ${at(DEMO.shortFuse, r)} S (BASE ${DEMO.fuse} S)`, stats: (r) => ({ shortFuse: at(DEMO.shortFuse, r) }) },
  ],
});
// + MASTERY внизу ветки оружия: +10/20/30 % урона им
const withMastery = (item, list) => {
  const row = list.length ? Math.max(...list.map((t) => t.row)) + 1 : 0, cols = list.length ? Math.max(...list.map((t) => t.col)) : 0;
  const name = WEAPON_NAMES[item] || item.toUpperCase(), attack = WEAPON_ATTACK[item] || item;
  return [...list, { id: `${item}-mastery`, name: "MASTERY", maxRank: 3, cost: SIDE, col: cols / 2, row,
    describe: (r) => `+${pct(at([0.1, 0.2, 0.3], r))} DMG WITH THE ${name}`, modifiers: (r) => [onlyAttack(attack, damageMultiplier(1 + at([0.1, 0.2, 0.3], r)))] }];
};

// ---------- Помощники новых веток ----------
// Цепочка талантов в столбце col: сверху вниз; каждый следующий открывается, когда в предыдущем вложена
// половина рангов (requiresRank — движок: engine/progression/talents.js)
const chain = (col, list) => list.map((t, i) => ({ ...t, col, row: i, ...(i ? { requires: [list[i - 1].id], requiresRank: Math.ceil(list[i - 1].maxRank / 2) } : {}) }));
const DMG = (id) => ({ id, name: "DAMAGE", maxRank: 4, cost: 1, describe: (r) => `+${10 * r}% DMG`, modifiers: (r) => [damageMultiplier(1 + 0.1 * r)] });
const TROPHIES = (kind, name, how) => ({ id: TROPHY_TALENTS[kind], name, maxRank: 1, cost: 4,
  describe: () => `+${TROPHY.perKill}% DMG PER KILL ${how} (NOW +${trophyPct(kind)}%)` });
// Яд VENOM: каждый удар — отравление на 5 с: pct урона удара в секунду, стопками до 3
const venom = (pct) => new Modifier({ id: "venom", name: "VENOM", priority: 65, apply: (d, ctx) => {
  const per = d.amount * pct * 0.5; // за тик (раз в 0.5 с)
  if (per > 0) d.statuses.push(new DamageOverTime({ id: "venom", name: "VENOM", duration: 5, interval: 0.5, damagePerTick: per, element: "poison", stackable: true, source: ctx.owner, icon: "VNM", color: [120, 200, 60] }));
} });

// ---------- Деревья по режимам ----------
// Обычная игра — "classic", дуэль — "duel": те же таланты, MODE_TALENTS — поправки полей для режима
// ({ "id": { maxRank, describe, modifiers, stats } }), MODE_REMOVED — каких талантов в режиме нет
export const TALENT_MODES = ["classic", "duel"];
export const MODE_TALENTS = { classic: {}, duel: {} };
// дуэль: трофеи (копятся за мобов) и удача на добычу — не нужны
export const MODE_REMOVED = { classic: [], duel: ["trophies", "fighter-trophies", "marksman-trophies", "demo-trophies", "v-fortune"] };

function buildTree(mode) {
  const TALENT_TREE = {
    tabs: [
      // ---------- БЛИЖНИЙ БОЙ ----------
      { id: "melee", name: "MELEE", kind: "melee", note: "BASE: MACHETE. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB", sections: [], talents: [
        ...chain(0, [
          DMG("m-damage"),
          { id: "m-crit", name: "CRIT", maxRank: 4, cost: 1, describe: (r) => `CRIT X${at([1.5, 2, 2.5, 3], r)} ONCE EVERY ${at([6, 5, 4, 3], r)} S`,
            modifiers: (r) => [guaranteedCrit(at([1.5, 2, 2.5, 3], r), at([6, 5, 4, 3], r), "melee-crit")] },
          TROPHIES("melee", "TROPHIES", "IN MELEE"),
        ]),
        ...chain(1, [
          { id: "m-speed", name: "ATTACK SPEED", maxRank: 4, cost: 1, describe: (r) => `+${pct(0.0725 * r)} ATTACK SPEED`, modifiers: (r) => [faster(0.0725 * r)] },
        ]),
        ...chain(2, [
          // REACH: дальность ударов и радиус удара молотом / по площади (stats.reach — abilities.js)
          { id: "m-reach", name: "REACH", maxRank: 4, cost: 1, describe: (r) => `+${pct(0.125 * r)} MELEE REACH AND SLAM RADIUS`, modifiers: (r) => [reachBonus(0.125 * r)], stats: (r) => ({ reach: 0.125 * r }) },
          // PARRY: блок (ПКМ) есть всегда — талант делает его сильнее и дольше (scene/input.js → tryBlock)
          { id: "m-parry", name: "PARRY", maxRank: 4, cost: 1, describe: (r) => `BLOCK ABSORBS UP TO ${Math.round((PARRY.absorb + PARRY.absorbPer * r) * 100)}% OF WEAPON DMG, LASTS ${+(PARRY.window + PARRY.windowPer * r).toFixed(2)} S`,
            stats: (r) => ({ parry: r }) },
          // SLOW AURA: враги рядом медленнее ходят и бьют (scene/buffs.js → slowAura)
          { id: "m-aura", name: "SLOW AURA", maxRank: 3, cost: 2, describe: (r) => `ENEMIES WITHIN ${at([4, 6, 8], r)} BLOCKS ${10 * r}% SLOWER (MOVE AND ATTACKS)`,
            stats: (r) => ({ slowAura: { radius: at([4, 6, 8], r), k: 0.1 * r } }) },
        ]),
        ...chain(3, [
          { id: "m-venom", name: "VENOM", maxRank: 4, cost: 1, describe: (r) => `HITS POISON: ${pct(at([0.1, 0.1725, 0.245, 0.3175], r))} OF THE HIT PER S FOR 5 S (UP TO 3 STACKS)`,
            modifiers: (r) => [venom(at([0.1, 0.1725, 0.245, 0.3175], r))] },
        ]),
        // кровотечение — отдельно от яда (действует по-другому и на разных врагов по-разному)
        ...chain(4, [
          { id: "m-bleed", name: "BLEED", maxRank: 3, cost: GENERAL, describe: (r) => `HITS BLEED ${pct(at([0.08, 0.12, 0.16], r))} MAX HP IN 3 S (UP TO 3 STACKS)`,
            modifiers: (r) => [withStatus(bleed(at([0.08, 0.12, 0.16], r)))] },
        ]),
      ] },
      // ---------- ДАЛЬНИЙ БОЙ ----------
      { id: "ranged", name: "RANGED", kind: "ranged", note: "BASE: PISTOL. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB", sections: [], talents: [
        ...chain(0, [
          DMG("r-damage"),
          // KILL BUFF: убийство — стопка на 35 с (каждая своя): +2.5 % урона и скорости атаки (scene/progression.js)
          { id: "r-killbuff", name: "KILL BUFF", maxRank: 4, cost: 2, describe: (r) => `KILLS GIVE A STACK FOR ${KILL_BUFF.time} S: +${KILL_BUFF.per * 100}% DMG AND ATTACK SPEED, UP TO ${at(KILL_BUFF.max, r)} STACKS`,
            stats: (r) => ({ killBuff: at(KILL_BUFF.max, r) }) },
          TROPHIES("ranged", "TROPHIES", "AT RANGE"),
        ]),
        ...chain(1, [
          { id: "r-speed", name: "ATTACK SPEED", maxRank: 4, cost: 1, describe: (r) => `+${10 * r}% ATTACK SPEED`, modifiers: (r) => [faster(0.1 * r)] },
          { id: "r-crit", name: "CRIT", maxRank: 4, cost: 1, describe: (r) => `${pct(0.0725 * r)} CHANCE TO CRIT X${1 + 0.25 * r}`, modifiers: (r) => [critical(0.0725 * r, 1 + 0.25 * r)] },
        ]),
        ...chain(2, [
          { id: "r-ammo", name: "AMMO", maxRank: 4, cost: 1, describe: (r) => `+${pct(0.125 * r)} MAGAZINE, ${5 * r}% FASTER RELOAD`, stats: (r) => ({ magBonus: 0.125 * r, reloadSpeed: 0.05 * r }) },
          { id: "r-killammo", name: "AMMO ON KILL", maxRank: 4, cost: 1, describe: (r) => `A KILL REFILLS ${10 * r}% OF THE MAGAZINE`, stats: (r) => ({ killRefill: 0.1 * r }) },
        ]),
        ...chain(3, [
          { id: "r-fire", name: "FIRE", maxRank: 2, cost: 1, describe: (r) => (r === 1 ? "FIRE: BURNS 7.5% HP/S, MAX 30% HP" : "FIRE: BURNS 15% HP/S, MAX 30% HP"),
            modifiers: () => [convertTo("fire")], stats: (r) => ({ burnLevel: r }) },
        ]),
      ] },
      // ---------- ПОДРЫВНИК (ветки — позже) ----------
      { id: "demo", name: "DEMOLITIONIST", kind: "blast", note: "BASE: GRENADES. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB", sections: [], talents: [] },
      // ---------- ЖИВУЧЕСТЬ (всем) ----------
      { id: "survival", name: "VITALITY", note: "ALWAYS ACTIVE", talents: [
        ...chain(0, [
          { id: "v-health", name: "HEALTH", maxRank: 4, cost: 1, describe: (r) => `+${10 * r} MAX HP`, stats: (r) => ({ maxHp: 10 * r }) },
          { id: "v-regen", name: "REGEN", maxRank: 4, cost: 1, describe: (r) => `+${1.25 * r}% MAX HP PER SECOND`, stats: (r) => ({ regenPct: 0.0125 * r }) },
          { id: "trophies", name: "TROPHIES", maxRank: 1, cost: 4, describe: () => `+${TROPHY.hpPerKill} MAX HP PER KILL (NOW +${Math.floor(TROPHY.hp)} HP)` },
        ]),
        // LIFESTEAL — ответвление от REGEN (половина его рангов)
        { id: "v-lifesteal", name: "LIFESTEAL", maxRank: 3, cost: 2, col: 1, row: 2, requires: ["v-regen"], requiresRank: 2,
          describe: (r) => `${5 * r}% OF DMG DEALT AS HEALTH`, modifiers: (r) => [lifesteal(0.05 * r)] },
        ...chain(2, [
          { id: "v-speed", name: "SPEED", maxRank: 4, cost: 1, describe: (r) => `+${pct(0.075 * r)} SPEED`, stats: (r) => ({ speed: 0.075 * r }) },
          { id: "v-jump", name: "JUMP", maxRank: 2, cost: 1, describe: (r) => `JUMP +${12.5 * r}% HIGHER (FALL DMG STARTS HIGHER TOO)`, stats: (r) => ({ jumpMult: 0.125 * r }) },
          { id: "v-double", name: "DOUBLE JUMP", maxRank: 1, cost: 3, describe: () => "ONE MORE JUMP IN THE AIR (80% HEIGHT)", stats: () => ({ extraJumps: 1 }) },
        ]),
        ...chain(3, [
          { id: "v-fortune", name: "FORTUNE", maxRank: 4, cost: 1, describe: (r) => `+${12.5 * r}% LUCK: RARE GEAR FROM MOBS AND BOSSES MORE OFTEN`, stats: (r) => ({ luck: 0.125 * r }) },
          { id: "v-evasion", name: "EVASION", maxRank: 4, cost: 2, describe: (r) => `${10 * r}% CHANCE TO DODGE A HIT: UP TO ${EVASION.cap * 100}% MAX HP OF IT IS IGNORED`, stats: (r) => ({ evasion: 0.1 * r }) },
        ]),
      ] },
    ],
    tierPoints: [0, 2, 4, 6, 12], // очки во вкладке, нужные для яруса (для вкладок с tier)
  };
  // вкладки покупного оружия — после вкладки своего класса (таланты — прежние, WEAPON_TALENTS + MASTERY)
  const weaponTalents = WEAPON_TALENTS();
  for (const [cls, items] of Object.entries(SUBCLASS.weapons)) {
    const tab = TALENT_TREE.tabs.find((t) => t.id === cls);
    if (!tab) continue;
    items.forEach((item, i) => {
      TALENT_TREE.tabs.splice(TALENT_TREE.tabs.indexOf(tab) + 1 + i, 0, {
        id: weaponTab(item), name: WEAPON_NAMES[item] || item.toUpperCase(), kind: tab.kind, weapon: item, note: "SUBCLASS WEAPON: ITS OWN BRANCH", talents: withMastery(item, weaponTalents[item] || []),
      });
    });
  }
  // МАУНТ (видна, когда маунт куплен) — перед ВЫЖИВАНИЕМ
  TALENT_TREE.tabs.splice(TALENT_TREE.tabs.length - 1, 0, { id: "mount", name: "MOUNT", note: "BOUGHT IN THE SHOP. Z - CALL / DISMOUNT", talents: [] });
  // поправки режима — поверх общих; убранные — убрать (и из требований других талантов)
  const gone = new Set(MODE_REMOVED[mode] || []);
  for (const tab of TALENT_TREE.tabs) {
    tab.talents = tab.talents.filter((t) => !gone.has(t.id))
      .map((t) => (MODE_TALENTS[mode]?.[t.id] ? { ...t, ...MODE_TALENTS[mode][t.id] } : t))
      .map((t) => (t.requires?.some((r) => gone.has(r)) ? { ...t, requires: t.requires.filter((r) => !gone.has(r)) } : t));
    for (const t of tab.talents) if (t.requires && !t.requires.length) delete t.requires;
  }
  // пустые вкладки остаются (таланты переделываются)
  TALENT_TREE.mode = mode;
  return TALENT_TREE;
}

export const TALENT_TREES = Object.fromEntries(TALENT_MODES.map((m) => [m, buildTree(m)]));
export const TALENT_TREE = TALENT_TREES.classic; // обычная игра (и всё, что не знает про режим)
// Дерево режима игры: дуэль — своё, остальное — обычное
export const talentTree = (mode) => TALENT_TREES[mode] || TALENT_TREES.classic;
