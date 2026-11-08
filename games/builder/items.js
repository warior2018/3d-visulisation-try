// ============================================================
//  Какие предметы бывают в игре. Инвентарь (engine/world/inventory.js) хранит только id
//  предмета ("bone") и количество, а всё остальное о предмете — здесь.
//  Новый предмет = новая строчка.
// ============================================================

import {
  PistolAbility, RifleAbility, CrossbowAbility, AutoAbility, ShotgunAbility, MacheteAbility, WarHammerAbility, KatanaAbility, SpearAbility,
  GrenadesAbility, LauncherAbility, DynamiteAbility,
  drawHammer, drawBearTrap, drawSpikes, drawMedkit,
} from "./abilities.js";
import { PALETTE, ARMOR } from "./config.js";

// Значок оружия — тот же, что у способности в панели
const iconOf = (Ability) => {
  const a = new Ability();
  return (ui, x, y, s) => a.drawIcon(ui, x, y, s);
};

// slot — куда можно положить: "weapon" — ячейка оружия (одна), "item" — две ячейки предметов (стройка, аптечка,
//   ловушки), "head" / "chest" / "legs" / "feet" — броня (ARMOR в config.js); без slot — только сумка
//   (кости, монеты, блоки, обоймы). Оружие и предметы — то и в панели способностей (abilities.js → ABILITY_FOR_ITEM)
// weapon: true — оружие одно в ячейке (stack 1)
// class — к какому классу относится (раздел магазина): melee, ranged, demo; без class — раздел ПРОЧЕЕ
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

// Часть комплекта брони → ячейка (до ITEMS: он её уже использует)
const ARMOR_PART_SLOT = { helmet: "head", chest: "chest", legs: "legs", boots: "feet" };

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
  // Аптечка: ячейка предмета, взять (клавиша ячейки) и держать ЛКМ — лечит (круг у прицела, MEDKIT)
  medkit: { name: "MEDKIT", slot: "item", color: [220, 60, 60], maxStack: 5, model: "medkit", drawIcon: drawMedkit },
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
  coin: { name: "COIN", color: [235, 190, 60], maxStack: 999999 }, // монеты — одной стопкой (цены до тысяч)
  // Оружие по классам: базовое (стартовое) и покупное
  machete: { name: "MACHETE", slot: "weapon", weapon: true, class: "melee", maxStack: 1, drawIcon: iconOf(MacheteAbility) },
  "war-hammer": { name: "WAR HAMMER", slot: "weapon", weapon: true, class: "melee", maxStack: 1, color: [120, 124, 134], drawIcon: iconOf(WarHammerAbility) },
  katana: { name: "KATANA", slot: "weapon", weapon: true, class: "melee", maxStack: 1, color: [200, 205, 215], drawIcon: iconOf(KatanaAbility) },
  spear: { name: "SPEAR", slot: "weapon", weapon: true, class: "melee", maxStack: 1, color: [140, 95, 60], drawIcon: iconOf(SpearAbility) },
  pistol: { name: "PISTOL", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(PistolAbility) },
  auto: { name: "ASSAULT RIFLE", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(AutoAbility) },
  shotgun: { name: "SHOTGUN", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, color: [120, 90, 60], drawIcon: iconOf(ShotgunAbility) },
  rifle: { name: "SNIPER RIFLE", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(RifleAbility) },
  crossbow: { name: "CROSSBOW", slot: "weapon", weapon: true, class: "ranged", maxStack: 1, drawIcon: iconOf(CrossbowAbility) },
  grenades: { name: "GRENADES", slot: "weapon", weapon: true, class: "demo", maxStack: 1, color: [80, 98, 52], drawIcon: iconOf(GrenadesAbility) },
  launcher: { name: "GRENADE LAUNCHER", slot: "weapon", weapon: true, class: "demo", maxStack: 1, color: [80, 98, 52], drawIcon: iconOf(LauncherAbility) },
  dynamite: { name: "DYNAMITE", slot: "weapon", weapon: true, class: "demo", maxStack: 1, color: [190, 40, 34], drawIcon: iconOf(DynamiteAbility) },
  "bear-trap": { name: "BEAR TRAP", slot: "item", maxStack: 10, model: "bear-trap", color: [110, 106, 100], drawIcon: drawBearTrap },
  spikes: { name: "SPIKES", slot: "item", maxStack: 30, model: "spikes", color: [150, 110, 70], drawIcon: drawSpikes },
  // Молот для стройки (id "builder" — старые сохранения не ломаются): ячейка предмета. Покупается в магазине
  builder: { name: "HAMMER", slot: "item", maxStack: 1, color: [170, 175, 185], drawIcon: drawHammer },
  // Броня (ARMOR в config.js): своя ячейка у каждой части, armor — доля физического урона, которую срезает
  ...armorItems(),
};

// Предметы брони из ARMOR: { "leather-helmet": { name, slot: "head", armor, ... }, ... }
function armorItems() {
  const out = {};
  for (const [setId, set] of Object.entries(ARMOR.sets)) {
    for (const [part, p] of Object.entries(set.parts)) {
      out[`${setId}-${part}`] = { name: `${set.name} ${p.name}`, slot: ARMOR_PART_SLOT[part], armor: p.armor, speed: p.speed || 0, headshot: p.headshot || 0, set: setId, maxStack: 1, color: set.color, drawIcon: drawArmor(part, set.color) };
    }
  }
  return out;
}

// Сколько штук предмета помещается в одну ячейку инвентаря
export const maxStack = (id) => ITEMS[id]?.maxStack ?? 64;

export const itemName = (id) => ITEMS[id]?.name ?? id.toUpperCase();

// Для экрана инвентаря движка: что это за предмет
export const itemInfo = (id) => ({ name: itemName(id), color: ITEMS[id]?.color, drawIcon: ITEMS[id]?.drawIcon });

export const isWeapon = (id) => !!ITEMS[id]?.weapon;

// Куда: "weapon" / "item" / "head" / "chest" / "legs" / "feet" / null (только сумка)
export const slotOf = (id) => ITEMS[id]?.slot || null;

// Хотбар — 3 ячейки: 0 — оружие (одно), 1 и 2 — предметы (стройка, аптечка, ловушки)
export const HOTBAR_SLOTS = ["weapon", "item", "item"];
export const hotbarAccepts = (i, id) => slotOf(id) !== null && slotOf(id) === HOTBAR_SLOTS[i];

// Броня — 4 ячейки: шлем, нагрудник, поножи, ботинки
export const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];
export const ARMOR_SLOT_NAMES = ["HELMET", "CHEST", "LEGS", "BOOTS"];
export const armorAccepts = (i, id) => slotOf(id) === ARMOR_SLOTS[i];
export const isArmor = (id) => ARMOR_SLOTS.includes(slotOf(id));

// То, что берут в руку (подобранное — сразу в хотбар, если есть подходящая пустая ячейка)
export const isUsable = (id) => HOTBAR_SLOTS.includes(slotOf(id));


// Значок брони: простой силуэт части цвета комплекта
function drawArmor(part, color) {
  const dark = color.map((c) => Math.round(c * 0.65));
  return (ui, x, y, s) => {
    const r = (fx, fy, fw, fh, c = color) => ui.rect(x + s * fx, y + s * fy, s * fw, s * fh, c);
    if (part === "helmet") {
      r(0.25, 0.25, 0.5, 0.3);
      r(0.2, 0.5, 0.15, 0.2);
      r(0.65, 0.5, 0.15, 0.2);
      r(0.35, 0.45, 0.3, 0.06, dark); // щель забрала
    } else if (part === "chest") {
      r(0.22, 0.22, 0.56, 0.56);
      r(0.1, 0.22, 0.14, 0.26);
      r(0.76, 0.22, 0.14, 0.26);
      r(0.42, 0.22, 0.16, 0.14, dark); // ворот
    } else if (part === "legs") {
      r(0.25, 0.2, 0.5, 0.18);
      r(0.25, 0.36, 0.2, 0.44);
      r(0.55, 0.36, 0.2, 0.44);
      r(0.25, 0.2, 0.5, 0.05, dark); // пояс
    } else {
      r(0.2, 0.3, 0.2, 0.36);
      r(0.2, 0.62, 0.3, 0.14);
      r(0.58, 0.3, 0.2, 0.36);
      r(0.58, 0.62, 0.3, 0.14);
    }
  };
}
