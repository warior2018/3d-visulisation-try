// ============================================================
//  Сцена «мир», часть: Вход в мир, сохранение, выход.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { VIEW_DISTANCE, HEARING, TERRAIN_V1, MAP_FOG, ULTIMATE, PLAYER, STAMINA, CLASSES, SPAWN, MOB_MIX, MOB_RANGED, TRAPS, BOARS, INVASION, AUTOSAVE, SUBCLASS, MOVEMENT, MULTIPLAYER, subclassOptions, worldgenFor, WOUND } from "../config.js";
import { loadGame, saveGame, saveGuestProgress, SAVE_DIR, worldInfo } from "../save.js";
import { Terrain, FogOfWar, UltimateCharge, CharacterController, Stamina, Inventory, Spawner, RandomEvent, Hints, profiler } from "../../../engine/index.js";
import { HINTS } from "../hints.js";
import { maxStack, hotbarAccepts, armorAccepts } from "../items.js";
import { TROPHY, weaponTab } from "../talents.js";
import { noSprint } from "../controls.js";
import { DEFAULT_SPAWNS, RESIDENTS, mobGrowth } from "../creatures.js";
import { pickWeighted, PROF } from "./shared.js";

export class SessionPart {
  // ---------- Вход и выход ----------

  enter() {
    noSprint(this.engine); // спринта нет — Shift под способность (controls.js)
    Object.assign(this.engine.sound.hearing, HEARING); // объёмный звук: радиус слышимости и затухание (config.js)
    this.engine.sound.environment = (at) => this.soundEnvironment(at); // стены глушат, в пещере — эхо (scene/audio.js)
    // видеокарта собрала шейдер частиц — лучи и следы пуль рисуются в 3D (стены их закрывают); нет — плоско
    this.beams.particles = this.engine.renderer?.particlePipeline ? this.fx : null;
    this.game.models.lightAt = (p, e) => this.lightHere(p, e); // свет на моделях: под крышей темнее (scene/daylight.js)
    // Мир из слота: размер и летающие острова (info.json; старые миры — с полом, большие)
    // матч: свой мир не трогаем — новый, летающие острова среднего размера, без читов, не сохраняется
    const info = this.match ? { floating: true, size: 2, cheats: false } : this.role === "client" ? {} : worldInfo();
    this.world.floor = !info.floating;
    this.setupLights(); // светящиеся блоки (LIGHTS) — до загрузки: лампы из сохранения сразу светят (scene/daylight.js)
    this.cheats = info.cheats !== false; // читы консоли (галочка при создании мира; у старых миров — включены)
    this.worldgen = worldgenFor(info.size || 3, !!info.floating);
    const saved = this.match ? null : loadGame(this.world); // блоки — сразу в мир; null — нового мира ещё нет
    // Рельеф: по зерну из сохранения (кубики уже в blocks — только высота земли для расчётов)
    // Параметры рельефа — из сохранения (старые миры — TERRAIN_V1: тогда остров был меньше)
    this.terrainParams = saved?.worldgen?.terrain || TERRAIN_V1;
    if (saved?.worldgen?.seed) this.terrain = new Terrain({ ...(saved.worldgen.terrain || TERRAIN_V1), seed: saved.worldgen.seed });
    // Площадка лича: из сохранения; в старом мире без логов её не было — строим сейчас
    this.arena = saved?.worldgen?.arena || null;
    if (saved && this.terrain && !this.arena) {
      this.arena = this.arenaSpot();
      if (this.arena) this.buildArena(this.arena);
    }
    this.treasure = saved?.worldgen?.treasure || null; // сундук на дальнем острове (scene/islands.js)
    // дуэль: вместо обычного мира — арена-коробка и комнаты подготовки (scene/duel.js; гостю мир придёт от хоста)
    if (this.duel) { if (this.role !== "client") this.buildDuelWorld((this.game.net?.roster || [1, 2]).length); } else if (!saved) this.generateWorld(); // новый мир: рельеф, постройки, деревья
    // Камни и прочее на земле. В сохранениях до камней их нет — разбрасываем, чтобы было из чего строить
    if (Array.isArray(saved?.pickups)) this.pickups.loadFrom(saved.pickups);

    const p = saved?.player;
    this.player = this.spawn("player", p || { x: 0, y: 0, z: 0 });
    this.player.skinned = true; // свои скины (skins.js) — на своём герое
    // Туман войны на карте (движок: FogOfWar): что герой уже разведал — из сохранения
    this.fog = new FogOfWar(MAP_FOG);
    this.fog.load(saved?.fog);
    this.fog.reveal(this.player.position);
    // Подсказки новичку (hints.js): выполненные — в настройках (на все миры этого компьютера)
    const gen = this.settings.general;
    this.hints = new Hints({
      list: HINTS, done: Array.isArray(gen.hintsDone) ? gen.hintsDone : [], enabled: gen.hints !== false && this.role !== "client",
      onChange: (ids) => {
        gen.hintsDone = ids;
        this.engine.settings.save();
      },
    });
    // Ультимейт (X): заряд от урона, убийств и со временем (движок: UltimateCharge). Самой ульты пока нет — только слот
    this.ultimate = new UltimateCharge(ULTIMATE);
    this.ultimate.charge = Math.min(1, saved?.progression?.ultimate || 0);
    this.ultimate.attach(this.player);
    // Патроны стволов — из сумки (движок: RangedAttack.reserve)
    // Обоймы стволов — из сумки, у каждого ствола свои (движок: RangedAttack.reserve.swap; CLIPS) — clipReserve
    if (p) {
      this.look.yaw = p.yaw;
      this.look.pitch = p.pitch;
    }
    this.controller = new CharacterController(this.player, this.engine.input, this.physics, PLAYER);
    this.controller.onLand = (land) => this.onLand(land); // приземлился: толчок камеры (и урон от падения)
    this.controller.accel = { ...MOVEMENT }; // разгон и торможение — не мгновенные (config.js → MOVEMENT)
    // Выносливость (движок: Stamina): бег и разбег с копьём тратят, удары ближнего боя — тоже (MELEE_STAMINA)
    // STAMINA.enabled: false — выносливости нет (this.stamina = null): бег без предела, удары бесплатно
    this.stamina = STAMINA.enabled ? new Stamina(STAMINA) : null;
    this.controller.canRun = () => this.stamina?.canRun ?? true;
    // Блок отбил удар (движок: статус parry → entity.onBlock) — «дзынь» и надпись
    // Попали в голову — шлем срезает часть урона (до брони; ARMOR: headshot)
    this.player.onIncoming = (d) => {
      if (d.part === "head") d.amount *= 1 - this.helmetHeadshot();
      // рана: попали оружием (не горение / кровотечение, не своё) — регенерация ×0.5 на WOUND.time с (out-of-combat.js)
      if (d.source && d.source !== this.player && !d.tags?.has("dot") && d.amount > 0) this.woundUntil = (this.combatClock || 0) + WOUND.time;
    };
    this.player.onBlock = (d, guard) => {
      this.engine.sound.play("parry");
      this.reflectShot(d, guard); // отбили выстрел — отбитая доля летит туда, куда смотрим
      this.blockFlash = 0.6;
      this.engine.log(`блок: отбит удар ${d.source?.name || "?"} (${Math.round(d.amount)})`);
    };
    this.experience.loadFrom(saved?.progression?.experience);
    this.talents.loadFrom(saved?.progression?.talents);
    // Хотбар — 3 ячейки: оружие (одно) и два предмета — стройка, аптечка, ловушки (items.js → slot).
    // Броня — 4 ячейки: шлем, нагрудник, поножи, ботинки. Что в свою ячейку больше не кладётся — в сумку
    // (не влезло — на землю)
    this.player.hotbar = new Inventory(3, maxStack, hotbarAccepts);
    this.player.armor = new Inventory(4, maxStack, armorAccepts);
    this.playerClass = CLASSES[saved?.progression?.class] ? saved.progression.class : null;
    this.loadHotbar(p?.hotbar, p?.armor); // и всё, чего больше нет в игре, — пропадает
    this.syncAbilities();
    this.shop.loadFrom(saved?.progression?.shop);
    // Класс героя: пока не выбран — открыты только общие вкладки талантов и раздел «ПРОЧЕЕ» магазина
    this.playerClass = CLASSES[saved?.progression?.class] ? saved.progression.class : null;
    this.ammoGiven = !!saved?.progression?.ammoGiven;
    this.hasMount = !!saved?.progression?.mount; // куплен ли маунт (MOUNT)
    if (Number.isFinite(saved?.progression?.dayTime)) this.dayTime = saved.progression.dayTime; // время суток
    // Подкласс (второе оружие с SUBCLASS.level уровня) — только из оружия своего класса
    const sub = saved?.progression?.subclass;
    this.subclass = subclassOptions(this.playerClass).includes(sub) ? sub : null;
    const up = saved?.progression?.upgrades; // улучшения оружия (WEAPON_UPGRADES)
    this.upgrades = { primary: Math.max(0, Number(up?.primary) || 0), second: Math.max(0, Number(up?.second) || 0) };
    this.loadRunStats(saved?.progression?.run); // итоги забега (scene/run-stats.js)
    this.loadQuests(saved?.progression?.quests); // задания стража (scene/quests.js)
    this.applyClass();
    // Очки во вкладках чужих классов и не своего второго оружия (старые сохранения, перестройка дерева) — обратно.
    // Подкласс ещё не выбран — ветки оружия своего класса ждут выбора (вернутся тогда)
    if (this.playerClass) {
      let back = 0;
      const mine = new Set(this.subclass ? [] : (SUBCLASS.weapons[this.playerClass] || []).map(weaponTab));
      for (const tab of this.talents.tree.tabs) if (!this.talents.isAllowed(tab.id) && !mine.has(tab.id)) back += this.talents.refundTab(tab.id);
      if (back) this.engine.log(`очки из вкладок чужих классов возвращены: ${back}`);
    }
    TROPHY.hp = saved?.progression?.trophies?.hp || 0; //         набранное талантом «ТРОФЕИ»
    // Трофеи урона по видам атак. В старых сохранениях был только «дальний» по +1 % за убийство —
    // переводим в новые +0.3 % за то же число убийств
    const tr = saved?.progression?.trophies;
    for (const kind of Object.keys(TROPHY.pct)) TROPHY.pct[kind] = Number(tr?.pct?.[kind]) || 0;
    if (!tr?.pct && tr?.rangedPct) TROPHY.pct.ranged = +(tr.rangedPct * TROPHY.perKill).toFixed(1);
    this.trollHides = saved?.progression?.trollHides || 0; //     шкуры тролля (броня, TROLL_HIDE)
    this.boneCrowns = saved?.progression?.boneCrowns || 0; //     короны лича (урон, BONE_CROWN)
    this.lairTimers = Array.isArray(saved?.progression?.bosses) ? saved.progression.bosses : []; // через сколько секунд новый босс в логове i
    this.applyTalents();
    // В журнал — что загрузилось: если прогресс пропадёт, по журналу видно, где именно
    this.engine.log(saved ? `загружен мир (сохранён ${saved.savedAt || "?"}): уровень ${this.experience.level}, ${this.talentsSummary()}` : "сохранения нет — новый мир");
    if (p?.hp !== undefined) this.player.stats.hp = Math.min(p.hp, this.player.stats.maxHp); // здоровье из сохранения (максимум — с талантами)
    if (this.playerClass === "ranged") this.giveAmmoOnce(); // стрелок из старого сохранения — без патронов не останется

    // В старых сохранениях существ нет — расставляем заново
    const creatures = this.duel ? [] : Array.isArray(saved?.entities) ? saved.entities : DEFAULT_SPAWNS; // в дуэли — никого
    for (const d of creatures) this.spawn(d.type, d); // неизвестные типы (убрали из игры) spawn пропускает
    this.dropUnknownItems(); //                         и предметы, которых больше нет, — из их добычи тоже
    // Жители (НПС) — всегда в мире, даже в старых сохранениях
    if (!this.duel) for (const d of RESIDENTS) if (!this.entities.list.some((e) => e.type === d.type)) this.spawn(d.type, d);

    // Мобы появляются сами вокруг героя, в пределах прорисовки (правила — в config.js → SPAWN, MOB_MIX)
    const view = VIEW_DISTANCE; // где появляются мобы — не от настройки графики (DRAW DISTANCE), у всех одинаково
    // сервер (без своего героя) — вокруг случайного игрока
    const around = () => {
      if (!this.dedicated) return this.player.position;
      const list = this.heroes();
      return list.length ? list[Math.floor(Math.random() * list.length)].position : this.player.position;
    };
    // Не у героя под носом и не внутри построек (иначе физика вытолкнет моба на крышу)
    const far = (x, z) => (this.dedicated ? this.heroes() : [this.player]).some((h) => Math.hypot(x - h.position.x, z - h.position.z) < SPAWN.minPlayerDistance) || this.onStructure(x, z)
      || (!this.world.floor && !this.world.topBlock(Math.floor(x), Math.floor(z))); // летающие острова: не над бездной
    this.spawnRate = this.match ? MULTIPLAYER.spawn : 1; // матч: мобов больше (×1.3 чаще)
    this.spawner = new Spawner({
      ...SPAWN,
      interval: SPAWN.interval / this.spawnRate,
      around, radius: view, minRadius: SPAWN.minPlayerDistance,
      count: () => this.entities.list.filter((e) => e.kind === "mob" && e.alive && !e.boss).length, // босс логова не в счёт
      avoid: far,
      spawn: (x, z, index) => {
        // Кто — по долям MOB_MIX; каждый следующий крепче (config.js → SKELETON_GROWTH); в блоке — физика вытолкнет наверх
        const type = pickWeighted(MOB_MIX);
        const growth = mobGrowth(index);
        // Стрелок: оружие (камень / нож / пистолет) — по весам MOB_RANGED; в дальнем нашествии — каждый второй
        const kind = this.invasion?.active ? this.invasionKind : null;
        const ranged = Math.random() < (kind?.rangedShare ?? MOB_RANGED.chance);
        const e = this.spawn(type, { x, y: this.world.surfaceY(x, z), z, yaw: Math.random() * Math.PI * 2, ...growth, ranged }); // на земле (на холме — на вершине столбика)
        if (!e) return; // такого моба нет (например, игра обновилась, а модули — старые): пропускаем
        if (kind?.speed) e.speedBonuses.invasion = kind.speed; // быстрое нашествие: +30 % скорости
        this.maybeElite(e, index); // редкая элита с аурой и добычей (scene/elites.js)
        this.maybeChampion(e, index); // редкий минибосс — ЧУМНОЙ ВОЖАК (scene/mob-kinds.js)
        this.scaleWardens(); // мобы крепчают — и страж тоже
        this.scaleBoars(); //   и кабаны
        this.engine.log(`появился ${e.name} №${index + 1}: ${x.toFixed(1)}, ${z.toFixed(1)}, +${growth.bonusHp} HP, урон ×${growth.damageMult.toFixed(2)} +${growth.bonusDamage}, удар ${e.attack?.damage}${e.rangedDamage ? `, бросок ${e.rangedDamage}` : ""}`);
      },
    });
    this.spawner.spawned = saved?.spawned || 0; // счёт продолжается после загрузки
    this.scaleWardens(); //                        страж — под этот счёт
    this.scaleBoars(true); //                      кабаны тоже (здоровье — как в сохранении)
    // Поставленные ловушки (атаки собираем заново по виду)
    for (const t of Array.isArray(saved?.traps) ? saved.traps : []) if (TRAPS[t.type]) if (!t.tilt) this.placeTrapAt(t.type, t, { yaw: t.yaw, age: t.age }); // ловушек на стенах больше нет
    // Кабаны — редко (BOARS.chance), и не больше BOARS.max диких
    this.boarSpawner = new Spawner({
      ...BOARS,
      around, radius: view, minRadius: SPAWN.minPlayerDistance,
      count: () => this.entities.list.filter((e) => e.type === "boar").length,
      avoid: far,
      spawn: (x, z) => {
        const b = this.spawn("boar", { x, y: this.world.surfaceY(x, z), z, yaw: Math.random() * Math.PI * 2 });
        this.scaleBoars();
        this.engine.log(`появился кабан: ${x.toFixed(1)}, ${z.toFixed(1)}, ${b?.stats.maxHp} HP`);
      },
    });

    // Нашествие (движок: RandomEvent): изредка все мобы бегут на героя, спавн чаще (config.js → INVASION)
    this.invasion = new RandomEvent({
      ...INVASION,
      id: "invasion",
      onStart: () => {
        this.spawner.interval = SPAWN.interval / INVASION.spawnSpeed / this.spawnRate;
        this.spawner.max = INVASION.max;
        // Какое нашествие: обычное / быстрое (все мобы +30 % скорости) / дальнее (половина новых — стрелки)
        const id = pickWeighted(Object.fromEntries(Object.entries(INVASION.types).map(([k, t]) => [k, t.weight])));
        this.invasionKind = { id, ...INVASION.types[id] };
        if (this.invasionKind.speed) for (const e of this.entities.list) if (e.kind === "mob" && !e.boss) e.speedBonuses.invasion = this.invasionKind.speed;
        this.engine.sound.play("growl");
        this.engine.toast(`${this.invasionKind.name}! ALL MOBS ARE COMING FOR YOU`, 3500);
        this.engine.log(`нашествие №${this.invasion.count} (${this.invasionKind.id}): спавн раз в ${this.spawner.interval.toFixed(2)} с, до ${INVASION.max} мобов`);
      },
      onEnd: () => {
        this.spawner.interval = SPAWN.interval / this.spawnRate;
        this.spawner.max = SPAWN.max;
        for (const e of this.entities.list) delete e.speedBonuses.invasion; // быстрое нашествие кончилось — обычная скорость
        this.engine.sound.play("levelup");
        this.engine.toast("INVASION REPELLED", 2500);
        this.engine.log("нашествие закончилось");
      },
    });

    this.abilities.select(0, this); // начинаем с руки
    this.syncEye();
    this.engine.onStats = (s) => this.showStats(s);
    if (saved) this.engine.toast("WORLD LOADED");
    this.startNet(); // сетевая игра: хост — слушать гостей, гость — подключиться и получить мир хоста
    if (this.duel) { // дуэль: ни мобов, ни кабанов, ни нашествий
      this.spawner.max = 0;
      this.boarSpawner.max = 0;
      this.invasion.every = Infinity;
      this.startDuel();
    }
  }

  exit() {
    this.engine.sound.environment = null;
    this.game.models.lightAt = null;
    this.resetDaylight();
    this.clearUrns?.(); // урны матча (scene/coop.js)
    this.net?.close(); // сетевая игра — закрыть (гости отключатся / мы отключимся от хоста)
    this.net = null;
    this.engine.alwaysLive = false;
    this.ultimate?.detach(); // перестать слушать журнал боя
    for (const e of this.entities.list) this.game.models.detach(e);
    this.pickups.clear();
    this.projectiles.clear();
    this.traps.clear();
    for (const vm of this.viewModels.values()) vm.dispose();
    this.entities.clear();
    this.engine.onStats = null;
  }

  onQuit() {
    this.save(false); // закрыли окно посреди игры — ничего не теряем
  }

  // Коротко о талантах для журнала: «очков 2, таланты: aim 3, regen 2…»
  talentsSummary() {
    const ranks = Object.entries(this.talents.ranks).map(([id, r]) => `${id} ${r}`).join(", ");
    return `очков ${this.talents.points}, таланты: ${ranks || "нет"}`;
  }

  // Сохранение — с замером (профайлер F3: SAVE): самое тяжёлое из редкого.
  // background — в фоне (автосохранение: игра не ждёт диска); иначе — сразу до конца (выход, кнопка SAVE)
  save(toast = true, { background = false } = {}) {
    return profiler.measure(PROF.save, () => this.saveNow(toast, { background }));
  }

  saveNow(toast = true, { background = false } = {}) {
    if (this.dead) return; // погибли — мир уже удалён, сохранять нечего
    if (this.match) return; // матч — мир на один раз, ничего не пишем
    const creatures = this.entities.list.filter((e) => e !== this.player && e.alive && !e.boss && !e.elite && e.type !== "steed"); // элиту не сохраняем // маунт не сохраняем // боссов не сохраняем (босс появится в логове заново)
    const progression = { class: this.playerClass, subclass: this.subclass || null, upgrades: { ...(this.upgrades || {}) }, run: this.runStatsJSON(), quests: this.questsJSON(), mount: !!this.hasMount, dayTime: this.dayTime ?? null, ammoGiven: !!this.ammoGiven, experience: this.experience.toJSON(), talents: this.talents.toJSON(), trophies: { hp: TROPHY.hp, pct: { ...TROPHY.pct } }, shop: this.shop.toJSON(), trollHides: this.trollHides, boneCrowns: this.boneCrowns, ultimate: this.ultimate.charge, bosses: this.lairTimers };
    this.autosaveIn = AUTOSAVE.every; // только что сохранились — следующее автосохранение отсчитываем заново
    if (this.role === "client") {
      // гость: мир — хоста (его не пишем), свой прогресс и вещи — в своё сохранение
      const ok = saveGuestProgress({ player: this.player, progression });
      this.engine.log(ok ? "гость: прогресс сохранён в своё сохранение" : "гость: своего сохранения нет — прогресс некуда записать");
      if (toast) this.engine.toast(ok ? "PROGRESS SAVED" : "NO OWN SAVE - PROGRESS NOT SAVED");
      return;
    }
    const r = saveGame({ background, world: this.world, player: this.player, look: this.look, creatures, progression, spawned: this.spawner.spawned, pickups: this.pickups.toJSON(), traps: this.traps.toJSON(), fog: this.fog.toJSON(), worldgen: this.terrain ? { seed: this.terrain.seed, terrain: this.terrainParams || TERRAIN_V1, ...(this.arena ? { arena: this.arena } : {}), ...(this.treasure ? { treasure: this.treasure } : {}) } : null });
    const what = `${r.blocks} блоков, записано кусков ${r.chunks} (${(r.bytes / 1024).toFixed(0)} КБ)${r.removed ? `, убрано ${r.removed}` : ""}${background ? ", в фоне" : ""}`;
    if (!background) console.log(`Сохранено: ${what} -> ${SAVE_DIR}`);
    this.engine.log(`сохранено${background ? " (авто)" : ""}: ${what}, уровень ${this.experience.level}, ${this.talentsSummary()}`);
    if (toast) this.engine.toast("SAVED");
  }
}
