// ============================================================
//  Сцена «мир», часть: Дуэль (режим лобби DUEL). Методы GameScene, подмешиваются в класс (mixParts).
//
//  Каждый сам за себя на маленькой арене-коробке, до DUEL.wins побед. Раунд:
//   1. ПОДГОТОВКА (DUEL.prep с): каждый в своей комнате (комнаты — по кругу вокруг арены, на равных углах).
//      Выдаются очки талантов и монеты раунда (DUEL.rounds), в 1-м — выбор класса, во 2-м — второго оружия.
//      Вещи — как на начало прошлого раунда (что потратил или выбросил в бою — вернулось). Магазин — только тут.
//   2. БОЙ: все — на арену (точки по тому же кругу внутри). Внутри арены всё сгенерировано заново.
//      Погиб — призрак до конца раунда. Остался один — он выиграл раунд.
//   3. ИТОГ раунда (DUEL.endPause с) → следующая подготовка или конец дуэли (у кого DUEL.wins побед).
//  Ведёт хост: он считает раунды и рассылает гостям (duelPrep, duelFight, duelOver) и в снимке (du).
//  Стены арены и комнат (поверхность "arena") не ломаются; всё внутри — ломается без дропа и строится.
// ============================================================

import { SummaryScene, rarityOf } from "../../../engine/index.js";
import { DUEL, PALETTE, BUILD, CLASSES, ITEM_TIER, ARMOR_TIER, subclassOptions } from "../config.js";
import { ITEMS, isWeapon, slotOf, ARMOR_SLOTS } from "../items.js";
import { TROPHY_TALENTS } from "../talents.js";

const ARENA = "arena"; // поверхность неразрушимых стен

export class DuelPart {
  // ---------- Мир дуэли (хост строит, гостям уходит с миром) ----------

  // Сколько игроков — столько комнат по кругу. Арена — в центре (0, 0), пол на высоте 0
  buildDuelWorld(n) {
    const w = this.world, A = DUEL.arena, R = DUEL.room;
    w.unbreakable.add(ARENA);
    const wall = (x, y, z) => w.place(x, y, z, DUEL.wall, ARENA);
    const lamp = (x, y, z) => w.place(x, y, z, DUEL.lamp, ARENA);
    // Коробка: пол, стены, потолок с лампами (без неба внутри было бы темно)
    const box = (cx, cz, half, height) => {
      for (let x = cx - half - 1; x <= cx + half + 1; x++) {
        for (let z = cz - half - 1; z <= cz + half + 1; z++) {
          const edge = x === cx - half - 1 || x === cx + half + 1 || z === cz - half - 1 || z === cz + half + 1;
          wall(x, 0, z);
          if ((x - cx) % 4 === 0 && (z - cz) % 4 === 0 && !edge) lamp(x, height + 1, z);
          else wall(x, height + 1, z);
          if (edge) for (let y = 1; y <= height; y++) wall(x, y, z);
        }
      }
    };
    box(0, 0, A.half, A.height);
    this.duelRooms = [];
    this.duelSpawns = [];
    const dist = A.half + R.half + R.gap;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rx = Math.round(Math.sin(a) * dist), rz = Math.round(Math.cos(a) * dist);
      box(rx, rz, R.half, R.height);
      this.duelRooms.push({ x: rx + 0.5, y: 1, z: rz + 0.5, yaw: a + Math.PI }); // лицом к арене
      const s = A.half - 3;
      this.duelSpawns.push({ x: Math.sin(a) * s + 0.5, y: 1, z: Math.cos(a) * s + 0.5, yaw: a + Math.PI }); // лицом к центру
    }
    this.generateDuelProps();
  }

  // Внутри арены — случайные укрытия: столбы, стенки, кубы, ступени (цвета палитры, не серые). Пересоздаются
  // перед каждым раундом: что сломали и настроили в прошлом — убирается
  generateDuelProps() {
    const w = this.world, A = DUEL.arena, h = A.half;
    // всё внутри арены и комнат (кроме стен) — убрать: и прошлые укрытия, и то, что настроили игроки
    const R = DUEL.room;
    const inside = (b) => (Math.abs(b.x) <= h && Math.abs(b.z) <= h && b.y >= 1 && b.y <= A.height) ||
      (this.duelRooms || []).some((r) => Math.abs(b.x + 0.5 - r.x) <= R.half + 0.5 && Math.abs(b.z + 0.5 - r.z) <= R.half + 0.5 && b.y >= 1 && b.y <= R.height);
    for (const b of [...w.blocks.values()]) if (b.surface !== ARENA && inside(b)) w.remove(b.x, b.y, b.z);
    const colors = PALETTE.filter((c, i) => i !== 0 && i !== 5); // без серого камня и льда
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const free = (x, z) => this.duelSpawns.every((s) => Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) > 2.5);
    const put = (x, y, z, c) => { if (Math.abs(x) < h && Math.abs(z) < h && y <= A.height - 1 && free(x, z)) w.place(x, y, z, c); };
    for (let i = 0; i < A.props; i++) {
      const c = colors[rnd(0, colors.length - 1)];
      const x = rnd(-h + 1, h - 1), z = rnd(-h + 1, h - 1);
      const kind = rnd(0, 3);
      if (kind === 0) for (let y = 1; y <= rnd(2, 4); y++) put(x, y, z, c); // столб
      else if (kind === 1) { // стенка
        const len = rnd(2, 5), ht = rnd(1, 3), alongX = Math.random() < 0.5;
        for (let k = 0; k < len; k++) for (let y = 1; y <= ht; y++) put(alongX ? x + k : x, y, alongX ? z : z + k, c);
      } else if (kind === 2) { // куб 2×2
        for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) for (let y = 1; y <= 2; y++) put(x + dx, y, z + dz, c);
      } else { // ступени
        for (let k = 0; k < 3; k++) for (let y = 1; y <= k + 1; y++) put(x + k, y, z, c);
      }
    }
  }

  // ---------- Ход дуэли (хост) ----------

  // Все герои дуэли: свой + гости (у хоста)
  duelHeroes() {
    return [this.player, ...(this.net?.role === "host" ? [...this.net.guests.values()].map((q) => q.hero) : [])];
  }

  startDuel() {
    this.talents.banned = new Set([...Object.values(TROPHY_TALENTS), "trophies"]); // таланты — все, кроме трофеев
    this.world.unbreakable.add(ARENA); // и у гостя: серые стены не ломаются (поверхность приходит с блоками)
    if (this.net?.role !== "host") return; // раунды ведёт хост
    const roster = this.game.net?.roster || [this.net?.myName];
    this.duelState = { phase: "wait", round: 0, time: 0, wins: Object.fromEntries(roster.map((n) => [n, 0])), winner: null };
    this.engine.log(`дуэль: игроков ${roster.length}`);
  }

  // Тик дуэли: хост ведёт раунды, у всех — враги друг другу, призраки погибших
  tickDuel(dt) {
    if (!this.duel) return;
    // в дуэли все герои — враги друг другу
    const heroes = this.net?.role === "host" ? this.duelHeroes() : [this.player, ...[...(this.net?.copies?.values() || [])].filter((e) => e.type === "player")];
    for (const e of heroes) {
      e.faction = "duelist";
      e.hostileTo.add("duelist");
      e.silhouette = e.downed ? "ghost" : null;
      e.drawOffsetY = 0;
    }
    if (this.net?.role !== "host") return;
    const S = this.duelState;
    if (!S) return;
    const roster = this.game.net?.roster || [];
    S.time -= dt;
    if (S.phase === "wait") {
      // все из лобби зашли — первая подготовка
      if (this.net.guests.size >= roster.length - 1) this.duelPrep(1);
    } else if (S.phase === "prep") {
      if (S.time <= 0) this.duelFight();
    } else if (S.phase === "fight") {
      const alive = this.duelHeroes().filter((e) => !e.downed);
      if (alive.length <= 1) this.duelRoundEnd(alive[0] || null);
    } else if (S.phase === "end" && S.time <= 0) {
      const champ = Object.entries(S.wins).find(([, n]) => n >= DUEL.wins);
      if (champ) this.duelOver(champ[0]);
      else this.duelPrep(S.round + 1);
    }
  }

  nameOf(e) {
    if (e === this.player) return this.net?.myName;
    for (const q of this.net?.guests?.values() || []) if (q.hero === e) return q.name;
    return null;
  }

  // Подготовка раунда round: арена — заново, все — в свои комнаты, награды раунда
  duelPrep(round) {
    const S = this.duelState;
    Object.assign(S, { phase: "prep", round, time: DUEL.prep, winner: null });
    this.generateDuelProps();
    const roster = this.game.net?.roster || [];
    const spot = (name) => this.duelRooms[Math.max(0, roster.indexOf(name))] || this.duelRooms[0];
    const grant = DUEL.rounds[Math.min(round, DUEL.rounds.length) - 1];
    this.duelEnterPrep(round, grant, spot(this.net.myName));
    for (const q of this.net.guests.values()) this.net.server.send(q.peer, { t: "duelPrep", round, grant, at: spot(q.name) });
    this.engine.log(`дуэль: раунд ${round}, подготовка ${DUEL.prep} с`);
  }

  duelFight() {
    const S = this.duelState;
    Object.assign(S, { phase: "fight", time: 0 });
    const roster = this.game.net?.roster || [];
    const spot = (name) => this.duelSpawns[Math.max(0, roster.indexOf(name))] || this.duelSpawns[0];
    this.duelEnterFight(spot(this.net.myName));
    for (const q of this.net.guests.values()) this.net.server.send(q.peer, { t: "duelFight", at: spot(q.name) });
    this.engine.log(`дуэль: раунд ${S.round} — бой`);
  }

  duelRoundEnd(winnerEntity) {
    const S = this.duelState;
    const name = winnerEntity ? this.nameOf(winnerEntity) : null;
    if (name) S.wins[name] = (S.wins[name] || 0) + 1;
    Object.assign(S, { phase: "end", time: DUEL.endPause, winner: name || "" });
    this.engine.log(`дуэль: раунд ${S.round} — ${name || "ничья"}; счёт ${JSON.stringify(S.wins)}`);
  }

  duelOver(champion) {
    const S = this.duelState;
    S.phase = "over";
    this.net.server.broadcast({ t: "duelOver", champion, wins: S.wins });
    this.duelFinish(champion, S.wins);
  }

  // ---------- У каждого (хост — сам, гость — по сообщению) ----------

  // Подготовка: живой, полное здоровье, вещи на начало прошлого раунда, награды раунда, в свою комнату
  duelEnterPrep(round, grant, at) {
    const p = this.player;
    this.downed = false;
    p.downed = false;
    if (this.duelKit) this.restoreKit(this.duelKit); // что было на начало прошлого раунда — вернулось
    this.duelOutfit(); //                              лучшее — на себе, редкости нет
    this.talents.points += grant?.points || 0;
    if (grant?.coins) this.giveResource("coin", grant.coins);
    const blocks = this.itemCount(BUILD.item);
    if (blocks < DUEL.build) this.giveResource(BUILD.item, DUEL.build - blocks);
    this.applyTalents();
    p.stats.hp = p.stats.maxHp;
    this.teleport(at);
    this.duelRound = round;
    this.engine.toast(`ROUND ${round}: +${grant?.points || 0} TALENT PTS, +${grant?.coins || 0} COINS`, 4000);
    if (grant?.pick === "class" && !this.playerClass) this.askClass();
    if (grant?.pick === "second" && !this.subclass && this.playerClass) this.askSubclass();
  }

  // Бой: не выбрал класс / второе оружие — выбираем за него (случайно); запоминаем вещи; на арену
  duelEnterFight(at) {
    const p = this.player;
    if (this.choosingClass) { // окно выбора ещё открыто — закрыть
      while (this.engine.scene !== this && this.engine.scenes.includes(this)) this.engine.pop();
      this.choosingClass = false;
    }
    if (!this.playerClass) this.chooseClass(Object.keys(CLASSES)[Math.floor(Math.random() * Object.keys(CLASSES).length)]);
    if ((this.duelRound || 1) >= 2 && !this.subclass) {
      const list = subclassOptions(this.playerClass);
      if (list.length) this.chooseSubclass(list[Math.floor(Math.random() * list.length)]);
    }
    while (this.engine.scene !== this && this.engine.scenes.includes(this)) this.engine.pop(); // магазин и таланты — закрыть
    this.duelOutfit(); // лучшее оружие — в руки, лучшая броня — на себя, лишнее — в утиль
    this.duelKit = this.saveKit();
    p.stats.hp = p.stats.maxHp;
    this.teleport(at);
    this.engine.toast("FIGHT!", 2000);
    this.engine.sound.play("growl");
  }

  // Дуэль: лучшее оружие — в ячейку оружия и в руки (выбранное вторым, иначе — старше по тиру, потом по редкости),
  // в каждую ячейку брони — лучшая часть (по тиру комплекта, потом по редкости). Остальное оружие и броня —
  // в утиль (пропадают). Вызывается перед боем и после покупки в магазине
  duelOutfit() {
    const p = this.player;
    const where = []; // { inv, i, slot }
    for (const inv of [p.hotbar, p.inventory, p.armor]) inv.slots.forEach((slot, i) => slot && where.push({ inv, i, slot }));
    // в дуэли редкости нет: оружие и броня — обычные (без редкости и прокачанных талантов на оружии)
    for (const x of where) if ((isWeapon(x.slot.item) || slotOf(x.slot.item) && ARMOR_SLOTS.includes(slotOf(x.slot.item))) && x.slot.data) x.slot.data = null;
    const power = (x) => rarityOf(x.slot.data?.rarity).power || 0;
    const pick = (list, tier) => list.sort((a, b) => tier(b) - tier(a) || power(b) - power(a))[0];
    let scrapped = 0;
    const scrap = (list, keep) => {
      for (const x of list) if (x !== keep) { x.inv.slots[x.i] = null; scrapped++; }
    };
    // оружие
    const weapons = where.filter((x) => isWeapon(x.slot.item));
    const best = pick(weapons, (x) => (x.slot.item === this.subclass ? 100 : 0) + (ITEM_TIER[x.slot.item] || 0));
    if (best) {
      scrap(weapons, best);
      if (best.inv !== p.hotbar) this.equipWeapon(best.slot.item);
    }
    // броня: по ячейке
    ARMOR_SLOTS.forEach((slotId, i) => {
      const parts = where.filter((x) => slotOf(x.slot.item) === slotId);
      const top = pick(parts, (x) => ARMOR_TIER[ITEMS[x.slot.item]?.set] || 0);
      if (!top) return;
      scrap(parts, top);
      if (top.inv !== p.armor || top.i !== i) {
        if (top.inv.slots[top.i] === top.slot) top.inv.slots[top.i] = null;
        p.armor.slots[i] = { ...top.slot };
      }
    });
    this.syncAbilities();
    this.applyTalents();
    if (scrapped) this.engine.log(`дуэль: лучшее надето, в утиль — ${scrapped}`);
  }

  // Погиб в дуэли: призрак до конца раунда (оживлений нет)
  duelDown() {
    const p = this.player;
    this.downed = true;
    p.downed = true;
    p.stats.hp = 0;
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    this.engine.sound.play("death");
    this.engine.toast("YOU ARE OUT THIS ROUND", 3000);
    this.engine.log("дуэль: погиб — до конца раунда призраком");
  }

  // Конец дуэли: профиль — победа / поражение, итоги
  duelFinish(champion, wins) {
    if (this.matchEnded) return;
    this.matchEnded = true;
    const me = this.net?.myName;
    const won = champion === me;
    this.engine.profile?.add(won ? "duelWins" : "duelLosses");
    this.engine.log(`дуэль окончена: победил ${champion}${won ? " (мы)" : ""}`);
    this.dead = true;
    while (this.engine.scene !== this && this.engine.scenes.includes(this)) this.engine.pop();
    const rows = Object.entries(wins || {}).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ label: name, value: `${n} WINS`, best: name === champion }));
    this.engine.push(new SummaryScene({
      title: won ? "VICTORY" : "DEFEAT",
      titleColor: won ? [240, 196, 80] : [230, 80, 70],
      subtitle: `${champion} WINS THE DUEL`,
      rows,
      buttons: [{ id: "menu", label: "MAIN MENU" }],
      lock: 1.5,
      onButton: () => this.game.toMenu(),
    }));
  }

  // ---------- Вещи и перенос ----------

  saveKit() {
    const p = this.player;
    return { inventory: p.inventory.toJSON(), hotbar: p.hotbar.toJSON(), armor: p.armor.toJSON() };
  }

  restoreKit(kit) {
    const p = this.player;
    p.inventory.loadFrom(kit.inventory);
    p.hotbar.loadFrom(kit.hotbar);
    p.armor.loadFrom(kit.armor);
    this.syncAbilities();
  }

  teleport(at) {
    if (!at) return;
    const p = this.player;
    p.position.x = at.x;
    p.position.y = at.y;
    p.position.z = at.z;
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    if (Number.isFinite(at.yaw)) this.look.yaw = at.yaw;
    this.groundY = undefined; // не падение
    this.fallGrace = 1;
  }

  // Состояние для HUD: { phase, round, time, wins, winner }
  duelStatus() {
    return this.net?.role === "host" ? this.duelState : this.duelRemote;
  }
}

