// ============================================================
//  Сцена «мир», часть: Взаимодействие (клавиша F).
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { PICKUP_REACH, ATTACKS } from "../config.js";
import { TROPHY, TROPHY_TALENTS } from "../talents.js";

export class InteractPart {
  // ---------- Взаимодействие (клавиша interact, по умолчанию F) ----------
  // Предмет на земле под прицелом — подобрать
  interact() {
    if (this.tryChest()) return; // сундук на дальнем острове рядом — открыть (scene/islands.js)
    if (this.tryTrade()) return; // страж под прицелом — торговля (scene/loot.js)
    const item = this.aimedPickup(PICKUP_REACH);
    if (item) this.pickUp(item.pickup);
  }

  // Существо погибло: опыт герою, его вещи — в инвентарь героя
  // Существо погибло. Добыча, опыт и трофеи — только если добил герой (стража добивает «бесплатно»)
  // Добыча и опыт — и если добил не герой (страж), но герой нанёс хоть 1 урона (движок: entity.damagedBy)
  onDeath(e) {
    if (e.selfDestructed) {
      this.engine.log(`${e.name} взорвался сам — без опыта и добычи`);
      return;
    }
    const finished = e.lastHitBy === this.player;
    const helped = e.damagedBy(this.player);
    if (!finished && !helped) {
      this.engine.log(`${e.name} погиб не от героя (${e.lastHitBy?.name || "?"})`);
      return;
    }
    if (!finished) this.engine.log(`${e.name}: добил ${e.lastHitBy?.name || "?"}, герой помог (${helped.dealt} урона) — добыча герою`);
    this.dropLoot(e);
    if (finished) this.achKill(e); // ачивки: убийства по оружию / видам / боссы (scene/achievements.js)
    this.countKill(e); // итоги забега (scene/run-stats.js)
    // Трофеи: 1 % здоровья / урона побеждённого моба — навсегда себе (каждый талант — своё)
    if (e.kind === "mob") {
      let changed = false;
      if (this.talents.rank("trophies") > 0) {
        TROPHY.hp += TROPHY.hpPerKill; // +1 HP за убийство, кто бы ни был
        changed = true;
      }
      // Трофей урона — тому виду атак, которым ДОБИЛИ (горение от пули — тоже дальний), если его талант выучен
      const kind = finished ? e.lastHitKind : helped.kind; // помог — трофей тому виду, каким бил
      if (kind in TROPHY.pct && this.talents.rank(TROPHY_TALENTS[kind]) > 0) {
        TROPHY.pct[kind] = +(TROPHY.pct[kind] + TROPHY.perKill).toFixed(1);
        changed = true;
      }
      if (changed) this.applyTalents();
    }
    this.gainXp(e.xp || 0); // после добычи: надпись о новом уровне важнее (матч: опыт общий — gainXp разошлёт)
  }

  // Добыча с павшего падает на землю под ним (чуть вразброс) — подбирай (F или автоподбор, V)
  dropLoot(e) {
    let dropped = 0;
    e.inventory.slots.forEach((slot, i) => {
      if (!slot) return;
      const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.35;
      this.pickups.add(slot.item, slot.count, { x: e.position.x + Math.sin(a) * r, y: e.position.y + 0.4, z: e.position.z + Math.cos(a) * r }, { data: slot.data });
      e.inventory.slots[i] = null;
      dropped++;
    });
    if (dropped) this.engine.sound.play("loot", { at: e.position });
    // Свои трофеи класса: стрелку — патроны, магу — сфера души
    if (e.kind !== "mob") return;
    this.dropGear(e); // вещь с редкостью (удача, тиры) — scene/loot.js
    const near = (k = 0.6) => ({ x: e.position.x + (Math.random() - 0.5) * k, y: e.position.y + 0.5, z: e.position.z + (Math.random() - 0.5) * k });
    // AMMO REFUND (стрелок): убийство из автомата — +15 патронов прямо в его магазин (не больше полного)
    if (this.talentStats.rifleRefund && e.lastHitBy === this.player && e.lastHitAttack === ATTACKS.auto.id) {
      const atk = this.abilityCache.get("auto")?.attack;
      if (atk) {
        const add = Math.min(this.talentStats.rifleRefund, atk.magazine - atk.ammo);
        atk.ammo += add;
        if (add > 0) this.engine.toast(`+${add} AMMO`, 700);
      }
    }
  }
}
