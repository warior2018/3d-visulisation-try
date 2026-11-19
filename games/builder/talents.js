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

import { SUBCLASS } from "./config.js";
// Модификаторы движка — для новых талантов (пока не используются)
import {
  damageMultiplier, cooldownReduction, lifesteal, guaranteedCrit, withStatus, convertTo, bleed, stun, Slow,
  firstHit, vsStunned, headshotBonus, rampPerHit, onlyAttack, reachBonus,
} from "../../engine/index.js";

// ---------- Помощники для описаний и цен (для новых талантов) ----------
const pct = (x) => `${Math.round(x * 1000) / 10}%`; //   0.15 → "15%"
const at = (list, r) => list[Math.min(r, list.length) - 1]; // значение для ранга r из списка
const GENERAL = (r) => (r >= 3 ? 2 : 1); //                   цена: ранги 1–2 по 1 очку, с 3-го — по 2
const SIDE = 2; //                                            цена боковых веток (оружия): 2 очка за ранг
const faster = (x) => cooldownReduction(1 - 1 / (1 + x)); //  +x к скорости атаки (перезарядка короче)

// Трофеи: сколько уже набрано за убитых. Игра обновляет и сохраняет, здесь — чтобы описания показывали цифры.
// hpPerKill — +макс. HP за убийство (талант "trophies"); perKill — +% урона своего вида за убийство этим видом
export const TROPHY = { hpPerKill: 1, hp: 0, perKill: 0.3, pct: { melee: 0, ranged: 0, blast: 0 } };
// Какой талант копит трофеи урона для какого вида атак
export const TROPHY_TALENTS = { melee: "fighter-trophies", ranged: "marksman-trophies", blast: "demo-trophies" };
export const trophyPct = (kind) => +TROPHY.pct[kind].toFixed(1);

// ---------- ПОДКЛАСС: вкладки оружия ----------
export const weaponTab = (item) => `w-${item}`;
const WEAPON_NAMES = {
  "war-hammer": "WAR HAMMER", katana: "KATANA", auto: "ASSAULT RIFLE", shotgun: "SHOTGUN", rifle: "SNIPER",
  crossbow: "CROSSBOW", bow: "BOW", launcher: "LAUNCHER", dynamite: "DYNAMITE",
};

// ---------- Деревья по режимам ----------
// Обычная игра — "classic", дуэль — "duel": те же таланты, MODE_TALENTS — поправки полей для режима
// ({ "id": { maxRank, describe, modifiers, stats } }), MODE_REMOVED — каких талантов в режиме нет
export const TALENT_MODES = ["classic", "duel"];
export const MODE_TALENTS = { classic: {}, duel: {} };
export const MODE_REMOVED = { classic: [], duel: [] };

function buildTree(mode) {
  const TALENT_TREE = {
    tabs: [
      { id: "melee", name: "FIGHTER", kind: "melee", note: "BASE: MACHETE. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB", sections: [], talents: [] },
      { id: "ranged", name: "RANGER", kind: "ranged", note: "BASE: PISTOL. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB", sections: [], talents: [] },
      { id: "demo", name: "DEMOLITIONIST", kind: "blast", note: "BASE: GRENADES. LEVEL 10 - SECOND WEAPON WITH ITS OWN TAB", sections: [], talents: [] },
      { id: "survival", name: "SURVIVAL", note: "ALWAYS ACTIVE", talents: [] },
    ],
    tierPoints: [0, 2, 4, 6, 12], // очки во вкладке, нужные для яруса (для вкладок с tier)
  };
  // вкладки покупного оружия — после вкладки своего класса
  for (const [cls, items] of Object.entries(SUBCLASS.weapons)) {
    const tab = TALENT_TREE.tabs.find((t) => t.id === cls);
    if (!tab) continue;
    items.forEach((item, i) => {
      TALENT_TREE.tabs.splice(TALENT_TREE.tabs.indexOf(tab) + 1 + i, 0, {
        id: weaponTab(item), name: WEAPON_NAMES[item] || item.toUpperCase(), kind: tab.kind, weapon: item, note: "SUBCLASS WEAPON: ITS OWN BRANCH", talents: [],
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
