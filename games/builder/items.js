// ============================================================
//  Какие предметы бывают в игре. Инвентарь (engine/world/inventory.js) хранит только id
//  предмета ("bone") и количество, а всё остальное о предмете — здесь.
//  Новый предмет = новая строчка.
// ============================================================

import { PistolAbility, RifleAbility, AutoAbility, MacheteAbility, KatanaAbility, ITEM_ICONS, drawHammer } from "./abilities.js";
import { PALETTE } from "./config.js";

// Значок оружия — тот же, что у способности в панели
const iconOf = (Ability) => {
  const a = new Ability();
  return (ui, x, y, s) => a.drawIcon(ui, x, y, s);
};

// weapon: true — оружие/инструмент: кладётся в хотбар и даёт способность (abilities.js → ABILITY_FOR_ITEM)
export const ITEMS = {
  bone: { name: "КОСТЬ", color: [225, 220, 200], maxStack: 32 },
  // Камень: из него строим (1 камень — 1 блок). Подбирается с земли (F)
  stone: {
    name: "КАМЕНЬ", color: [128, 128, 134], maxStack: 64, usable: true, // в руке — бросок (Q): сразу в хотбар
    drawIcon: (ui, x, y, s) => {
      ui.rect(x + s * 0.18, y + s * 0.42, s * 0.64, s * 0.36, [128, 128, 134]);
      ui.rect(x + s * 0.28, y + s * 0.3, s * 0.4, s * 0.16, [162, 162, 168]);
      ui.rect(x + s * 0.18, y + s * 0.66, s * 0.22, s * 0.12, [96, 96, 102]);
      ui.rect(x + s * 0.6, y + s * 0.6, s * 0.22, s * 0.18, [96, 96, 102]);
    },
  },
  skull: { name: "ЧЕРЕП", color: [190, 185, 165], maxStack: 8 },
  coin: { name: "МОНЕТА", color: [235, 190, 60], maxStack: 99 },
  pistol: { name: "ПИСТОЛЕТ", weapon: true, maxStack: 1, drawIcon: iconOf(PistolAbility) },
  rifle: { name: "СНАЙПЕРКА", weapon: true, maxStack: 1, drawIcon: iconOf(RifleAbility) },
  auto: { name: "АВТОМАТ", weapon: true, maxStack: 1, drawIcon: iconOf(AutoAbility) },
  machete: { name: "МАЧЕТЕ", weapon: true, maxStack: 1, drawIcon: iconOf(MacheteAbility) },
  katana: { name: "КАТАНА", weapon: true, maxStack: 1, color: [200, 205, 215], drawIcon: iconOf(KatanaAbility) },
  // Молот (id "builder" — как раньше «стройка»: старые сохранения не ломаются). Покупается в магазине
  builder: { name: "МОЛОТ", weapon: true, maxStack: 1, color: [170, 175, 185], drawIcon: drawHammer },
};

// Сколько штук предмета помещается в одну ячейку инвентаря
export const maxStack = (id) => ITEMS[id]?.maxStack ?? 64;

export const itemName = (id) => ITEMS[id]?.name ?? id.toUpperCase();

// Для экрана инвентаря движка: что это за предмет
export const itemInfo = (id) => ({ name: itemName(id), color: ITEMS[id]?.color, drawIcon: ITEMS[id]?.drawIcon });

export const isWeapon = (id) => !!ITEMS[id]?.weapon;

// Предметы, которые берут в руку и используют (оружие, молот, камни) — подобранное сразу в хотбар
export const isUsable = (id) => !!(ITEMS[id]?.weapon || ITEMS[id]?.usable);

// Значок камня — способности «камень в руке» (abilities.js)
ITEM_ICONS.stone = ITEMS.stone.drawIcon;
