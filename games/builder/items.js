// ============================================================
//  Какие предметы бывают в игре. Инвентарь (engine/world/inventory.js) хранит только id
//  предмета ("bone") и количество, а всё остальное о предмете — здесь.
//  Новый предмет = новая строчка.
// ============================================================

import {
  PistolAbility, RifleAbility, AutoAbility, ShotgunAbility, MacheteAbility, WarHammerAbility, KatanaAbility, SpearAbility,
  FireStaffAbility, FrostWandAbility, MagmaStoneAbility, drawHammer, drawBearTrap, drawSpikes, drawMushroom, drawMedkit,
} from "./abilities.js";
import { PALETTE } from "./config.js";

// Значок оружия — тот же, что у способности в панели
const iconOf = (Ability) => {
  const a = new Ability();
  return (ui, x, y, s) => a.drawIcon(ui, x, y, s);
};

// slot — куда в хотбаре (3 ячейки) можно положить: "weapon" — левая и правая (оружие, ловушки),
//   "utility" — средняя (стройка, аптечка, грибы); без slot — только сумка (кости, монеты, блоки, патроны).
//   Что лежит в хотбаре — то и в панели способностей (abilities.js → ABILITY_FOR_ITEM)
// weapon: true — оружие одно в ячейке (stack 1)
// class — к какому классу относится (раздел магазина): melee, ranged, magic, trap, beast
// model — своя модель на земле (assets/<model>.glb); без неё — ящичек с крышкой цвета предмета
// Обойма: магазин с патронами сверху; tall — высота магазина (длинная у автомата). Стопка до 10
function clipItem(name, color, tall) {
  return {
    name, class: "ranged", color, maxStack: 10,
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.36, y + s * (0.8 - tall), s * 0.28, s * tall, color);
      ui.rect(x + s * 0.4, y + s * (0.8 - tall) - s * 0.1, s * 0.2, s * 0.12, [214, 176, 80]); // патрон сверху
      ui.rect(x + s * 0.36, y + s * 0.74, s * 0.28, s * 0.06, [60, 60, 66]); //                    донце
    },
  };
}

export const ITEMS = {
  bone: { name: "BONE", color: [225, 220, 200], maxStack: 32 },
  // Блок: из них строим молотком (1 предмет — 1 блок в мире). Покупается в магазине, ломаешь блок — возвращается
  block: {
    name: "BLOCK", color: [240, 240, 240], maxStack: 64,
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6, [150, 150, 156]);
      ui.rect(x + s * 0.24, y + s * 0.24, s * 0.52, s * 0.52, [240, 240, 240]);
    },
  },
  // Обоймы (CLIPS в config.js): у каждого ствола своя, только из магазина. Неполная — с данными { rounds }
  "pistol-clip": clipItem("PISTOL CLIP", [150, 150, 158], 0.32),
  "auto-clip": clipItem("RIFLE CLIP", [120, 110, 90], 0.5),
  "shotgun-clip": clipItem("SHELLS", [190, 60, 50], 0.36),
  "rifle-clip": clipItem("SNIPER CLIP", [90, 100, 80], 0.42),
  // Гриб (ПРИЗЫВАТЕЛЬ): в средней ячейке — им кормят кабанов (F, выбирать не надо); выбрал ячейку и ЛКМ —
  // из ВСЕХ грибов растёт турель. Растёт на земле (зелёный кубик), только у этого класса
  mushroom: { name: "MUSHROOM", slot: "utility", class: "beast", color: [90, 200, 90], maxStack: 32, drawIcon: drawMushroom },
  // Аптечка: средняя ячейка, выбрать и ЛКМ — лечит
  medkit: { name: "MEDKIT", slot: "utility", color: [220, 60, 60], maxStack: 5, drawIcon: drawMedkit },
  // Сфера души: падает с врагов у мага; подобрал — сразу мана (в сумку не идёт)
  soul: {
    name: "SOUL", color: [120, 200, 255], maxStack: 1, instant: true,
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4, [120, 200, 255]);
      ui.rect(x + s * 0.4, y + s * 0.4, s * 0.2, s * 0.2, [230, 250, 255]);
    },
  },
  // Шкура тролля: трофей босса логова; подобрал — сразу броня навсегда (TROLL_HIDE), в сумку не идёт
  "troll-hide": {
    name: "TROLL HIDE", color: [110, 120, 90], maxStack: 1, instant: true, model: "hide",
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.18, y + s * 0.28, s * 0.64, s * 0.44, [110, 120, 90]);
      ui.rect(x + s * 0.1, y + s * 0.2, s * 0.16, s * 0.16, [110, 120, 90]); // лапы шкуры по углам
      ui.rect(x + s * 0.74, y + s * 0.2, s * 0.16, s * 0.16, [110, 120, 90]);
      ui.rect(x + s * 0.1, y + s * 0.64, s * 0.16, s * 0.16, [110, 120, 90]);
      ui.rect(x + s * 0.74, y + s * 0.64, s * 0.16, s * 0.16, [110, 120, 90]);
      ui.rect(x + s * 0.3, y + s * 0.4, s * 0.4, s * 0.2, [85, 95, 70]);
    },
  },
  // Саженец турели (ПРИЗЫВАТЕЛЬ): E — посадить; растёт в турель (TURRET в config.js). Магазин или с врагов
  "turret-sapling": {
    name: "TURRET SAPLING", class: "beast", color: [120, 190, 90], maxStack: 10,
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.46, y + s * 0.45, s * 0.08, s * 0.35, [110, 80, 50]); //  стебелёк
      ui.rect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.18, [90, 200, 90]); //   шляпка-росток
      ui.rect(x + s * 0.22, y + s * 0.78, s * 0.56, s * 0.08, [120, 90, 60]); // земля
    },
  },
  // Корона лича: трофей второго босса; подобрал — сразу +урон навсегда (BONE_CROWN), в сумку не идёт
  "bone-crown": {
    name: "BONE CROWN", color: [200, 170, 255], maxStack: 1, instant: true,
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.2, y + s * 0.5, s * 0.6, s * 0.24, [200, 170, 255]);
      for (const k of [0.2, 0.43, 0.66]) ui.rect(x + s * k, y + s * 0.28, s * 0.14, s * 0.24, [200, 170, 255]); // зубцы
      ui.rect(x + s * 0.45, y + s * 0.56, s * 0.1, s * 0.1, [140, 60, 220]);
    },
  },
  skull: { name: "SKULL", color: [190, 185, 165], maxStack: 8 },
  coin: { name: "COIN", color: [235, 190, 60], maxStack: 99 },
  // Оружие по классам: базовое (стартовое) и покупное
  machete: { name: "MACHETE", slot: "weapon", weapon: true, class: "melee", maxStack: 1, drawIcon: iconOf(MacheteAbility) },
  "war-hammer": { name: "WAR HAMMER", slot: "weapon", weapon: true, class: "melee", maxStack: 1, color: [120, 124, 134], drawIcon: iconOf(WarHammerAbility) },
  katana: { name: "KATANA", slot: "weapon", weapon: true, class: "melee", maxStack: 1, color: [200, 205, 215], drawIcon: iconOf(KatanaAbility) },
  spear: { name: "SPEAR", slot: "weapon", weapon: true, class: "melee", maxStack: 1, color: [140, 95, 60], drawIcon: iconOf(SpearAbility) },
  pistol: { name: "PISTOL", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(PistolAbility) },
  auto: { name: "ASSAULT RIFLE", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(AutoAbility) },
  shotgun: { name: "SHOTGUN", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, color: [120, 90, 60], drawIcon: iconOf(ShotgunAbility) },
  rifle: { name: "SNIPER RIFLE", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(RifleAbility) },
  "frost-wand": { name: "FROST WAND", slot: "weapon", weapon: true, class: "magic", maxStack: 1, color: [120, 200, 255], drawIcon: iconOf(FrostWandAbility) },
  "magma-stone": { name: "MAGMA STONE", slot: "weapon", weapon: true, class: "magic", maxStack: 1, color: [230, 90, 30], drawIcon: iconOf(MagmaStoneAbility) },
  "fire-staff": { name: "METEOR STAFF", slot: "weapon", weapon: true, class: "magic", maxStack: 1, color: [200, 70, 40], drawIcon: iconOf(FireStaffAbility) },
  "bear-trap": { name: "BEAR TRAP", slot: "weapon", maxStack: 10, model: "bear-trap", color: [110, 106, 100], drawIcon: drawBearTrap },
  spikes: { name: "SPIKES", slot: "weapon", maxStack: 30, model: "spikes", color: [150, 110, 70], drawIcon: drawSpikes },
  // Молот для стройки (id "builder" — старые сохранения не ломаются): средняя ячейка. Покупается в магазине
  builder: { name: "HAMMER", slot: "utility", maxStack: 1, color: [170, 175, 185], drawIcon: drawHammer },
};

// Сколько штук предмета помещается в одну ячейку инвентаря
export const maxStack = (id) => ITEMS[id]?.maxStack ?? 64;

export const itemName = (id) => ITEMS[id]?.name ?? id.toUpperCase();

// Для экрана инвентаря движка: что это за предмет
export const itemInfo = (id) => ({ name: itemName(id), color: ITEMS[id]?.color, drawIcon: ITEMS[id]?.drawIcon });

export const isWeapon = (id) => !!ITEMS[id]?.weapon;

// Куда в хотбаре: "weapon" / "utility" / null (только сумка)
export const slotOf = (id) => ITEMS[id]?.slot || null;

// Хотбар — 3 ячейки: 0 и 2 — оружие, 1 (середина) — расходники и инструменты
export const HOTBAR_SLOTS = ["weapon", "utility", "weapon"];
export const hotbarAccepts = (i, id) => slotOf(id) !== null && slotOf(id) === HOTBAR_SLOTS[i];

// То, что берут в руку (подобранное — сразу в хотбар, если есть подходящая пустая ячейка)
export const isUsable = (id) => slotOf(id) !== null;

// Убранные предметы (класс ROGUE и старое): в старых сохранениях их выкидываем; refund — монеты взамен
export const REMOVED_ITEMS = { stone: 0, knife: 1, ammo: 0 }; // ammo — старые патроны: при загрузке → обоймы пистолета (game-scene: migrateHotbar)
