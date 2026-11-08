// ============================================================
//  Сцена «мир», часть: добыча вещей (удача, редкость, тиры), продажа стражу и его возвращение.
//   - моб может уронить вещь: оружие или часть брони (LOOT.gear; босс — всегда; в нашествие — чаще);
//     тир — по тому, сколько мобов уже было (LOOT.tiers), редкость — rollRarity с удачей героя;
//   - удача: талант FORTUNE (+20 % за ранг) и консоль (luck);
//   - страж (дружелюбный скелет) покупает вещи из сумки: F — открыть торговлю;
//   - погиб страж — через RESIDENT_RESPAWN секунд возвращается на своё место.
// ============================================================

import { rarityOf, rollRarity, chance, pickWeightedKey, TradeScene, translate } from "../../../engine/index.js";
import { LOOT, ITEM_TIER, ARMOR_TIER, ARMOR, SHOP, TIERS, WEAPON_PERKS } from "../config.js";
import { TALENT_TREE, weaponTab } from "../talents.js";
import { ITEMS, itemName, isWeapon, isArmor, itemInfo } from "../items.js";
import { RESIDENTS } from "../creatures.js";
import { INTERACT_REACH } from "./shared.js";

const RESIDENT_RESPAWN = 60; // секунд до возвращения погибшего стража
const SHORT = { rare: "R", epic: "E", legendary: "L" };

// Данные экземпляра по редкости: цвет рамки и буква в углу ячейки (обычной — нет данных)
export function rarityData(rarity) {
  if (!rarity || rarity === "common") return null;
  return { rarity, color: rarityOf(rarity).color, label: SHORT[rarity] || "" };
}

// Цена вещи в магазине (оружие — по тиру, броня — своя цена части)
export function shopPrice(id) {
  if (SHOP[id] !== undefined) return SHOP[id];
  const info = ITEMS[id];
  if (info?.set) return ARMOR.sets[info.set]?.parts?.[id.slice(info.set.length + 1)]?.price ?? 0;
  return 0;
}

// Таланты на оружии (WEAPON_PERKS): у оружия со своей веткой талантов — случайные прокачанные таланты из неё.
// Вернёт { id таланта: ранг } или null
export function rollPerks(item, rarity = "common") {
  const tab = TALENT_TREE.tabs.find((t) => t.id === weaponTab(item));
  if (!tab?.talents.length || Math.random() >= (WEAPON_PERKS.chance[rarity] ?? 0)) return null;
  const [a, b] = WEAPON_PERKS.count[rarity] || [1, 1];
  const n = Math.min(tab.talents.length, a + Math.floor(Math.random() * (b - a + 1)));
  const pool = [...tab.talents];
  const out = {};
  for (let i = 0; i < n; i++) {
    const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    out[t.id] = 1 + Math.floor(Math.random() * t.maxRank);
  }
  return out;
}

// «KATANA: MASTERY 2, IAI MULTIPLIER 1» — что на оружии (для надписей)
export function perksText(perks, tr = (s) => s) {
  if (!perks) return "";
  const name = (id) => tr(TALENT_TREE.tabs.flatMap((t) => t.talents).find((t) => t.id === id)?.name || id);
  return Object.entries(perks).map(([id, r]) => `${name(id)} ${r}`).join(", ");
}

export function tierOf(id) {
  const info = ITEMS[id];
  return ITEM_TIER[id] || (info?.set ? ARMOR_TIER[info.set] : 0) || 0;
}

export class LootPart {
  // Удача героя (доля): таланты + консоль
  luck() {
    return (this.talentStats?.luck || 0) + (this.luckBonus || 0);
  }

  // Вещь с моба: шанс → тир → предмет тира → редкость
  rollGear(e) {
    const boss = !!e.boss;
    const base = boss ? LOOT.bossGear : LOOT.gear * (this.invasion?.active ? LOOT.invasionMult : 1);
    if (!e.elite && !chance(base, this.luck())) return null; // элита (ELITE) — вещь всегда
    const tier = Number(pickWeightedKey(LOOT.tiers(this.spawner?.spawned || 0)));
    const pool = Object.keys(ITEMS).filter((id) => (isWeapon(id) || isArmor(id)) && tierOf(id) === tier);
    if (!pool.length) return null;
    const item = pool[Math.floor(Math.random() * pool.length)];
    const rarity = rollRarity(this.luck());
    return { item, rarity: e.elite && rarity === "common" ? "rare" : rarity }; // с элиты — не ниже RARE
  }

  dropGear(e) {
    const g = this.rollGear(e);
    if (!g) return;
    let data = rarityData(g.rarity);
    const perks = isWeapon(g.item) ? rollPerks(g.item, g.rarity) : null; // прокачанные таланты на оружии
    if (perks) data = { ...(data || {}), perks, label: (data?.label || "") + "+" };
    this.pickups.add(g.item, 1, { x: e.position.x, y: e.position.y + 0.6, z: e.position.z }, data ? { data } : {});
    const r = rarityOf(g.rarity);
    this.engine.log(`добыча: ${r.name} ${g.item} (T${tierOf(g.item)}) с ${e.name}, удача ${this.luck().toFixed(2)}${perks ? `, таланты: ${perksText(perks)}` : ""}`);
    if (perks) this.engine.toast(`${translate(itemName(g.item))} + ${translate(perksText(perks))}`, 2500);
    else if (g.rarity !== "common") this.engine.toast(`${translate(r.name)} ${translate(itemName(g.item))}!`, 1500); // по частям: так переводится
    this.engine.sound.play("loot", { at: e.position });
  }

  // Сколько страж даст за вещь (одну штуку)
  sellPrice(slot) {
    if (!slot) return 0;
    if (isWeapon(slot.item) || isArmor(slot.item)) return Math.max(1, Math.floor(shopPrice(slot.item) * LOOT.sell * rarityOf(slot.data?.rarity).sell));
    return LOOT.resources[slot.item] || 0;
  }

  // Торговля со стражем: всё из сумки, что он берёт
  openTrade(npc) {
    const bag = this.player.inventory;
    this.pushLive(new TradeScene({
      title: npc.name || "WARDEN",
      currency: "COINS",
      money: () => this.itemCount("coin"),
      hint: "THE WARDEN BUYS WEAPONS, ARMOR, BONES AND SKULLS FROM YOUR BAG",
      rows: () => bag.slots.map((s, i) => {
        const price = this.sellPrice(s);
        if (!s || price <= 0 || s.item === "coin") return null;
        const r = rarityOf(s.data?.rarity);
        const tier = tierOf(s.item);
        return {
          key: i, count: s.count, price: price * s.count, drawIcon: itemInfo(s.item).drawIcon,
          name: `${s.data?.rarity ? translate(r.name) + " " : ""}${translate(itemName(s.item))}`, color: s.data?.color || null,
          note: [tier ? TIERS[tier].name : "", s.count > 1 ? `${price} ${translate("EACH")}` : ""].filter(Boolean).join(", "),
        };
      }).filter(Boolean),
      onSell: (i) => {
        const s = bag.slots[i];
        const price = this.sellPrice(s);
        if (!s || price <= 0) return false;
        const total = price * s.count;
        bag.slots[i] = null;
        const left = this.giveResource("coin", total);
        if (left > 0) this.pickups.add("coin", left, { x: this.player.position.x, y: this.player.position.y + 0.5, z: this.player.position.z }); // некуда — под ноги
        this.engine.sound.play("pickup");
        this.engine.log(`продано стражу: ${s.item} x${s.count} за ${total}`);
        return true;
      },
    }));
  }

  // Страж под прицелом рядом — торговля (клавиша interact)
  tryTrade() {
    const e = this.lookTarget;
    if (!e || e.type !== "warden" || !e.alive || e.remote) return false;
    if (Math.hypot(e.position.x - this.player.position.x, e.position.z - this.player.position.z) > INTERACT_REACH + 1) return false;
    this.openWarden(e); // окно стража: задания и торговля (scene/quests.js)
    return true;
  }

  // Жители (страж): погиб или пропал — через RESIDENT_RESPAWN с вернуть на место
  updateResidents(dt) {
    this.residentTimers ||= {};
    for (const d of RESIDENTS) {
      if (this.entities.list.some((e) => e.type === d.type && e.alive && !e.remote)) {
        this.residentTimers[d.type] = 0;
        continue;
      }
      const t = (this.residentTimers[d.type] = (this.residentTimers[d.type] || 0) + dt);
      if (t < RESIDENT_RESPAWN) continue;
      this.residentTimers[d.type] = 0;
      for (const old of this.entities.list.filter((e) => e.type === d.type)) this.removeEntity(old); // тело, если лежит
      const e = this.spawn(d.type, { ...d, y: this.world.surfaceY(d.x, d.z) });
      this.scaleWardens?.();
      this.engine.log(`${e?.name || d.type} вернулся`);
      this.engine.toast(`${e?.name || "WARDEN"} IS BACK`, 2500);
    }
  }
}
