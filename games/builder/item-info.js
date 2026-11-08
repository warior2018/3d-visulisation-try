// ============================================================
//  Плашка с информацией о предмете (наводишь мышь на ячейку инвентаря — движок: InventoryScene describe).
//   - оружие: редкость, урон (с редкостью и улучшениями), скорострельность, обойма, дальность, что умеют
//     кнопки (help.js), прокачанные таланты на нём (с мобов: data.perks) и цена продажи;
//   - броня: защита, скорость, комплект, цена продажи;
//   - остальное (ресурсы, предметы): имя, сколько штук, цена продажи стражу.
//  Числа — из config.js: плашка сама следует за балансом.
// ============================================================

import { rarityOf, translate } from "../../engine/index.js";
import { ATTACKS, ARMOR } from "./config.js";
import { ITEMS, itemName, isWeapon, isArmor } from "./items.js";
import { HELP } from "./help.js";
import { perksText } from "./scene/loot.js";

// Предмет → его основная атака (config.js → ATTACKS)
const ATTACK_OF = {
  machete: "machete", "war-hammer": "warHammer", katana: "katana", spear: "spear", pistol: "pistol", auto: "auto",
  shotgun: "shotgun", rifle: "rifle", crossbow: "crossbow", grenades: "handGrenade", launcher: "launcher", dynamite: "dynamite",
};
const MUTED = [150, 156, 170], GOOD = [120, 230, 140], GOLD = [240, 196, 80], TEXT = [230, 234, 240];
const n1 = (v) => Math.round(v * 10) / 10;

export function describeSlot(g, slot) {
  const id = slot.item;
  const info = ITEMS[id];
  if (!info) return null;
  const rarity = rarityOf(slot.data?.rarity);
  const lines = [{ text: (rarity.id !== "common" ? `${rarity.name} ` : "") + itemName(id) + (slot.count > 1 ? ` x${slot.count}` : ""), color: rarity.id !== "common" ? rarity.color : TEXT }];
  const sell = g.sellPrice?.(slot) || 0;

  if (isWeapon(id)) {
    const A = ATTACKS[ATTACK_OF[id]];
    const power = (1 + rarity.power) * (1 + (g.upgradeBonus?.(id) || 0));
    if (A) {
      const dmg = Array.isArray(A.damage) ? A.damage.map((d) => Math.round(d * power)).join("-") : n1(A.damage * power);
      // кусочки переводим сразу (в строку ниже они попадают уже готовыми)
      const per = translate(A.pellets > 1 ? ` x${A.pellets} PELLETS` : A.pierce > 1 ? `, PIERCES ${A.pierce}` : A.maxTargets > 1 ? `, UP TO ${A.maxTargets} TARGETS` : A.radius ? ` IN ${A.radius} M` : "");
      const bonus = power > 1.001 ? ` (+${Math.round((power - 1) * 100)}%)` : "";
      lines.push({ text: `DAMAGE: ${dmg}${per}${bonus}`, color: TEXT, size: 2 }); // главное — крупно, справка — мельче
      if (A.cooldown) lines.push({ text: `RATE: ${n1(1 / A.cooldown)} PER SECOND`, color: MUTED });
      if (A.magazine) lines.push({ text: `CLIP: ${A.magazine}, RELOAD ${A.reloadTime} S`, color: MUTED });
      const full = A.falloff ? translate(`, FULL DMG UP TO ${A.falloff[0]} M`) : "";
      if (A.range) lines.push({ text: `RANGE: ${A.range} M${full}`, color: MUTED });
      else if (A.reach) lines.push({ text: `REACH: ${A.reach} M`, color: MUTED });
    }
    // что умеют кнопки (справка F1)
    const help = HELP[id];
    const keys = { primary: "LMB", secondary: "RMB", skill1: "Q", skill2: "E" };
    for (const [k, label] of Object.entries(keys)) {
      const h = help?.[k];
      if (h && (k === "skill1" || k === "skill2" || h.name)) lines.push({ text: `${label}${h.name ? " " + translate(h.name) : ""}: ${translate(h.text)}`, color: k.startsWith("skill") ? GOLD : MUTED });
    }
    if (help?.passive) lines.push({ text: `PASSIVE ${help.passive.name}: ${help.passive.text}`, color: GOOD });
    if (slot.data?.perks) lines.push({ text: `TALENTS: ${perksText(slot.data.perks, translate)}`, color: GOOD, size: 2 });
  } else if (isArmor(id)) {
    const k = 1 + rarity.power;
    lines.push({ text: `ARMOR: -${Math.round((info.armor || 0) * k * 100)}% PHYSICAL DMG`, color: TEXT, size: 2 });
    if (info.speed) lines.push({ text: `SPEED: ${info.speed > 0 ? "+" : ""}${Math.round(info.speed * 100)}%`, color: MUTED });
    const set = ARMOR.sets[info.set];
    if (set?.full?.text) lines.push({ text: `FULL SET: ${translate(set.full.text)}`, color: MUTED });
  }
  const each = slot.count > 1 ? translate(" EACH") : "";
  lines.push({ text: sell > 0 ? `SELLS FOR ${sell} COINS${each}` : "CAN'T BE SOLD", color: sell > 0 ? GOLD : MUTED, size: 2 });
  return lines;
}
