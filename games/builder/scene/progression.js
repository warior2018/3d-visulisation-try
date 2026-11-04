// ============================================================
//  Сцена «мир», часть: Развитие героя: опыт, уровни, таланты, классы.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { TROPHY_TALENTS, TROPHY, weaponTab } from "../talents.js";
import { onlyFor, damageMultiplier, cooldownReduction, TalentScene, Input, ChoiceScene, Vec3, rarityOf } from "../../../engine/index.js";
import { CREATURES } from "../creatures.js";
import { ARMOR, PLAYER, KATANA_IAI, PROGRESSION, CLASSES, COMMON_TABS, BUILD, SUBCLASS, WEAPON_UPGRADES, subclassOptions } from "../config.js";
import { ITEMS } from "../items.js";

export class ProgressionPart {
  // ---------- Развитие героя ----------

  // Таланты дают модификаторы урона — вешаем их на героя: атаки движка сами их учтут
  // Таланты → герой: модификаторы атак и прибавки к характеристикам (вкладка «Выживание»)
  applyTalents() {
    const p = this.player;
    p.modifiers = this.talents.modifiers();
    const s = this.talents.stats();
    // «ТРОФЕИ»: набранный урон — ко всем видам атак, набранное здоровье — к максимуму (целыми)
    // «ТРОФЕИ» (Выживание) — набранное здоровье к максимуму; трофеи урона (по вкладке на вид атак) — урон этого вида
    const hpTrophies = this.talents.rank("trophies") > 0;
    // Трофеи урона: у каждого вида атак свой талант и свой набранный процент — множитель урона ТОЛЬКО этого вида
    for (const [kind, id] of Object.entries(TROPHY_TALENTS)) {
      const pct = TROPHY.pct[kind];
      if (this.talents.rank(id) > 0 && pct > 0) p.modifiers.push(onlyFor(kind, damageMultiplier(1 + pct / 100)));
    }
    p.setMaxHp(CREATURES.player.maxHp + (s.maxHp || 0) + (hpTrophies ? Math.floor(TROPHY.hp) : 0));
    p.regen = p.stats.maxHp * (s.regenPct || 0); // HP в секунду — доля от макс. HP (дробные копятся)
    p.burnLevel = s.burnLevel || 1; //            сила горения от огня героя (ОГНЕННЫЕ ПУЛИ)
    p.speedBonuses.talents = s.speed || 0; //     прибавка к скорости
    p.stats.resist = { ...(s.resist || {}) }; //  сопротивления стихиям
    // Короны лича — +урон всем атакам героя (BONE_CROWN)
    const crown = this.crownDamage(this.boneCrowns || 0);
    if (crown > 0) p.modifiers.push(damageMultiplier(1 + crown));
    // Шкуры тролля и надетая броня — к физической броне (вместе с THICK SKIN), не больше 90 %
    const armor = this.hideArmor(this.trollHides || 0) + this.armorValue();
    if (armor > 0) p.stats.resist.physical = Math.min(0.9, (p.stats.resist.physical || 0) + armor);
    // Броня: скорость частей (железо −, кость +) и бонус полного комплекта (ARMOR.sets[id].full)
    const full = ARMOR.sets[this.armorFullSet()]?.full || {};
    p.speedBonuses.armor = this.armorSpeed() + (full.speed || 0);
    if (full.hp) p.setMaxHp(p.stats.maxHp + full.hp);
    if (full.attackSpeed) p.modifiers.push(cooldownReduction(1 - 1 / (1 + full.attackSpeed)));
    // Правила классов из талантов (не модификаторы урона) — читают оружие, ловушки, призыв
    this.talentStats = s;
    // HIGH GROUND (снайпер): прыжок ×1.5 и двойной прыжок
    if (this.controller) {
      this.controller.jumpHeight = PLAYER.jumpHeight * (1 + (s.jumpMult || 0));
      this.controller.extraJumps = s.extraJumps || 0;
    }
    this.applyMagazines();
  }

  // Сколько физического урона срезает надетая броня (сумма частей, ITEMS[id].armor)
  armorValue() {
    // редкая часть брони — крепче (× 1 + power редкости)
    return (this.player.armor?.slots || []).reduce((sum, sl) => sum + (sl ? (ITEMS[sl.item]?.armor || 0) * (1 + rarityOf(sl.data?.rarity).power) : 0), 0);
  }

  // Скорость от надетой брони (железо тяжёлое, кость лёгкая): сумма частей, ITEMS[id].speed
  armorSpeed() {
    return (this.player.armor?.slots || []).reduce((sum, sl) => sum + (sl ? ITEMS[sl.item]?.speed || 0 : 0), 0);
  }

  // Полный комплект (все 4 части одного): его id или null — бонус ARMOR.sets[id].full
  armorFullSet() {
    const sets = (this.player.armor?.slots || []).map((sl) => (sl ? ITEMS[sl.item]?.set : null));
    return sets.length === 4 && sets[0] && sets.every((x) => x === sets[0]) ? sets[0] : null;
  }

  // Обоймы стволов с талантом MAGAZINE: +15…45 % патронов (округляем вверх)
  applyMagazines() {
    const bonus = this.talentStats?.magBonus || 0;
    for (const a of this.abilityCache?.values() || []) {
      const atk = a.attack;
      if (!atk?.baseMagazine && !atk?.magazine) continue;
      atk.baseMagazine ||= atk.magazine;
      atk.magazine = Math.ceil(atk.baseMagazine * (1 + bonus));
      atk.ammo = Math.min(atk.ammo, atk.magazine);
    }
  }

  // ИАЙ катаны с талантами: множитель удара и прибавка к бегу
  iaiStats() {
    const s = this.talentStats || {};
    return { mult: s.iaiMult || KATANA_IAI.damage, speed: s.iaiSpeed || KATANA_IAI.speed };
  }

  openTalents() {
    this.hints?.event("talents");
    this.pushLive(new TalentScene({
      talents: this.talents,
      onLearn: (id) => {
        this.applyTalents();
        this.engine.sound.play("learn");
        this.engine.log(`талант ${id}: ранг ${this.talents.rank(id)}`);
      },
    }));
  }

  gainXp(amount) {
    const gained = this.experience.add(Math.round(amount * (PROGRESSION.xpMultiplier ?? 1))); // ×1.15 — PROGRESSION
    if (!gained) return;
    this.talents.points += gained * PROGRESSION.pointsPerLevel;
    this.levelFlash = 1; // золотая вспышка по краям — новый уровень (здоровье больше не лечится)
    this.engine.sound.play("levelup");
    const key = Input.label(this.settings.controls.bindings.talents);
    this.engine.toast(`LEVEL ${this.experience.level}! +${gained} PTS (${key})`, 3000);
    this.engine.log(`новый уровень: ${this.experience.level}`);
    if (!this.playerClass) this.askClass(); // первый новый уровень — пора выбрать класс
    else if (this.needsSubclass()) this.askSubclass(); // SUBCLASS.level — второе оружие
  }

  // ---------- Классы (config.js → CLASSES) ----------

  // Что открыто классу: вкладки талантов (свой класс + общие) и раздел магазина (магазин спрашивает сам — when)
  applyClass() {
    const c = CLASSES[this.playerClass];
    const sub = c && this.subclass ? [weaponTab(this.subclass)] : [];
    const extra = this.hasMount ? ["mount"] : []; // вкладка маунта — когда куплен
    this.talents.allow(c ? [c.tab, ...sub, ...COMMON_TABS, ...extra] : [...COMMON_TABS, ...extra]);
    this.dressHero();
  }

  // Одежда героя по классу (CLASSES[id].outfit — своя модель: стрелок в плаще, подрывник в комбинезоне;
  // боец и герой без класса — в юкате, "hero"). Сменилась — модель героя другая (анимации те же)
  // Скины сменились (консоль skin): переодеть героя, модели от 1-го лица — заново
  refreshSkins() {
    const p = this.player;
    if (p?.view) {
      const name = p.view.name;
      this.game.models.detach(p);
      this.game.models.attach(p, name);
    }
    for (const vm of this.viewModels?.values() || []) if (vm.holder) this.game.models.detach(vm.holder);
    this.viewModels?.clear();
    this.viewModelName = null;
  }

  dressHero() {
    const p = this.player;
    const name = CLASSES[this.playerClass]?.outfit || "hero";
    if (!p?.view || p.view.name === name) return;
    this.game.models.detach(p);
    this.game.models.attach(p, name);
  }

  // Окно выбора класса (движок: ChoiceScene). Закрыть, не выбрав, нельзя
  askClass() {
    if (this.choosingClass) return;
    this.choosingClass = true;
    this.engine.push(new ChoiceScene({
      title: "CHOOSE YOUR CLASS",
      subtitle: "UNLOCKS ITS TALENTS AND ITS SHOP WEAPONS. THE CHOICE IS FINAL",
      required: true,
      lock: 1, // не выбрать случайно кликом из боя
      options: Object.entries(CLASSES).map(([id, c]) => ({
        id, name: c.name, describe: c.text,
        drawIcon: (ui, x, y, s) => ITEMS[c.starter[0]]?.drawIcon?.(ui, x, y, s),
      })),
      onPick: (id) => this.chooseClass(id),
    }));
  }

  // Класс выбран: чужие вкладки талантов — сброс (очки возвращаются), стартовое оружие — в руки
  chooseClass(id) {
    const c = CLASSES[id];
    this.choosingClass = false;
    if (!c) return;
    this.playerClass = id;
    let refunded = 0;
    for (const other of Object.values(CLASSES)) if (other !== c) refunded += this.talents.refundTab(other.tab);
    this.applyClass();
    this.applyTalents();
    const [item, count] = c.starter;
    const left = this.giveItem(item, count);
    // некуда положить (хотбар и сумка полны) — не пропадает: падает рядом на землю
    if (left > 0) this.pickups.add(item, left, this.player.position.add(new Vec3(0, 0.5, 0)));
    this.abilities.select(this.player.hotbar.slots.findIndex((s) => s?.item === item), this); // сразу в руки
    if (id === "ranged") this.giveAmmoOnce();
    this.giveResource(BUILD.item, BUILD.pack); // всем (в сумку, не в хотбар) — немного блоков на первую стройку
    this.engine.sound.play("learn");
    this.engine.toast(`CLASS: ${c.name}${refunded ? ` (REFUNDED POINTS: ${refunded})` : ""}`, 3000);
    this.engine.log(`выбран класс ${id}${refunded ? `, возвращено очков ${refunded}` : ""}, выдано ${item} x${count}`);
    this.save(false);
    if (this.needsSubclass()) this.askSubclass(); // класс выбрали поздно — сразу и второе оружие
  }

  // ---------- Подкласс (config.js → SUBCLASS) ----------

  // Пора выбрать второе оружие: класс есть, уровень дорос, а подкласса нет (гость сетевой игры — не спрашиваем)
  needsSubclass() {
    return !!this.playerClass && !this.subclass && this.role !== "client" && this.experience.level >= SUBCLASS.level;
  }

  // Окно выбора второго оружия: покупные своего класса или базовое (тогда оно сильно крепнет). Закрыть, не
  // выбрав, нельзя. Выбранное — сразу в руки; в магазине — его улучшения (WEAPON_UPGRADES)
  askSubclass() {
    if (this.choosingClass) return;
    const list = subclassOptions(this.playerClass);
    if (!list.length) return;
    const starter = CLASSES[this.playerClass].starter[0];
    this.choosingClass = true;
    this.engine.push(new ChoiceScene({
      title: "CHOOSE YOUR SECOND WEAPON",
      subtitle: "YOU GET IT RIGHT AWAY. THE SHOP THEN SELLS ITS UPGRADES. THE CHOICE IS FINAL",
      required: true,
      lock: 1,
      options: list.map((id) => ({
        id, name: ITEMS[id].name,
        describe: id === starter ? `KEEP YOUR BASE WEAPON: +${Math.round(WEAPON_UPGRADES.primaryPick * 100)}% DMG RIGHT AWAY, THEN ITS BIG UPGRADES` : this.shop.slots.find((s) => s.id === id)?.describe?.() || "",
        drawIcon: (ui, x, y, s) => ITEMS[id]?.drawIcon?.(ui, x, y, s),
      })),
      onPick: (id) => this.chooseSubclass(id),
    }));
  }

  // Подкласс выбран: оружие — сразу (базовое — уже есть); очки в ветках другого оружия класса — обратно;
  // открыта его вкладка талантов (если есть)
  chooseSubclass(id) {
    this.choosingClass = false;
    if (!subclassOptions(this.playerClass).includes(id)) return;
    this.subclass = id;
    let refunded = 0;
    for (const w of SUBCLASS.weapons[this.playerClass] || []) if (w !== id) refunded += this.talents.refundTab(weaponTab(w));
    this.applyClass();
    this.applyTalents();
    const starter = CLASSES[this.playerClass].starter[0];
    if (id !== starter && !this.itemCount(id)) {
      const left = this.giveItem(id);
      if (left > 0) this.pickups.add(id, left, this.player.position.add(new Vec3(0, 0.5, 0))); // некуда — рядом на землю
    }
    this.syncAbilities(); // сила базового (если выбрали его) — сразу
    this.engine.sound.play("learn");
    const text = id === starter ? `BASE WEAPON MASTERED: ${ITEMS[id].name} +${Math.round(WEAPON_UPGRADES.primaryPick * 100)}% DMG` : `SECOND WEAPON: ${ITEMS[id].name}`;
    this.engine.toast(refunded ? `${text} (REFUNDED POINTS: ${refunded})` : text, 4000);
    this.engine.log(`выбран подкласс ${id}${refunded ? `, возвращено очков ${refunded}` : ""}`);
    this.save(false);
  }

  // ---------- Улучшения оружия (WEAPON_UPGRADES) ----------

  // Насколько сильнее оружие item от улучшений: базовое — свои уровни (и «освоено» + улучшения второго, если его
  // выбрали на 10 уровне), второе — свои
  upgradeBonus(item) {
    const U = WEAPON_UPGRADES, up = this.upgrades || {};
    const starter = CLASSES[this.playerClass]?.starter[0];
    let k = 0;
    if (item === starter) k += (up.primary || 0) * U.primary.bonus;
    if (item === this.subclass) k += (up.second || 0) * U.second.bonus + (item === starter ? U.primaryPick : 0);
    return k;
  }

  // Купить следующий уровень улучшения: track — "primary" / "second". Вернёт true, если купили
  upgradeWeapon(track) {
    const U = WEAPON_UPGRADES[track];
    this.upgrades ||= { primary: 0, second: 0 };
    if ((this.upgrades[track] || 0) >= U.prices.length) return false;
    this.upgrades[track] = (this.upgrades[track] || 0) + 1;
    this.syncAbilities();
    return true;
  }
}
