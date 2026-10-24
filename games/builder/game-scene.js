// ============================================================
//  Сцена «мир» игры «Стройка». Здесь только ПРАВИЛА игры:
//  что делают способности, когда скелет бьёт и умирает, что выпадает,
//  что сохраняется и что бывает, когда игрок погиб.
//  Всё «как» — физика, камера, модели, способности, миникарта, меню — берём у движка.
// ============================================================

import {
  Scene, Vec3, Camera, CameraRig, VoxelWorld, EntityManager, Physics, CharacterController,
  MenuScene, InventoryScene, TalentScene, MapScene, Input, KEYS, ViewModel, Spawner, AbilityBar, Experience, Talents, flatDamage, damageMultiplier, onlyFor, DamageNumbers, Shop, ShopScene, Inventory, Aim, Recoil, Zones, KamikazeBrain, TurretBrain, Charge, MeleeAttack, MagicAttack, Damage, stun, lifesteal, cooldownReduction, buff,
  mount, dismount, updateRider, parry, Pickups, Projectiles, buildHouse, buildCratePile, buildTower, scatter, randomInt, seededRandom, Terrain, flattenArea, buildTree, RandomEvent, SlashEffects, critCooldown,
  HeadBob, Traps, TrapAttack, BeamEffects, DelayedStrikes, Slow, withStatus, viewBasis, toWorld, grow, growth, aimArc, ChoiceScene,
} from "../../engine/index.js";
import { PALETTE, PLAYER, REACH, SPAWN, PROGRESSION, AIM, MOB_MIX, BOARS, SHOP, WARDEN_GROWTH, ATTACKS, HEARING, BUILD, PICKUP_REACH, PICKUP_AUTO_RADIUS, WORLDGEN, INVASION, BOAR_GROWTH, LIFETIME, BLOCK, THROW, KATANA_IAI, BOAR_SCALE, TRAPS, MOB_RANGED, CLASSES, COMMON_TABS, FROST, CLIPS, MANA, MUSHROOMS, EMPOWER, METEOR_REPEAT, SPARKS, MINION, MIST, AUTO_TRAP, TURRET, TERRAIN_V1, HAMMER_SHAKE, HAMMER, SPEAR, BULLET, BOSS, TROLL_HIDE, BLOATER, LICH, BONE_CROWN, HEALER } from "./config.js";
import { TALENT_TREE, TROPHY, TROPHY_TALENTS } from "./talents.js";
import { CREATURES, DEFAULT_SPAWNS, RESIDENTS, createCreature, mobGrowth, modelFor, makePet } from "./creatures.js";
import { HandAbility, HeldItemAbility, ABILITY_FOR_ITEM, IN_HAND } from "./abilities.js";
import { itemInfo, itemName, ITEMS, maxStack, isWeapon, isUsable, hotbarAccepts, slotOf, REMOVED_ITEMS, HOTBAR_SLOTS } from "./items.js";
import { saveGame, loadGame, deleteSave, SAVE_FILE } from "./save.js";
import { drawHud, SCOPE } from "./hud.js";

// Пока открыта панель цветов, цифры выбирают цвет (а не способность)
const DIGIT_KEYS = [KEYS["1"], KEYS["2"], KEYS["3"], KEYS["4"], KEYS["5"]];
const INTERACT_REACH = 3; // как далеко дотягиваемся до зверя (метры)
const NO_INPUT = { isDown: () => false }; // «никаких клавиш» — для героя под живым окном
const CORPSE_TIME = 1.2; //  секунд павший лежит, прежде чем исчезнуть
const MINIMAP_FPS = 10; //   сколько раз в секунду обновлять миникарту

export class GameScene extends Scene {
  // game — общее для всей игры: { models, openSettings(), toMenu() }
  constructor(game) {
    super();
    this.realtime = true;
    this.captureMouse = true;
    this.game = game;

    this.world = new VoxelWorld();
    this.entities = new EntityManager();
    this.physics = new Physics({ isSolid: (x, y, z) => this.world.isSolid(x, y, z) });
    // Мир для поиска пути существ: те же твёрдые клетки + «номер версии» (поставили блок — пересчитать путь)
    this.navWorld = { isSolid: this.physics.isSolid, version: () => this.world.version };
    // Предметы на земле (движок: Pickups) — падают на блоки, крутятся; модель — «item-<id>» (main.js)
    this.pickups = new Pickups({
      physics: this.physics,
      lifetime: LIFETIME.pickup, // пролежал 2 минуты — исчезает
      onAdd: (p) => game.models.attach(p, "item-" + p.item),
      onRemove: (p) => game.models.detach(p),
    });
    this.lookPickup = null; // предмет на земле под прицелом
    // Снаряды (броски мобов-метателей, магма, споры, граната): летят по дуге или прямо, попал — урон.
    // У своих снарядов — свои onHit / onLand (game-scene: магма, турель, граната)
    this.projectiles = new Projectiles({
      world: this.world, entities: this.entities, gravity: THROW.gravity,
      onAdd: (p) => game.models.attach(p, "item-" + p.item),
      onRemove: (p) => game.models.detach(p),
      onHit: (p, hit) => {
        p.attack.hit(p.owner, hit.entity, this.combatContext({ part: hit.part, baseDamage: p.damage, onHit: (r) => this.onPlayerHit(r) }));
        this.engine.sound.play("hit", { at: hit.entity.position });
      },
      onLand: (p) => this.engine.sound.play("pickup", { at: p.position, volume: 0.5 }),
    });
    // Ловушки героя (движок: Traps): стоят на земле, бьют врагов, которые в них зашли
    this.traps = new Traps({
      onAdd: (t) => game.models.attach(t, "item-" + t.type),
      onRemove: (t) => game.models.detach(t),
      onTrigger: (t, r) => {
        this.engine.sound.play(t.type === "bear-trap" ? "snap" : "spike", { at: t.position });
        const self = r.hits.find((h) => h.target === this.player);
        if (self) {
          this.engine.sound.play("hurt");
          this.engine.toast(`YOUR OWN TRAP! -${self.dealt} HP`, 1500);
          this.engine.log(`герой наступил на свою ловушку ${t.type}: -${self.dealt}`);
        }
        // Талант SKELETON (засадник): из сработавшего капкана выбегает скелет-камикадзе
        if (t.type === "bear-trap" && this.talentStats.minion && r.hits.some((h) => h.target !== this.player)) {
          this.spawnMinion(t.position, Math.max(...r.hits.map((h) => h.damage.amount)));
        }
      },
    });
    this.beams = new BeamEffects(); // лучи: ледяная стрела, искры взрыва, круги посоха огня
    this.strikes = new DelayedStrikes(); // отложенные удары: солнечный удар посоха огня
    this.spearRun = new Charge(SPEAR.charge); // разбег с копьём (ПКМ): движок — бег вперёд и поворот взглядом
    this.spearCd = 0;
    this.look = new Camera(); //   глаза героя: где и куда смотрит
    this.rig = new CameraRig(); // откуда показываем: из глаз или из-за плеча

    // Способности: 5 ячеек — это хотбар героя (5 ячеек внизу инвентаря). Что за предмет
    // лежит в ячейке, такая и способность (abilities.js → ABILITY_FOR_ITEM); пусто — кулак.
    this.abilities = new AbilityBar(3); // хотбар: оружие слева (Q), средняя ячейка (2), оружие справа (E)
    this.hand = new HandAbility();
    this.abilityCache = new Map(); // предмет → его способность (своя перезарядка, не пересоздаём)
    this.shop = this.makeShop();

    // Развитие героя: опыт → уровни → очки талантов (правила — в движке, содержимое — talents.js)
    this.experience = new Experience(PROGRESSION);
    this.talents = new Talents(TALENT_TREE);

    this.colorIndex = 0;
    this.paletteOpen = false; // панель цветов стройки (E)
    this.viewModels = new Map(); // модели «для экрана»: имя -> ViewModel (создаём, когда понадобится)
    this.viewModelName = null; //   какая сейчас в руке
    this.target = null; //     куда смотрит прицел в стройке: { block, place, t }
    this.ghost = null; //      «призрак» блока
    this.lookTarget = null; // существо под прицелом
    this.aiming = false; //    прицеливаемся (ПКМ с пистолетом)
    this.aimT = 0; //          0 — у бедра, 1 — прицелились (плавно)
    this.aimToggle = false; // режим «переключать»: прицел включён нажатием ПКМ
    this.aimBlocked = false; // сменили оружие с зажатой ПКМ — прицел только после того, как отпустишь
    this.baseFov = this.look.fov;
    this.aim = new Aim(); // прицеливание: приближение и мышь (движок)
    this.recoil = new Recoil(); // отдача оружия (движок): схема бросков у каждого своя
    this.damageNumbers = new DamageNumbers(); // цифры урона над целями (движок)
    this.slashes = new SlashEffects(); //         белые следы ударов по хитбоксу (движок)
    this.bob = new HeadBob(); // покачивание головы при ходьбе и беге (движок)
    this.zones = new Zones(); //   лужи магмы, ядовитый туман (движок: зоны на земле)
    this.talentStats = {}; //       правила из талантов (applyTalents)
    this.empowerTimer = 0; //       EMPOWER (маг): копится до 30 с
    this.autoTrapTimer = Infinity; // REFLEX TRAP (засадник): с последней ловушки-рефлекса
    this.rifleShots = 0; //         GRENADE (стрелок): выстрелы автомата подряд
    this.levelFlash = 0; //    золотая вспышка при новом уровне (1 → 0)
    this.hudKey = ""; //       что показывает HUD — чтобы перерисовывать только при изменении
    this.minimapTimer = 0;
    this.hitMarker = 0; //     секунд показывать отметку попадания
    this.dead = false;
  }

  get settings() {
    return this.engine.settings.data;
  }

  get building() {
    return this.abilities.current?.id === "build";
  }

  // ---------- Вход и выход ----------

  enter() {
    Object.assign(this.engine.sound.hearing, HEARING); // объёмный звук: радиус слышимости и затухание (config.js)
    const saved = loadGame(); // null — нового мира ещё нет
    if (saved) this.world.loadFrom(saved.blocks);
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
    if (!saved) this.generateWorld(); // новый мир: рельеф, постройки, деревья
    // Камни и прочее на земле. В сохранениях до камней их нет — разбрасываем, чтобы было из чего строить
    if (Array.isArray(saved?.pickups)) this.pickups.loadFrom(saved.pickups);

    const p = saved?.player;
    this.player = this.spawn("player", p || { x: 0, y: 0, z: 0 });
    this.player.enableMana(MANA.max, MANA.regen); // мана — для заклинаний (MAGE); у сущности движка
    if (p?.mana !== undefined) this.player.stats.mana = Math.min(MANA.max, p.mana);
    // Патроны стволов — из сумки (движок: RangedAttack.reserve)
    // Обоймы стволов — из сумки, у каждого ствола свои (движок: RangedAttack.reserve.swap; CLIPS) — clipReserve
    if (p) {
      this.look.yaw = p.yaw;
      this.look.pitch = p.pitch;
    }
    this.controller = new CharacterController(this.player, this.engine.input, this.physics, PLAYER);
    // Блок отбил удар (движок: статус parry → entity.onBlock) — «дзынь» и надпись
    this.player.onBlock = (d) => {
      this.engine.sound.play("parry");
      this.blockFlash = 0.6;
      this.engine.log(`блок: отбит удар ${d.source?.name || "?"} (${Math.round(d.amount)})`);
    };
    this.experience.loadFrom(saved?.progression?.experience);
    this.talents.loadFrom(saved?.progression?.talents);
    // Хотбар — 3 ячейки: по краям оружие (Q / E), в середине — стройка, аптечка, грибы (items.js → slot).
    // В старых сохранениях ячеек было 5 и клали что угодно: что не подходит — в сумку (не влезло — на землю)
    // У ПРИЗЫВАТЕЛЯ в средней ячейке можно держать и ловушки (Q/E у него — навыки, не оружие)
    this.player.hotbar = new Inventory(3, maxStack, (i, id) => hotbarAccepts(i, id) || (i === 1 && this.playerClass === "beast" && id in TRAPS));
    this.migrateHotbar(p?.hotbar);
    this.syncAbilities();
    this.shop.loadFrom(saved?.progression?.shop);
    // Класс героя: пока не выбран — открыты только общие вкладки талантов и раздел «ПРОЧЕЕ» магазина
    this.playerClass = CLASSES[saved?.progression?.class] ? saved.progression.class : null;
    this.ammoGiven = !!saved?.progression?.ammoGiven;
    this.applyClass();
    // Очки во вкладках чужих классов (старые сохранения, перестройка дерева) — обратно
    if (this.playerClass) {
      let back = 0;
      for (const [id, c] of Object.entries(CLASSES)) if (id !== this.playerClass) back += this.talents.refundTab(c.tab);
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
    const creatures = Array.isArray(saved?.entities) ? saved.entities : DEFAULT_SPAWNS;
    // Мобы из старых сохранений росли уроном «цифрой» (+1 за каждые 5) — пересчитываем по новым правилам (проценты)
    const legacy = (d) => (d.damageMult === undefined && (d.type === "skeleton" || d.type === "zombie") ? (({ damageMult, bonusDamage }) => ({ damageMult, bonusDamage }))(mobGrowth(saved?.spawned || 0)) : {});
    for (const d of creatures) this.spawn(d.type, { ...d, ...legacy(d) });
    // Жители (НПС) — всегда в мире, даже в старых сохранениях
    for (const d of RESIDENTS) if (!this.entities.list.some((e) => e.type === d.type)) this.spawn(d.type, d);
    // Приручённые звери помнят хозяина (в сохранении — только его тип)
    for (const e of this.entities.list) {
      if (e.taming?.ownerType !== "player") continue;
      e.taming.owner = this.player;
      e.leader = this.player; // ходит за героем
    }

    // Мобы появляются сами вокруг героя, в пределах прорисовки (правила — в config.js → SPAWN, MOB_MIX)
    const view = this.engine.renderer?.fadeDist || 60; // дальность прорисовки
    const around = () => this.player.position;
    // Не у героя под носом и не внутри построек (иначе физика вытолкнет моба на крышу)
    const far = (x, z) => Math.hypot(x - this.player.position.x, z - this.player.position.z) < SPAWN.minPlayerDistance || this.onStructure(x, z);
    this.spawner = new Spawner({
      ...SPAWN,
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
        if (kind?.speed) e.speedBonuses.invasion = kind.speed; // быстрое нашествие: +30 % скорости
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
      count: () => this.entities.list.filter((e) => e.type === "boar" && !e.taming?.tamed).length,
      avoid: far,
      spawn: (x, z) => {
        const b = this.spawn("boar", { x, y: this.world.surfaceY(x, z), z, yaw: Math.random() * Math.PI * 2 });
        this.scaleBoars();
        this.engine.log(`появился кабан: ${x.toFixed(1)}, ${z.toFixed(1)}, ${b?.stats.maxHp} HP`);
      },
    });

    // Грибы растут на земле — только у класса SUMMONER (ими приручают кабанов)
    this.mushroomSpawner = new Spawner({
      ...MUSHROOMS,
      around,
      count: () => (this.playerClass === "beast" ? this.pickups.count("mushroom") : Infinity),
      avoid: (x, z) => this.onStructure(x, z),
      spawn: (x, z) => this.pickups.add("mushroom", 1, { x, y: this.world.surfaceY(x, z), z }),
    });

    // Нашествие (движок: RandomEvent): изредка все мобы бегут на героя, спавн чаще (config.js → INVASION)
    this.invasion = new RandomEvent({
      ...INVASION,
      id: "invasion",
      onStart: () => {
        this.spawner.interval = SPAWN.interval / INVASION.spawnSpeed;
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
        this.spawner.interval = SPAWN.interval;
        this.spawner.max = SPAWN.max;
        for (const e of this.entities.list) delete e.speedBonuses.invasion; // быстрое нашествие кончилось — обычная скорость
        this.engine.sound.play("levelup");
        this.engine.toast("INVASION REPELLED", 2500);
        this.engine.log("нашествие закончилось");
      },
    });

    // Приручённые кабаны: таланты вкладки КАБАН (здоровье из сохранения не трогаем)
    this.applyPetTalents(true);

    this.abilities.select(0, this); // начинаем с руки
    this.syncEye();
    this.engine.onStats = (s) => this.showStats(s);
    if (saved) this.engine.toast("WORLD LOADED");
  }

  exit() {
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

  save(toast = true) {
    if (this.dead) return; // погибли — мир уже удалён, сохранять нечего
    const creatures = this.entities.list.filter((e) => e !== this.player && e.alive && e.type !== "minion" && !e.boss); // камикадзе и боссов не сохраняем (босс появится в логове заново)
    const progression = { class: this.playerClass, ammoGiven: !!this.ammoGiven, experience: this.experience.toJSON(), talents: this.talents.toJSON(), trophies: { hp: TROPHY.hp, pct: { ...TROPHY.pct } }, shop: this.shop.toJSON(), trollHides: this.trollHides, boneCrowns: this.boneCrowns, bosses: this.lairTimers };
    const count = saveGame({ world: this.world, player: this.player, look: this.look, creatures, progression, spawned: this.spawner.spawned, pickups: this.pickups.toJSON(), traps: this.traps.toJSON(), worldgen: this.terrain ? { seed: this.terrain.seed, terrain: this.terrainParams || TERRAIN_V1, ...(this.arena ? { arena: this.arena } : {}) } : null });
    console.log(`Сохранено: ${count} блоков -> ${SAVE_FILE}`);
    this.engine.log(`сохранено: ${count} блоков, уровень ${this.experience.level}, ${this.talentsSummary()}`);
    if (toast) this.engine.toast("SAVED");
  }

  // ---------- Сущности ----------

  spawn(type, data) {
    const e = createCreature(type, data);
    if (!e) return null;
    // Урон от героя (удар, выстрел, горение) — цифрой над целью: хедшот — крупно и красным, огонь — оранжевым
    e.onDamage = (d, dealt) => {
      if (d.source !== this.player || e === this.player || this.settings.general.damageNumbers === false) return;
      const head = d.part === "head";
      const color = head ? [255, 70, 60] : d.tags.has("dot") ? [255, 150, 60] : d.tags.has("crit") ? [255, 210, 80] : [255, 245, 220];
      const y = e.height + (head ? 0.45 : 0.25); // над головой — не закрывает прицел
      this.damageNumbers.add(e, { x: e.position.x, y: e.position.y + y, z: e.position.z }, dealt, { color, big: head || d.tags.has("crit") });
    };
    this.entities.add(e);
    this.game.models.attach(e, modelFor(e));
    if (e.ranged) this.game.models.hold(e, e.ranged.held, IN_HAND); // метатель: в руке то, что бросает
    if (e.type === "bloater") {
      e.onPrime = (b) => this.engine.sound.play("growl", { at: b.position, volume: 1 }); // зашипел — сейчас рванёт
      e.onBoom = (b) => this.bloaterBoom(b);
    }
    return e;
  }

  removeEntity(e) {
    this.game.models.detach(e);
    this.entities.remove(e);
  }

  // Глаза — на eyeHeight выше ног; герой повёрнут туда же, куда смотрит
  syncEye() {
    this.look.position = this.player.position.add(new Vec3(0, PLAYER.eyeHeight, 0));
    this.player.yaw = this.look.yaw;
    this.look.roll = 0; // камера не кренится и не качается — на ходу качается предмет в руке (как в Minecraft)
  }

  updateRig() {
    this.rig.mode = this.settings.general.cameraMode;
    return this.rig.update(this.look, (o, d, max) => this.world.raycast(o, d, max)?.t ?? null);
  }

  // Модель «для экрана» текущей способности. Сменилась — рука поднимается снизу (Equip).
  viewModel() {
    const name = this.abilities.current?.viewModelName(this);
    if (!name) return null;
    if (!this.viewModels.has(name)) this.viewModels.set(name, new ViewModel(this.game.models, name));
    const vm = this.viewModels.get(name);
    if (name !== this.viewModelName) {
      this.viewModelName = name;
      vm.play("Equip");
    }
    return vm;
  }

  // ---------- Кадр ----------

  // background — под «живым» окном (карта, таланты, магазин, инвентарь): мир идёт, но клавиши и мышь
  // героя не читаем (стоит на месте, не стреляет)
  update(dt, { background = false } = {}) {
    const { engine, player } = this;
    this.background = background;
    const input = background ? NO_INPUT : engine.input;
    this.controller.input = input;
    if (this.rideController) this.rideController.input = input;
    // Старое сохранение (уровень уже есть, а класса нет) — выбрать класс сразу при входе в мир
    if (!this.classChecked) {
      this.classChecked = true;
      if (!this.playerClass && this.experience.level > 1) return this.askClass();
    }

    // 0. Способность в руках: прицеливание, замедление от оружия
    this.abilities.update(dt, this, input); // с input — зажатая ЛКМ повторяет удар/выстрел
    // (плавность прицела — в this.aim, см. ниже)
    // Прицел (движок: Aim) — приближение и мышь задаёт оружие в руках; ползунок в настройках — общий множитель
    const weaponAim = this.abilities.current?.aim;
    this.aim.update(dt, this.aiming && !!weaponAim, weaponAim || {}, (this.settings.controls.aimSensitivity ?? 100) / 100);
    this.aimT = this.aim.t;
    this.look.fov = this.aim.fov(this.baseFov); // приближение
    // Оптика: прицелились до конца от 1-го лица — круг прицела вместо модели винтовки (hud.js)
    this.scoped = !!this.abilities.current?.scope && this.aimT > 0.92 && this.rig.mode !== "third";
    player.speedBonuses.weapon = this.abilities.current?.moveSpeed || 0; // оружие в руках
    player.speedBonuses.aim = this.aiming ? AIM.moveSpeed : 0; //            прицеливание

    // 1. Мышь крутит взгляд (в прицеле — медленнее, под приближение), клавиши двигают героя
    const m = background ? (engine.mouse.consume(), { dx: 0, dy: 0 }) : engine.mouse.consume();
    // В прицеле мышь медленнее — сколько, решает оружие (engine/input/aim.js)
    const zoom = this.aim.mouseScale();
    this.look.rotate(m.dx * zoom, (this.settings.controls.invertY ? -m.dy : m.dy) * zoom);
    // Отдача: бросок ствола после выстрела и плавный возврат (rotate: dy > 0 — вниз, поэтому минус)
    const kick = this.recoil.update(dt);
    if (kick.pitch || kick.yaw) this.look.rotate(kick.yaw, -kick.pitch);
    // Покачивание головы: скорость по земле, на земле ли, бежим ли (верхом — по скакуну)
    const body = player.mount || player;
    this.bob.update(dt, Math.hypot(body.velocity.x, body.velocity.z), body.onGround, engine.input.isDown("run"));
    let move;
    if (player.mount) {
      // Верхом: клавиши ведут скакуна (его контроллер), герой сидит в седле
      const steed = player.mount;
      move = this.rideController.update(dt, this.look.yaw);
      steed.yaw = this.look.yaw;
      updateRider(player);
      steed.view?.animator.setBase(move.moving ? "Walk" : "Idle", move.moving ? move.speed / 3 : 1);
    } else {
      this.hammerControl(dt); // удар молотом: медленнее ходим, быстрее падаем; JUMP SLAM — прыжок выше
      this.spearControl(dt); //  разбег с копьём: поворот, разгон, кого насадили
      move = this.controller.update(dt, this.look.yaw);
    }
    this.syncEye();
    engine.sound.setListener(this.look.position, this.look.yaw); // «уши» — в глазах героя (объёмный звук)
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.blockCooldown = Math.max(0, (this.blockCooldown || 0) - dt);
    this.blockFlash = Math.max(0, (this.blockFlash || 0) - dt);
    this.damageNumbers.update(dt);
    this.levelFlash = Math.max(0, this.levelFlash - dt);
    // Кулдауны атак идут, даже если способность не в руке. Каждую атаку — ОДИН раз за кадр:
    // рука (кулак) лежит сразу во всех пустых ячейках, и раньше её перезарядка шла в 2–4 раза быстрее
    for (const a of new Set(this.abilities.slots)) {
      const atk = a?.attack;
      if (!atk) continue;
      const was = atk.reloading;
      atk.update(dt);
      // Перезарядка закончилась у оружия в руках — «клац»
      if (was && !atk.reloading && a === this.abilities.current) this.engine.sound.play("reloaded");
    }
    this.slashes.update(dt);

    // 2. Анимации героя: тело «для мира» и рука «для экрана»
    // От 3-го лица: оружие в руке (или катана на бедре), руки держат его (слой поверх ходьбы)
    const heldNow = this.abilities.current?.held || null;
    this.game.models.hold(player, heldNow?.model ?? null, heldNow || {});
    player.view?.animator.setOverlay(heldNow?.pose ?? null);
    player.roll = player.mount ? 0 : -this.look.roll;
    if (player.mount) player.view?.animator.setBase("Sit"); // в седле — сидим
    else if (this.spearRun.active) player.view?.animator.setBase("Walk", this.spearRun.speed / 4); // разбег — бежим
    else player.view?.animator.setBase(move.moving ? "Walk" : "Idle", move.moving ? move.speed / 4 : 1);
    const walking = move.moving && player.onGround && this.aimT < 0.5; // в прыжке и в прицеле рука не качается
    const vm = this.viewModel();
    // Рука на ходу не машет своей анимацией — её покачивает HeadBob.hand (дугой, как в Minecraft)
    vm?.setBase(this.spearRun.active ? "Charge" : this.aimT > 0.5 ? "Aim" : "Idle", 1);
    if (vm) vm.sway = this.settings.general.headBob !== false ? this.bob.hand() /* сила сама плавно гаснет, когда стоишь */ : { x: 0, y: 0, z: 0, roll: 0 };
    if (vm) {
      vm.aim = this.aimT; // пистолет — к центру экрана, мушка — в прицел
      vm.aimOffset = AIM.offset;
    }
    vm?.update(dt);

    // 3. Существа: появляются, думают, ходят, бьют; павшие исчезают
    this.spawner.update(dt);
    // Дикие кабаны: у призывателя — чаще и больше (BOARS.summoner)
    Object.assign(this.boarSpawner, this.playerClass === "beast" ? BOARS.summoner : { interval: BOARS.interval, chance: BOARS.chance, max: BOARS.max });
    this.boarSpawner.update(dt);
    this.mushroomSpawner.update(dt);
    this.invasion.update(dt);
    this.growPets(dt);
    this.pickups.update(dt); // предметы на земле падают и крутятся
    this.projectiles.update(dt); // брошенное летит
    this.traps.update(dt, this.combatContext()); // ловушки ловят
    // Автоподбор (V — вкл/выкл): всё, что лежит рядом, само попадает в сумку
    // Верхом — тоже (собираем вокруг кабана)
    if (this.settings.general.autoLoot !== false && player.alive) {
      this.pickups.autoCollect(player.mount || player, PICKUP_AUTO_RADIUS, (p) => this.pickUp(p, { quiet: true }));
    }
    this.beams.update(dt);
    this.strikes.update(dt);
    this.updateLairs(dt); // боссы в логовах: появление, через 3 мин после гибели — новый
    this.bossWarnings(); // замах тролля — красный круг на земле
    this.updateHealers(dt); // целебные грибы лечат героя и призванных
    this.updateTurrets(dt); // саженцы турелей растут
    this.drawBoarMark(); //   красная метка над целью кабанов
    this.zones.update(dt, this.entities.list); // лужи магмы, ядовитый туман
    this.updateClassTalents(dt);
    if (this.abilities.current?.id === "fire-staff" && player.alive && this.engine.scene === this) this.previewStrike(this.abilities.current.attack);
    if (this.abilities.current?.id === "magma-stone" && player.alive && this.engine.scene === this) this.previewMagma(this.abilities.current.attack);
    // Что «мозги» существ знают о мире (engine/ai/brain.js)
    const ai = {
      entities: this.entities.list,
      navWorld: this.navWorld,
      hunt: this.invasion.active ? player : null, // нашествие: все мобы — на героя
      shoot: (e, target, attack) => (e.ranged.hitscan ? this.mobGunshot(e, target, attack) : this.mobThrow(e, target, attack)), // стрелок (HostileBrain ranged)
      combatFor: (e) => ({
        entities: this.entities.list, // сплеш: кого ещё задел взмах
        blocked: (owner, target) => this.blockedBetween(owner, target),
        onUse: () => {
          e.view?.animator.playOnce("Attack"); // замах
          engine.sound.play("swing", { at: e.position }); // объёмный: слышно, откуда замахнулись
        },
        onSlam: (c, r) => this.bossSlam(c, r), // тролль ударил дубиной о землю (SlamAttack)
        onHit: (hit) => {
          if (hit.target === player && !hit.blocked) engine.sound.play("hurt"); // по нам — «в голове» (отбили — свой звук)
          else engine.sound.play("hit", { at: hit.target.position });
          engine.log(`${e.name} → ${hit.target.name}: ${hit.damage.attack.name} -${hit.dealt} HP (осталось ${hit.target.stats.hp})`);
        },
      }),
    };
    for (const e of [...this.entities.list]) {
      if (e === player) continue;
      if (!e.alive) {
        // Погиб — от чего угодно (удар, выстрел, горение...): добыча — один раз
        if (!e.looted) {
          e.looted = true;
          engine.sound.play("mobDeath", { at: e.position });
          this.onDeath(e);
        }
        if (e.deadTime > CORPSE_TIME) this.removeEntity(e);
        continue;
      }
      // Ушёл слишком далеко — исчезает: спокойный моб (или живёт дольше 2 минут) и дикий кабан — дальше
      // despawnDistance, злой моб — дальше huntDespawn (отстал от героя). Злых нашествия не трогаем
      const dist = Math.hypot(e.position.x - player.position.x, e.position.z - player.position.z);
      const wildBoar = e.type === "boar" && !e.taming?.tamed && !e.rider;
      const gone = e.boss ? false : e.kind === "mob"
        ? (!e.aggro && (dist > SPAWN.despawnDistance || e.age > LIFETIME.mob)) || (dist > SPAWN.huntDespawn && !this.invasion.active)
        : wildBoar && dist > SPAWN.despawnDistance;
      if (gone) {
        this.engine.log(`${e.name} ушёл далеко (${dist.toFixed(0)} м) — исчез`);
        this.removeEntity(e);
        continue;
      }
      if (e.taming && e.lastHitBy === player) e.taming.refuse(); // ранили — больше не приручить
      if (e.rider) continue; // под седлом: ведёт всадник (выше), сам не думает
      // Думает сам — «мозги» из движка (engine/ai): мобы охотятся, НПС гуляют
      // Заморожен / оглушён (статус со stun) — стоит и не бьёт; перезарядка атаки идёт
      if (e.stunned) {
        e.velocity.x = 0;
        e.velocity.z = 0;
        e.attack?.update(dt);
      }
      const { walking: going, alerted } = !e.stunned && e.brain ? e.brain.update(e, ai, dt) : { walking: false, alerted: [] };
      if (alerted.length > 1) engine.log(`стадо: разозлились ${alerted.length} (${e.name})`);
      if (alerted.includes(e)) engine.sound.play("growl", { at: e.position, volume: 0.8 }); // рык того, кто разозлился
      this.physics.step(e, dt); // стены, ступеньки, падение
      // Шаги: пока идёт — раз в полшага (быстрее — чаще); слышно, кто и откуда подходит
      if (going && e.onGround) {
        e.stepTimer = (e.stepTimer ?? Math.random() * 0.5) - dt * Math.max(0.6, e.speed / 2.2);
        if (e.stepTimer <= 0) {
          e.stepTimer = 0.45;
          engine.sound.play(e.type === "boar" ? "hoof" : "step", { at: e.position, volume: 0.6 });
        }
      }
      e.view?.animator.setBase(going ? "Walk" : "Idle", going ? e.speed / 4 : 1);
    }
    this.entities.update(dt);
    this.game.models.update(this.entities.list, dt);

    // Скакуна убили прямо под нами — падаем на землю
    if (player.mount && !player.mount.alive) {
      const steed = player.mount;
      dismount(player, this.physics);
      this.syncEye();
      this.engine.toast(`${steed.name} DIED`, 2500);
    }
    if (!player.alive) return this.die();

    // 4. Камера и прицел
    this.updateRig();
    this.ghost = null;
    this.target = null;
    if (this.building) {
      const cam = this.rig.camera;
      this.target = this.world.raycast(cam.position, cam.lookDirection(), REACH + this.rig.behind);
      if (this.target) {
        const c = this.target.place;
        // Красный призрак — сюда нельзя или нет камня
        const ok = this.canPlace(c) && this.blockCount() >= BUILD.perBlock;
        this.ghost = { ...c, color: ok ? PALETTE[this.colorIndex] : [255, 60, 60] };
      }
    }
    this.lookTarget = this.aimedEntity(REACH);
    this.lookPickup = player.mount ? null : this.aimedPickup(PICKUP_REACH)?.pickup || null;

    // 5. HUD перерисовываем, только если в нём что-то поменялось (миникарта — 10 раз в секунду)
    const t = this.lookTarget;
    const hud = [Math.ceil(this.levelFlash * 10), player.stats.hp, this.experience.level, this.experience.xp, this.talents.points, t ? t.id + ":" + t.stats.hp + ":" + (t.taming?.fed ?? "") : "", this.lookPickup ? this.lookPickup.id + ":" + this.lookPickup.count : "", this.building ? this.blockCount() : "", !!player.mount, this.scoped, this.damageNumbers.active ? performance.now() : 0, engine.updater?.available?.version, TROPHY.hp | 0, Object.values(TROPHY.pct).join(","), this.hitMarker > 0, Math.ceil(Math.max(0, 0.5 - player.hurtTime) * 10), this.invasion.active ? Math.ceil(this.invasion.timeLeft) : "", player.mount ? player.mount.stats.hp + "/" + player.mount.stats.maxHp : "", this.hudWeaponKey(), this.slashes.active || this.beams.active ? performance.now() : 0, player.statuses.map((s) => s.id + (Number.isFinite(s.left) ? Math.ceil(s.left * 10) : "") + ":" + s.charges).join(","), Math.ceil(this.blockFlash * 10), Math.ceil(this.blockCooldown * 10), this.talents.rank("f-crit") ? Math.ceil(critCooldown(player, "fighter-crit")) : "", this.playerClass, Math.floor(player.stats.mana ?? 0), this.engine.fps ?? "", this.abilities.animating ? performance.now() : 0, this.traps.list.length, Math.ceil(this.entities.list.find((e) => e.boss && e.alive && e.aggro === player)?.stats.hp ?? -1), this.invasionKind?.id, t?.growLeft ? Math.ceil(t.growLeft) : "", t?.type === "turret" ? t.inventory.count("mushroom") : "", this.playerClass === "beast" ? this.itemCount("turret-sapling") : "", this.lairTimers.map((t) => Math.ceil(t)).join(","), this.lairTimers.some((t) => t > 0) ? `${this.look.yaw.toFixed(2)},${this.look.pitch.toFixed(2)},${player.position.x.toFixed(1)},${player.position.z.toFixed(1)}` : "", this.cooldownList().map((c) => c.icon + Math.round(c.progress * 40)).join(","), this.buffList().map((b) => b.icon + (b.label || "")).join(",")].join("|");
    this.minimapTimer += dt;
    const minimapDue = this.settings.general.minimap && this.minimapTimer >= 1 / MINIMAP_FPS;
    if (hud !== this.hudKey || minimapDue) {
      this.hudKey = hud;
      this.minimapTimer = 0;
      engine.redraw();
    }
  }

  // Что рисовать (движок спрашивает и когда мы под паузой — тогда без «призрака»)
  view() {
    const camera = this.updateRig();
    const firstPerson = this.rig.mode !== "third";
    // Рука «для экрана» — только пока играем: под паузой и окнами она лишь мешала бы
    const playing = this.engine.scene === this;
    const vm = firstPerson && playing && !this.scoped ? this.viewModel()?.draw(camera) : null;
    return {
      camera,
      world: this.world,
      ghost: this.engine.scene === this ? this.ghost : null,
      characters: this.game.models.drawList([...this.entities.list, ...this.pickups.list, ...this.projectiles.list, ...this.traps.list], firstPerson ? this.player : null),
      viewModels: vm ? [vm] : [], // рука — слой «для экрана», только от 1-го лица
      // Оптика: всё вне круга прицела размыто (круг — в hud.js → SCOPE)
      blur: this.scoped && playing ? { radius: SCOPE.size - SCOPE.blurInset, feather: 0.008, strength: 0.018, dim: 0.35 } : null,
    };
  }

  drawUI(ui) {
    drawHud(ui, this);
  }

  showStats({ fps, cpu }) {
    const key = (a) => Input.label(this.settings.controls.bindings[a]);
    this.engine.window.setTitle(
      `VOID · ${fps} FPS · cpu ${cpu.toFixed(2)} ms · blocks ${this.world.blocks.size} · ` +
      `${key("ability1")}/${key("ability2")}/${key("ability3")} abilities · ${key("jump")} jump · ` +
      `${key("autoLoot")} auto loot · ${key("inventory")} inventory · ${key("pause")} pause`
    );
  }

  // ---------- Ввод ----------

  onPress(actions, event) {
    const has = (a) => actions.includes(a);
    if (has("pause")) return this.pause();
    if (has("inventory")) return this.openInventory();
    if (has("talents")) return this.openTalents();
    if (has("map")) return this.pushLive(new MapScene({ map: () => this.mapData(), radius: 60, info: () => this.coordsText(), legend: "RED CROSS - WORLD CENTER (0, 0). PURPLE SKULL - BOSS" }));
    if (has("save")) this.save();
    if (has("autoLoot")) this.toggleAutoLoot(); // V — автоподбор вкл/выкл (вид камеры — только в настройках)
    if (has("interact")) this.interact();
    if (has("shop")) return this.openShop();

    // Панель цветов открыта: цифра — это цвет, а не смена способности
    const digit = DIGIT_KEYS.indexOf(event.scancode);
    if (this.paletteOpen && digit !== -1 && digit < PALETTE.length) {
      this.colorIndex = digit;
      this.paletteOpen = false;
      this.engine.redraw();
      return;
    }

    // Прицел в режиме «переключать»: ПКМ включает и выключает (у оружия с прицелом)
    if (has("secondary") && this.settings.general.aimMode === "toggle" && this.abilities.current?.aim && !this.abilities.equipping) {
      this.aimToggle = !this.aimToggle;
    }

    // Остальное — панели способностей (движок): выбор ячейки, ЛКМ/ПКМ. Q / E — оружие слева / справа
    const before = this.abilities.index;
    // ПРИЗЫВАТЕЛЬ: Q — метка для кабанов, E — посадить турель; остальные: Q/E — оружие слева / справа
    if (this.playerClass === "beast") {
      if (has("weaponLeft")) this.markBoarTarget();
      if (has("weaponRight")) this.plantSapling();
    } else {
      if (has("weaponLeft")) this.abilities.select(0, this);
      if (has("weaponRight")) this.abilities.select(2, this);
    }
    this.abilities.handle(actions.filter((a) => a !== "weaponLeft" && a !== "weaponRight"), this);
    if (this.abilities.index !== before) {
      this.onWeaponSwitch();
      this.engine.sound.play("equip");
      this.engine.redraw();
    }
  }

  onBlur() {
    if (this.engine.scene === this) this.pause(); // переключились в другое окно — пауза
  }

  pause() {
    const { engine, game } = this;
    engine.push(new MenuScene({
      title: "PAUSE",
      overlay: true,
      items: [
        { id: "resume", label: "RESUME" },
        { id: "save", label: "SAVE" },
        { id: "settings", label: "SETTINGS" },
        { id: "menu", label: "MAIN MENU" },
      ],
      onBack: () => engine.pop(),
      onSelect: (id) => {
        if (id === "resume") engine.pop();
        if (id === "save") this.save();
        if (id === "settings") game.openSettings();
        if (id === "menu") {
          this.save(false);
          game.toMenu();
        }
      },
    }));
  }

  // Игрок погиб: сохранение удаляем (следующая игра — с чистого мира), показываем экран гибели
  die() {
    if (this.dead) return;
    this.dead = true;
    while (this.engine.scene !== this && this.engine.scenes.includes(this)) this.engine.pop(); // погибли под открытым окном — закрыть его
    if (this.player.mount) dismount(this.player, this.physics);
    const archived = deleteSave();
    this.engine.log(`игрок погиб (уровень ${this.experience.level}, ${this.talentsSummary()}) — мир начнётся заново; старое сохранение: ${archived || "не было"}`);
    this.engine.sound.play("death");
    this.engine.push(new MenuScene({
      title: "YOU DIED",
      overlay: true,
      lock: 1.5, // в пылу боя (кликаешь ЛКМ) не прокликать экран гибели, не заметив его
      footer: () => "WORLD, LEVEL AND TALENTS ARE LOST - A NEW RUN STARTS",
      items: [{ id: "menu", label: "MAIN MENU" }],
      onSelect: () => this.game.toMenu(),
    }));
  }

  toggleAutoLoot() {
    const g = this.settings.general;
    g.autoLoot = g.autoLoot === false;
    this.engine.settings.save();
    this.engine.toast("AUTO LOOT: " + (g.autoLoot ? "ON" : "OFF"));
  }

  toggleCamera() {
    const g = this.settings.general;
    g.cameraMode = g.cameraMode === "third" ? "first" : "third";
    this.engine.settings.save();
    this.engine.toast("VIEW: " + (g.cameraMode === "third" ? "THIRD PERSON" : "FIRST PERSON"));
  }

  // Блок (ПКМ с оружием ближнего боя): на BLOCK.window секунд отбиваем удары спереди
  // (движок: статус parry), потом перезарядка BLOCK.cooldown
  tryBlock(ability) {
    if (this.blockCooldown > 0 || this.player.mount) return false;
    this.player.addStatus(parry({ duration: BLOCK.window }));
    this.blockCooldown = BLOCK.cooldown;
    this.viewModel()?.play("Block");
    this.player.view?.animator.playOnce("Block");
    this.engine.sound.play("guard");
    return true;
  }

  // Хочет ли игрок целиться (ПКМ): «удерживать» — пока зажата, «переключать» — нажал / нажал ещё раз.
  // После смены оружия зажатая ПКМ не считается: прицел прошлого оружия не переносится на новое
  aimWanted() {
    if (this.background) return false; // открыто окно (магазин, карта...) — не целимся
    if (this.settings.general.aimMode === "toggle") return this.aimToggle;
    const down = this.engine.input.isDown("secondary");
    if (!down) this.aimBlocked = false;
    return down && !this.aimBlocked;
  }

  // Сменили оружие в руках: из прицела выходим сразу, режим «переключать» сбрасываем
  onWeaponSwitch() {
    this.aimToggle = false;
    this.aimBlocked = this.engine.input.isDown("secondary");
    this.aiming = false;
    this.aim.reset();
    this.aimT = 0;
  }

  // ---------- Стройка (способность 3) ----------

  // Нельзя ставить в занятую клетку и туда, где стоит хоть одна сущность (её «коробка»)
  canPlace(c) {
    return c.y >= 0 && !this.world.has(c.x, c.y, c.z) && !this.entities.overlapsCell(c);
  }

  placeBlock() {
    if (!this.target || !this.canPlace(this.target.place)) return;
    // Ставим блоки из сумки (предмет BUILD.item). Нет блоков — не строим (купить в магазине или сломать блок)
    if (this.blockCount() < BUILD.perBlock) {
      this.engine.toast(`NO ${itemName(BUILD.item)}S: BREAK BLOCKS OR BUY IN THE SHOP`, 2000);
      return;
    }
    const c = this.target.place;
    this.takeItem(BUILD.item, BUILD.perBlock);
    this.world.place(c.x, c.y, c.z, PALETTE[this.colorIndex]);
    this.viewModel()?.play("Use");
    this.engine.sound.play("place", { at: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 } });
  }

  removeBlock() {
    if (!this.building || !this.target?.block) return;
    const b = this.target.block;
    this.world.remove(b.x, b.y, b.z);
    // Блок возвращается в сумку (не влез — падает на землю на месте блока)
    if (BUILD.refundOnBreak) {
      const left = this.giveResource(BUILD.item, BUILD.perBlock);
      if (left > 0) this.pickups.add(BUILD.item, left, { x: b.x + 0.5, y: b.y, z: b.z + 0.5 });
    }
    this.viewModel()?.play("Attack");
    this.engine.sound.play("remove", { at: { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 } });
  }

  // Сколько блоков для стройки у героя
  blockCount() {
    return this.itemCount(BUILD.item);
  }

  // Сколько штук предмета у героя (сумка + хотбар) и забрать n штук (сначала из сумки)
  itemCount(id) {
    const p = this.player;
    return p.inventory.count(id) + p.hotbar.count(id);
  }

  takeItem(id, n = 1) {
    const p = this.player;
    let taken = p.inventory.remove(id, n);
    if (taken < n) {
      taken += p.hotbar.remove(id, n - taken);
      this.syncAbilities(); // в хотбаре ячейка могла опустеть
    }
    return taken;
  }

  // Влезет ли count штук предмета (в начатые стопки и пустые ячейки хотбара и сумки)
  canTake(id, count) {
    const max = maxStack(id);
    let room = 0;
    const hb = this.player.hotbar;
    hb.slots.forEach((s, i) => (room += !s ? (hb.accepts(i, id) ? max : 0) : s.item === id ? max - s.count : 0));
    for (const s of this.player.inventory.slots) room += !s ? max : s.item === id ? max - s.count : 0;
    return room >= count;
  }

  // Старое сохранение (5 ячеек, что угодно): в хотбар — только то, что подходит своей ячейке,
  // остальное — в сумку; убранные предметы (ножи, камни ROGUE) выкидываем — взамен монеты
  migrateHotbar(saved) {
    const p = this.player;
    if (!Array.isArray(saved)) return;
    const extra = [];
    saved.forEach((s, i) => {
      if (!s || typeof s.item !== "string" || !(s.count > 0)) return;
      if (i < 3 && hotbarAccepts(i, s.item)) p.hotbar.slots[i] = { item: s.item, count: s.count };
      else extra.push(s);
    });
    // Предметы, которых больше нет в игре, — из сумки тоже
    p.inventory.slots.forEach((s, i) => {
      if (s && s.item in REMOVED_ITEMS) {
        extra.push(s);
        p.inventory.slots[i] = null;
      }
    });
    let coins = 0;
    for (const s of extra) {
      if (s.item in REMOVED_ITEMS) {
        coins += REMOVED_ITEMS[s.item] * s.count;
        continue;
      }
      let left = p.hotbar.add(s.item, s.count);
      left = p.inventory.add(s.item, left);
      if (left > 0) this.pickups.add(s.item, left, { x: p.position.x, y: p.position.y + 0.5, z: p.position.z }); // не влезло — под ноги
    }
    if (coins > 0) p.inventory.add("coin", coins);
    // Старые патроны (общие на все стволы) → обоймы пистолета: по одной за каждые 12 (с округлением вверх)
    const oldAmmo = extra.filter((s) => s.item === "ammo").reduce((n, s) => n + s.count, 0);
    if (oldAmmo > 0) this.giveResource(CLIPS.items.pistol, Math.ceil(oldAmmo / ATTACKS.pistol.magazine));
    for (const pk of this.pickups.list.filter((pk) => pk.item in REMOVED_ITEMS)) this.pickups.remove(pk); // и с земли
    if (extra.length) this.engine.log(`хотбар: 3 ячейки — переложено ${extra.length} стопок, монет за убранные предметы: ${coins}`);
  }

  // ---------- Мир: постройки и камни ----------

  // Высота земли (рельефа) в столбике — без построек и того, что поставил герой. Плоский мир — 0
  groundHeight(x, z) {
    return this.terrain ? this.terrain.height(Math.floor(x) + 0.5, Math.floor(z) + 0.5) : 0;
  }

  // Стоит ли здесь постройка (дом, башня, дерево, блоки героя): поверхность выше земли больше чем на блок.
  // Туда не спавним мобов и камни (иначе окажутся на крыше)
  onStructure(x, z) {
    return this.world.surfaceY(x, z) - this.groundHeight(x, z) > 1;
  }

  // Новый мир: рельеф (холмы, плато, гора), на нём постройки и деревья
  // (движок: Terrain, structures; правила — WORLDGEN в config.js). Зерно рельефа — в сохранении
  generateWorld() {
    const W = WORLDGEN;
    const rnd = Math.random;
    const range = ([a, b]) => randomInt(rnd, a, b);
    const pick = (list) => list[Math.floor(rnd() * list.length)];

    // 1. Рельеф
    this.terrain = new Terrain({ ...W.terrain, seed: 1 + Math.floor(rnd() * 1e9) });
    this.terrainParams = W.terrain; // в сохранение: рельеф пересчитывается по ним (а не по текущему config)
    const terrainBlocks = this.terrain.build(this.world, W.colors);
    this.engine.log(`острова: ${this.terrain.discs.length - 1} маленьких, гор ${this.terrain.mountains.length}, логов боссов ${this.terrain.lairs.length}` +
      this.terrain.lairs.map((l) => ` (${l.x}, ${l.z})`).join(""));

    // 1б. Логов в горах нет — жёлтая площадка лича (второй босс)
    this.arena = this.arenaSpot();
    if (this.arena) this.buildArena(this.arena);
    const arenaAvoid = this.arena ? [{ x: this.arena.x, z: this.arena.z, r: this.arena.r + 3 }] : [];

    // 2. Где ставить постройки: не у места появления и жителей, не на крутом склоне (и не на площадке лича)
    const avoid = [{ x: 0, z: 0, r: W.keepClear }, ...[...DEFAULT_SPAWNS, ...RESIDENTS].map((d) => ({ x: d.x, z: d.z, r: 3 })), ...arenaAvoid];
    const ground = (x, z, w, d) => {
      let min = Infinity, max = -Infinity, sum = 0;
      for (let i = x; i < x + w; i++) for (let k = z; k < z + d; k++) {
        const h = this.groundHeight(i, k);
        min = Math.min(min, h); max = Math.max(max, h); sum += h;
      }
      return { min, max, avg: sum / (w * d) };
    };
    const queue = [
      ...Array.from({ length: W.houses }, () => ({ kind: "house", w: range(W.house.w), d: range(W.house.d) })),
      ...Array.from({ length: W.towers }, () => { const s = range(W.tower.size); return { kind: "tower", w: s, d: s }; }),
      ...Array.from({ length: W.piles }, () => ({ kind: "pile", w: range(W.pile.w), d: range(W.pile.d) })),
    ];
    const spots = scatter({
      count: queue.length, area: W.area, gap: W.gap, avoid, size: () => queue.shift(), random: rnd,
      accept: (x, z, s) => { const g = ground(x, z, s.w, s.d); return g.max - g.min <= W.maxSlope; },
    });
    // 2б. Маленькие острова — свои постройки (WORLDGEN.islandStuff): пара домиков, куча коробок, иногда башня.
    // Ставим на ровной части острова (не у края и не на его горке)
    const I = W.islandStuff;
    const islands = this.terrain.discs.filter((d) => !d.main);
    const hillOf = (d) => this.terrain.mountains.find((m) => Math.hypot(m.x - d.x, m.z - d.z) < 1);
    for (const d of islands) {
      const inner = d.r - d.edge;
      const hill = hillOf(d);
      const q = [
        ...Array.from({ length: range(I.houses) }, () => ({ kind: "house", w: range(W.house.w), d: range(W.house.d) })),
        ...(rnd() < I.towerChance ? [(() => { const s = range(W.tower.size); return { kind: "tower", w: s, d: s }; })()] : []),
        ...Array.from({ length: range(I.piles) }, () => ({ kind: "pile", w: range(W.pile.w), d: range(W.pile.d) })),
      ];
      spots.push(...scatter({
        count: q.length, area: [Math.floor(d.x - inner), Math.floor(d.z - inner), Math.ceil(d.x + inner), Math.ceil(d.z + inner)],
        gap: W.gap, avoid: [...(hill ? [{ x: d.x, z: d.z, r: hill.r * 0.85 }] : []), ...arenaAvoid], size: () => q.shift(), random: rnd,
        accept: (x, z, s) => {
          const far = Math.hypot(x + s.w / 2 - d.x, z + s.d / 2 - d.z) + Math.hypot(s.w, s.d) / 2;
          if (far > inner + 1) return false; //  вся постройка — на ровной части острова
          const g = ground(x, z, s.w, s.d);
          return g.min >= 1 && g.max - g.min <= W.maxSlope;
        },
      }));
    }
    const [STONE, WOOD, , , BRICK] = PALETTE;
    for (const s of spots) {
      // Площадку под постройку выравниваем (срезать / досыпать) до средней высоты земли
      const y = Math.round(ground(s.x, s.z, s.w, s.d).avg);
      flattenArea(this.world, { x: s.x, z: s.z, w: s.w, d: s.d, y, top: W.colors.grass, fill: W.colors.dirt });
      if (s.kind === "house") {
        const wall = pick([WOOD, STONE, BRICK]);
        buildHouse(this.world, { ...s, y, h: range(W.house.h), wall, trim: wall === WOOD ? STONE : WOOD, roof: pick([WOOD, BRICK, STONE]), decay: rnd() * W.house.decay[1], random: rnd });
      } else if (s.kind === "tower") {
        buildTower(this.world, { ...s, y, size: s.w, h: range(W.tower.h), wall: STONE, top: WOOD, door: pick(["north", "south", "east", "west"]), random: rnd });
      } else {
        buildCratePile(this.world, { ...s, y, colors: [WOOD, WOOD, STONE], count: range(W.pile.count), random: rnd });
      }
    }

    // 3. Деревья — на свободной земле (не на постройках, не у места появления, не на снегу и скалах)
    let trees = 0;
    for (let t = 0; t < W.trees * 20 && trees < W.trees; t++) {
      const x = Math.floor((rnd() * 2 - 1) * (W.terrain.radius - 6));
      const z = Math.floor((rnd() * 2 - 1) * (W.terrain.radius - 6));
      if (Math.hypot(x, z) < W.keepClear + 3 || this.onStructure(x, z)) continue;
      if (arenaAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue; // не на площадке лича
      if (this.groundHeight(x, z) > W.colors.rockLine || this.groundHeight(x, z) < 1) continue; // не на скалах и не за краем острова
      if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue; // не вплотную к стенам
      buildTree(this.world, { x, y: this.world.surfaceY(x, z), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
      trees++;
    }
    // Деревья на маленьких островах — тоже на свободной земле, не у края и не на скалах горки
    for (const d of islands) {
      const want = range(I.trees);
      for (let t = 0, n = 0; t < want * 20 && n < want; t++) {
        const a = rnd() * Math.PI * 2, r = rnd() * (d.r - d.edge);
        const x = Math.floor(d.x + Math.sin(a) * r), z = Math.floor(d.z + Math.cos(a) * r);
        if (this.onStructure(x, z) || this.groundHeight(x, z) > W.colors.rockLine || this.groundHeight(x, z) < 1) continue;
        if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue;
        if (this.terrain.lairs.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 2)) continue; // не над логовом
        if (arenaAvoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue; //              не на площадке лича
        buildTree(this.world, { x, y: this.world.surfaceY(x, z), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
        trees++;
        n++;
      }
    }
    const count = (k) => spots.filter((s) => s.kind === k).length;
    this.engine.log(`новый мир: рельеф ${terrainBlocks} кубиков (зерно ${this.terrain.seed}), ${count("house")} домиков, ${count("tower")} башен, ${count("pile")} куч, ${trees} деревьев; всего ${this.world.blocks.size} блоков`);
  }

  // Разбросать камни вокруг места появления (новый мир)
  // Разбросать count предметов item вокруг героя (до 14 м, не на постройках)
  scatterItem(item, count = 1) {
    const c = this.player?.position || { x: 0, z: 0 };
    for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
      const x = c.x + (Math.random() * 2 - 1) * 14;
      const z = c.z + (Math.random() * 2 - 1) * 14;
      if (Math.hypot(x - c.x, z - c.z) < 2 || this.onStructure(x, z)) continue;
      this.pickups.add(item, 1, { x, y: this.world.surfaceY(x, z), z });
      n++;
    }
  }

  // Предмет на земле под прицелом не дальше reach от глаз (и не за стеной): { pickup, t } или null
  aimedPickup(reach) {
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const hit = this.pickups.raycast(cam.position, dir, this.rig.behind + reach);
    if (!hit) return null;
    const wall = this.world.raycast(cam.position, dir, hit.t);
    if (wall?.block && wall.t < hit.t) return null; // между нами блок
    const p = hit.pickup.position;
    const eye = this.look.position;
    if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > reach + 0.5) return null;
    return hit;
  }

  // Подобрать предмет с земли: оружие — в хотбар, остальное (камни, кости) — в сумку
  // quiet — автоподбор: если некуда положить, не кричим каждый кадр (предмет просто остаётся лежать)
  pickUp(p, { quiet = false } = {}) {
    if (ITEMS[p.item]?.instant) {
      // Корона лича: сразу +урон всем (навсегда), в сумку не идёт
      if (p.item === "bone-crown") {
        const add = this.crownDamage(this.boneCrowns + 1) - this.crownDamage(this.boneCrowns);
        this.boneCrowns++;
        this.pickups.remove(p);
        this.applyTalents();
        this.engine.sound.play("levelup");
        this.engine.toast(add > 0 ? `BONE CROWN: +${Math.round(add * 1000) / 10}% DMG (TOTAL +${Math.round(this.crownDamage(this.boneCrowns) * 1000) / 10}%)` : "BONE CROWN: NO MORE DAMAGE FROM CROWNS", 3000);
        this.engine.log(`корона лича №${this.boneCrowns}: +${(add * 100).toFixed(1)} % урона`);
        return;
      }
      // Шкура тролля: сразу броня (навсегда), в сумку не идёт
      if (p.item === "troll-hide") {
        const add = this.hideArmor(this.trollHides + 1) - this.hideArmor(this.trollHides);
        this.trollHides++;
        this.pickups.remove(p);
        this.applyTalents();
        this.engine.sound.play("levelup");
        this.engine.toast(add > 0 ? `TROLL HIDE: -${Math.round(add * 1000) / 10}% PHYSICAL DMG (TOTAL -${Math.round(this.hideArmor(this.trollHides) * 1000) / 10}%)` : "TROLL HIDE: NO MORE ARMOR FROM HIDES", 3000);
        this.engine.log(`шкура тролля №${this.trollHides}: +${(add * 100).toFixed(1)} % брони`);
        return;
      }
      // Сфера души: сразу мана
      if (p.item === "soul") {
        const got = Math.round(this.player.restoreMana((this.player.stats.maxMana * p.count) / 100)); // count — % макс. маны
        this.pickups.remove(p);
        this.engine.sound.play("learn");
        this.engine.toast(`+${got} MANA`, 800);
      }
      return;
    }
    const left = isWeapon(p.item) ? this.giveItem(p.item, p.count) : this.giveResource(p.item, p.count, p.data);
    const got = p.count - left;
    if (got === 0) {
      if (quiet) p.delay = p.age + 1; // некуда — пробуем снова через секунду (освободил место — само подберётся)
      return quiet ? null : this.engine.toast("NO ROOM IN INVENTORY");
    }
    if (left > 0) p.count = left; // что не влезло — осталось лежать
    else this.pickups.remove(p);
    this.engine.sound.play("pickup");
    this.engine.toast(`+${got} ${itemName(p.item)}`, 900);
    this.engine.log(`подобрано: ${p.item} x${got}`);
  }

  // Выдать ресурс: сначала докладываем в НАЧАТЫЕ стопки (в хотбаре, потом в сумке), потом — новая стопка:
  // то, что используют в руке (камни), — сразу в хотбар; остальное (кости, монеты) — в сумку.
  // Возвращает, сколько не влезло
  giveResource(id, count = 1, data = null) {
    const p = this.player;
    // Со своими данными (неполная обойма) — по одной в пустые ячейки сумки, потом хотбара
    if (data) {
      const left = p.hotbar.add(id, p.inventory.add(id, count, { data }), { data });
      this.syncAbilities();
      return left;
    }
    let left = p.hotbar.add(id, count, { stackOnly: true });
    left = p.inventory.add(id, left, { stackOnly: true });
    if (isUsable(id)) {
      left = p.hotbar.add(id, left);
      left = p.inventory.add(id, left);
    } else {
      left = p.inventory.add(id, left);
      left = p.hotbar.add(id, left);
    }
    this.syncAbilities();
    return left;
  }

  // ---------- Бой (способности 1 и 2) ----------

  // Существо под прицелом не дальше reach от глаз героя (и не за стеной) — или null
  aimedEntity(reach) {
    return this.aimedHit(reach)?.entity || null;
  }

  // То же, но подробно: { entity, part } — part — часть тела (голова — хедшот) или null
  // spread — разброс (радианы): луч чуть в сторону от прицела (дробь дробовика)
  aimedHit(reach, spread = 0) {
    const cam = this.rig.camera;
    const origin = cam.position;
    let dir = cam.lookDirection();
    if (spread > 0) {
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const right = new Vec3(Math.cos(this.look.yaw), 0, -Math.sin(this.look.yaw));
      const up = new Vec3(-right.z * dir.y, right.z * dir.x - right.x * dir.z, right.x * dir.y); // right × dir
      dir = dir.add(right.scale(Math.cos(a) * r)).add(up.scale(Math.sin(a) * r));
      const l = Math.hypot(dir.x, dir.y, dir.z);
      dir = dir.scale(1 / l);
    }
    this.lastRay = { origin, dir, max: this.rig.behind + reach }; // для следа пули (bulletTrace)
    // Себя и своего скакуна (верхом) луч не задевает
    const hit = this.entities.raycast(origin, dir, this.rig.behind + reach, [this.player, this.player.mount]);
    if (!hit) return null;
    const wall = this.world.raycast(origin, dir, hit.t);
    if (wall && wall.t < hit.t) return null; // между нами блок
    const p = origin.add(dir.scale(hit.t));
    const eye = this.look.position;
    if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > reach + 0.5) return null;
    return { entity: hit.entity, part: hit.part };
  }

  // Есть ли стена между двумя сущностями: луч от «груди» одной до середины другой упёрся в блок
  blockedBetween(a, b) {
    const from = { x: a.position.x, y: a.position.y + a.height * 0.75, z: a.position.z };
    const to = { x: b.position.x - from.x, y: b.position.y + b.height / 2 - from.y, z: b.position.z - from.z };
    const len = Math.hypot(to.x, to.y, to.z) || 1;
    const hit = this.world.raycast(from, new Vec3(to.x / len, to.y / len, to.z / len), len);
    return !!hit?.block;
  }

  // Что атаки движка знают о нашем мире: кто под прицелом, кто вокруг
  combatContext(extra = {}) {
    return {
      aim: (range) => this.aimedHit(range), // { entity, part } — part: голова → хедшот
      aimSpread: (range, spread) => this.aimedHit(range, spread), // дробь: луч с разбросом
      onShot: () => this.bulletTrace(), // выстрел: трассер и след на блоке
      entities: this.entities.list,
      // Удар по хитбоксу не бьёт сквозь стены
      blocked: (owner, target) => this.blockedBetween(owner, target),
      // Хитбокс ближнего боя — в плоскости камеры: откуда и с каким наклоном смотрит герой
      view: { origin: this.look.position, pitch: this.look.pitch, roll: this.look.roll || 0 },
      ...extra,
    };
  }

  // Атака игрока (рука, пистолет...). Сама атака — класс движка (engine/combat):
  // она знает урон, кулдаун, дальность, стихию и модификаторы. Здесь — анимация и звук.
  // bodyAnim — что играет тело героя «для мира» (от 3-го лица); по умолчанию — Attack, если и для экрана Attack.
  // Вернёт true, если атака состоялась (не на перезарядке)
  // ctx — добавки к контексту удара (например, baseDamage), onHit — что ещё сделать с каждым попаданием
  useAttack(attack, { anim, sound, hitSound = sound, bodyAnim = anim === "Attack" ? "Attack" : null, ctx = {}, onHit = null }) {
    let hits = 0;
    let autoReload = false;
    let miss = null;
    const result = attack.use(this.player, this.combatContext({
      // Последний патрон — перезарядка начинается сама. Анимацию запускаем ПОСЛЕ анимации выстрела ниже,
      // иначе выстрел сразу перебьёт «Reload» (рука и тело так и не перезаряжаются)
      ...ctx,
      onReload: () => (autoReload = true),
      onMiss: (reason) => (miss = reason),
      onHit: (hit) => {
        hits++;
        this.onPlayerHit(hit);
        onHit?.(hit);
      },
    }));
    if (!result || result.used === false) {
      if (autoReload) this.onReloadStart(this.abilities.current); // нажали стрелять с пустой обоймой
      if (miss === "no-ammo") this.noAmmo();
      if (miss === "no-mana") this.noMana();
      return false; // кулдаун ещё идёт / нечем стрелять
    }
    this.recoil.kick(this.abilities.current?.recoil, this.aimT); // отдача — у оружия своя (движок: Recoil)
    this.viewModel()?.play(anim); //                        для экрана (от 1-го лица)
    if (bodyAnim) this.player.view?.animator.playOnce(bodyAnim); // для мира (от 3-го)
    this.engine.sound.play(hits ? hitSound : sound);
    if (autoReload) this.onReloadStart(this.abilities.current);
    return true;
  }

  // Герой попал (ударом, выстрелом, брошенным камнем): отметка у прицела, хедшот — красная
  onPlayerHit(hit) {
    const head = hit?.damage?.part === "head";
    this.hitMarker = head ? 0.35 : 0.15;
    this.headshot = head; // хедшот — красная отметка и надпись (hud.js)
    if (head) this.engine.log(`хедшот: ${hit.target.name} -${hit.dealt}`);
    this.engine.redraw();
  }

  // ---------- Метатели (мобы, которые бросают издалека) ----------

  // Моб бросает в цель: снаряд по дуге (движок: aimArc) с упреждением на полшага; попал — урон (только врагу),
  // упал — пропал (камни и кости мобов на землю не падают, чтобы не засорять мир)
  mobThrow(e, target, attack) {
    const r = ATTACKS[e.ranged.attack];
    const from = { x: e.position.x, y: e.position.y + e.height * 0.85, z: e.position.z };
    const lead = Math.hypot(target.position.x - e.position.x, target.position.z - e.position.z) / r.speed; // летит ~столько секунд
    const to = {
      x: target.position.x + (target.velocity?.x || 0) * lead * 0.5,
      y: target.position.y + target.height * 0.6,
      z: target.position.z + (target.velocity?.z || 0) * lead * 0.5,
    };
    const [lo, hi] = e.rangedDamage;
    const damage = lo + Math.floor(Math.random() * (hi - lo + 1));
    // straight — летит прямо (сгусток лича), иначе — по дуге
    const dir = e.ranged.straight ? (() => { const v = new Vec3(to.x - from.x, to.y - from.y, to.z - from.z); return v.scale(r.speed / (Math.hypot(v.x, v.y, v.z) || 1)); })() : null;
    this.projectiles.launch({
      owner: e, position: from, velocity: dir || aimArc(from, to, r.speed, MOB_RANGED.gravity), attack, damage, item: e.ranged.item, scale: e.ranged.scale || 1, // валун тролля — крупный
      gravity: dir ? 0 : MOB_RANGED.gravity, spin: dir ? 0 : 2,
      onHit: (p, hit) => {
        if (!e.isHostileTo(hit.entity)) return; // своих не бьёт (пролетело сквозь)
        const res = attack.hit(e, hit.entity, { part: hit.part, baseDamage: p.damage });
        this.engine.sound.play(hit.entity === this.player ? "hurt" : "hit", { at: hit.entity.position });
        this.engine.log(`${e.name} → ${hit.entity.name}: ${r.name} -${res?.dealt ?? 0} HP`);
      },
      onLand: () => {},
    });
    e.view?.animator.playOnce("Throw");
    this.engine.sound.play("swing", { at: e.position });
  }

  // След выстрела героя: короткий трассер от ствола до того, во что попал луч (последний aimedHit),
  // в блок — чёрная точка на пару секунд (BULLET)
  bulletTrace() {
    const ray = this.lastRay;
    if (!ray) return;
    const { origin, dir, max } = ray;
    const hit = this.entities.raycast(origin, dir, max, [this.player, this.player.mount]);
    const wall = this.world.raycast(origin, dir, max);
    const t = hit && (!wall || hit.t <= wall.t) ? hit.t : wall ? wall.t : max;
    const end = origin.add(dir.scale(t));
    this.beams.add({ from: this.handPoint(), to: end, color: BULLET.color, core: BULLET.core, life: BULLET.life, width: BULLET.width });
    if (wall && t === wall.t) this.bulletHole(origin, dir, t);
  }

  // Чёрная точка там, где пуля ударила в блок (чуть ближе к стрелку — чтобы её не закрывала сама грань)
  bulletHole(origin, dir, t) {
    const p = { x: origin.x + dir.x * (t - 0.02), y: origin.y + dir.y * (t - 0.02), z: origin.z + dir.z * (t - 0.02) };
    this.beams.mark(p, { color: BULLET.hole, life: BULLET.holeLife, size: BULLET.holeSize });
  }

  // Моб стреляет из пистолета: мгновенный луч из руки в грудь цели с разбросом spread; первым на пути —
  // блок (пуля в стену) или существо (урон — только врагу). След пули — жёлтый луч
  mobGunshot(e, target, attack) {
    const w = e.ranged;
    const from = new Vec3(e.position.x + Math.sin(e.yaw) * 0.3, e.position.y + e.height * 0.75, e.position.z + Math.cos(e.yaw) * 0.3);
    const to = { x: target.position.x, y: target.position.y + target.height * 0.6, z: target.position.z };
    let dir = new Vec3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir = new Vec3(dir.x / len + (Math.random() * 2 - 1) * w.spread, dir.y / len + (Math.random() * 2 - 1) * w.spread * 0.5, dir.z / len + (Math.random() * 2 - 1) * w.spread);
    const k = Math.hypot(dir.x, dir.y, dir.z);
    dir = new Vec3(dir.x / k, dir.y / k, dir.z / k);
    const max = w.range + 6;
    const hit = this.entities.raycast(from, dir, max, [e]);
    const wall = this.world.raycast(from, dir, max);
    const t = hit && (!wall || hit.t <= wall.t) ? hit.t : wall ? wall.t : max;
    if (hit && t === hit.t && e.isHostileTo(hit.entity)) {
      const [lo, hi] = e.rangedDamage;
      const res = attack.hit(e, hit.entity, { part: hit.part, baseDamage: lo + Math.floor(Math.random() * (hi - lo + 1)) });
      this.engine.sound.play(hit.entity === this.player ? "hurt" : "hit", { at: hit.entity.position });
      this.engine.log(`${e.name} → ${hit.entity.name}: ${ATTACKS[w.attack].name} -${res?.dealt ?? 0} HP`);
    }
    this.beams.add({ from, to: { x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t }, color: BULLET.color, core: BULLET.core, life: BULLET.life, width: BULLET.width });
    if (wall && t === wall.t) this.bulletHole(from, dir, t);
    e.view?.animator.playOnce("Shoot");
    this.engine.sound.play("shot", { at: e.position });
  }

  // ---------- Магия, ножи, ловушки ----------

  // Точка у правой руки (откуда вылетают заклинания): чуть правее, ниже и впереди глаз — в осях взгляда
  handPoint() {
    const cam = this.look;
    return toWorld(cam.position, viewBasis(cam.yaw, cam.pitch, cam.roll || 0), 0.22, -0.2, 0.6);
  }

  // Куда смотрит прицел: первая сущность или блок на луче (не дальше range) — { point, entity }
  lookPoint(range) {
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const max = range + this.rig.behind;
    const hit = this.entities.raycast(cam.position, dir, max, [this.player, this.player.mount]);
    const wall = this.world.raycast(cam.position, dir, max);
    const t = Math.min(hit?.t ?? max, wall?.t ?? max);
    return { point: cam.position.add(dir.scale(t)), entity: hit && (!wall || hit.t <= wall.t) ? hit.entity : null };
  }

  // Куда ударит посох огня: ноги того, в кого целимся, или точка на блоке / земле (не дальше range). null — некуда
  strikePoint(range) {
    const look = this.lookPoint(range);
    if (look.entity) return { point: { x: look.entity.position.x, y: look.entity.position.y, z: look.entity.position.z }, entity: look.entity };
    const cam = this.rig.camera;
    const hit = this.world.raycast(cam.position, cam.lookDirection(), range + this.rig.behind);
    return hit ? { point: look.point, entity: null } : null;
  }

  // Посох огня в руках: круг под прицелом — куда ударит (зелёный — можно, серый — далеко / маны мало)
  previewStrike(attack) {
    const at = this.strikePoint(attack.range);
    if (!at) return;
    const ok = attack.ready && (this.player.stats.mana ?? Infinity) >= attack.cost;
    const radius = attack.radius * (1 + (this.talentStats.spellRadius || 0)) * (this.player.hasStatus("empower") ? EMPOWER.radius : 1);
    this.beams.ring({ ...at.point, y: at.point.y + 0.05 }, radius, { color: ok ? [255, 150, 50] : [120, 120, 130], life: 0.04, width: 5 });
  }

  // Посох огня — СОЛНЕЧНЫЙ УДАР: через delay секунд столб огня бьёт в точку (DelayedStrikes движка);
  // пока ждём — красный круг сжимается к центру
  castFireball(attack) {
    const at = this.strikePoint(attack.range);
    if (!at) {
      if (attack.ready) this.engine.toast("TOO FAR", 600);
      return false;
    }
    const used = attack.use(this.player, this.combatContext());
    if (!used) return false; // перезарядка
    if (used.used === false) return this.noMana(), false; // маны мало
    const aimed = at.entity;
    const power = this.takeEmpower(); // EMPOWER: ×3 урона, ×2 радиус
    const radius = attack.radius * (1 + (this.talentStats.spellRadius || 0)) * power.radius; // талант RADIUS
    this.meteor(attack, at.point, { delay: ATTACKS.fireStaff.delay, radius, damage: power.damage, aimed, repeat: !!this.talentStats.meteorRepeat });
    this.viewModel()?.play("Cast");
    this.player.view?.animator.playOnce("Attack");
    this.engine.sound.play("cast");
    return true;
  }

  // Удар метеора в точку: через delay с, радиус radius, урон ×damage. repeat — талант REPEATED METEOR:
  // через секунду ещё один в то же место, 50 % урона
  meteor(attack, point, { delay, radius, damage = 1, aimed = null, repeat = false }) {
    this.strikes.add({
      point, delay, radius,
      onWarn: (st) => {
        const p = { ...st.point, y: st.point.y + 0.05 };
        this.beams.ring(p, st.radius, { color: [255, 70, 40], life: 0.04, width: 7 });
        this.beams.ring(p, st.radius * (1 - st.progress), { color: [255, 200, 80], life: 0.04, width: 5, segments: 14 });
      },
      onStrike: (st) => {
        const p = st.point;
        // Столб огня с неба
        for (const dx of [-0.3, 0, 0.3]) {
          this.beams.add({ from: { x: p.x + dx, y: p.y + 30, z: p.z }, to: { x: p.x + dx, y: p.y, z: p.z }, color: [255, 120, 30], core: [255, 240, 170], life: 0.35, width: 18 });
        }
        this.explode(attack, { x: p.x, y: p.y + 0.4, z: p.z }, aimed ? [aimed] : [], { radius, damage });
        if (repeat) this.meteor(attack, p, { delay: METEOR_REPEAT.delay, radius, damage: damage * METEOR_REPEAT.share, aimed });
      },
    });
  }

  // include — кого задеть, даже если он не враг (в кого целились / попали прямо)
  // radius / damage — радиус и множитель урона этого взрыва (таланты, EMPOWER)
  explode(attack, point, include = [], { radius = attack.radius, damage = 1 } = {}) {
    const extra = damage !== 1 ? { baseDamage: attack.roll() * damage } : {};
    const r = attack.burst(this.player, point, this.combatContext({ ...extra, onHit: (h) => this.onPlayerHit(h) }), { include, radius });
    this.engine.sound.play("boom", { at: point });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const up = ((i % 3) - 1) * 0.6;
      const k = radius * (0.7 + 0.3 * Math.random());
      this.beams.add({ from: point, to: { x: point.x + Math.sin(a) * k, y: point.y + up * k * 0.6, z: point.z + Math.cos(a) * k }, color: [255, 130, 40], core: [255, 230, 140], life: 0.3, width: 12 });
    }
    if (r.hits.length) this.engine.log(`взрыв ${attack.id}: задел ${r.hits.length}, урон ${r.hits.map((h) => h.dealt).join(", ")}`);
    return r;
  }

  // Жезл льда: мгновенная стрела в цель под прицелом + голубой луч от руки
  castBolt(attack) {
    // Раскол: целимся в замёрзшего — урон этого выстрела ×FROST.shatter, лёд разбит
    const aimed = this.aimedHit(attack.range)?.entity;
    const ctx = aimed?.hasStatus("frozen") ? { baseDamage: attack.roll(Math.random) * FROST.shatter } : {};
    const used = this.useAttack(attack, {
      anim: "Cast", bodyAnim: "Attack", sound: "zap", hitSound: "zap", ctx,
      onHit: (hit) => hit.target.alive && this.frostHit(hit.target, hit.target.hasStatus("frozen")),
    });
    if (!used) return false;
    this.beams.add({ from: this.handPoint(), to: this.lookPoint(attack.range).point, color: [110, 200, 255], core: [235, 250, 255], life: 0.16, width: 6 });
    return true;
  }

  // Попадание жезла льда: стопка холода; набралось freezeAt — заморозка; по замёрзшему — раскол
  frostHit(target, wasFrozen) {
    const rank = this.talents.rank("deep-freeze");
    if (wasFrozen) {
      target.removeStatus("frozen");
      this.engine.sound.play("parry", { at: target.position }); // «дзынь» льда
      this.engine.log(`раскол льда: ${target.name}`);
      return;
    }
    const need = FROST.freezeAt - rank;
    target.addStatus(new Slow({ id: "frost", name: "FROST", duration: FROST.stackTime, perStack: FROST.slowPerStack, stackable: true, maxStacks: need, icon: "FRS" }));
    const stacks = target.statuses.find((s) => s.id === "frost")?.stacks || 0;
    if (stacks >= need) {
      target.removeStatus("frost");
      target.addStatus(new Slow({ id: "frozen", name: "FROZEN", duration: FROST.freezeTime + 0.5 * rank, factor: 0.05, stun: true, icon: "ICE", color: [170, 220, 255] }));
      this.engine.sound.play("snap", { at: target.position });
      this.engine.log(`заморожен: ${target.name}`);
    }
  }

  // Магма-камень (МАГ): бросок по дуге к точке прицела; где упал (блок, земля, враг) — лужа магмы.
  // Лужа (движок: Zones) — radius м, duration с, жжёт врагов внутри damage урона в секунду (тики по 0.5 с).
  // Таланты: SLOW (замедляет внутри), SPARKS (искры в соседних врагов), RADIUS, EMPOWER, PASSIVE CRITS
  throwMagma(attack) {
    const used = attack.use(this.player, this.combatContext());
    if (!used) return false;
    if (used.used === false) return this.noMana(), false;
    const power = this.takeEmpower(); // EMPOWER: ×3 урона и ×2 радиус (раз в 30 с)
    const land = (p) => this.magmaPuddle(attack, p.position, power);
    this.projectiles.launch({ ...this.magmaThrow(), item: "magma", spin: 1, onHit: land, onLand: land, onExpire: land });
    this.viewModel()?.play("Throw");
    this.player.view?.animator.playOnce("Throw");
    this.engine.sound.play("cast");
    return true;
  }

  // Откуда и как летит камень магмы (один и тот же расчёт — для броска и для круга-предпросмотра)
  magmaThrow() {
    const M = ATTACKS.magmaStone;
    const dir = this.rig.camera.lookDirection();
    const eye = this.look.position;
    const from = { x: eye.x + dir.x * 0.4, y: eye.y - 0.1 + dir.y * 0.4, z: eye.z + dir.z * 0.4 };
    return { owner: this.player, position: from, velocity: dir.scale(M.speed), gravity: 14, maxLife: 4 };
  }

  // Камень магмы в руках: круг там, где ляжет лужа (движок: Projectiles.predict — тот же полёт, что у броска).
  // Оранжевый — можно бросить, серый — перезарядка или мало маны
  previewMagma(attack) {
    const at = this.projectiles.predict(this.magmaThrow());
    if (!at) return;
    const M = ATTACKS.magmaStone;
    const p = at.point;
    let y = this.world.surfaceY(p.x, p.z);
    if (Math.abs(y - p.y) > 2) y = p.y; // как у лужи: на крыше / в воздухе — где упал
    const ok = attack.ready && (this.player.stats.mana ?? Infinity) >= attack.cost;
    const radius = M.radius * (1 + (this.talentStats.spellRadius || 0)) * (this.player.hasStatus("empower") ? EMPOWER.radius : 1);
    this.beams.ring({ x: p.x, y: y + 0.05, z: p.z }, radius, { color: ok ? [255, 110, 30] : [120, 120, 130], life: 0.04, width: 5 });
  }

  // Видна ли точка мира из камеры (между ними нет блока) — лучи и круги не рисуем сквозь стены
  seenFromCamera(p) {
    const o = this.rig.camera.position;
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.3) return true;
    const hit = this.world.raycast(o, new Vec3(dx / d, dy / d, dz / d), d);
    return !hit || hit.t >= d - 0.15;
  }

  // Лужа магмы в точке point
  magmaPuddle(attack, point, power = { damage: 1, radius: 1 }) {
    const M = ATTACKS.magmaStone;
    const st = this.talentStats;
    const radius = M.radius * (1 + (st.spellRadius || 0)) * power.radius;
    const ground = { x: point.x, y: this.world.surfaceY(point.x, point.z), z: point.z };
    if (Math.abs(ground.y - point.y) > 2) ground.y = point.y; // упал на крышу / в воздухе — где упал
    const p = this.player;
    const tick = M.damage * 0.5 * power.damage; // за 0.5 с
    this.engine.sound.play("boom", { at: ground });
    this.zones.add({
      position: ground, radius, duration: M.duration, interval: 0.5, owner: p, data: { kind: "magma", sparkTimer: 0 },
      filter: (e) => p.isHostileTo(e),
      onTick: (z, inside) => {
        for (const e of inside) {
          attack.hit(p, e, this.combatContext({ baseDamage: this.dotCritRoll(tick), noElementStatus: true, onHit: (h) => this.onPlayerHit(h) }));
          if (st.magmaSlow) e.addStatus(new Slow({ id: "magma-slow", name: "SLOWED", duration: 0.7, factor: 1 - st.magmaSlow }));
        }
        // Искры: раз в секунду — в случайного врага рядом (не обязательно в луже)
        if (st.magmaSparks && (z.data.sparkTimer += z.interval) >= SPARKS.interval) {
          z.data.sparkTimer = 0;
          const near = this.entities.list.filter((e) => e.alive && p.isHostileTo(e) && Math.hypot(e.position.x - z.position.x, e.position.z - z.position.z) <= SPARKS.range);
          const t = near[Math.floor(Math.random() * near.length)];
          if (t) {
            attack.hit(p, t, this.combatContext({ baseDamage: M.damage * SPARKS.share * power.damage, noElementStatus: true, onHit: (h) => this.onPlayerHit(h) }));
            this.beams.add({ from: { ...z.position, y: z.position.y + 0.3 }, to: { x: t.position.x, y: t.position.y + t.height * 0.5, z: t.position.z }, color: [255, 140, 40], core: [255, 230, 150], life: 0.2, width: 5 });
          }
        }
      },
    });
  }

  // PASSIVE CRITS (маг): урон по времени (лужа, горение) с шансом 50 % ×2 / ×3
  dotCritRoll(amount) {
    const c = this.player.dotCrit;
    return c && Math.random() < c.chance ? amount * c.multiplier : amount;
  }

  // EMPOWER (маг): раз в 30 с следующее заклинание — ×3 урона и ×2 радиус. Вернёт множители этого заклинания
  takeEmpower() {
    if (!this.talentStats.empower || !this.player.hasStatus("empower")) return { damage: 1, radius: 1 };
    this.player.removeStatus("empower");
    this.empowerTimer = 0;
    this.engine.toast("EMPOWERED SPELL!", 900);
    return { damage: EMPOWER.damage, radius: EMPOWER.radius };
  }

  // Поставить ловушку под прицелом (не дальше TRAPS.reach) на пол или верх блока — «приклеивается» к блоку:
  // ровно в центр клетки, поворот по сетке (не по диагонали). Сверх лимита — самая старая исчезает
  placeTrap(type) {
    if (this.itemCount(type) <= 0) return false;
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const reach = TRAPS.reach * (1 + (this.talentStats.placeRange || 0)); // талант PLACE RANGE
    const hit = this.world.raycast(cam.position, dir, reach + this.rig.behind);
    const pos = hit && cam.position.add(dir.scale(hit.t));
    const far = !pos || Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z) > reach;
    if (far) {
      this.engine.toast("AIM AT THE GROUND NEARBY", 1200);
      return false;
    }
    // Ставим только сверху (на пол или верх блока) — и ровно по сетке: в центр клетки, поворот кратен 90°
    const onTop = !hit.block || hit.place.y === hit.block.y + 1;
    if (!onTop) {
      this.engine.toast("AIM AT THE TOP OF A BLOCK OR THE GROUND", 1200);
      return false;
    }
    const cell = hit.block ? { x: hit.block.x, z: hit.block.z } : { x: Math.floor(pos.x), z: Math.floor(pos.z) };
    if (this.traps.list.some((t) => Math.floor(t.position.x) === cell.x && Math.floor(t.position.z) === cell.z && Math.abs(t.position.y - hit.place.y) < 0.5)) {
      this.engine.toast("THIS BLOCK ALREADY HAS A TRAP", 1000);
      return false;
    }
    const at = { x: cell.x + 0.5, y: hit.place.y, z: cell.z + 0.5 };
    const yaw = Math.round(this.player.yaw / (Math.PI / 2)) * (Math.PI / 2), tilt = 0;
    const def = TRAPS[type];
    while (this.traps.count(this.player, type) >= def.max) this.traps.remove(this.traps.oldest(this.player, type));
    this.placeTrapAt(type, at, { yaw, tilt });
    this.takeItem(type, 1);
    this.viewModel()?.play("Use");
    this.player.view?.animator.playOnce("Attack");
    this.engine.sound.play("trapSet");
    this.engine.log(`поставлена ловушка ${type}: ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}`);
    return true;
  }

  // Ловушка по виду: атака движка TrapAttack (параметры — ATTACKS): врагов героя и самого героя (ему — selfDamage)
  // safe — своя ловушка-рефлекс: героя не ранит
  placeTrapAt(type, position, { yaw = 0, tilt = 0, age = 0, safe = false } = {}) {
    const def = TRAPS[type];
    const p = this.player;
    const root = () => new Slow({ id: "trapped", name: "TRAPPED", duration: def.root, factor: 0.05, icon: "TRP", color: [190, 190, 196] });
    const base = ATTACKS[def.attack];
    const attack = new TrapAttack({
      ...base,
      radius: base.radius * (1 + (this.talentStats?.trapRadius || 0)), // талант RADIUS
      filter: (e) => e.alive && (p.isHostileTo(e) || (e === p && !safe)),
      percentHp: def.percentHp || 0,
      selfDamage: def.selfDamage || 0,
      modifiers: def.root ? [withStatus(root, 1)] : [],
    });
    return this.traps.place({ type, attack, position, owner: p, yaw, tilt, age }); // стоят, пока не сработают
  }

  // ---------- Стрелковое оружие: обойма и перезарядка (движок: RangedAttack magazine) ----------

  // R — перезарядить оружие в руках
  reloadWeapon(ability) {
    return ability.attack.reload({ onReload: () => this.onReloadStart(ability), onMiss: () => this.noAmmo() });
  }

  // Стрелку — стартовые обоймы пистолета (один раз: и новому, и выбравшему класс)
  giveAmmoOnce() {
    if (this.ammoGiven) return;
    this.ammoGiven = true;
    this.giveResource(CLIPS.items.pistol, CLIPS.start);
  }

  // Запас обойм ствола weapon (движок: RangedAttack.reserve): count — сколько обойм в сумке (полных и неполных),
  // swap(ammo, magazine) — перезарядка: вынимаем самую полную обойму (полная — magazine патронов, неполная — сколько
  // в ней), а недострелянную старую (если в ней что-то осталось) кладём в сумку неполной обоймой
  clipReserve(weapon) {
    const item = CLIPS.items[weapon];
    const bags = () => [this.player.inventory, this.player.hotbar];
    return {
      count: () => this.itemCount(item),
      swap: (ammo, magazine) => {
        // Самая полная: сначала полные (без данных), иначе неполная с наибольшим числом патронов
        let best = null;
        for (const inv of bags()) inv.slots.forEach((s, i) => {
          if (!s || s.item !== item) return;
          const rounds = s.data ? Math.min(magazine, s.data.rounds) : magazine;
          if (!best || rounds > best.rounds) best = { inv, i, rounds };
        });
        if (!best || best.rounds <= ammo) return ammo; // нечем или в сумке обоймы не лучше вставленной
        const s = best.inv.slots[best.i];
        if (--s.count <= 0) best.inv.slots[best.i] = null;
        if (ammo > 0) this.returnClip(item, ammo, magazine);
        this.syncAbilities();
        return best.rounds;
      },
    };
  }

  // Недострелянная обойма — в сумку (неполной: на ячейке — патроны); полная — обычной; некуда — под ноги
  returnClip(item, rounds, magazine) {
    const data = rounds >= magazine ? null : { rounds, label: String(rounds) };
    let left = this.player.inventory.add(item, 1, { data });
    if (left > 0) left = this.player.hotbar.add(item, 1, { data });
    if (left > 0) this.pickups.add(item, 1, { x: this.player.position.x, y: this.player.position.y + 0.5, z: this.player.position.z }, { data });
  }

  noMana() {
    const now = performance.now();
    if (now - (this.noManaAt || 0) < 1000) return;
    this.noManaAt = now;
    this.engine.toast("NOT ENOUGH MANA", 900);
  }

  // Патронов нет ни в обойме, ни в сумке — подсказка (не чаще раза в секунду)
  noAmmo() {
    const now = performance.now();
    if (now - (this.noAmmoAt || 0) < 1000) return;
    this.noAmmoAt = now;
    this.engine.sound.play("reload");
    this.engine.toast("NO CLIPS FOR THIS GUN: BUY THEM IN THE SHOP", 1200);
  }

  // Перезарядка началась: рука «для экрана» и тело от 3-го лица — анимация, звук
  onReloadStart(ability) {
    this.viewModel()?.play("Reload");
    if (ability?.reloadPose) this.player.view?.animator.playOnce(ability.reloadPose);
    this.engine.sound.play("reload");
    this.engine.log(`перезарядка: ${ability?.name}`);
  }

  // Для HUD: что показывать про оружие в руках (патроны, перезарядка, ИАЙ) — меняется → перерисовать
  hudWeaponKey() {
    const a = this.abilities.current;
    const atk = a?.attack;
    const ammo = atk?.magazine ? `${atk.ammo}:${atk.reserveCount}:${atk.reloading ? Math.ceil(atk.reloadProgress * 30) : ""}` : "";
    return ammo + (a?.iaiProgress !== undefined ? `:${Math.ceil(a.iaiProgress * 14)}` : "") + (a?.chargePower != null ? `:c${Math.ceil(a.chargePower * 20)}` : "");
  }

  // Белый след удара — по хитбоксу атаки (сектор arc в плоскости камеры длиной reach): слева направо,
  // чуть поднимаясь; delay/sweep — в такт анимации Iai (клинок проходит экран с 0.07 по 0.23 с)
  slashTrail(attack, { from = -0.55, to = -0.25, dir = 1, delay = 0.06, sweep = 0.17 } = {}) {
    const eye = this.look.position; // глаза (с выглядыванием) — след в плоскости камеры, как и хитбокс
    // straight — на экране прямая линия слева снизу направо, чуть поднимаясь (как рез клинка)
    // От 1-го лица след вылетает из левого нижнего угла камеры (как будто клинок выхвачен у самых глаз),
    // от 3-го лица — только по сектору хитбокса. Сам хитбокс одинаковый
    const corner = this.settings.general.cameraMode === "third" ? null : [-0.5 * dir, -0.4, 0.3];
    this.slashes.add({ origin: eye, yaw: this.player.yaw, pitch: this.look.pitch, roll: this.look.roll || 0, arc: attack.arc, reach: attack.reachFor(this.player), from, to, dir, delay, sweep, straight: true, corner });
  }

  // Что показать на карте (миникарта и большая на M): мир, где игрок, метки
  // Координаты героя — блок, в котором стоят ноги (под миникартой и картой)
  coordsText() {
    const p = (this.player.mount || this.player).position; // верхом — где стоит скакун
    return `X ${Math.floor(p.x)}  Y ${Math.floor(p.y + 0.01)}  Z ${Math.floor(p.z)}`;
  }

  mapData() {
    return {
      world: this.world,
      center: this.player.position,
      yaw: this.look.yaw,
      markers: [
        ...this.entities.list
          .filter((e) => e !== this.player && e.alive)
          .map((e) => ({ x: e.position.x, z: e.position.z, ...markerFor(e) })),
        // Камни и прочее на земле — маленькие серые точки
        ...this.pickups.list.map((p) => ({ x: p.position.x, z: p.position.z, icon: "pebble", color: [150, 150, 158] })),
        // Боссы: где живут (логово / площадка) — видно всегда, за краем карты — прижато к краю;
        // мёртв — рядом таймер, через сколько новый
        ...this.bossSites().map((site, i) => {
          const alive = this.entities.list.some((e) => e.boss && e.lair === i && e.alive);
          const t = Math.ceil(this.lairTimers[i] || 0);
          return { x: site.x + 0.5, z: site.z + 0.5, icon: "skull", color: alive ? [190, 90, 255] : [120, 100, 140], label: alive ? "BOSS" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, clamp: true };
        }),
        // Временная метка: центр мира (0, 0). Если за краем карты — прижата к краю
        { x: 0, z: 0, icon: "cross", color: [255, 80, 80], label: "0,0", clamp: true },
      ],
    };
  }

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
    // Шкуры тролля — к физической броне (вместе с TOUGH BONES), не больше 90 %
    const hide = this.hideArmor(this.trollHides || 0);
    if (hide > 0) p.stats.resist.physical = Math.min(0.9, (p.stats.resist.physical || 0) + hide);
    // Правила классов из талантов (не модификаторы урона) — читают оружие, ловушки, призыв
    this.talentStats = s;
    p.dotCrit = s.dotCrit ? { chance: 0.5, multiplier: s.dotCrit } : null; // PASSIVE CRITS (маг): урон по времени
    // HIGH GROUND (снайпер): прыжок ×1.5 и двойной прыжок
    if (this.controller) {
      this.controller.jumpHeight = PLAYER.jumpHeight * (1 + (s.jumpMult || 0));
      this.controller.extraJumps = s.extraJumps || 0;
    }
    if (!s.empower) p.removeStatus("empower");
    this.applyMagazines();
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
        this.applyPetTalents();
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
    this.applyPetTalents();
    const [item, count] = c.starter;
    this.giveItem(item, count);
    this.abilities.select(this.player.hotbar.slots.findIndex((s) => s?.item === item), this); // сразу в руки
    if (id === "ranged") this.giveAmmoOnce();
    if (id === "beast") {
      this.scatterItem("mushroom", MUSHROOMS.startCount);
      this.giveResource(TURRET.sapling, TURRET.startSaplings); // первый саженец турели
    }
    this.giveResource(BUILD.item, BUILD.pack); // всем (в сумку, не в хотбар) — немного блоков на первую стройку
    this.engine.sound.play("learn");
    this.engine.toast(`CLASS: ${c.name}${refunded ? ` (REFUNDED POINTS: ${refunded})` : ""}`, 3000);
    this.engine.log(`выбран класс ${id}${refunded ? `, возвращено очков ${refunded}` : ""}, выдано ${item} x${count}`);
    this.save(false);
  }

  // ---------- Магазин (клавиша B, движок: engine/economy/shop.js) ----------
  makeShop() {
    // Оружие и инструмент — без ограничений: выбросил случайно — купи снова
    const weapon = (id, price, text) => ({
      id, name: itemName(id), price, describe: () => text, category: ITEMS[id].class || "other",
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
    const F = ATTACKS.fireStaff, W = ATTACKS.frostWand, BT = ATTACKS.bearTrap, SP = ATTACKS.spikes, H = ATTACKS.warHammer, SG = ATTACKS.shotgun, MG = ATTACKS.magmaStone;
    return new Shop({
      currency: "coin",
      currencyName: "COINS",
      // Разделы — по классам оружия, как вкладки талантов
      // Раздел класса виден только своему классу (до выбора класса — только «ПРОЧЕЕ»)
      categories: [
        ...["melee", "ranged", "magic", "beast"].map((id) => ({
          id, name: { melee: "FIGHTER", ranged: "RANGER", magic: "MAGE", beast: "SUMMONER" }[id],
          when: () => CLASSES[this.playerClass]?.shop === id,
        })),
        { id: "other", name: "OTHER" },
      ],
      slots: [
        // В каждом разделе сначала базовое (дёшево), потом продвинутое
        // В каждом разделе сначала базовое (дёшево — если потерял), потом покупное
        weapon("machete", SHOP.machete, `${ATTACKS.machete.damage} DMG, HITS TWO. SWING EVERY 1.4 S`),
        weapon("war-hammer", SHOP["war-hammer"], `TWO-HANDED. SLAMS THE GROUND: ${H.damage} DMG TO ALL WITHIN ${H.radius} BLOCK. TALENTS: STUN, BIGGER SLAM`),
        weapon("spear", SHOP.spear, `${ATTACKS.spear.damage} DMG, LONG REACH, NO BLOCK. RMB (HOLD) - CHARGE THROUGH UP TO ${SPEAR.maxHits} ENEMIES`),
        weapon("katana", SHOP.katana, `${ATTACKS.katana.damage} DMG TO ALL AHEAD. SHEATHE ${KATANA_IAI.sheathTime}S: IAI LUNGE`),
        weapon("pistol", SHOP.pistol, `${ATTACKS.pistol.damage} DMG, MAG ${ATTACKS.pistol.magazine}. RMB - AIM`),
        weapon("auto", SHOP.auto, `${ATTACKS.auto.damage} DMG FULL AUTO, MAG ${ATTACKS.auto.magazine}. MIND THE RECOIL`),
        weapon("shotgun", SHOP.shotgun, `${SG.pellets} PELLETS X ${SG.damage} DMG, MAG ${SG.magazine}. CLOSE RANGE`),
        weapon("rifle", SHOP.rifle, `${ATTACKS.rifle.damage} DMG, MAG ${ATTACKS.rifle.magazine}. RMB - SCOPE`),
        // Обоймы — у каждого ствола своя (R — вставить, недострелянная вернётся в сумку неполной)
        ...Object.entries(CLIPS.items).map(([gun, clip]) => supply(clip, SHOP[clip], 1, `FULL MAGAZINE FOR THE ${itemName(gun)} (${ATTACKS[gun].magazine}). R - RELOAD`)),
        weapon("frost-wand", SHOP["frost-wand"], `${W.damage} DMG, ${W.cost} MANA. ${FROST.freezeAt} HITS FREEZE, FROZEN X${FROST.shatter}`),
        weapon("magma-stone", SHOP["magma-stone"], `THROW: MAGMA PUDDLE ${MG.duration} S, ${MG.damage} DMG/S. ${MG.cost} MANA`),
        weapon("fire-staff", SHOP["fire-staff"], `METEOR: ${F.damage} DMG TO ALL IN ${F.radius} M AFTER ${F.delay} S, BURNS. ${F.cost} MANA`),
        // Ловушки — для всех классов (раздел ПРОЧЕЕ)
        supply("bear-trap", SHOP["bear-trap"], 1, `${BT.damage} DMG + ${TRAPS["bear-trap"].percentHp * 100}% HP, HOLDS ${TRAPS["bear-trap"].root} S. SNAPS TO A BLOCK`),
        supply("spikes", SHOP.spikes, 1, `${SP.damage} DMG TO ALL EVERY ${SP.rearm} S. PERMANENT, UP TO ${TRAPS.spikes.max}`),
        supply("mushroom", SHOP.mushroom, 1, `TAME A BOAR (F), PUT INTO A TURRET (F). MIDDLE SLOT: CLICK - HEALING SHROOM (${HEALER.cost})`),
        supply(TURRET.sapling, SHOP[TURRET.sapling], 1, `E - PLANT: GROWS ${TURRET.grow} S INTO A TURRET. MORE MUSHROOMS IN IT - STRONGER`),
        weapon("builder", SHOP.builder, "LMB - BREAK, RMB - PLACE A BLOCK. G - COLOR"),
        { ...supply(BUILD.item, SHOP.block, BUILD.pack, "BLOCKS FOR BUILDING (HAMMER)"), category: "other" },
        { ...supply("medkit", SHOP.medkit, 1, `MIDDLE SLOT, LMB: +${SHOP.medkitHeal} HP`), category: "other" },
      ],
    });
  }

  openShop() {
    this.pushLive(new ShopScene({
      shop: this.shop,
      buyer: this.player,
      ctx: this,
      onBuy: (slot) => {
        this.engine.sound.play("loot");
        this.engine.log(`куплено: ${slot.name}`);
      },
    }));
  }

  // Выдать предмет: сначала в хотбар (сразу под рукой), не влез — в сумку
  giveItem(id, count = 1) {
    const p = this.player;
    let left = p.hotbar.add(id, count);
    if (left > 0) left = p.inventory.add(id, left);
    this.syncAbilities();
    return left;
  }

  // Панель способностей = хотбар: в каждой ячейке — способность предмета или кулак
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
          if (made.attack?.magazine) made.attack.reserve = this.clipReserve(slot.item); // стволы заряжаются своими обоймами из сумки
          this.abilityCache.set(slot.item, made);
          this.applyMagazines(); // талант MAGAZINE
        }
        ability = this.abilityCache.get(slot.item);
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
        { inventory: this.player.inventory, title: "BAG", cols: 10 },
        {
          inventory: this.player.hotbar, title: "HOTBAR: WEAPON - ITEM - WEAPON", cols: 3,
          label: (i) => Input.label(b[["weaponLeft", "ability2", "weaponRight"][i]]),
          refuse: (item, i) => (HOTBAR_SLOTS[i] === "weapon" ? "ONLY WEAPONS AND TRAPS HERE" : this.playerClass === "beast" ? "ONLY TOOLS, MEDKITS, MUSHROOMS AND TRAPS HERE" : "ONLY TOOLS, MEDKITS AND MUSHROOMS HERE"),
        },
      ],
      onChange: () => this.syncAbilities(),
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

  // Вся сумка и хотбар как «источник» (кормить кабана): count/remove по всем ячейкам
  bagSource() {
    return {
      count: (item) => this.itemCount(item),
      remove: (item, n = 1) => {
        const p = this.player;
        const got = p.inventory.remove(item, n);
        return got + p.hotbar.remove(item, n - got);
      },
    };
  }

  // Средняя ячейка хотбара как «источник» для взаимодействия (кормить кабана): выбирать её не нужно,
  // главное — чтобы там лежало. count/remove — только по ней
  middleSlot() {
    const slots = this.player.hotbar.slots;
    const k = 1;
    return {
      count: (item) => (slots[k]?.item === item ? slots[k].count : 0),
      remove: (item, n = 1) => {
        if (slots[k]?.item !== item) return 0;
        const take = Math.min(n, slots[k].count);
        slots[k].count -= take;
        if (slots[k].count <= 0) slots[k] = null;
        return take;
      },
    };
  }

  // ---------- Приручённые звери ----------

  // Наши приручённые звери (живые)
  pets() {
    return this.entities.list.filter((e) => e.alive && e.taming?.tamed && e.taming.owner === this.player);
  }

  // Призванные героя: приручённые кабаны и турели-грибы (живые)
  summons() {
    return this.entities.list.filter((e) => e.alive && ((e.taming?.tamed && e.taming.owner === this.player) || e.type === "turret" || e.type === "healer"));
  }

  // Таланты ПРИЗЫВАТЕЛЯ → призванные: урон, скорость атаки, броня, реген (%), у кабанов — оглушение и
  // вампиризм. Турель: сила — от числа грибов (TURRET). Трофеи: «SUMMONER TROPHIES» — +% урона всем призванным.
  // keepHp — не менять текущее здоровье (после загрузки: оно уже сохранено)
  applyPetTalents(keepHp = false) {
    const s = this.talentStats || {};
    const trophy = this.talents.rank(TROPHY_TALENTS.summon) > 0 ? TROPHY.pct.summon : 0;
    for (const e of this.summons()) {
      const def = CREATURES[e.type];
      const hp = e.stats.hp;
      const hpTrophy = this.talents.rank("trophies") > 0 ? Math.floor(e.trophyHp || 0) : 0;
      if (e.type === "turret") {
        const n = e.inventory.count("mushroom"); // сила — от грибов в её ячейке (без предела)
        e.setMaxHp(TURRET.base.hp + TURRET.per.hp * n);
        e.attack ||= new MagicAttack({ ...ATTACKS.spore });
        e.attack.kind = "summon";
        e.attack.damage = Math.round((TURRET.base.damage + TURRET.per.damage * n) * 10) / 10;
        e.attack.cooldown = Math.max(TURRET.minCooldown, TURRET.base.cooldown + TURRET.per.cooldown * n);
        // Растёт или пустая (без грибов) — не стреляет и не отвлекает мобов
        const active = !(e.growLeft > 0) && n > 0;
        e.turretBrain ||= new TurretBrain({ range: TURRET.range, onFire: (t, target) => this.turretFire(t, target) });
        e.brain = active ? e.turretBrain : null;
        e.tauntRadius = active ? TURRET.taunt : 0; // мобы ближе 3 блоков бросают героя и бьют турель (движок: auraTarget)
        if (e.growLeft > 0) e.scale = CREATURES.turret.scale * (0.3 + 0.7 * (1 - e.growLeft / TURRET.grow));
      } else {
        e.setMaxHp(def.maxHp + (e.bonusHp || 0) + (e.worldHp || 0) + hpTrophy);
        if (e.attack) e.attack.kind = "summon"; // трофеи и счёт убийств — «призванные»
      }
      e.modifiers = [];
      const dmg = (1 + (s.summonDamage || 0)) * (1 + trophy / 100);
      if (dmg !== 1) e.modifiers.push(damageMultiplier(dmg));
      if (s.summonSpeed) e.modifiers.push(cooldownReduction(1 - 1 / (1 + s.summonSpeed)));
      if (e.type === "boar") {
        if (s.boarStun) e.modifiers.push(withStatus(stun(s.boarStun)));
        if (s.boarLeech) e.modifiers.push(lifesteal(s.boarLeech));
      }
      if (keepHp) e.stats.hp = Math.min(hp, e.stats.maxHp);
      e.regen = (def.regen || 0) + e.stats.maxHp * (s.summonRegen || 0);
      e.stats.resist = { ...(def.resist || {}), physical: Math.min(0.9, (def.resist?.physical || 0) + (s.summonArmor || 0)) };
      // Сборщики (FORAGERS): кабан бежит к грибам рядом и приносит их герою
      e.onFetch = (pick) => {
        if (!pick.alive || !this.pickups.list.includes(pick)) return;
        const left = this.giveResource(pick.item, pick.count);
        if (left > 0) pick.count = left;
        else this.pickups.remove(pick);
        this.engine.sound.play("pickup", { at: e.position });
      };
    }
  }

  // Турель-гриб стреляет спорой в цель (снаряд летит прямо; талант: быстрее и насквозь)
  turretFire(t, target) {
    const s = this.talentStats || {};
    const from = { x: t.position.x, y: t.position.y + t.height * 0.75, z: t.position.z };
    const to = { x: target.position.x, y: target.position.y + target.height * 0.5, z: target.position.z };
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const speed = TURRET.speed * (1 + (s.turretSpeed || 0));
    const attack = t.attack;
    this.projectiles.launch({
      owner: t, position: from, velocity: { x: (d.x / len) * speed, y: (d.y / len) * speed, z: (d.z / len) * speed },
      item: "spore", gravity: 0, spin: 0.5, maxLife: (TURRET.range * 1.5) / speed, pierce: s.turretPierce || 0,
      onHit: (p, hit) => {
        const e = hit.entity;
        if (!t.isHostileTo(e)) return;
        attack.hit(t, e, { entities: this.entities.list });
        // SECONDARY TARGETS: ещё 1–2 врага рядом с попавшим — по 50 %
        const n = s.turretSplit || 0;
        if (n > 0) {
          const near = this.entities.list
            .filter((o) => o !== e && o.alive && t.isHostileTo(o) && Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) <= TURRET.split.radius)
            .slice(0, n);
          for (const o of near) {
            attack.hit(t, o, { entities: this.entities.list, baseDamage: attack.roll() * TURRET.split.share });
            this.beams.add({ from: { x: e.position.x, y: e.position.y + 1, z: e.position.z }, to: { x: o.position.x, y: o.position.y + 1, z: o.position.z }, color: [120, 230, 100], core: [220, 255, 200], life: 0.2, width: 4 });
          }
        }
      },
      onLand: () => {},
    });
  }

  // Точка на земле под прицелом не дальше 8 м (посадить турель, гриб) — { x, y, z } или null (с подсказкой)
  groundAim() {
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const hit = this.world.raycast(cam.position, dir, 8 + this.rig.behind);
    const pos = hit && cam.position.add(dir.scale(hit.t));
    if (!hit || (hit.block && hit.place.y !== hit.block.y + 1) || Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z) > 8) {
      this.engine.toast("AIM AT THE GROUND NEARBY", 1200);
      return null;
    }
    return { x: pos.x, y: hit.place.y, z: pos.z };
  }

  // E (ПРИЗЫВАТЕЛЬ): посадить САЖЕНЕЦ турели — растёт TURRET.grow с, потом F — положить в неё грибы
  plantSapling() {
    if (this.itemCount(TURRET.sapling) <= 0) return this.engine.toast("NO TURRET SAPLINGS: BUY IN THE SHOP OR LOOT ENEMIES", 1800);
    const at = this.groundAim();
    if (!at) return;
    const turrets = this.entities.list.filter((e) => e.type === "turret" && e.alive);
    if (turrets.length >= TURRET.max) this.removeEntity(turrets[0]); // сверх лимита — самая старая уходит
    this.takeItem(TURRET.sapling, 1);
    const t = this.spawn("turret", { x: at.x, y: at.y, z: at.z, yaw: this.player.yaw, growLeft: TURRET.grow });
    this.applyPetTalents();
    t.stats.hp = t.stats.maxHp;
    this.player.view?.animator.playOnce("Throw");
    this.engine.sound.play("place");
    this.engine.toast(`SAPLING PLANTED: GROWS ${TURRET.grow} S, THEN ${Input.label(this.settings.controls.bindings.interact)} - PUT MUSHROOMS IN`, 2500);
  }

  // Турели растут: саженец понемногу становится больше; вырос — можно класть грибы
  updateTurrets(dt) {
    for (const t of this.entities.list) {
      if (t.type !== "turret" || !t.alive || !(t.growLeft > 0)) continue;
      t.growLeft = Math.max(0, t.growLeft - dt);
      t.scale = CREATURES.turret.scale * (0.3 + 0.7 * (1 - t.growLeft / TURRET.grow)); // от росточка до полной
      if (t.growLeft === 0) {
        this.applyPetTalents(true);
        this.engine.sound.play("learn", { at: t.position });
        this.engine.toast(`TURRET GREW: ${Input.label(this.settings.controls.bindings.interact)} - PUT MUSHROOMS IN`, 2000);
      }
    }
  }

  // F по своей выросшей турели: её ячейка грибов рядом с сумкой — перекладывай сколько хочешь (ПКМ — по одному)
  openTurret(t) {
    if (t.growLeft > 0) return this.engine.toast(`STILL GROWING: ${Math.ceil(t.growLeft)} S`, 1200);
    const b = this.settings.controls.bindings;
    this.pushLive(new InventoryScene({
      entity: this.player, itemInfo, title: "MUSHROOM TURRET", dropKey: Input.label(b.drop),
      sections: [
        { inventory: t.inventory, title: "TURRET: MUSHROOMS (MORE - STRONGER)", cols: 1, refuse: () => "ONLY MUSHROOMS" },
        { inventory: this.player.inventory, title: "BAG", cols: 10 },
        { inventory: this.player.hotbar, title: "HOTBAR", cols: 3, label: (i) => Input.label(b[["weaponLeft", "ability2", "weaponRight"][i]]) },
      ],
      onChange: () => {
        this.syncAbilities();
        const hp = t.stats.hp / t.stats.maxHp;
        this.applyPetTalents(true);
        t.stats.hp = Math.max(1, Math.round(t.stats.maxHp * hp)); // сила поменялась — здоровье в той же доле
      },
      onDrop: (item, count, data) => this.pickups.add(item, count, { x: t.position.x, y: t.position.y + 0.6, z: t.position.z }, { data, ignore: this.player }),
    }));
  }

  // Q (ПРИЗЫВАТЕЛЬ): метка — кабаны бьют именно этого врага (под прицелом), над ним красная метка
  markBoarTarget() {
    const t = this.aimedEntity(40);
    if (!t || !this.player.isHostileTo(t)) {
      if (this.boarTarget) {
        this.boarTarget = null;
        for (const pet of this.pets()) pet.focus = null;
        return this.engine.toast("MARK REMOVED", 900);
      }
      return this.engine.toast("AIM AT AN ENEMY TO MARK IT", 1200);
    }
    this.boarTarget = t;
    const pets = this.pets();
    for (const pet of pets) pet.focus = t; // движок: FollowBrain — приказ важнее всего
    this.engine.sound.play("growl", { volume: 0.7 });
    this.engine.toast(pets.length ? `BOARS: ATTACK ${t.name}!` : "MARKED (NO TAMED BOARS)", 1200);
  }

  // Красная метка над целью кабанов (пока жива)
  drawBoarMark() {
    const t = this.boarTarget;
    if (!t) return;
    if (!t.alive) {
      this.boarTarget = null;
      return;
    }
    const top = t.position.y + t.height + 0.35;
    this.beams.add({ from: { x: t.position.x, y: top + 0.45, z: t.position.z }, to: { x: t.position.x, y: top, z: t.position.z }, color: [255, 50, 40], core: [255, 200, 190], life: 0.04, width: 8 });
    this.beams.ring({ x: t.position.x, y: t.position.y + 0.05, z: t.position.z }, Math.max(0.6, t.radius + 0.3), { color: [255, 50, 40], life: 0.04, width: 4, segments: 14 });
  }

  // Средняя ячейка с грибами, ПКМ: ЦЕЛЕБНЫЙ ГРИБ (HEALER) — HEALER.cost грибов, живёт HEALER.life с
  plantHealer() {
    if (this.playerClass !== "beast") return this.engine.toast("ONLY A SUMMONER CAN GROW MUSHROOMS", 1500);
    if (this.itemCount("mushroom") < HEALER.cost) return this.engine.toast(`NEED ${HEALER.cost} MUSHROOMS`, 1200);
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const hit = this.world.raycast(cam.position, dir, 8 + this.rig.behind);
    const pos = hit && cam.position.add(dir.scale(hit.t));
    if (!hit || (hit.block && hit.place.y !== hit.block.y + 1) || Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z) > 8) {
      return this.engine.toast("AIM AT THE GROUND NEARBY", 1200);
    }
    const mine = this.entities.list.filter((e) => e.type === "healer" && e.alive);
    if (mine.length >= HEALER.max) this.removeEntity(mine[0]); // сверх лимита — самый старый уходит
    this.takeItem("mushroom", HEALER.cost);
    const h = this.spawn("healer", { x: pos.x, y: hit.place.y, z: pos.z, yaw: this.player.yaw });
    this.applyPetTalents();
    h.stats.hp = h.stats.maxHp;
    this.viewModel()?.play("Use");
    this.engine.sound.play("learn");
    this.engine.toast(`HEALING SHROOM: +${HEALER.heal * 100}% HP/S AROUND, ${HEALER.life} S`, 2000);
  }

  // Целебные грибы: раз в секунду лечат героя и призванных в радиусе (зелёные лучи); отжили — пропадают
  updateHealers(dt) {
    for (const h of this.entities.list) {
      if (h.type !== "healer" || !h.alive) continue;
      if (h.age > HEALER.life) {
        this.beams.ring({ x: h.position.x, y: h.position.y + 0.05, z: h.position.z }, 0.8, { color: [120, 230, 120], life: 0.4, width: 5 });
        this.removeEntity(h);
        continue;
      }
      h.healTimer = (h.healTimer ?? 1) - dt;
      if (h.healTimer > 0) continue;
      h.healTimer = 1;
      for (const o of [this.player, ...this.summons()]) {
        if (o === h || !o.alive || o.stats.hp >= o.stats.maxHp) continue;
        if (Math.hypot(o.position.x - h.position.x, o.position.z - h.position.z) > HEALER.radius) continue;
        o.heal(o.stats.maxHp * HEALER.heal);
        this.beams.add({ from: { x: h.position.x, y: h.position.y + 0.9, z: h.position.z }, to: { x: o.position.x, y: o.position.y + o.height * 0.6, z: o.position.z }, color: [120, 230, 120], core: [220, 255, 220], life: 0.25, width: 4 });
      }
      this.beams.ring({ x: h.position.x, y: h.position.y + 0.05, z: h.position.z }, HEALER.radius, { color: [110, 220, 110], life: 0.3, width: 3, segments: 24 });
    }
  }

  // Средняя ячейка: аптечка
  useMedkit() {
    const p = this.player;
    if (this.itemCount("medkit") <= 0) return;
    if (p.stats.hp >= p.stats.maxHp) return this.engine.toast("HEALTH IS FULL", 800);
    this.takeItem("medkit", 1);
    p.heal(SHOP.medkitHeal);
    this.engine.sound.play("learn");
    this.engine.toast(`+${SHOP.medkitHeal} HP`, 800);
  }

  // Боевой молот: пока идёт удар — на 40 % медленнее, в воздухе падаем быстрее (удар — о землю);
  // талант JUMP SLAM — с молотом в руках прыжок выше на 80 % (HAMMER)
  hammerControl(dt) {
    const p = this.player;
    const swinging = !!this.abilityCache.get("war-hammer")?.attack.pending;
    if (swinging) p.speedBonuses.hammer = HAMMER.slow;
    else delete p.speedBonuses.hammer;
    if (swinging && !p.onGround) p.velocity.y -= HAMMER.fastFall * dt;
    const leap = this.talentStats?.hammerLeap && this.abilities.current?.id === "war-hammer" ? HAMMER.leap : 0;
    this.controller.jumpHeight = PLAYER.jumpHeight * (1 + (this.talentStats?.jumpMult || 0) + leap);
  }

  // ---------- Баффы и перезарядки (панель у хотбара: hud.js) ----------

  // Баффы и дебаффы героя — значки НАД хотбаром: статусы (движок), прибавки и штрафы к скорости,
  // готовый крит, разбег, навсегда полученное (шкуры, короны). Каждый: { icon, name, positive, color, label?, left? }
  buffList() {
    const p = this.player;
    const list = p.statuses.filter((st) => st.icon || st.name).map((st) => st); // статусы как есть (бафф — зелёная рамка, дебафф — красная)
    let up = 0, down = 0;
    for (const v of Object.values(p.speedBonuses)) (v > 0 ? (up += v) : (down += v));
    for (const st of p.statuses) if (st.speed) (st.speed > 0 ? (up += st.speed) : (down += st.speed));
    if (up > 0.001) list.push({ icon: "SPD", name: "SPEED", positive: true, color: [110, 200, 255], label: `+${Math.round(up * 100)}%` });
    if (down < -0.001) list.push({ icon: "SLW", name: "SLOW", positive: false, color: [235, 120, 70], label: `${Math.round(down * 100)}%` });
    if (this.spearRun.active) list.push({ icon: "CHG", name: "CHARGE", positive: true, color: [255, 200, 90], label: `X${this.spearRun.power.toFixed(1)}` });
    const crit = this.talents.rank("f-crit");
    if (crit && this.playerClass === "melee" && critCooldown(p, "fighter-crit") <= 0) list.push({ icon: "CRT", name: "CRIT", positive: true, color: [255, 210, 80], label: `X${crit > 1 ? 3 : 2}` });
    const hide = this.hideArmor(this.trollHides || 0), crown = this.crownDamage(this.boneCrowns || 0);
    if (hide > 0) list.push({ icon: "ARM", name: "TROLL HIDE", positive: true, color: [140, 170, 110], label: `-${Math.round(hide * 1000) / 10}%` });
    if (crown > 0) list.push({ icon: "DMG", name: "BONE CROWN", positive: true, color: [200, 170, 255], label: `+${Math.round(crown * 1000) / 10}%` });
    return list;
  }

  // Все перезарядки — «часиками» ПОД хотбаром: { icon, color, progress (0…1 — сколько уже прошло), left, draw? }
  cooldownList() {
    const p = this.player;
    const list = [];
    const cur = this.abilities.current;
    const atk = cur?.attack;
    // Оружие в руках: перезарядка обоймы и долгая перезарядка удара / выстрела (от 0.8 с)
    if (atk?.reloading) list.push({ icon: "RLD", color: [240, 196, 80], progress: atk.reloadProgress, left: atk.reloadLeft });
    else if (atk && atk.cooldownLeft > 0.05) {
      const total = Math.max(atk.cooldownLeft, atk.cooldown);
      if (total >= 0.8) list.push({ icon: "ATK", color: [220, 220, 230], progress: 1 - atk.cooldownLeft / total, left: atk.cooldownLeft, draw: cur.drawIcon ? (ui, x, y, s) => cur.drawIcon(ui, x, y, s, this) : null });
    }
    if (cur?.blocks && this.blockCooldown > 0) list.push({ icon: "BLK", color: [150, 200, 255], progress: 1 - this.blockCooldown / BLOCK.cooldown, left: this.blockCooldown });
    // Катана копит ИАЙ (в ножнах)
    if (cur?.iaiProgress !== undefined && !p.hasStatus("iai")) list.push({ icon: "IAI", color: [255, 120, 90], progress: cur.iaiProgress, left: KATANA_IAI.sheathTime * (1 - cur.iaiProgress) });
    // Гарантированный крит бойца
    const crit = this.talents.rank("f-crit");
    const cl = crit && this.playerClass === "melee" ? critCooldown(p, "fighter-crit") : 0;
    if (cl > 0) list.push({ icon: "CRT", color: [255, 210, 80], progress: 1 - cl / (crit > 1 ? 7 : 8), left: cl });
    // Разбег с копьём
    if (this.spearCd > 0) list.push({ icon: "CHG", color: [255, 200, 90], progress: 1 - this.spearCd / SPEAR.cooldown, left: this.spearCd });
    // Маг: EMPOWER копится
    if (this.talentStats?.empower && !p.hasStatus("empower")) list.push({ icon: "PWR", color: [255, 160, 60], progress: this.empowerTimer / EMPOWER.every, left: EMPOWER.every - this.empowerTimer });
    return list;
  }

  // Окно поверх мира, которое время не останавливает (движок: scene.live) — карта, таланты, магазин, инвентарь.
  // Останавливают только меню паузы / настройки
  pushLive(scene) {
    scene.live = true;
    this.engine.push(scene);
  }

  // ПКМ с копьём: разбег (SPEAR). Перезарядка — после конца разбега
  startSpearCharge() {
    if (this.spearRun.active || this.player.mount) return;
    if (this.spearCd > 0) return this.engine.toast(`CHARGE READY IN ${Math.ceil(this.spearCd)} S`, 700);
    // Талант MOMENTUM: разгон до +30/60/90 % скорости (за rampTime с), а насквозь — на +2/4/6 врагов больше
    const r = this.talents.rank("spear-momentum");
    const bonus = r ? SPEAR.momentum.speed[r - 1] : 0;
    this.spearRun.maxSpeed = SPEAR.charge.speed * (1 + bonus);
    this.spearRun.ramp = bonus ? (SPEAR.charge.speed * bonus) / SPEAR.momentum.rampTime : 0;
    this.spearMaxHits = SPEAR.maxHits + (r ? SPEAR.momentum.hits[r - 1] : 0);
    this.spearRun.start(this.player, this.look.yaw);
    this.spearHits = new Set();
    this.spearAttack ||= new MeleeAttack(ATTACKS.spearCharge);
    this.engine.sound.play("growl", { volume: 0.5 });
  }

  // Разбег идёт: держим ПКМ — бежим; кого коснулся наконечник — урон (больше на большой скорости), насквозь
  // до SPEAR.maxHits; отпустил, сменил оружие, упёрся в стену, набрал 5 — конец и перезарядка
  spearControl(dt) {
    this.spearCd = Math.max(0, this.spearCd - dt);
    const run = this.spearRun;
    if (!run.active) return;
    const p = this.player;
    const end = () => {
      run.stop();
      this.spearCd = SPEAR.cooldown;
    };
    if (this.background || !this.engine.input.isDown("secondary") || this.abilities.current?.id !== "spear" || p.mount || !p.alive) return end();
    if (p.blocked && run.left < run.duration - 0.25) return end(); // упёрлись в стену
    run.update(dt, this.look.yaw);
    if (!run.active) return end();
    const tip = { x: p.position.x + Math.sin(run.yaw) * SPEAR.tip, z: p.position.z + Math.cos(run.yaw) * SPEAR.tip };
    for (const e of this.entities.list) {
      if (this.spearHits.size >= this.spearMaxHits) break;
      if (e === p || !e.alive || this.spearHits.has(e) || !p.isHostileTo(e) || !e.canBeDamagedBy(p)) continue;
      const dy = e.position.y - p.position.y;
      if (dy < -1.2 || dy > 1.8) continue;
      if (Math.hypot(e.position.x - tip.x, e.position.z - tip.z) > SPEAR.hitRadius + e.radius) continue;
      if (this.blockedBetween(p, e)) continue;
      this.spearHits.add(e);
      const k = run.power ** SPEAR.powerExp; // быстрее бежишь — сильнее бьёшь (с MOMENTUM 3 — до ×2.6)
      this.spearAttack.hit(p, e, this.combatContext({ baseDamage: this.spearAttack.roll() * k, onHit: (h) => this.onPlayerHit(h) }));
      this.engine.sound.play("hit", { at: e.position });
    }
    if (this.spearHits.size >= this.spearMaxHits) end(); // насадили сколько могли — хватит
  }

  // JUMP SLAM: во сколько раз сильнее удар после падения с высоты fall (м)
  slamFallMultiplier(fall) {
    if (!this.talentStats?.hammerLeap) return 1;
    return Math.min(HAMMER.maxMult, 1 + HAMMER.perBlock * fall);
  }

  // Боевой молот ударил о землю (движок: SlamAttack → onSlam): круг удара, тряска экрана, звук
  hammerSlam(center, radius, hits, info = {}) {
    if (info.k > 1.05) {
      // Удар с прыжка — круг шире и ярче, и надпись, во сколько раз сильнее
      this.beams.ring({ x: center.x, y: center.y + 0.05, z: center.z }, radius * 1.3, { color: [255, 210, 120], life: 0.35, width: 9 });
      this.engine.toast(`JUMP SLAM X${info.k.toFixed(1)}`, 700);
    }
    this.beams.ring({ x: center.x, y: center.y + 0.05, z: center.z }, radius, { color: [210, 200, 180], life: 0.3, width: 7 });
    this.beams.ring({ x: center.x, y: center.y + 0.05, z: center.z }, radius * 0.5, { color: [160, 150, 130], life: 0.2, width: 5, segments: 12 });
    this.recoil.kick(HAMMER_SHAKE);
    this.engine.sound.play(hits.length ? "hit" : "place", { at: center });
  }

  // Автомат выстрелил: талант GRENADE — каждые 15 выстрелов граната (200 % урона выстрела по площади)
  onRifleShot(attack) {
    if (!this.talentStats.rifleGrenade) return;
    this.rifleShots = (this.rifleShots || 0) + 1;
    if (this.rifleShots < ATTACKS.grenade.every) return;
    this.rifleShots = 0;
    const G = ATTACKS.grenade;
    const nade = new MagicAttack({ ...G, damage: Math.round(ATTACKS.auto.damage * 2) });
    nade.kind = "ranged";
    const dir = this.rig.camera.lookDirection();
    const from = this.handPoint();
    const boom = (p) => this.explode(nade, p.position, [], { radius: G.radius });
    this.projectiles.launch({ owner: this.player, position: from, velocity: dir.scale(G.speed), item: "grenade", gravity: 12, spin: 2, maxLife: 3, onHit: boom, onLand: boom, onExpire: boom });
    this.engine.sound.play("cast");
  }

  // Засадник: маленький скелет-камикадзе из сработавшего капкана (талант SKELETON)
  spawnMinion(at, trapDamage) {
    const m = this.spawn("minion", { x: at.x, y: at.y, z: at.z, yaw: Math.random() * Math.PI * 2 });
    if (!m) return;
    m.stats.maxHp = m.stats.hp = MINION.hp;
    const blast = new MagicAttack({ id: "minion-blast", name: "MINION BLAST", damage: Math.max(1, Math.round(trapDamage * MINION.share)), radius: MINION.radius, cost: 0 });
    blast.kind = "trap";
    m.brain = new KamikazeBrain({
      range: MINION.range, fuse: MINION.fuse, speed: MINION.speed,
      onBoom: (e) => {
        this.explode(blast, { x: e.position.x, y: e.position.y + 0.5, z: e.position.z }, [], { radius: MINION.radius });
        e.noLoot = true;
      },
    });
    m.noLoot = true;
  }

  // Засадник: ядовитый туман на месте убийства (талант DEADLY MIST) — 5 % макс. HP в секунду врагам внутри
  spawnMist(at) {
    const p = this.player;
    const attack = new MagicAttack({ id: "mist", name: "DEADLY MIST", damage: 0, element: "poison", cost: 0 });
    attack.kind = "trap";
    this.zones.add({
      position: at, radius: MIST.radius, duration: MIST.duration, interval: 0.5, owner: p, data: { kind: "mist" },
      filter: (e) => p.isHostileTo(e),
      onTick: (z, inside) => {
        for (const e of inside) attack.hit(p, e, this.combatContext({ baseDamage: Math.max(1, e.stats.maxHp * MIST.pct * z.interval), noElementStatus: true, onHit: (h) => this.onPlayerHit(h) }));
      },
    });
  }

  // Засадник: получил урон — под тобой случайная ловушка (талант REFLEX TRAP, не чаще раза в 10 с).
  // Своя ловушка-рефлекс тебя не ранит
  reflexTrap() {
    if (!this.talentStats.autoTrap || this.autoTrapTimer < AUTO_TRAP.cooldown) return;
    this.autoTrapTimer = 0;
    const type = Math.random() < 0.5 ? "bear-trap" : "spikes";
    const p = this.player.position;
    while (this.traps.count(this.player, type) >= TRAPS[type].max) this.traps.remove(this.traps.oldest(this.player, type));
    this.placeTrapAt(type, { x: Math.floor(p.x) + 0.5, y: this.world.surfaceY(p.x, p.z), z: Math.floor(p.z) + 0.5 }, { yaw: 0, safe: true }); // по сетке
    this.engine.sound.play("trapSet");
    this.engine.log(`ловушка-рефлекс: ${type}`);
  }

  // Каждый кадр: таймеры талантов (EMPOWER, REFLEX TRAP), рисунок зон, сборщики грибов
  updateClassTalents(dt) {
    const s = this.talentStats || {};
    const p = this.player;
    this.autoTrapTimer += dt;
    // EMPOWER: раз в 30 с — бафф «следующее заклинание усилено»
    if (s.empower && !p.hasStatus("empower")) {
      this.empowerTimer += dt;
      if (this.empowerTimer >= EMPOWER.every) {
        p.addStatus(buff({ id: "empower", name: "EMPOWER", icon: "PWR", color: [255, 160, 60], duration: Infinity }));
        this.engine.sound.play("learn");
      }
    }
    // REFLEX TRAP: здоровье упало — значит, ранили
    if (this.lastHp !== undefined && p.stats.hp < this.lastHp) this.reflexTrap();
    this.lastHp = p.stats.hp;
    // Зоны: лужа магмы — оранжевый круг, туман — зелёный
    for (const z of this.zones.list) {
      const c = { x: z.position.x, y: z.position.y + 0.06, z: z.position.z };
      const color = z.data.kind === "mist" ? [120, 200, 90] : [255, 110, 30];
      const pulse = 0.85 + 0.15 * Math.sin(z.age * 6);
      this.beams.ring(c, z.radius * pulse, { color, life: 0.04, width: 6, segments: 18 });
      this.beams.ring(c, z.radius * 0.55 * pulse, { color: z.data.kind === "mist" ? [170, 240, 140] : [255, 200, 80], life: 0.04, width: 4, segments: 12 });
    }
    // FORAGERS: кабаны бегут к грибам не дальше 10 м
    if (s.fetch) {
      for (const e of this.summons()) {
        if (e.type !== "boar" || e.fetch || e.aggro || e.rider) continue;
        const m = this.pickups.list.find((k) => k.item === "mushroom" && Math.hypot(k.position.x - e.position.x, k.position.z - e.position.z) <= 10);
        if (m) e.fetch = m;
      }
    }
  }

  // Талант «РОСТ»: раз в минуту зверь навсегда получает +10 к макс. HP (bonusHp — в сохранении)
  growPets(dt) {
    if (this.talents.rank("boar-growth") === 0) return;
    const g = BOAR_GROWTH;
    for (const e of this.pets()) {
      e.growTime = (e.growTime || 0) + dt;
      if (e.growTime < g.growEvery) continue;
      e.growTime -= g.growEvery;
      e.bonusHp = (e.bonusHp || 0) + g.growHp;
      this.applyPetTalents(); // макс. HP вырос — и текущее на столько же
      this.engine.toast(`${e.name} GREW: +${g.growHp} HP (${e.stats.maxHp})`, 1800);
      this.engine.log(`${e.name} подрос: макс. HP ${e.stats.maxHp}`);
    }
  }

  // Кабаны крепчают по счёту появлений мобов (BOAR_SCALE): дикие — сразу, приручённый — через applyPetTalents
  // (worldHp не сохраняется — всегда считается заново от счёта). keepHp — после загрузки: здоровье уже из сохранения
  scaleBoars(keepHp = false) {
    const n = this.spawner.spawned;
    const g = BOAR_SCALE;
    const def = CREATURES.boar;
    const worldHp = grow(0, n, g.hp);
    for (const e of this.entities.list) {
      if (e.type !== "boar" || !e.alive) continue;
      e.worldHp = worldHp;
      e.xp = grow(def.xp, n, g.xp);
      if (e.attack) e.attack.damage = grow(ATTACKS.boarTusk.damage, n, g.damage);
      if (e.taming?.tamed) continue; // приручённого считает applyPetTalents (там ещё таланты и трофеи)
      const hp = e.stats.hp;
      e.setMaxHp(def.maxHp + (e.bonusHp || 0) + worldHp);
      if (keepHp) e.stats.hp = Math.min(hp, e.stats.maxHp);
      if (e.taming) e.taming.need = this.mushroomsFor(e);
    }
    if (!keepHp) this.applyPetTalents();
  }

  // Сколько грибов нужно, чтобы приручить кабана: 1 + по одному за каждые 100 HP
  mushroomsFor(e) {
    return BOARS.tameBase + Math.floor(e.stats.maxHp / BOARS.tamePerHp);
  }

  // Страж растёт вместе с мобами (тот же счёт появлений): здоровье — как у мобов, урон — медленнее
  scaleWardens() {
    const n = this.spawner.spawned;
    const g = WARDEN_GROWTH;
    for (const e of this.entities.list) {
      if (e.type !== "warden" || !e.alive) continue;
      e.setMaxHp(grow(CREATURES.warden.maxHp, n, g.hp));
      if (e.attack) e.attack.damage = grow(ATTACKS.wardenSword.damage, n, g.damage);
    }
  }

  // ---------- Боссы в логовах ----------

  // Сколько урона дают n корон лича: первая BONE_CROWN.first, каждая следующая на step меньше (не меньше 0)
  crownDamage(n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.max(0, BONE_CROWN.first - BONE_CROWN.step * i);
    return sum;
  }

  // Сколько брони дают n шкур тролля: первая TROLL_HIDE.first, каждая следующая на step меньше (не меньше 0)
  hideArmor(n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.max(0, TROLL_HIDE.first - TROLL_HIDE.step * i);
    return sum;
  }

  // Логова (terrain.lairs): в каждом — свой тролль. Погиб — через BOSS.respawn секунд новый.
  // Таймеры — в сохранении (сам босс не сохраняется: после загрузки появится заново, если пора)
  updateLairs(dt) {
    this.bossSites().forEach((lair, i) => {
      const boss = this.entities.list.find((e) => e.boss && e.lair === i);
      if (boss && !boss.alive && !boss.respawnSet) {
        boss.respawnSet = true;
        this.lairTimers[i] = BOSS.respawn; // убит — новый через 3 минуты
        this.engine.log(`босс логова ${i} повержен: новый через ${BOSS.respawn} с`);
      }
      if (boss?.alive) return this.bossTick(boss, lair, dt);
      this.lairTimers[i] = Math.max(0, (this.lairTimers[i] || 0) - dt);
      if (this.lairTimers[i] > 0 || (boss && !boss.alive && this.entities.list.includes(boss))) return; // ждём (и пока лежит тело)
      this.spawnBoss(i);
    });
  }

  // Где живут боссы: логова в горах — ТРОЛЛИ; нет ни одного логова — ЖЁЛТАЯ ПЛОЩАДКА ЛИЧА (this.arena).
  // Номер места — индекс в lairTimers (площадка — только когда логов нет, так что номера не путаются)
  bossSites() {
    return [...(this.terrain?.lairs || []).map((l) => ({ ...l, type: "troll" })), ...(this.arena ? [{ ...this.arena, type: "lich" }] : [])];
  }

  // Место площадки лича — по зерну мира: середина маленького острова без горки, иначе — главный остров
  // на WORLDGEN.arena.distance от центра, не в горе. { x, y, z, r } — y: где стоят (над жёлтым настилом)
  arenaSpot() {
    const T = this.terrain;
    if (!T || T.lairs.length) return null;
    const A = WORLDGEN.arena;
    const rnd = seededRandom(T.seed * 7 + 3);
    const flat = T.discs.filter((d) => !d.main && d.r - d.edge >= A.radius && !T.mountains.some((m) => Math.hypot(m.x - d.x, m.z - d.z) < 1));
    let x, z;
    if (flat.length) {
      const d = flat[Math.floor(rnd() * flat.length)];
      x = Math.round(d.x);
      z = Math.round(d.z);
    } else {
      for (let k = 0; k < 16; k++) {
        const a = rnd() * Math.PI * 2;
        x = Math.round(Math.sin(a) * A.distance);
        z = Math.round(Math.cos(a) * A.distance);
        if (!T.mountains.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + A.radius) && !T.plateaus.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + p.edge + A.radius)) break;
      }
    }
    const g = Math.max(1, Math.round(this.groundHeight(x, z)));
    return { x, z, r: A.radius, y: g + 1 };
  }

  // Построить площадку: выровнять землю, круглый жёлтый настил в блок высотой и 4 каменных столба по краям
  buildArena(a) {
    const W = WORLDGEN;
    const g = a.y - 1;
    flattenArea(this.world, { x: a.x - a.r, z: a.z - a.r, w: a.r * 2 + 1, d: a.r * 2 + 1, y: g, top: W.colors.grass, fill: W.colors.dirt });
    for (let i = -a.r; i <= a.r; i++) for (let k = -a.r; k <= a.r; k++) {
      if (Math.hypot(i, k) <= a.r + 0.3) this.world.place(a.x + i, g, a.z + k, W.arena.color);
    }
    const p = Math.round(a.r * 0.75);
    for (const [i, k] of [[p, p], [-p, p], [p, -p], [-p, -p]]) {
      for (let j = 0; j < 3; j++) this.world.place(a.x + i, a.y + j, a.z + k, W.colors.stone);
    }
    this.engine.log(`площадка лича: (${a.x}, ${a.z}), радиус ${a.r}`);
  }

  // Босс в месте i: в центре, лицом к центру мира; не выходит за свою территорию; сила — по счёту мобов
  spawnBoss(i) {
    const lair = this.bossSites()[i];
    const x = lair.x + 0.5, z = lair.z + 0.5;
    const type = lair.type; //  в логове — тролль, на площадке — лич
    const e = this.spawn(type, { x, y: lair.y, z, yaw: Math.atan2(-lair.x, -lair.z) });
    if (!e) return;
    e.lair = i;
    e.summonTimer = LICH.summon.every * 0.5; // лич: первых скелетов — побыстрее
    e.blinkCd = 0;
    e.brain.territory = { x, z, radius: lair.r + BOSS.territory };
    this.scaleBoss(e);
    e.stats.hp = e.stats.maxHp;
    this.engine.log(`босс в логове ${i} (${lair.x}, ${lair.z}): ${e.name}, ${e.stats.maxHp} HP, удар ${e.attack.damage}, валун ${e.rangedDamage}`);
  }

  // Босс растёт с мобами (BOSS.growth по счёту появлений — как страж)
  scaleBoss(e) {
    const n = this.spawner.spawned;
    const g = BOSS.growth;
    const def = CREATURES[e.type];
    e.setMaxHp(grow(def.maxHp, n, g.hp));
    e.attack.damage = grow(ATTACKS[def.attack].damage, n, g.damage);
    e.rangedDamage = grow(ATTACKS[def.rangedWeapon.attack].damage, n, g.damage);
  }

  // Тролль ударил о землю: пыльный круг, грохот, тряска экрана, если герой рядом
  bossSlam(c, r) {
    this.beams.ring({ x: c.x, y: c.y + 0.05, z: c.z }, r, { color: [190, 170, 140], life: 0.35, width: 9 });
    this.beams.ring({ x: c.x, y: c.y + 0.05, z: c.z }, r * 0.55, { color: [150, 130, 100], life: 0.25, width: 6, segments: 14 });
    this.engine.sound.play("boom", { at: c });
    const d = Math.hypot(this.player.position.x - c.x, this.player.position.z - c.z);
    if (d < 10) this.recoil.kick(HAMMER_SHAKE);
  }

  // Предупреждение: тролль замахнулся — красный круг там, куда ударит (успей отойти)
  // Живой босс: без цели — лечится; ниже половины HP — ЯРОСТЬ; у лича — прыжки по залу и подъём скелетов
  bossTick(e, lair, dt) {
    if (!e.aggro && e.stats.hp < e.stats.maxHp) e.heal(e.stats.maxHp * BOSS.regen * dt); // ушёл из логова — лечится
    if (!e.enraged && e.stats.hp <= e.stats.maxHp * BOSS.enrageAt) {
      e.enraged = true;
      e.speedBonuses.enrage = BOSS.enrage.speed;
      if (e.attack) e.attack.cooldown *= BOSS.enrage.cooldown;
      if (e.rangedAttack) e.rangedAttack.cooldown *= BOSS.enrage.cooldown;
      this.engine.sound.play("growl", { at: e.position, volume: 1 });
      if (e.aggro === this.player) this.engine.toast(`${e.name} IS ENRAGED!`, 2000);
    }
    if (e.type !== "lich" || !e.aggro || e.stunned) return;
    // Прыжок: подошли вплотную — исчезает и появляется подальше от героя, в другом конце зала
    e.blinkCd -= dt;
    const t = e.aggro;
    if (e.blinkCd <= 0 && Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z) < LICH.blink.near) {
      let best = null;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * Math.max(1, lair.r - 1.2);
        const x = lair.x + 0.5 + Math.sin(a) * r, z = lair.z + 0.5 + Math.cos(a) * r;
        const bx = Math.floor(x), bz = Math.floor(z);
        if ([0, 1, 2].some((j) => this.world.has(bx, lair.y + j, bz))) continue; // в камень не прыгаем
        const d = Math.hypot(x - t.position.x, z - t.position.z);
        if (!best || d > best.d) best = { x, z, d };
      }
      if (best) {
        const from = { x: e.position.x, y: e.position.y + 1.3, z: e.position.z };
        e.position = new Vec3(best.x, lair.y, best.z);
        e.velocity.x = e.velocity.z = 0;
        e.nav?.reset();
        e.blinkCd = LICH.blink.cooldown;
        this.beams.add({ from, to: { x: best.x, y: lair.y + 1.3, z: best.z }, color: [180, 110, 255], core: [240, 220, 255], life: 0.3, width: 8 });
        this.beams.ring({ x: best.x, y: lair.y + 0.05, z: best.z }, 1.2, { color: [180, 110, 255], life: 0.4, width: 6 });
        this.engine.sound.play("zap", { at: e.position });
      }
    }
    // Подъём скелетов: раз в every с, не больше max живых своих
    e.summonTimer -= dt;
    if (e.summonTimer > 0) return;
    e.summonTimer = LICH.summon.every;
    const mine = this.entities.list.filter((m) => m.alive && m.raisedBy === e).length;
    const growth = mobGrowth(this.spawner.spawned);
    for (let k = 0; k < Math.min(LICH.summon.count, LICH.summon.max - mine); k++) {
      const a = Math.random() * Math.PI * 2;
      const x = e.position.x + Math.sin(a) * 1.5, z = e.position.z + Math.cos(a) * 1.5;
      if (this.world.has(Math.floor(x), lair.y, Math.floor(z))) continue;
      const s = this.spawn("skeleton", { x, y: lair.y, z, yaw: a, ...growth });
      if (!s) continue;
      s.raisedBy = e;
      s.aggro = t;
      s.xp = 5; //                          поднятые — без добычи и почти без опыта
      s.inventory.slots.fill(null);
      this.beams.ring({ x, y: lair.y + 0.05, z }, 0.8, { color: [180, 110, 255], life: 0.5, width: 5 });
    }
    this.engine.sound.play("growl", { at: e.position, volume: 0.8 });
  }

  // РАЗДУТЫЙ взорвался: урон всем вокруг (его врагам: герою, стражу, призванным), искры и грохот
  bloaterBoom(b) {
    const blast = new MagicAttack({ id: "bloater-blast", name: "BLAST", damage: b.blastDamage || BLOATER.damage, radius: BLOATER.radius, cost: 0 });
    const point = { x: b.position.x, y: b.position.y + 0.6, z: b.position.z };
    const r = blast.burst(b, point, { entities: this.entities.list, onHit: (h) => this.engine.log(`взрыв раздутого → ${h.target.name}: -${h.dealt} HP`) });
    if (r.hits.some((h) => h.target === this.player)) this.engine.sound.play("hurt");
    this.engine.sound.play("boom", { at: point });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, k = BLOATER.radius * (0.7 + 0.3 * Math.random());
      this.beams.add({ from: point, to: { x: point.x + Math.sin(a) * k, y: point.y + ((i % 3) - 1) * k * 0.4, z: point.z + Math.cos(a) * k }, color: [150, 210, 90], core: [230, 255, 190], life: 0.3, width: 12 });
    }
    if (Math.hypot(this.player.position.x - point.x, this.player.position.z - point.z) < 8) this.recoil.kick(HAMMER_SHAKE);
  }

  bossWarnings() {
    // Раздутый зажёг запал — пульсирующий красный круг взрыва
    for (const e of this.entities.list) {
      if (e.type !== "bloater" || !e.alive || !(e.priming > 0)) continue;
      const k = 1 - e.priming / BLOATER.prime;
      this.beams.ring({ x: e.position.x, y: e.position.y + 0.05, z: e.position.z }, BLOATER.radius, { color: [255, 60, 50], life: 0.04, width: 6 });
      this.beams.ring({ x: e.position.x, y: e.position.y + 0.05, z: e.position.z }, BLOATER.radius * k, { color: [255, 170, 90], life: 0.04, width: 4, segments: 14 });
    }
    for (const e of this.entities.list) {
      if (!e.boss || !e.alive || !e.attack?.pending) continue;
      const c = e.attack.slamPoint(e, e.attack.pending.ctx);
      const k = 1 - e.attack.pending.left / e.attack.windup; // 0 → 1: круг сжимается к удару
      this.beams.ring({ x: c.x, y: c.y + 0.05, z: c.z }, e.attack.radius, { color: [255, 60, 50], life: 0.04, width: 6 });
      this.beams.ring({ x: c.x, y: c.y + 0.05, z: c.z }, e.attack.radius * (1 - k), { color: [255, 150, 90], life: 0.04, width: 4, segments: 14 });
    }
  }

  // ---------- Взаимодействие (клавиша interact, по умолчанию F) ----------
  // Верхом — слезть. Предмет на земле — подобрать. Зверь рядом: не приручён — покормить, приручён (наш) — сесть.
  interact() {
    const p = this.player;
    if (p.mount) {
      const steed = p.mount;
      dismount(p, this.physics);
      steed.wander = null; // гулять будет вокруг места, где слезли
      steed.nav?.reset();
      this.syncEye();
      return this.engine.toast(`DISMOUNTED: ${steed.name}`);
    }
    // Предмет на земле под прицелом — подобрать (если зверь не ближе)
    const item = this.aimedPickup(PICKUP_REACH);
    const t = this.aimedEntity(INTERACT_REACH);
    const beastCloser = t?.taming && Math.hypot(t.position.x - this.look.position.x, t.position.z - this.look.position.z) < item?.t;
    if (item && !beastCloser) return this.pickUp(item.pickup);
    if (t?.type === "turret") return this.openTurret(t); // своя турель — положить / забрать грибы
    if (!t?.taming) return;
    const tm = t.taming;
    if (tm.tamed) {
      if (tm.owner !== p) return this.engine.toast("NOT YOUR ANIMAL");
      this.rideController = mount(p, t, { input: this.engine.input, physics: this.physics });
      if (!this.rideController) return;
      this.engine.sound.play("equip");
      return this.engine.toast(`RIDING: ${t.name}. ${Input.label(this.settings.controls.bindings.interact)} - DISMOUNT`);
    }
    // Приручает только ПРИЗЫВАТЕЛЬ; грибы — откуда угодно (сумка или хотбар), сколько — по HP кабана
    if (this.playerClass !== "beast") return this.engine.toast("ONLY A SUMMONER CAN TAME BOARS", 2000);
    tm.need = Math.max(tm.fed, this.mushroomsFor(t));
    const r = tm.feed(p, this.bagSource());
    if (r.reason === "refused") return this.engine.toast(`${t.name} DOESN'T TRUST YOU - YOU HURT IT`);
    if (!r.ok) return this.engine.toast(`NEED ${itemName(tm.food)}S: ${r.fed}/${r.need}`, 2500);
    this.syncAbilities(); // последняя кость съедена — ячейка опустела
    this.engine.sound.play("loot");
    if (r.tamed) {
      makePet(t, p); //         теперь на нашей стороне: мобы на него нападают, мы его не раним; ходит за нами
      this.applyPetTalents(); // таланты вкладки КАБАН
      // Приручили: седло на спине (другая модель)
      this.game.models.detach(t);
      this.game.models.attach(t, modelFor(t));
      this.engine.sound.play("levelup");
      this.engine.toast(`${t.name} TAMED! ${Input.label(this.settings.controls.bindings.interact)} - RIDE`, 3000);
    } else {
      this.engine.toast(`${t.name}: ${itemName(tm.food)}S ${r.fed}/${r.need}`);
    }
    this.engine.log(`кормим ${t.name}: ${r.fed}/${r.need}`);
  }

  // Существо погибло: опыт герою, его вещи — в инвентарь героя
  // Существо погибло. Добыча, опыт и трофеи — только если добил герой (стража добивает «бесплатно»)
  // Добыча и опыт — и если добил не герой (страж), но герой нанёс хоть 1 урона (движок: entity.damagedBy)
  onDeath(e) {
    if (e.type === "turret") return this.dropLoot(e); // турель сломали — её грибы падают на землю
    const finished = e.lastHitBy === this.player;
    const helped = e.damagedBy(this.player);
    // Наши призванные (звери, турели): добил или ранил — тоже наша победа (добыча и опыт — герою)
    const pets = this.summons();
    const byPet = pets.filter((pt) => e.lastHitBy === pt || e.damagedBy(pt));
    if (!finished && !helped && !byPet.length) {
      this.engine.log(`${e.name} погиб не от героя (${e.lastHitBy?.name || "?"})`);
      return;
    }
    // SUMMONER TROPHIES: моб пал от призванного — +0.3 % урона всем призванным
    if (e.kind === "mob" && byPet.length && pets.includes(e.lastHitBy) && this.talents.rank(TROPHY_TALENTS.summon) > 0) {
      TROPHY.pct.summon = +(TROPHY.pct.summon + TROPHY.perKill).toFixed(1);
      this.applyPetTalents(true);
    }
    if (!finished && !helped) {
      // Победил только зверь: добыча и опыт — герою, а трофеи героя — нет (их копит зверь)
      this.engine.log(`${e.name}: победил ${e.lastHitBy?.name} — добыча герою`);
      this.dropLoot(e);
      this.gainXp(e.xp || 0);
      return;
    }
    if (!finished) this.engine.log(`${e.name}: добил ${e.lastHitBy?.name || "?"}, герой помог (${helped.dealt} урона) — добыча герою`);
    this.dropLoot(e);
    // Трофеи: 1 % здоровья / урона побеждённого моба — навсегда себе (каждый талант — своё)
    if (e.kind === "mob") {
      let changed = false;
      if (this.talents.rank("trophies") > 0) {
        TROPHY.hp += e.stats.maxHp * TROPHY.share;
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
    this.gainXp(e.xp || 0); // после добычи: надпись о новом уровне важнее
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
    const near = (k = 0.6) => ({ x: e.position.x + (Math.random() - 0.5) * k, y: e.position.y + 0.5, z: e.position.z + (Math.random() - 0.5) * k });
    // ПРИЗЫВАТЕЛЮ изредка падает саженец турели
    if (this.playerClass === "beast" && Math.random() < TURRET.saplingDrop) this.pickups.add(TURRET.sapling, 1, near());
    // Сфера души: база 20 % шанс, +5 % маны; талант MANA GLOBES — 50/70 % шанс, 5/10 % маны
    if (this.playerClass === "magic") {
      const g = this.talentStats.globes ? MANA.globes[this.talentStats.globes - 1] : { chance: MANA.soulChance, soul: MANA.soul };
      if (Math.random() < g.chance) this.pickups.add("soul", Math.round(g.soul * 100), near());
    }
    // DEADLY MIST (засадник): на месте убийства — ядовитый туман
    if (this.talentStats.mist && (e.lastHitBy === this.player || e.damagedBy(this.player))) this.spawnMist({ x: e.position.x, y: e.position.y, z: e.position.z });
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

// Случайный ключ по долям: { skeleton: 7, zombie: 3 } → «skeleton» в 70 % случаев
function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if ((r -= w) < 0) return key;
  return entries[0][0];
}

// Как существо выглядит на карте: НПС — точки (сторож синий, кабан бурый, приручённый — золотой),
// мобы — черепки (скелет белый, зомби зелёный, злые — красные)
function markerFor(e) {
  if (e.kind === "npc") {
    if (e.type === "boar") return { icon: "dot", color: e.taming?.tamed ? [240, 196, 80] : [170, 110, 70] };
    return { icon: "dot", color: [110, 200, 255] };
  }
  if (e.boss) return { icon: "skull", color: [190, 90, 255] }; // босс логова — фиолетовый
  if (e.type === "bloater") return { icon: "skull", color: [170, 220, 90] }; // раздутый — ядовито-зелёный
  if (e.aggro) return { icon: "skull", color: [240, 80, 70] };
  if (e.ranged) return { icon: "skull", color: [240, 170, 60] }; // метатель — оранжевый
  return { icon: "skull", color: e.type === "zombie" ? [130, 200, 100] : [235, 230, 210] };
}
