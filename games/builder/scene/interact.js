// ============================================================
//  Сцена «мир», часть: Взаимодействие (клавиша F).
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { PICKUP_REACH, ATTACKS, KILL_BUFF } from "../config.js";
import { TROPHY, TROPHY_TALENTS } from "../talents.js";

export class InteractPart {
  // ---------- Взаимодействие (клавиша interact, по умолчанию F) ----------
  // Предмет на земле под прицелом — подобрать
  interact() {
    if (this.tryRoomChest()) return; // сундук в комнате портала (scene/portals.js)
    if (this.tryCaveChest()) return; // сундук в пещере (scene/caves.js)
    if (this.tryHouseChest()) return; // сундук в доме (scene/islands.js)
    if (this.tryChest()) return; // сундук на дальнем острове рядом — открыть (scene/islands.js)
    if (this.tryTrade()) return; // страж под прицелом — торговля (scene/loot.js)
    const item = this.aimedPickup(PICKUP_REACH);
    if (item) this.pickUp(item.pickup);
  }

  // Существо погибло: опыт герою, его вещи — в инвентарь героя
  // Существо погибло. Добыча, опыт и трофеи — только если добил герой (стража добивает «бесплатно»)
  // Добыча и опыт — и если добил не герой (страж), но герой нанёс хоть 1 урона (движок: entity.damagedBy)
  onDeath(e) {
    if (e.boss) this.bossDown = true; // повержен босс — открываются порталы (scene/portals.js)
    if (e.selfDestructed) {
      this.engine.log(`${e.name} взорвался сам — без опыта и добычи`);
      return;
    }
    const finished = e.lastHitBy === this.player;
    const helped = e.damagedBy(this.player);
    // Сетевая игра, хост: добил гость — добыча на землю (подберут все), опыт — ему (в матче — общий)
    if (!finished && e.lastHitBy?.type === "player" && this.role === "host") {
      this.dropLoot(e);
      if (this.match) this.gainXp(e.xp || 0);
      else this.net?.sendKillXp?.(e.lastHitBy, e.xp || 0);
      this.engine.log(`${e.name}: добил гость ${e.lastHitBy.name || "?"} — добыча на землю`);
      return;
    }
    if (!finished && !helped) {
      this.engine.log(`${e.name} погиб не от героя (${e.lastHitBy?.name || "?"})`);
      return;
    }
    if (!finished) this.engine.log(`${e.name}: добил ${e.lastHitBy?.name || "?"}, герой помог (${helped.dealt} урона) — добыча герою`);
    this.dropLoot(e);
    if (finished) this.achKill(e); // ачивки: убийства по оружию / видам / боссы (scene/achievements.js)
    this.countKill(e); // итоги забега (scene/run-stats.js)
    this.trophyKill(e, finished ? e.lastHitKind : helped.kind); // трофеи талантов (вид — каким добил / бил)
    this.gainXp(e.xp || 0); // после добычи: надпись о новом уровне важнее (матч: опыт общий — gainXp разошлёт)
  }

  // Трофеи: +HP за убийство (талант TROPHIES) и +урон тому виду атак, которым добил (свой талант-трофей вида).
  // Гость в сетевой игре зовёт сам за свои убийства (scene/net.js)
  trophyKill(e, kind) {
    if (e.kind !== "mob") return;
    let changed = false;
    if (this.talents.rank("trophies") > 0) {
      TROPHY.hp += TROPHY.hpPerKill;
      changed = true;
    }
    if (kind in TROPHY.pct && this.talents.rank(TROPHY_TALENTS[kind]) > 0) {
      TROPHY.pct[kind] = +(TROPHY.pct[kind] + TROPHY.perKill).toFixed(1);
      changed = true;
    }
    if (changed) this.applyTalents();
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
    // AMMO REFUND (стрелок): убийство из автомата — +15 патронов прямо в его магазин (не больше полного)
    if (this.talentStats.rifleRefund && e.lastHitBy === this.player && e.lastHitAttack === ATTACKS.auto.id) {
      const atk = this.abilityCache.get("auto")?.attack;
      if (atk) {
        const add = Math.min(this.talentStats.rifleRefund, atk.magazine - atk.ammo);
        atk.ammo += add;
        if (add > 0) this.engine.toast(`+${add} AMMO`, 700);
      }
    }
    if (e.lastHitBy !== this.player) return;
    // KILL BUFF (дальний бой): стопка на KILL_BUFF.time с (у каждой своё время), не больше предела таланта
    const maxStacks = this.talentStats.killBuff || 0;
    if (maxStacks) {
      (this.killStacks ||= []).push(KILL_BUFF.time);
      if (this.killStacks.length > maxStacks) this.killStacks.sort((a, b) => b - a).length = maxStacks; // старые — вон
    }
    // AMMO ON KILL: убийство — в магазин оружия в руках доля его ёмкости (не больше полного)
    const refill = this.talentStats.killRefill || 0, atk = this.abilities.current?.attack;
    if (refill && atk?.magazine) atk.ammo = Math.min(atk.magazine, atk.ammo + Math.ceil(atk.magazine * refill));
  }
}
