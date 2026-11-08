// ============================================================
//  Сцена «мир», часть: Магазин и инвентарь.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { itemName, ITEMS, isArmor, isWeapon, HOTBAR_SLOTS, itemInfo, ARMOR_SLOT_NAMES } from "../items.js";
import { ATTACKS, CLASSES, SUBCLASS_WEAPONS, WEAPON_UPGRADES, MOUNT, PLAYER, SHOP, SPEAR, KATANA_IAI, DEMO, CLIPS, TRAPS, BUILD, MEDKIT, ARMOR } from "../config.js";
import { signedPct } from "./shared.js";
import { Shop, ShopScene, InventoryScene, Input, Vec3, rarityOf } from "../../../engine/index.js";
import { openTuneScene } from "../tune.js";
import fs from "node:fs";
import path from "node:path";
import { WORLD_ROOT, currentWorld } from "../save.js";
import { ABILITY_FOR_ITEM, HeldItemAbility } from "../abilities.js";
import { helpFor } from "../help.js";

export class ShopPart {
  // ---------- Магазин (клавиша B, движок: engine/economy/shop.js) ----------
  makeShop() {
    // Оружие и инструмент — без ограничений: выбросил случайно — купи снова
    const weapon = (id, price, text) => ({
      id, name: itemName(id), price: SUBCLASS_WEAPONS.has(id) ? WEAPON_UPGRADES.rebuy : price, describe: () => text, category: ITEMS[id].class || "other",
      // покупное оружие класса — только выбранное на SUBCLASS.level уровне (выдаётся сразу; здесь — если потерял)
      when: SUBCLASS_WEAPONS.has(id) ? () => this.subclass === id && !this.itemCount(id) : undefined,
      canGive: () => this.canTake(id, 1) || "NO ROOM IN INVENTORY",
      give: () => this.giveItem(id),
      drawIcon: (ui, x, y, s) => ITEMS[id].drawIcon(ui, x, y, s),
    });
    const scene = this;
    // Расходники (ловушки, грибы, патроны): пачкой по count штук — если влезут
    const supply = (id, price, count, text) => ({
      id, name: count > 1 ? `${itemName(id)} X${count}` : itemName(id), price, describe: () => text, category: ITEMS[id].class || "other",
      canGive: () => this.canTake(id, count) || "NO ROOM IN INVENTORY",
      give: () => this.giveResource(id, count), // в руку берущееся — в хотбар, остальное (блоки) — в сумку
      drawIcon: (ui, x, y, s) => ITEMS[id].drawIcon(ui, x, y, s),
    });
    const BT = ATTACKS.bearTrap, SP = ATTACKS.spikes, H = ATTACKS.warHammer, SG = ATTACKS.shotgun;
    // Описание части брони: защита, скорость (если есть) и бонус полного комплекта. Без вложенных шаблонов —
    // так словарь перевода (lang/ru.js) находит надпись по частям
    const armorText = (p, set) => {
      const spd = p.speed ? `, ${signedPct(p.speed)}% SPEED` : "";
      return `ARMOR: -${Math.round(p.armor * 1000) / 10}% PHYSICAL DMG${p.speed ? spd : ""}. FULL ${set.name} SET: ${set.full.text}. GOES STRAIGHT ON IF THE SLOT IS FREE`;
    };
    return new Shop({
      currency: "coin",
      currencyName: "COINS",
      // Разделы — по классам оружия, как вкладки талантов
      // Раздел класса виден только своему классу (до выбора класса — только «ПРОЧЕЕ»)
      categories: [
        ...["melee", "ranged", "demo"].map((id) => ({
          id, name: CLASSES[id].name,
          when: () => CLASSES[this.playerClass]?.shop === id,
        })),
        { id: "upgrades", name: "UPGRADES", when: () => !!this.playerClass },
        { id: "other", name: "OTHER" },
      ],
      slots: [
        // В каждом разделе сначала базовое (дёшево), потом продвинутое
        // В каждом разделе сначала базовое (дёшево — если потерял), потом покупное
        weapon("machete", SHOP.machete, `${ATTACKS.machete.damage} DMG, HITS TWO. SWING EVERY 1.4 S`),
        weapon("war-hammer", SHOP["war-hammer"], `TWO-HANDED. SLAMS THE GROUND: ${H.damage} DMG TO ALL WITHIN ${H.radius} BLOCK. TALENTS: STUN, BIGGER SLAM`),
        weapon("spear", SHOP.spear, `${ATTACKS.spear.damage} DMG, LONG REACH, NO BLOCK. RMB (HOLD) - CHARGE THROUGH UP TO ${SPEAR.maxHits} ENEMIES`),
        weapon("katana", SHOP.katana, `${ATTACKS.katana.damage} DMG TO ALL AHEAD. SKILL IAI: DASH ${KATANA_IAI.distance}M, X${KATANA_IAI.damage} TO ALL ON THE PATH, COOLDOWN ${KATANA_IAI.cooldown}S`),
        weapon("grenades", SHOP.grenades, `${ATTACKS.handGrenade.damage} DMG TO ALL WITHIN ${ATTACKS.handGrenade.radius} BLOCKS WHERE IT LANDS. ENDLESS, ONE EVERY ${ATTACKS.handGrenade.cooldown} S`),
        weapon("launcher", SHOP.launcher, `FAST FLAT SHELLS: ${ATTACKS.launcher.damage} DMG IN ${ATTACKS.launcher.radius} BLOCKS. SKILL CLUSTER: THE SHELL SCATTERS ${DEMO.cluster.count} BOMBLETS`),
        weapon("dynamite", SHOP.dynamite, `LIES ${DEMO.fuse} S, THEN ${ATTACKS.dynamite.damage} DMG TO ALL WITHIN ${ATTACKS.dynamite.radius} BLOCKS`),
        weapon("pistol", SHOP.pistol, `${ATTACKS.pistol.damage} DMG, MAG ${ATTACKS.pistol.magazine}. RMB - AIM`),
        weapon("auto", SHOP.auto, `${ATTACKS.auto.damage} DMG FULL AUTO, MAG ${ATTACKS.auto.magazine}. MIND THE RECOIL`),
        weapon("shotgun", SHOP.shotgun, `${SG.pellets} PELLETS X ${SG.damage} DMG, MAG ${SG.magazine}. CLOSE RANGE. SKILL BLAST JUMP: STUNNING BLAST, THE KICK THROWS YOU BACK`),
        weapon("rifle", SHOP.rifle, `${ATTACKS.rifle.damage} DMG, MAG ${ATTACKS.rifle.magazine}. RMB - SCOPE`),
        weapon("crossbow", SHOP.crossbow, `${ATTACKS.crossbow.damage} DMG, THE BOLT GOES THROUGH UP TO ${ATTACKS.crossbow.pierce} ENEMIES IN A LINE (-${Math.round((1 - ATTACKS.crossbow.pierceFalloff) * 100)}% EACH). RELOAD AFTER EVERY SHOT`),
        // Обоймы — у каждого ствола своя (R — вставить, недострелянная вернётся в сумку неполной)
        ...Object.entries(CLIPS.enabled ? CLIPS.items : {}).map(([gun, clip]) => supply(clip, SHOP[clip], 1, `FULL MAGAZINE FOR THE ${itemName(gun)} (${ATTACKS[gun].magazine}). R - RELOAD`)),
        // Ловушки — для всех классов (раздел ПРОЧЕЕ)
        supply("bear-trap", SHOP["bear-trap"], 1, `${BT.damage} DMG + ${TRAPS["bear-trap"].percentHp * 100}% HP, HOLDS ${TRAPS["bear-trap"].root} S. SNAPS TO A BLOCK`),
        supply("spikes", SHOP.spikes, 1, `${SP.damage} DMG TO ALL EVERY ${SP.rearm} S. PERMANENT, UP TO ${TRAPS.spikes.max}`),
        weapon("builder", SHOP.builder, "LMB - BREAK, RMB - PLACE A BLOCK. G - COLOR"),
        { ...supply(BUILD.item, SHOP.block, BUILD.pack, "BLOCKS FOR BUILDING (HAMMER)"), category: "other" },
        // Улучшения оружия: базовое (50 / 100) и выбранное на 10 уровне (200 / 400 / 600) — +урон за уровень
        ...["primary", "second"].map((track) => {
          const U = WEAPON_UPGRADES[track];
          const item = () => (track === "primary" ? CLASSES[this.playerClass]?.starter[0] : this.subclass);
          const lvl = () => this.upgrades?.[track] || 0;
          return {
            id: "upgrade-" + track,
            name: () => (item() ? `UPGRADE ${itemName(item())} ${lvl() + 1}/${U.prices.length}` : "UPGRADE"),
            price: () => U.prices[Math.min(lvl(), U.prices.length - 1)],
            category: "upgrades",
            when: () => !!item() && lvl() < U.prices.length && (track === "primary" || !!this.subclass),
            describe: () => `+${Math.round(U.bonus * 100)}% DMG WITH THIS WEAPON (NOW +${Math.round((this.upgradeBonus(item()) || 0) * 100)}%)`,
            canGive: () => lvl() < U.prices.length || "MAXED",
            give: () => this.upgradeWeapon(track),
            drawIcon: (ui, x, y, s) => {
              ITEMS[item()]?.drawIcon?.(ui, x, y, s);
              ui.text("+", x + s * 0.72, y - s * 0.05, 2, [120, 230, 120]);
            },
          };
        }),
        // Маунт — один раз навсегда (этот герой): Z — позвать, исчезает от урона (scene/mount.js)
        {
          id: "mount", name: "MOUNT", price: MOUNT.price, category: "other", when: () => !this.hasMount,
          describe: () => `${Input.label(this.settings.controls.bindings.mount)} - CALL. +${Math.round((MOUNT.speed / PLAYER.speed - 1) * 100)}% SPEED. ANY HIT THROWS YOU OFF, THEN ${MOUNT.cooldown} S COOLDOWN. OPENS THE MOUNT TALENT TAB`,
          canGive: () => true,
          give: () => {
            this.hasMount = true;
            this.applyClass(); // открыть вкладку талантов MOUNT
            this.engine.toast(`MOUNT BOUGHT! ${Input.label(this.settings.controls.bindings.mount)} - CALL`, 3000);
          },
          drawIcon: (ui, x, y, s) => {
            ui.rect(x + s * 0.12, y + s * 0.4, s * 0.62, s * 0.32, [120, 84, 60]); // туловище кабана
            ui.rect(x + s * 0.66, y + s * 0.34, s * 0.24, s * 0.26, [100, 70, 50]); // голова
            ui.rect(x + s * 0.86, y + s * 0.52, s * 0.08, s * 0.06, [230, 225, 205]); // клык
            ui.rect(x + s * 0.3, y + s * 0.32, s * 0.26, s * 0.12, [150, 40, 34]); // седло
            ui.rect(x + s * 0.18, y + s * 0.72, s * 0.1, s * 0.18, [90, 62, 45]);
            ui.rect(x + s * 0.54, y + s * 0.72, s * 0.1, s * 0.18, [90, 62, 45]);
          },
        },
        { ...supply("medkit", SHOP.medkit, 1, `ITEM SLOT. HOLD LMB ${MEDKIT.useTime} S: +${SHOP.medkitHeal} HP`), category: "other" },
        // Броня (ARMOR): каждая часть — своя ячейка, срезает долю физического урона
        ...Object.entries(ARMOR.sets).flatMap(([setId, set]) => Object.entries(set.parts).map(([part, p]) =>
          weapon(`${setId}-${part}`, p.price, armorText(p, set)))),
      ],
    });
  }

  openShop() {
    if (this.duel && this.duelStatus?.()?.phase !== "prep") return this.engine.toast("SHOP: ONLY BETWEEN ROUNDS", 1500); // дуэль: магазин — на подготовке
    this.hints?.event("shop");
    this.pushLive(new ShopScene({
      shop: this.shop,
      buyer: this.player,
      ctx: this,
      onBuy: (slot) => {
        this.engine.sound.play("loot");
        this.engine.log(`куплено: ${this.shop.nameOf(slot)}`);
      },
    }));
  }

  // Выдать предмет: сначала в хотбар (сразу под рукой), не влез — в сумку
  // data — свои данные экземпляра (редкость: { rarity, color, label })
  giveItem(id, count = 1, data = null) {
    const p = this.player;
    const o = data ? { data } : {};
    if (isArmor(id)) {
      // Броня: в свою ячейку, если она пустая (сразу надета), иначе — в сумку
      const left = p.inventory.add(id, p.armor.add(id, count, o), o);
      this.applyTalents();
      return left;
    }
    let left = p.hotbar.add(id, count, o);
    if (left > 0) left = p.inventory.add(id, left, o);
    this.syncAbilities();
    return left;
  }

  // Панель способностей = хотбар: в каждой ячейке — способность предмета или кулак
  // F6 — окно баланса (tune.js): числа config.js на ходу и запись в файл
  openTune() {
    openTuneScene(this);
  }

  // F7 — запись повтора (engine/core/replay.js): мир сохраняем и копируем в папку повтора — с него повтор
  // и начнётся (tools/sim/replay.mjs <папка>). Ещё раз F7 — стоп. Ошибка в игре — запись сохраняется сама
  toggleReplay() {
    const e = this.engine;
    if (e.replay?.recording) {
      const file = e.stopReplay();
      return e.toast(file ? "REPLAY SAVED: saves/replays" : "REPLAY NOT SAVED - SEE LOG", 3000);
    }
    if (this.role !== "solo") return e.toast("REPLAY: SINGLE PLAYER ONLY", 2000);
    const dir = e.startReplay({
      meta: { world: currentWorld },
      snapshot: (to) => {
        this.save(false);
        fs.cpSync(WORLD_ROOT, path.join(to, "world"), { recursive: true, filter: (f) => !/[\\/](backups|dead)([\\/]|$)/.test(f) && !f.endsWith(".tmp") });
      },
    });
    if (dir) e.toast("RECORDING REPLAY - F7 TO STOP", 2500);
  }

  // config.js перезагрузили на ходу (main.js → watchModule): оружие — заново из новых ATTACKS (обоймы — полные)
  configReloaded() {
    this.abilityCache.clear();
    this.syncAbilities();
    this.engine.redraw();
  }

  syncAbilities() {
    const bar = this.abilities;
    const before = bar.current;
    this.player.hotbar.slots.forEach((slot, i) => {
      // Пустая ячейка оружия — рука (выглядит пустой); пустую среднюю выбрать нельзя
      let ability = HOTBAR_SLOTS[i] === "weapon" ? this.hand : null;
      if (slot) {
        // Оружие — своя способность; любой другой предмет (кость...) — «в руке», бьём рукой
        const make = ABILITY_FOR_ITEM[slot.item] || (() => new HeldItemAbility(slot.item, itemInfo(slot.item)));
        if (!this.abilityCache.has(slot.item)) {
          const made = make();
          made.help ??= helpFor(made); // справка F1 (help.js)
          if (made.attack?.magazine && CLIPS.enabled) made.attack.reserve = this.clipReserve(slot.item); // стволы заряжаются своими обоймами из сумки (CLIPS.enabled)
          this.abilityCache.set(slot.item, made);
          this.applyMagazines(); // талант MAGAZINE
        }
        ability = this.abilityCache.get(slot.item);
        // редкость экземпляра в руках: сила атаки (+10 % RARE, +20 % EPIC, +35 % LEGENDARY)
        // и улучшения этого оружия в магазине (WEAPON_UPGRADES)
        if (ability.attack) ability.attack.power = (1 + rarityOf(slot.data?.rarity).power) * (1 + (this.upgradeBonus?.(slot.item) || 0));
      }
      bar.set(i, ability);
    });
    // Выбранная ячейка опустела (средняя без предмета) — берём оружие слева
    if (bar.index >= 0 && !bar.slots[bar.index]) bar.index = 0;
    // В выбранной ячейке теперь другое (переложили, выбросили) — «переодеваемся»
    if (bar.current !== before) {
      before?.unequip(this);
      bar.current?.equip(this);
      bar.startEquip(); //    новое оружие ещё достают
      this.onWeaponSwitch(); // и прицел прошлого не переносится
    }
  }

  // Инвентарь: сумка сверху, хотбар снизу. Перекладывать можно мышью, Q — выбросить
  openInventory() {
    const b = this.settings.controls.bindings;
    this.pushLive(new InventoryScene({
      entity: this.player,
      itemInfo,
      dropKey: Input.label(b.drop),
      sections: [
        // Слева — сумка столбиком; справа — оружие | броня (сверху вниз: шлем, нагрудник, поножи, ботинки) | вещи
        { inventory: this.player.inventory, title: "BAG", cols: 4, area: "left" },
        { inventory: this.player.hotbar, indices: [0], title: "WEAPON", cols: 1, area: "right", refuse: () => "ONLY A WEAPON HERE" },
        {
          inventory: this.player.armor, title: "ARMOR", cols: 1, area: "right",
          label: (i) => ARMOR_SLOT_NAMES[i], // HELMET / CHEST / LEGS / BOOTS — в углу ячейки
          refuse: (item, i) => `ONLY ${ARMOR_SLOT_NAMES[i]} HERE`,
        },
        {
          inventory: this.player.hotbar, indices: [1, 2], title: "ITEMS", cols: 1, area: "right",
          label: (i) => Input.label(b[["", "item1", "item2"][i]]),
          refuse: () => "ONLY TOOLS, MEDKITS AND TRAPS HERE",
        },
      ],
      onChange: () => {
        this.syncAbilities();
        this.applyTalents(); // надели / сняли броню
      },
      // Оружие в игре выбросить нельзя (движок умеет — здесь закрыто; продать можно стражу)
      canDrop: (item) => (isWeapon(item) ? "WEAPONS CAN'T BE DROPPED (SELL THEM TO THE WARDEN)" : true),
      onDrop: (item, count, data) => {
        // Выброшенное летит вперёд и ложится на землю — подобрать можно снова (F)
        const dir = this.look.lookDirection();
        const from = this.look.position.add(dir.scale(0.5)).add(new Vec3(0, -0.4, 0));
        this.pickups.add(item, count, from, { velocity: new Vec3(dir.x * 3.5, 2, dir.z * 3.5), ignore: this.player, data }); // автоподбор не вернёт его, пока не отойдёшь
        this.engine.sound.play("swing");
        this.engine.toast(`DROPPED: ${itemName(item)}${count > 1 ? " X" + count : ""}`);
        this.engine.log(`выброшено: ${item} x${count}`);
      },
    }));
  }
}
