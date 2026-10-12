// ============================================================
//  Сцена «мир» игры «Стройка». Здесь только ПРАВИЛА игры:
//  что делают способности, когда скелет бьёт и умирает, что выпадает,
//  что сохраняется и что бывает, когда игрок погиб.
//  Всё «как» — физика, камера, модели, способности, миникарта, меню — берём у движка.
// ============================================================

import {
  Scene, Vec3, Camera, CameraRig, VoxelWorld, EntityManager, Physics, CharacterController,
  MenuScene, InventoryScene, TalentScene, MapScene, Input, KEYS, ViewModel, Spawner, AbilityBar, Experience, Talents, flatDamage, damageMultiplier, onlyFor, DamageNumbers, Shop, ShopScene, Inventory, Aim, Recoil, Lean,
  mount, dismount, updateRider, parry, Pickups, Projectiles, buildHouse, buildCratePile, buildTower, scatter, randomInt, Terrain, flattenArea, buildTree, RandomEvent, SlashEffects, critCooldown,
} from "../../engine/index.js";
import { PALETTE, PLAYER, REACH, SPAWN, PROGRESSION, AIM, MOB_MIX, BOARS, SHOP, WARDEN_GROWTH, ATTACKS, HEARING, BUILD, STONES, PICKUP_REACH, WORLDGEN, INVASION, BOAR_GROWTH, LIFETIME, BLOCK, THROW, KATANA_IAI } from "./config.js";
import { TALENT_TREE, TROPHY, TROPHY_TALENTS } from "./talents.js";
import { CREATURES, DEFAULT_SPAWNS, RESIDENTS, createCreature, mobGrowth, modelFor, makePet } from "./creatures.js";
import { HandAbility, HeldItemAbility, ABILITY_FOR_ITEM } from "./abilities.js";
import { itemInfo, itemName, ITEMS, maxStack, isWeapon, isUsable } from "./items.js";
import { saveGame, loadGame, deleteSave, SAVE_FILE } from "./save.js";
import { drawHud, SCOPE } from "./hud.js";

// Пока открыта панель цветов, цифры выбирают цвет (а не способность)
const DIGIT_KEYS = [KEYS["1"], KEYS["2"], KEYS["3"], KEYS["4"], KEYS["5"]];
const INTERACT_REACH = 3; // как далеко дотягиваемся до зверя (метры)
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
    // Брошенное (камни): летит по дуге, попал — урон (хедшоты есть), упал — лежит, можно поднять
    this.projectiles = new Projectiles({
      world: this.world, entities: this.entities, gravity: THROW.gravity,
      onAdd: (p) => game.models.attach(p, "item-" + p.item),
      onRemove: (p) => game.models.detach(p),
      onHit: (p, hit) => {
        p.attack.hit(p.owner, hit.entity, this.combatContext({ part: hit.part, baseDamage: p.damage, onHit: (r) => this.onPlayerHit(r) }));
        this.pickups.add(p.item, 1, { x: hit.entity.position.x, y: hit.entity.position.y + 0.5, z: hit.entity.position.z }); // отскочил и упал
        this.engine.sound.play("hit", { at: hit.entity.position });
      },
      onLand: (p) => {
        this.pickups.add(p.item, 1, p.position);
        this.engine.sound.play("pickup", { at: p.position, volume: 0.5 });
      },
    });
    this.look = new Camera(); //   глаза героя: где и куда смотрит
    this.rig = new CameraRig(); // откуда показываем: из глаз или из-за плеча

    // Способности: 5 ячеек — это хотбар героя (5 ячеек внизу инвентаря). Что за предмет
    // лежит в ячейке, такая и способность (abilities.js → ABILITY_FOR_ITEM); пусто — кулак.
    this.abilities = new AbilityBar(5);
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
    this.lean = new Lean({ angle: 14, offset: 0.4 }); // наклоны Q/E (движок) — навык оружия дальнего боя
    this.leanHeld = [false, false]; // зажаты ли Q / E (ставит навык оружия)
    this.leanToggle = 0; //            режим «переключать»: -1 влево, 1 вправо, 0 прямо
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
    if (saved?.worldgen?.seed) this.terrain = new Terrain({ ...WORLDGEN.terrain, seed: saved.worldgen.seed });
    if (!saved) this.generateWorld(); // новый мир: рельеф, постройки, деревья
    // Камни и прочее на земле. В сохранениях до камней их нет — разбрасываем, чтобы было из чего строить
    if (Array.isArray(saved?.pickups)) this.pickups.loadFrom(saved.pickups);
    else this.scatterStones(STONES.startCount);

    const p = saved?.player;
    this.player = this.spawn("player", p || { x: 0, y: 0, z: 0 });
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
    // Хотбар: из сохранения или стартовый набор — пустые руки. Пистолет и молот (стройка)
    // покупают в магазине (B), камни подбирают с земли.
    // Винтовка, купленная до того, как оружие стало предметами, — в ячейку 4.
    this.player.hotbar = new Inventory(5, maxStack);
    if (p?.hotbar) this.player.hotbar.loadFrom(p.hotbar);
    else {
      if (saved?.progression?.owned?.includes("rifle")) this.player.hotbar.slots[3] = { item: "rifle", count: 1 };
    }
    this.syncAbilities();
    this.shop.loadFrom(saved?.progression?.shop);
    TROPHY.hp = saved?.progression?.trophies?.hp || 0; //         набранное талантом «ТРОФЕИ»
    // Трофеи урона по видам атак. В старых сохранениях был только «дальний» по +1 % за убийство —
    // переводим в новые +0.3 % за то же число убийств
    const tr = saved?.progression?.trophies;
    for (const kind of Object.keys(TROPHY.pct)) TROPHY.pct[kind] = Number(tr?.pct?.[kind]) || 0;
    if (!tr?.pct && tr?.rangedPct) TROPHY.pct.ranged = +(tr.rangedPct * TROPHY.perKill).toFixed(1);
    this.applyTalents();
    // В журнал — что загрузилось: если прогресс пропадёт, по журналу видно, где именно
    this.engine.log(saved ? `загружен мир (сохранён ${saved.savedAt || "?"}): уровень ${this.experience.level}, ${this.talentsSummary()}` : "сохранения нет — новый мир");
    if (p?.hp !== undefined) this.player.stats.hp = Math.min(p.hp, this.player.stats.maxHp); // здоровье из сохранения (максимум — с талантами)

    // В старых сохранениях существ нет — расставляем заново
    const creatures = Array.isArray(saved?.entities) ? saved.entities : DEFAULT_SPAWNS;
    for (const d of creatures) this.spawn(d.type, d);
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
      count: () => this.entities.list.filter((e) => e.kind === "mob" && e.alive).length,
      avoid: far,
      spawn: (x, z, index) => {
        // Кто — по долям MOB_MIX; каждый следующий крепче (config.js → SKELETON_GROWTH); в блоке — физика вытолкнет наверх
        const type = pickWeighted(MOB_MIX);
        const growth = mobGrowth(index);
        const e = this.spawn(type, { x, y: this.world.surfaceY(x, z), z, yaw: Math.random() * Math.PI * 2, ...growth }); // на земле (на холме — на вершине столбика)
        this.scaleWardens(); // мобы крепчают — и страж тоже
        this.engine.log(`появился ${e.name} №${index + 1}: ${x.toFixed(1)}, ${z.toFixed(1)}, +${growth.bonusHp} HP, +${growth.bonusDamage} урона`);
      },
    });
    this.spawner.spawned = saved?.spawned || 0; // счёт продолжается после загрузки
    this.scaleWardens(); //                        страж — под этот счёт
    // Кабаны — редко (BOARS.chance), и не больше BOARS.max диких
    this.boarSpawner = new Spawner({
      ...BOARS,
      around, radius: view, minRadius: SPAWN.minPlayerDistance,
      count: () => this.entities.list.filter((e) => e.type === "boar" && !e.taming?.tamed).length,
      avoid: far,
      spawn: (x, z) => {
        this.spawn("boar", { x, y: this.world.surfaceY(x, z), z, yaw: Math.random() * Math.PI * 2 });
        this.engine.log(`появился кабан: ${x.toFixed(1)}, ${z.toFixed(1)}`);
      },
    });

    // Камни появляются сами (config.js → STONES), пока их лежит меньше max
    this.stoneSpawner = new Spawner({
      ...STONES,
      around,
      count: () => this.pickups.count("stone"),
      avoid: (x, z) => this.onStructure(x, z),
      spawn: (x, z) => this.pickups.add("stone", 1, { x, y: this.world.surfaceY(x, z), z }),
    });

    // Нашествие (движок: RandomEvent): изредка все мобы бегут на героя, спавн чаще (config.js → INVASION)
    this.invasion = new RandomEvent({
      ...INVASION,
      id: "invasion",
      onStart: () => {
        this.spawner.interval = SPAWN.interval / INVASION.spawnSpeed;
        this.spawner.max = INVASION.max;
        this.engine.sound.play("growl");
        this.engine.toast("НАШЕСТВИЕ! ВСЕ МОБЫ ИДУТ НА ТЕБЯ", 3500);
        this.engine.log(`нашествие №${this.invasion.count}: спавн раз в ${this.spawner.interval.toFixed(2)} с, до ${INVASION.max} мобов`);
      },
      onEnd: () => {
        this.spawner.interval = SPAWN.interval;
        this.spawner.max = SPAWN.max;
        this.engine.sound.play("levelup");
        this.engine.toast("НАШЕСТВИЕ ОТБИТО", 2500);
        this.engine.log("нашествие закончилось");
      },
    });

    // Приручённые кабаны: таланты вкладки КАБАН (здоровье из сохранения не трогаем)
    this.applyPetTalents(true);

    this.abilities.select(0, this); // начинаем с руки
    this.syncEye();
    this.engine.onStats = (s) => this.showStats(s);
    if (saved) this.engine.toast("МИР ЗАГРУЖЕН");
  }

  exit() {
    for (const e of this.entities.list) this.game.models.detach(e);
    this.pickups.clear();
    this.projectiles.clear();
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
    const creatures = this.entities.list.filter((e) => e !== this.player && e.alive);
    const progression = { experience: this.experience.toJSON(), talents: this.talents.toJSON(), trophies: { hp: TROPHY.hp, pct: { ...TROPHY.pct } }, shop: this.shop.toJSON() };
    const count = saveGame({ world: this.world, player: this.player, look: this.look, creatures, progression, spawned: this.spawner.spawned, pickups: this.pickups.toJSON(), worldgen: this.terrain ? { seed: this.terrain.seed } : null });
    console.log(`Сохранено: ${count} блоков -> ${SAVE_FILE}`);
    this.engine.log(`сохранено: ${count} блоков, уровень ${this.experience.level}, ${this.talentsSummary()}`);
    if (toast) this.engine.toast("СОХРАНЕНО");
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
    // Наклон (Q/E): голова кренится и сдвигается вбок, но не в стену
    this.lean.apply(this.look, (o, d, max) => this.world.raycast(o, d, max)?.t ?? null);
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

  update(dt) {
    const { engine, player } = this;

    // 0. Способность в руках: прицеливание, замедление от оружия
    this.abilities.update(dt, this, engine.input); // с input — зажатая ЛКМ повторяет удар/выстрел
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
    const m = engine.mouse.consume();
    // В прицеле мышь медленнее — сколько, решает оружие (engine/input/aim.js)
    const zoom = this.aim.mouseScale();
    this.look.rotate(m.dx * zoom, (this.settings.controls.invertY ? -m.dy : m.dy) * zoom);
    // Отдача: бросок ствола после выстрела и плавный возврат (rotate: dy > 0 — вниз, поэтому минус)
    const kick = this.recoil.update(dt);
    if (kick.pitch || kick.yaw) this.look.rotate(kick.yaw, -kick.pitch);
    // Наклоны Q/E — навык оружия ДАЛЬНЕГО боя (abilities.js → LEAN_SKILLS): с кулаком, мачете,
    // стройкой и верхом не наклоняемся. Клавиши читает сам навык (движок: Ability.skills) —
    // в leanHeld (зажаты ли) и pressLean (нажали).
    // Режим из настроек: «удерживать» — пока зажата клавиша; «переключать» — нажал / нажал ещё раз
    const canLean = !!this.abilities.current?.skill("skill1") && !player.mount;
    if (!canLean) {
      this.leanToggle = 0; // убрали оружие — выпрямляемся (и не «залипаем» в наклоне)
      this.leanHeld = [false, false];
    }
    const held = (this.leanHeld[1] ? 1 : 0) - (this.leanHeld[0] ? 1 : 0);
    const leanDir = this.settings.general.leanMode === "toggle" ? this.leanToggle || 0 : held;
    this.lean.update(dt, canLean ? leanDir : 0);
    let move;
    if (player.mount) {
      // Верхом: клавиши ведут скакуна (его контроллер), герой сидит в седле
      const steed = player.mount;
      move = this.rideController.update(dt, this.look.yaw);
      steed.yaw = this.look.yaw;
      updateRider(player);
      steed.view?.animator.setBase(move.moving ? "Walk" : "Idle", move.moving ? move.speed / 3 : 1);
    } else {
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
    // От 3-го лица: оружие в руке (или катана на бедре), руки держат его (слой поверх ходьбы), наклон Q/E
    const heldNow = this.abilities.current?.held || null;
    this.game.models.hold(player, heldNow?.model ?? null, heldNow || {});
    player.view?.animator.setOverlay(heldNow?.pose ?? null);
    player.roll = player.mount ? 0 : -this.look.roll;
    if (player.mount) player.view?.animator.setBase("Sit"); // в седле — сидим
    else player.view?.animator.setBase(move.moving ? "Walk" : "Idle", move.moving ? move.speed / 4 : 1);
    const walking = move.moving && player.onGround && this.aimT < 0.5; // в прыжке и в прицеле рука не качается
    const vm = this.viewModel();
    vm?.setBase(this.aimT > 0.5 ? "Aim" : walking ? "Walk" : "Idle", walking ? move.speed / 4 : 1);
    if (vm) {
      vm.aim = this.aimT; // пистолет — к центру экрана, мушка — в прицел
      vm.aimOffset = AIM.offset;
    }
    vm?.update(dt);

    // 3. Существа: появляются, думают, ходят, бьют; павшие исчезают
    this.spawner.update(dt);
    this.boarSpawner.update(dt);
    this.stoneSpawner.update(dt);
    this.invasion.update(dt);
    this.growPets(dt);
    this.pickups.update(dt); // предметы на земле падают и крутятся
    this.projectiles.update(dt); // брошенное летит
    // Что «мозги» существ знают о мире (engine/ai/brain.js)
    const ai = {
      entities: this.entities.list,
      navWorld: this.navWorld,
      hunt: this.invasion.active ? player : null, // нашествие: все мобы — на героя
      combatFor: (e) => ({
        entities: this.entities.list, // сплеш: кого ещё задел взмах
        blocked: (owner, target) => this.blockedBetween(owner, target),
        onUse: () => {
          e.view?.animator.playOnce("Attack"); // замах
          engine.sound.play("swing", { at: e.position }); // объёмный: слышно, откуда замахнулись
        },
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
      // Спокойный моб далеко отстал или живёт дольше 2 минут — исчезает (злой — никогда: он охотится)
      const far = Math.hypot(e.position.x - player.position.x, e.position.z - player.position.z) > SPAWN.despawnDistance;
      if (e.kind === "mob" && !e.aggro && (far || e.age > LIFETIME.mob)) {
        this.removeEntity(e);
        continue;
      }
      if (e.taming && e.lastHitBy === player) e.taming.refuse(); // ранили — больше не приручить
      if (e.rider) continue; // под седлом: ведёт всадник (выше), сам не думает
      // Думает сам — «мозги» из движка (engine/ai): мобы охотятся, НПС гуляют
      const { walking: going, alerted } = e.brain ? e.brain.update(e, ai, dt) : { walking: false, alerted: [] };
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
      this.engine.toast(`${steed.name} ПОГИБ`, 2500);
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
        const ok = this.canPlace(c) && this.stoneCount() >= BUILD.stonePerBlock;
        this.ghost = { ...c, color: ok ? PALETTE[this.colorIndex] : [255, 60, 60] };
      }
    }
    this.lookTarget = this.aimedEntity(REACH);
    this.lookPickup = player.mount ? null : this.aimedPickup(PICKUP_REACH)?.pickup || null;

    // 5. HUD перерисовываем, только если в нём что-то поменялось (миникарта — 10 раз в секунду)
    const t = this.lookTarget;
    const hud = [Math.ceil(this.levelFlash * 10), player.stats.hp, this.experience.level, this.experience.xp, this.talents.points, t ? t.id + ":" + t.stats.hp + ":" + (t.taming?.fed ?? "") : "", this.lookPickup ? this.lookPickup.id + ":" + this.lookPickup.count : "", this.building ? this.stoneCount() : "", !!player.mount, this.scoped, this.damageNumbers.active ? performance.now() : 0, engine.updater?.available?.version, TROPHY.hp | 0, Object.values(TROPHY.pct).join(","), this.hitMarker > 0, Math.ceil(Math.max(0, 0.5 - player.hurtTime) * 10), this.invasion.active ? Math.ceil(this.invasion.timeLeft) : "", player.mount ? player.mount.stats.hp + "/" + player.mount.stats.maxHp : "", this.hudWeaponKey(), this.slashes.active ? performance.now() : 0, player.statuses.map((s) => s.id + (Number.isFinite(s.left) ? Math.ceil(s.left * 10) : "") + ":" + s.charges).join(","), Math.ceil(this.blockFlash * 10), Math.ceil(this.blockCooldown * 10), this.talents.rank("death-cut") ? Math.ceil(critCooldown(player)) : ""].join("|");
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
      characters: this.game.models.drawList([...this.entities.list, ...this.pickups.list, ...this.projectiles.list], firstPerson ? this.player : null),
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
      `VOID · ${fps} FPS · процессор ${cpu.toFixed(2)} мс · блоков ${this.world.blocks.size} · ` +
      `${key("ability1")}/${key("ability2")}/${key("ability3")} способности · ${key("jump")} прыжок · ` +
      `${key("camera")} вид · ${key("inventory")} инвентарь · ${key("pause")} пауза`
    );
  }

  // ---------- Ввод ----------

  onPress(actions, event) {
    const has = (a) => actions.includes(a);
    if (has("pause")) return this.pause();
    if (has("inventory")) return this.openInventory();
    if (has("talents")) return this.openTalents();
    if (has("map")) return this.engine.push(new MapScene({ map: () => this.mapData(), info: () => this.coordsText(), legend: "КРАСНЫЙ КРЕСТ - ЦЕНТР МИРА (0, 0)" }));
    if (has("save")) this.save();
    if (has("camera")) this.toggleCamera();
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

    // Остальное — панели способностей (движок): выбор ячейки, ЛКМ/ПКМ, E у стройки
    const before = this.abilities.index;
    this.abilities.handle(actions, this);
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
      title: "ПАУЗА",
      overlay: true,
      items: [
        { id: "resume", label: "ПРОДОЛЖИТЬ" },
        { id: "save", label: "СОХРАНИТЬ" },
        { id: "settings", label: "НАСТРОЙКИ" },
        { id: "menu", label: "В ГЛАВНОЕ МЕНЮ" },
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
    if (this.player.mount) dismount(this.player, this.physics);
    const archived = deleteSave();
    this.engine.log(`игрок погиб (уровень ${this.experience.level}, ${this.talentsSummary()}) — мир начнётся заново; старое сохранение: ${archived || "не было"}`);
    this.engine.sound.play("death");
    this.engine.push(new MenuScene({
      title: "ВЫ ПОГИБЛИ",
      overlay: true,
      lock: 1.5, // в пылу боя (кликаешь ЛКМ) не прокликать экран гибели, не заметив его
      footer: () => "МИР, УРОВЕНЬ И ТАЛАНТЫ ПОТЕРЯНЫ — НОВАЯ ИГРА С НУЛЯ",
      items: [{ id: "menu", label: "В ГЛАВНОЕ МЕНЮ" }],
      onSelect: () => this.game.toMenu(),
    }));
  }

  toggleCamera() {
    const g = this.settings.general;
    g.cameraMode = g.cameraMode === "third" ? "first" : "third";
    this.engine.settings.save();
    this.engine.toast("ВИД: " + (g.cameraMode === "third" ? "3-Е ЛИЦО" : "1-Е ЛИЦО"));
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

  // Навык «наклон» нажали (Q — dir -1, E — 1). В режиме «переключать»: ещё раз — выпрямиться
  pressLean(dir) {
    if (this.settings.general.leanMode === "toggle") this.leanToggle = this.leanToggle === dir ? 0 : dir;
  }

  // ---------- Стройка (способность 3) ----------

  // Нельзя ставить в занятую клетку и туда, где стоит хоть одна сущность (её «коробка»)
  canPlace(c) {
    return c.y >= 0 && !this.world.has(c.x, c.y, c.z) && !this.entities.overlapsCell(c);
  }

  placeBlock() {
    if (!this.target || !this.canPlace(this.target.place)) return;
    // Блок стоит камней (config.js → BUILD). Нет камня — не строим
    if (this.stoneCount() < BUILD.stonePerBlock) {
      this.engine.toast(`НУЖЕН ${itemName("stone")}: ПОДБЕРИ С ЗЕМЛИ (${Input.label(this.settings.controls.bindings.interact)})`, 2000);
      return;
    }
    const c = this.target.place;
    this.takeStones(BUILD.stonePerBlock);
    this.world.place(c.x, c.y, c.z, PALETTE[this.colorIndex]);
    this.viewModel()?.play("Use");
    this.engine.sound.play("place", { at: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 } });
  }

  removeBlock() {
    if (!this.building || !this.target?.block) return;
    const b = this.target.block;
    this.world.remove(b.x, b.y, b.z);
    // Камень возвращается (не влез в инвентарь — падает на землю на месте блока)
    if (BUILD.refundOnBreak) {
      const left = this.giveResource("stone", BUILD.stonePerBlock);
      if (left > 0) this.pickups.add("stone", left, { x: b.x + 0.5, y: b.y, z: b.z + 0.5 });
    }
    this.viewModel()?.play("Attack");
    this.engine.sound.play("remove", { at: { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 } });
  }

  // Сколько камней у героя (сумка + хотбар)
  stoneCount() {
    const p = this.player;
    return p.inventory.count("stone") + p.hotbar.count("stone");
  }

  // Забрать камни: сначала из сумки, потом из хотбара
  takeStones(n) {
    const p = this.player;
    let taken = p.inventory.remove("stone", n);
    if (taken < n) {
      taken += p.hotbar.remove("stone", n - taken);
      this.syncAbilities(); // в хотбаре ячейка могла опустеть
    }
    return taken;
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
    const terrainBlocks = this.terrain.build(this.world, W.colors);

    // 2. Где ставить постройки: не у места появления и жителей, не на крутом склоне
    const avoid = [{ x: 0, z: 0, r: W.keepClear }, ...[...DEFAULT_SPAWNS, ...RESIDENTS].map((d) => ({ x: d.x, z: d.z, r: 3 }))];
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
      const x = Math.floor((rnd() * 2 - 1) * W.terrain.radius);
      const z = Math.floor((rnd() * 2 - 1) * W.terrain.radius);
      if (Math.hypot(x, z) < W.keepClear + 3 || this.onStructure(x, z)) continue;
      if (this.groundHeight(x, z) > W.colors.rockLine) continue;
      if ([-1, 1].some((dx) => this.onStructure(x + dx, z) || this.onStructure(x, z + dx))) continue; // не вплотную к стенам
      buildTree(this.world, { x, y: this.world.surfaceY(x, z), z, height: range(W.tree.height), crown: range(W.tree.crown), random: rnd });
      trees++;
    }
    const count = (k) => spots.filter((s) => s.kind === k).length;
    this.engine.log(`новый мир: рельеф ${terrainBlocks} кубиков (зерно ${this.terrain.seed}), ${count("house")} домиков, ${count("tower")} башен, ${count("pile")} куч, ${trees} деревьев; всего ${this.world.blocks.size} блоков`);
  }

  // Разбросать камни вокруг места появления (новый мир)
  scatterStones(count) {
    for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
      const x = (Math.random() * 2 - 1) * 14;
      const z = (Math.random() * 2 - 1) * 14;
      if (Math.hypot(x, z) < 2 || this.onStructure(x, z)) continue;
      this.pickups.add("stone", 1, { x, y: this.world.surfaceY(x, z), z });
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
  pickUp(p) {
    const left = isWeapon(p.item) ? this.giveItem(p.item, p.count) : this.giveResource(p.item, p.count);
    const got = p.count - left;
    if (got === 0) return this.engine.toast("НЕТ МЕСТА В ИНВЕНТАРЕ");
    if (left > 0) p.count = left; // что не влезло — осталось лежать
    else this.pickups.remove(p);
    this.engine.sound.play("pickup");
    this.engine.toast(`+${got} ${itemName(p.item)}`, 900);
    this.engine.log(`подобрано: ${p.item} x${got}`);
  }

  // Выдать ресурс: сначала докладываем в НАЧАТЫЕ стопки (в хотбаре, потом в сумке), потом — новая стопка:
  // то, что используют в руке (камни), — сразу в хотбар; остальное (кости, монеты) — в сумку.
  // Возвращает, сколько не влезло
  giveResource(id, count = 1) {
    const p = this.player;
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
  aimedHit(reach) {
    const cam = this.rig.camera;
    const origin = cam.position;
    const dir = cam.lookDirection();
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
  useAttack(attack, { anim, sound, hitSound = sound, bodyAnim = anim === "Attack" ? "Attack" : null }) {
    let hits = 0;
    let autoReload = false;
    const result = attack.use(this.player, this.combatContext({
      // Последний патрон — перезарядка начинается сама. Анимацию запускаем ПОСЛЕ анимации выстрела ниже,
      // иначе выстрел сразу перебьёт «Reload» (рука и тело так и не перезаряжаются)
      onReload: () => (autoReload = true),
      onHit: (hit) => {
        hits++;
        this.onPlayerHit(hit);
      },
    }));
    if (!result) {
      if (autoReload) this.onReloadStart(this.abilities.current); // нажали стрелять с пустой обоймой
      return false; // кулдаун ещё идёт
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

  // Бросить камень с силой power (0…1): тратит перезарядку броска и один камень, летит туда, куда смотрим
  throwStone(attack, power) {
    if (this.stoneCount() <= 0) return false;
    if (!attack.use(this.player, {})) return false; // ещё не готов (перезарядка броска)
    this.takeStones(1);
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const eye = this.look.position;
    const from = { x: eye.x + dir.x * 0.4, y: eye.y - 0.1 + dir.y * 0.4, z: eye.z + dir.z * 0.4 };
    const speed = attack.speedFor(power);
    this.projectiles.launch({ owner: this.player, position: from, velocity: dir.scale(speed), attack, damage: attack.damageFor(power), item: "stone" });
    this.viewModel()?.play("Throw");
    this.player.view?.animator.playOnce("Throw");
    this.engine.sound.play("swing");
    this.engine.log(`бросок камня: сила ${Math.round(power * 100)}%, ${speed.toFixed(0)} м/с, урон ${attack.damageFor(power)}`);
    return true;
  }

  // ---------- Стрелковое оружие: обойма и перезарядка (движок: RangedAttack magazine) ----------

  // R — перезарядить оружие в руках
  reloadWeapon(ability) {
    return ability.attack.reload({ onReload: () => this.onReloadStart(ability) });
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
    const ammo = atk?.magazine ? `${atk.ammo}:${atk.reloading ? Math.ceil(atk.reloadProgress * 30) : ""}` : "";
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
  }

  openTalents() {
    this.engine.push(new TalentScene({
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
    const gained = this.experience.add(amount);
    if (!gained) return;
    this.talents.points += gained * PROGRESSION.pointsPerLevel;
    this.levelFlash = 1; // золотая вспышка по краям — новый уровень (здоровье больше не лечится)
    this.engine.sound.play("levelup");
    const key = Input.label(this.settings.controls.bindings.talents);
    this.engine.toast(`УРОВЕНЬ ${this.experience.level}! +${gained} ОЧК. (${key})`, 3000);
    this.engine.log(`новый уровень: ${this.experience.level}`);
  }

  // ---------- Магазин (клавиша B, движок: engine/economy/shop.js) ----------
  makeShop() {
    // Оружие и инструмент — без ограничений: выбросил случайно — купи снова
    const weapon = (id, price, text) => ({
      id, name: itemName(id), price, describe: () => text,
      canGive: () => this.hasRoom() || "НЕТ МЕСТА В ИНВЕНТАРЕ",
      give: () => this.giveItem(id),
      drawIcon: (ui, x, y, s) => ITEMS[id].drawIcon(ui, x, y, s),
    });
    return new Shop({
      currency: "coin",
      currencyName: "МОНЕТ",
      slots: [
        weapon("pistol", SHOP.pistol, `${ATTACKS.pistol.damage} УРОНА, ОБОЙМА ${ATTACKS.pistol.magazine}. ПКМ - ПРИЦЕЛ`),
        weapon("auto", SHOP.auto, `${ATTACKS.auto.damage} УРОНА ОЧЕРЕДЬЮ, ОБОЙМА ${ATTACKS.auto.magazine}. ДЕРЖИ ОТДАЧУ`),
        weapon("rifle", SHOP.rifle, `${ATTACKS.rifle.damage} УРОНА, ОБОЙМА ${ATTACKS.rifle.magazine}. ПКМ - ОПТИКА`),
        weapon("machete", SHOP.machete, `${ATTACKS.machete.damage} УРОНА, ЗАДЕВАЕТ ДВОИХ. УДАР РАЗ В 1.4 С`),
        weapon("katana", SHOP.katana, `${ATTACKS.katana.damage} УРОНА ВСЕМ ПЕРЕД СОБОЙ. ${KATANA_IAI.sheathTime} С В НОЖНАХ - УДАР X${KATANA_IAI.damage} С ВЫПАДОМ`),
        weapon("builder", SHOP.builder, "СТРОИТЬ: 1 КАМЕНЬ - 1 БЛОК. G - ЦВЕТ"),
        {
          id: "medkit", name: "АПТЕЧКА", price: SHOP.medkit, // stock не задан — без ограничений
          describe: () => `СРАЗУ +${SHOP.medkitHeal} HP`,
          give: (buyer) => buyer.heal(SHOP.medkitHeal),
          drawIcon: (ui, x, y, s) => {
            ui.rect(x + s * 0.15, y + s * 0.15, s * 0.7, s * 0.7, [235, 235, 230]);
            ui.rect(x + s * 0.42, y + s * 0.25, s * 0.16, s * 0.5, [210, 50, 50]);
            ui.rect(x + s * 0.25, y + s * 0.42, s * 0.5, s * 0.16, [210, 50, 50]);
          },
        },
      ],
    });
  }

  openShop() {
    this.engine.push(new ShopScene({
      shop: this.shop,
      buyer: this.player,
      ctx: this,
      onBuy: (slot) => {
        this.engine.sound.play("loot");
        this.engine.log(`куплено: ${slot.name}`);
      },
    }));
  }

  // Есть ли свободная ячейка (в хотбаре или сумке)
  hasRoom() {
    const p = this.player;
    return p.hotbar.slots.includes(null) || p.inventory.slots.includes(null);
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
      let ability = this.hand; // пусто — рука (ячейка выглядит пустой)
      if (slot) {
        // Оружие — своя способность; любой другой предмет (кость...) — «в руке», бьём рукой
        const make = ABILITY_FOR_ITEM[slot.item] || (() => new HeldItemAbility(slot.item, itemInfo(slot.item)));
        if (!this.abilityCache.has(slot.item)) this.abilityCache.set(slot.item, make());
        ability = this.abilityCache.get(slot.item);
      }
      bar.set(i, ability);
    });
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
    this.engine.push(new InventoryScene({
      entity: this.player,
      itemInfo,
      dropKey: Input.label(b.drop),
      sections: [
        { inventory: this.player.inventory, title: "СУМКА", cols: 10 },
        { inventory: this.player.hotbar, title: "ХОТБАР: ПАНЕЛЬ СПОСОБНОСТЕЙ", label: (i) => Input.label(b["ability" + (i + 1)]) },
      ],
      onChange: () => this.syncAbilities(),
      onDrop: (item, count) => {
        // Выброшенное летит вперёд и ложится на землю — подобрать можно снова (F)
        const dir = this.look.lookDirection();
        const from = this.look.position.add(dir.scale(0.5)).add(new Vec3(0, -0.4, 0));
        this.pickups.add(item, count, from, { velocity: new Vec3(dir.x * 3.5, 2, dir.z * 3.5) });
        this.engine.sound.play("swing");
        this.engine.toast(`ВЫБРОШЕНО: ${itemName(item)}${count > 1 ? " X" + count : ""}`);
        this.engine.log(`выброшено: ${item} x${count}`);
      },
    }));
  }

  // Последняя ячейка хотбара как «источник» для взаимодействия (как в ARK): count/remove — только по ней
  lastHotbarSlot() {
    const slots = this.player.hotbar.slots;
    const k = slots.length - 1;
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

  // Таланты вкладки КАБАН → наши звери: макс. HP, регенерация, скорость, броня.
  // keepHp — не менять текущее здоровье (после загрузки: оно уже сохранено с талантами)
  applyPetTalents(keepHp = false) {
    const s = this.talents.stats();
    for (const e of this.pets()) {
      const def = CREATURES[e.type];
      const hp = e.stats.hp;
      // Трофеи зверя — свои (копит сам с того момента, как приручён); действуют, если у героя есть эти таланты
      const trophyHp = this.talents.rank("trophies") > 0 ? Math.floor(e.trophyHp || 0) : 0;
      e.setMaxHp(def.maxHp + (e.bonusHp || 0) + (s.boarMaxHp || 0) + trophyHp);
      const pct = this.talents.rank(TROPHY_TALENTS.melee) > 0 ? e.trophyPct || 0 : 0;
      e.modifiers = pct > 0 ? [damageMultiplier(1 + pct / 100)] : [];
      if (keepHp) e.stats.hp = Math.min(hp, e.stats.maxHp);
      e.regen = (def.regen || 0) + (s.boarRegen || 0);
      e.speedBonuses.talents = s.boarSpeed || 0; // и пешком, и под седлом (CharacterController)
      e.stats.resist = { ...(def.resist || {}), ...(s.boarResist || {}) };
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
      this.engine.toast(`${e.name} ПОДРОС: +${g.growHp} HP (${e.stats.maxHp})`, 1800);
      this.engine.log(`${e.name} подрос: макс. HP ${e.stats.maxHp}`);
    }
  }

  // Страж растёт вместе с мобами (тот же счёт появлений): здоровье — как у мобов, урон — медленнее
  scaleWardens() {
    const n = this.spawner.spawned;
    const g = WARDEN_GROWTH;
    const bonusDamage = Math.floor(n / g.damageEvery) * g.damageStep;
    for (const e of this.entities.list) {
      if (e.type !== "warden" || !e.alive) continue;
      e.setMaxHp(CREATURES.warden.maxHp + n * g.hpPerSpawn);
      const base = ATTACKS.wardenSword.damage;
      if (e.attack) e.attack.damage = base.map((d) => d + bonusDamage);
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
      return this.engine.toast(`СЛЕЗЛИ С: ${steed.name}`);
    }
    // Предмет на земле под прицелом — подобрать (если зверь не ближе)
    const item = this.aimedPickup(PICKUP_REACH);
    const t = this.aimedEntity(INTERACT_REACH);
    const beastCloser = t?.taming && Math.hypot(t.position.x - this.look.position.x, t.position.z - this.look.position.z) < item?.t;
    if (item && !beastCloser) return this.pickUp(item.pickup);
    if (!t?.taming) return;
    const tm = t.taming;
    if (tm.tamed) {
      if (tm.owner !== p) return this.engine.toast("ЭТО НЕ ТВОЙ ЗВЕРЬ");
      this.rideController = mount(p, t, { input: this.engine.input, physics: this.physics });
      if (!this.rideController) return;
      this.engine.sound.play("equip");
      return this.engine.toast(`ВЕРХОМ НА: ${t.name}. ${Input.label(this.settings.controls.bindings.interact)} - СЛЕЗТЬ`);
    }
    // Как в ARK: то, что нужно для взаимодействия (еда), берётся из ПОСЛЕДНЕЙ ячейки хотбара
    const r = tm.feed(p, this.lastHotbarSlot());
    if (r.reason === "refused") return this.engine.toast(`${t.name} НЕ ДОВЕРЯЕТ ТЕБЕ - ТЫ ЕГО РАНИЛ`);
    if (!r.ok) return this.engine.toast(`ПОЛОЖИ ${itemName(tm.food)} В ПОСЛЕДНЮЮ ЯЧЕЙКУ ХОТБАРА (${r.fed}/${r.need})`, 2500);
    this.syncAbilities(); // последняя кость съедена — ячейка опустела
    this.engine.sound.play("loot");
    if (r.tamed) {
      makePet(t, p); //         теперь на нашей стороне: мобы на него нападают, мы его не раним; ходит за нами
      this.applyPetTalents(); // таланты вкладки КАБАН
      // Приручили: седло на спине (другая модель)
      this.game.models.detach(t);
      this.game.models.attach(t, modelFor(t));
      this.engine.sound.play("levelup");
      this.engine.toast(`${t.name} ПРИРУЧЁН! ${Input.label(this.settings.controls.bindings.interact)} - СЕСТЬ`, 3000);
    } else {
      this.engine.toast(`${t.name}: КОСТИ ${r.fed}/${r.need}`);
    }
    this.engine.log(`кормим ${t.name}: ${r.fed}/${r.need}`);
  }

  // Существо погибло: опыт герою, его вещи — в инвентарь героя
  // Существо погибло. Добыча, опыт и трофеи — только если добил герой (стража добивает «бесплатно»)
  // Добыча и опыт — и если добил не герой (страж), но герой нанёс хоть 1 урона (движок: entity.damagedBy)
  onDeath(e) {
    const finished = e.lastHitBy === this.player;
    const helped = e.damagedBy(this.player);
    // Наши звери: добил или ранил — тоже наша победа (добыча и опыт — герою)
    const pets = this.pets();
    const byPet = pets.filter((pt) => e.lastHitBy === pt || e.damagedBy(pt));
    if (!finished && !helped && !byPet.length) {
      this.engine.log(`${e.name} погиб не от героя (${e.lastHitBy?.name || "?"})`);
      return;
    }
    // Трофеи зверей — свои у каждого: копятся, когда моб пал от героя или от них
    if (e.kind === "mob" && pets.length) {
      let changed = false;
      for (const pt of pets) {
        if (this.talents.rank("trophies") > 0) { pt.trophyHp = (pt.trophyHp || 0) + e.stats.maxHp * TROPHY.share; changed = true; }
        if (this.talents.rank(TROPHY_TALENTS.melee) > 0) { pt.trophyPct = +((pt.trophyPct || 0) + TROPHY.perKill).toFixed(1); changed = true; }
      }
      if (changed) this.applyPetTalents();
    }
    if (!finished && !helped) {
      // Победил только зверь: добыча и опыт — герою, а трофеи героя — нет (их копит зверь)
      this.engine.log(`${e.name}: победил ${e.lastHitBy?.name} — добыча герою`);
      this.collectLoot(e);
      this.gainXp(e.xp || 0);
      return;
    }
    if (!finished) this.engine.log(`${e.name}: добил ${e.lastHitBy?.name || "?"}, герой помог (${helped.dealt} урона) — добыча герою`);
    this.collectLoot(e);
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

  // Добыча с павшего — как подобранное: сначала в начатые стопки (и в хотбаре), потом в сумку
  collectLoot(e) {
    const moved = [];
    e.inventory.slots.forEach((slot, i) => {
      if (!slot) return;
      const left = this.giveResource(slot.item, slot.count);
      if (slot.count - left > 0) moved.push({ item: slot.item, count: slot.count - left });
      e.inventory.slots[i] = left > 0 ? { item: slot.item, count: left } : null;
    });
    if (moved.length) {
      this.engine.sound.play("loot");
      this.engine.toast(moved.map((m) => `${itemName(m.item)} X${m.count}`).join(", "));
    }
    if (!e.inventory.isEmpty()) this.engine.toast("ИНВЕНТАРЬ ПОЛОН");
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
  if (e.aggro) return { icon: "skull", color: [240, 80, 70] };
  return { icon: "skull", color: e.type === "zombie" ? [130, 200, 100] : [235, 230, 210] };
}
