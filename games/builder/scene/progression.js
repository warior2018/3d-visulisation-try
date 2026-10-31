// ============================================================
//  Сцена «мир», часть: Развитие героя: опыт, уровни, таланты, классы.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { TROPHY_TALENTS, TROPHY } from "../talents.js";
import { onlyFor, damageMultiplier, cooldownReduction, TalentScene, Input, ChoiceScene, Vec3 } from "../../../engine/index.js";
import { CREATURES } from "../creatures.js";
import { ARMOR, PLAYER, KATANA_IAI, PROGRESSION, CLASSES, COMMON_TABS, BUILD } from "../config.js";
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
    return (this.player.armor?.slots || []).reduce((sum, sl) => sum + (sl ? ITEMS[sl.item]?.armor || 0 : 0), 0);
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
  }

  // ---------- Классы (config.js → CLASSES) ----------

  // Что открыто классу: вкладки талантов (свой класс + общие) и раздел магазина (магазин спрашивает сам — when)
  applyClass() {
    const c = CLASSES[this.playerClass];
    this.talents.allow(c ? [c.tab, ...COMMON_TABS] : COMMON_TABS);
    this.dressHero();
  }

  // Одежда героя по классу (CLASSES[id].outfit — своя модель: стрелок в плаще, подрывник в комбинезоне;
  // боец и герой без класса — в юкате, "hero"). Сменилась — модель героя другая (анимации те же)
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
  }
}
