// ============================================================
//  Сцена «мир» игры «Стройка». Здесь только ПРАВИЛА игры:
//  что делают способности, когда скелет бьёт и умирает, что выпадает,
//  что сохраняется и что бывает, когда игрок погиб.
//  Всё «как» — физика, камера, модели, способности, миникарта, меню — берём у движка.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { Scene, VoxelWorld, EntityManager, Physics, Pickups, Projectiles, Traps, BeamEffects, Charge, Camera, CameraRig, AbilityBar, Experience, Talents, Aim, Recoil, CameraShake, ActionLock, DamageNumbers, SlashEffects, CrescentSlash, HeadBob, Vec3, ViewModel, Interpolation, profiler, pathBudget, Input } from "../../engine/index.js";
import { LIFETIME, THROW, SPEAR, PROGRESSION, PLAYER, AUTOSAVE, STREAM, AIM, PICKUP_AUTO_RADIUS, SPAWN, SHAKE, REACH, BUILD, PALETTE, PICKUP_REACH } from "./config.js";
import { HandAbility, IN_HAND } from "./abilities.js";
import { helpFor } from "./help.js";
import { TALENT_TREE } from "./talents.js";
import { createHud, SCOPE } from "./hud.js";
import { createCreature, modelFor } from "./creatures.js";
import { NO_INPUT, PROF, CORPSE_TIME, mixParts } from "./scene/shared.js";
import { SAVE_DIR, SAVE_FILE, store as saveStore } from "./save.js";
import { SessionPart } from "./scene/session.js";
import { InputPart } from "./scene/input.js";
import { BuildingPart } from "./scene/building.js";
import { WorldgenPart } from "./scene/worldgen.js";
import { CombatPart } from "./scene/combat.js";
import { ThrowersPart } from "./scene/throwers.js";
import { MagicPart } from "./scene/magic.js";
import { AmmoPart } from "./scene/ammo.js";
import { ProgressionPart } from "./scene/progression.js";
import { ShopPart } from "./scene/shop.js";
import { PetsPart } from "./scene/pets.js";
import { BuffsPart } from "./scene/buffs.js";
import { BossesPart } from "./scene/bosses.js";
import { InteractPart } from "./scene/interact.js";
import { HostNet, ClientNet } from "./scene/net.js";
import { Chat } from "./scene/chat.js";
import { registerCommands } from "./scene/commands.js";

export class GameScene extends Scene {
  // game — общее для всей игры: { models, openSettings(), toMenu() }
  constructor(game) {
    super();
    this.realtime = true;
    this.captureMouse = true;
    this.game = game;
    // Роль в сетевой игре: "solo" — одиночная, "host" — мир считаем мы и рассылаем, "client" — мир присылает
    // хост, мы считаем только своего героя (scene/net.js)
    this.role = game.net?.role || "solo";
    this.net = null;
    this.chat = new Chat(this); // чат (Enter) — scene/chat.js
    this.god = false; //          консоль: god — бессмертие

    this.world = new VoxelWorld();
    this.entities = new EntityManager();
    // surfaceAt — скользкие блоки (лёд из палитры стройки): на них не устоять
    this.physics = new Physics({ isSolid: (x, y, z) => this.world.isSolid(x, y, z), surfaceAt: (x, y, z) => this.world.surfaceAt(x, y, z), hasSurfaces: () => this.world.surfaces > 0 });
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
      },
    });
    this.fuses = []; // горящие фитили лежащего динамита: { left, at, lit, boom } (updateFuses)
    this.beams = new BeamEffects(); // лучи: ледяная стрела, искры взрыва, круги посоха огня
    this.spearRun = new Charge(SPEAR.charge); // разбег с копьём (ПКМ): движок — бег вперёд и поворот взглядом
    this.spearCd = 0;
    this.look = new Camera(); //   глаза героя: где и куда смотрит
    this.rig = new CameraRig(); // откуда показываем: из глаз или из-за плеча

    // Способности: 5 ячеек — это хотбар героя (5 ячеек внизу инвентаря). Что за предмет
    // лежит в ячейке, такая и способность (abilities.js → ABILITY_FOR_ITEM); пусто — кулак.
    this.abilities = new AbilityBar(3); // хотбар: оружие слева (Q), средняя ячейка (2), оружие справа (E)
    this.hand = new HandAbility();
    this.hand.help = helpFor(this.hand); // справка F1 (help.js)
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
    this.shake = new CameraShake(); // тряска камеры — только картинки (прицел не сдвигает)
    this.viewCamera = new Camera(); // камера для рисования: та же, что у прицела, плюс тряска
    this.actionLock = new ActionLock(); // конец рывка ИАЙ: камера стоит (движок)
    this.damageNumbers = new DamageNumbers(); // цифры урона над целями (движок)
    this.slashes = new SlashEffects(); //         белые следы ударов по хитбоксу (движок)
    this.crescents = new CrescentSlash(); //      разрез-серп вдоль пореза (рывок ИАЙ; движок)
    this.bob = new HeadBob(); // покачивание головы при ходьбе и беге (движок)
    this.talentStats = {}; //       правила из талантов (applyTalents)
    this.rifleShots = 0; //         GRENADE (стрелок): выстрелы автомата подряд
    this.levelFlash = 0; //    золотая вспышка при новом уровне (1 → 0)
    this.hud = createHud(); // HUD из частей (hud.js): перерисовываем, только когда часть поменялась
    this.hitMarker = 0; //     секунд показывать отметку попадания
    this.dead = false;
  }

  get settings() {
    return this.engine.settings.data;
  }

  get building() {
    return this.abilities.current?.id === "build";
  }

  // ---------- Сущности ----------

  spawn(type, data) {
    const e = createCreature(type, data);
    if (!e) return null;
    // Урон от героя (удар, выстрел, горение) — цифрой над целью: хедшот — крупно и красным, огонь — оранжевым
    e.onDamage = (d, dealt) => {
      if (d.source !== this.player || e === this.player || this.settings.general.damageNumbers === false) return;
      const head = d.part === "head";
      // цвет цифры: хедшот — красный, крит — золотой, горение — оранжевый; иначе по виду урона (как в Dota):
      // физический — светлый, магический — голубой, чистый — сиреневый
      const color = head ? [255, 70, 60] : d.tags.has("crit") ? [255, 210, 80] : d.tags.has("dot") && d.type !== "pure" ? [255, 150, 60]
        : d.type === "magical" ? [130, 185, 255] : d.type === "pure" ? [225, 160, 255] : [255, 245, 220];
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
  // at — от какого места (по умолчанию — где герой по тику; кадр передаёт сглаженное renderPosition)
  syncEye(at = this.player.position) {
    // Глаза — на eyeY (стоя / в стойке, плавно: updateStance); в рывке коробка сжата и ноги подняты на lift
    // (движок: streamline) — глаза остаются на месте
    this.look.position = at.add(new Vec3(0, (this.eyeY ?? PLAYER.eyeHeight) - (this.player.streamlined?.lift || 0), 0));
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

  // ---------- Тики и кадры ----------
  // Мир живёт тиками (тикрейт движка, 60 в секунду: engine.fixed): fixedUpdate — всё, что влияет на игру
  // (движение, физика, удары, мозги, таймеры). Раз в кадр — beforeTicks (мышь крутит взгляд: до тиков, чтобы
  // герой шёл туда, куда уже смотрим) и frameUpdate (камера, рука, анимации, эффекты, HUD — то, что видно).
  // background — под «живым» окном (карта, таланты, магазин, инвентарь): мир идёт, но клавиши и мышь
  // героя не читаем (стоит на месте, не стреляет)

  // Один кадр = один тик (автотесты и всё, что крутит сцену вручную); рисуем там, где всё после тика (alpha 1)
  update(dt, opts) {
    this.beforeTicks(dt, opts);
    this.fixedUpdate(dt, opts);
    this.frameUpdate(dt, 1, opts);
  }

  // Что рисуется моделями (их сглаживаем между тиками). Один массив на всё время — без мусора
  drawnLists() {
    const l = (this.drawn ||= []);
    l[0] = this.entities.list;
    l[1] = this.pickups.list;
    l[2] = this.projectiles.list;
    l[3] = this.traps.list;
    return l;
  }

  captureAll() {
    for (const list of this.drawnLists()) Interpolation.capture(list);
  }

  // Раз в кадр, до тиков: прицел (приближение) и взгляд мышью
  beforeTicks(dt, { background = false } = {}) {
    const { engine } = this;
    this.background = background;
    if (this.dead) return;
    // Прицел (движок: Aim) — приближение и мышь задаёт оружие в руках; ползунок в настройках — общий множитель
    const weaponAim = this.abilities.current?.aim;
    this.aim.update(dt, this.aiming && !!weaponAim, weaponAim || {}, (this.settings.controls.aimSensitivity ?? 100) / 100);
    this.aimT = this.aim.t;
    this.look.fov = this.aim.fov(this.baseFov); // приближение
    // Оптика: прицелились до конца от 1-го лица — круг прицела вместо модели винтовки (hud.js)
    this.scoped = !!this.abilities.current?.scope && this.aimT > 0.92 && this.rig.mode !== "third";
    // Мышь крутит взгляд (в прицеле — медленнее, под приближение). Идёт тяжёлый удар — камера стоит
    // (движок: ActionLock); мышь всё равно «съедаем»
    const m = background ? (engine.mouse.consume(), { dx: 0, dy: 0 }) : this.actionLock.filterMouse(engine.mouse.consume());
    // В прицеле мышь медленнее — сколько, решает оружие (engine/input/aim.js)
    const zoom = this.aim.mouseScale();
    this.look.rotate(m.dx * zoom, (this.settings.controls.invertY ? -m.dy : m.dy) * zoom);
    // Отдача: бросок ствола после выстрела и плавный возврат (rotate: dy > 0 — вниз, поэтому минус)
    const kick = this.recoil.update(dt);
    if (kick.pitch || kick.yaw) this.look.rotate(kick.yaw, -kick.pitch);
  }

  // Тик: всё, что влияет на игру. dt — всегда шаг тика (1/60 с)
  fixedUpdate(dt, { background = false } = {}) {
    const { engine, player } = this;
    if (this.dead) return; // погибли в прошлом тике этого кадра — дальше не считаем
    this.captureAll(); // где все стояли до тика — кадр рисует между этим и тем, что будет после
    this.fallGrace = Math.max(0, (this.fallGrace ?? 1) - dt); // первая секунда в мире — урона от падения нет
    // Автосохранение: раз в AUTOSAVE.every с, в фоне, тихо
    this.autosaveIn = (this.autosaveIn ?? AUTOSAVE.every) - dt;
    if (this.autosaveIn <= 0 && player.alive) this.save(false, { background: true });
    const input = background ? NO_INPUT : engine.input;
    this.controller.input = input;
    // Старое сохранение (уровень уже есть, а класса нет) — выбрать класс сразу при входе в мир
    if (!this.classChecked) {
      this.classChecked = true;
      if (!this.playerClass && this.experience.level > 1) return this.askClass();
    }

    this.tickPlayer(dt, input); // 1. свой герой: оружие, движение
    // 2. Мир: существа, предметы, снаряды, ловушки, события. Клиент сетевой игры мир не считает —
    // его считает хост и присылает (тогда tickWorld заменяет сеть: net.applyWorld)
    if (this.role !== "client") this.tickWorld(dt);
    this.net?.tick(dt); // хост — разобрать сообщения гостей и разослать снимок; гость — применить снимки хоста
    if (this.god) player.stats.hp = player.stats.maxHp; // консоль: god

    if (!player.alive) return this.die();
  }

  // Сетевая игра (game.net от главного меню: { role, server | client, name }) — scene/net.js
  startNet() {
    registerCommands(this); // команды консоли этой игры (scene/commands.js)
    const n = this.game.net;
    if (!n) return;
    if (n.role === "host") this.net = new HostNet(this, n.server);
    if (n.role === "client") {
      this.net = new ClientNet(this, n.client, n.name);
      this.net.start();
    }
  }

  // Состояние сетевой игры (консоль: net)
  netStatus() {
    const n = this.net;
    if (!n) return "SOLO GAME";
    if (n.role === "host") return [`HOST, PORT ${n.server.port}, GUESTS ${n.guests.size}`, ...[...n.guests.values()].map((q) => `  ${q.name}: PING ${q.ping ?? "?"} MS`)];
    return `GUEST, PING ${n.ping ?? "?"} MS, ${n.ready ? "IN THE HOST WORLD" : "CONNECTING"}`;
  }

  // Гость погиб: в чужом мире ничего не стираем — встаём рядом с хостом с полным здоровьем
  guestRespawn() {
    const p = this.player;
    const host = this.entities.list.find((e) => e.remote && e.type === "player" && e.alive);
    const at = host?.position || p.position;
    p.position.x = at.x + 1;
    p.position.y = at.y + 1;
    p.position.z = at.z + 1;
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    p.stats.hp = p.stats.maxHp;
    this.groundY = undefined;
    this.engine.sound.play("death");
    this.engine.toast("YOU DIED - BACK NEXT TO THE HOST", 3000);
    this.engine.log("гость погиб — встал рядом с хостом");
  }

  // Тик своего героя: способность в руках, стойка, движение, перезарядки. input — клавиши (или «никаких»)
  tickPlayer(dt, input) {
    const { player } = this;
    // 1. Герой: способность в руках, движение
    profiler.begin(PROF.player);
    this.abilities.update(dt, this, input); // с input — зажатая ЛКМ повторяет удар/выстрел
    player.speedBonuses.weapon = this.abilities.current?.moveSpeed || 0; // оружие в руках
    player.speedBonuses.aim = this.aiming ? AIM.moveSpeed : 0; //            прицеливание
    this.actionLock.update(dt);
    player.speedBonuses.lock = this.actionLock.moveSpeed;
    this.updateStance(dt); //  катана в руках — стойка: ниже рост и глаза
    this.hammerControl(dt); // удар молотом: медленнее ходим, быстрее падаем; JUMP SLAM — прыжок выше
    this.spearControl(dt); //  разбег с копьём: поворот, разгон, кого насадили
    const move = (this.move = this.controller.update(dt, this.look.yaw));
    if (player.onGround) this.groundY = player.position.y; // откуда оторвались от земли (урон от падения — от этой высоты)
    this.stamina?.update(dt, { running: (move.running && player.onGround) || this.spearRun.active }); // в прыжке бег не тратит
    this.syncEye(); // выстрел следующего тика — из глаз на новом месте
    this.blockCooldown = Math.max(0, (this.blockCooldown || 0) - dt);
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
    profiler.end(PROF.player);
  }

  // Тик мира: всё, что живёт без героя — существа (мозги, физика), предметы, снаряды, ловушки, динамит,
  // логова, нашествие. Это и есть то, что в сетевой игре считает хост
  tickWorld(dt) {
    const { engine, player } = this;
    // Большой мир — по частям: раз в секунду подгрузить близкие куски, выгрузить дальние (ChunkStore.stream)
    this.streamIn = (this.streamIn ?? 1) - dt;
    if (this.streamIn <= 0) {
      this.streamIn = 1;
      if (saveStore.onDisk.size > STREAM.minChunks && saveStore.world === this.world) saveStore.stream(this.world, player.position.x, player.position.z, STREAM.radius);
    }
    // 3. Существа: появляются, думают, ходят, бьют; павшие исчезают
    profiler.begin(PROF.spawn);
    this.spawner.update(dt);
    this.boarSpawner.update(dt);
    this.invasion.update(dt);
    profiler.end(PROF.spawn);
    profiler.begin(PROF.items);
    this.pickups.update(dt); // предметы на земле падают и крутятся
    profiler.end(PROF.items);
    profiler.begin(PROF.projectiles);
    this.projectiles.update(dt); // брошенное летит
    profiler.end(PROF.projectiles);
    profiler.begin(PROF.traps);
    this.traps.update(dt, this.combatContext()); // ловушки ловят
    profiler.end(PROF.traps);
    // Автоподбор (V — вкл/выкл): всё, что лежит рядом, само попадает в сумку
    profiler.begin(PROF.items);
    if (this.settings.general.autoLoot !== false && player.alive) {
      this.pickups.autoCollect(player, PICKUP_AUTO_RADIUS, (p) => this.pickUp(p, { quiet: true }));
    }
    profiler.end(PROF.items);
    profiler.begin(PROF.world);
    this.updateFuses(dt); // динамит догорает — взрыв
    this.updateLairs(dt); // боссы в логовах: появление, через 3 мин после гибели — новый
    this.bossWarnings(); // запал раздутого — красный круг на земле
    if (player.alive) this.ultimate.update(dt); // заряд ульты со временем
    this.fog.reveal(player.position); // туман войны: открываем карту вокруг героя
    profiler.end(PROF.world);
    // Поиск пути — не больше 6 пересчётов за кадр (нашествие: десятки мобов разом), остальные — в следующих
    pathBudget(6);
    const scene = this;
    // Что «мозги» существ знают о мире (engine/ai/brain.js)
    this.entities.grid.rebuild(this.entities.list); // сетка соседей — раз в тик (толкотня мобов: только ближние)
    const ai = {
      entities: this.entities.list,
      near: (e) => this.entities.near(e), //  соседи из сетки (separate)
      navWorld: this.navWorld,
      hunt: this.invasion.active ? player : null, // нашествие: все мобы — на героя
      shoot: (e, target, attack) => (e.ranged.hitscan ? this.mobGunshot(e, target, attack) : this.mobThrow(e, target, attack)), // стрелок (HostileBrain ranged)
      // Контекст атак — один на существо (не новый объект каждый кадр); стена между ним и целью — луч не чаще
      // раза в 0.25 с (стрелки проверяют это каждый кадр)
      combatFor: (e) => (e.combatCtx ||= {
        get entities() { return scene.entities.list; }, // сплеш: кого ещё задел взмах
        blocked: (owner, target) => scene.blockedCached(owner, target),
        onUse: () => {
          e.view?.animator.playOnce("Attack"); // замах
          e.netAttack = true; // сетевая игра: гостям — сыграть замах у копии
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
    profiler.begin(PROF.creatures);
    for (const e of [...this.entities.list]) {
      if (e === player) continue;
      // гость сетевой игры: его двигает сеть (scene/net.js), не мозги и не физика
      if (e.remote) {
        e.view?.animator.setBase(e.netWalk ? "Walk" : "Idle", 1);
        continue;
      }
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
      const wildBoar = e.type === "boar";
      const gone = e.boss ? false : e.kind === "mob"
        ? (!e.aggro && (dist > SPAWN.despawnDistance || e.age > LIFETIME.mob)) || (dist > SPAWN.huntDespawn && !this.invasion.active)
        : wildBoar && dist > SPAWN.despawnDistance;
      if (gone) {
        this.engine.log(`${e.name} ушёл далеко (${dist.toFixed(0)} м) — исчез`);
        this.removeEntity(e);
        continue;
      }
      // Думает сам — «мозги» из движка (engine/ai): мобы охотятся, НПС гуляют
      // Заморожен / оглушён (статус со stun) — стоит и не бьёт; перезарядка атаки идёт
      if (e.stunned) {
        e.velocity.x = 0;
        e.velocity.z = 0;
        e.attack?.update(dt);
      }
      profiler.begin(PROF.ai);
      const { walking: going, alerted } = !e.stunned && e.brain ? e.brain.update(e, ai, dt) : { walking: false, alerted: [] };
      profiler.end(PROF.ai);
      if (alerted.length > 1) engine.log(`стадо: разозлились ${alerted.length} (${e.name})`);
      if (alerted.includes(e)) engine.sound.play("growl", { at: e.position, volume: 0.8 }); // рык того, кто разозлился
      profiler.begin(PROF.physics);
      this.physics.step(e, dt); // стены, ступеньки, падение
      profiler.end(PROF.physics);
      // Шаги: пока идёт — раз в полшага (быстрее — чаще); слышно, кто и откуда подходит
      if (going && e.onGround) {
        e.stepTimer = (e.stepTimer ?? Math.random() * 0.5) - dt * Math.max(0.6, e.speed / 2.2);
        if (e.stepTimer <= 0) {
          e.stepTimer = 0.45;
          engine.sound.play(e.type === "boar" ? "hoof" : "step", { at: e.position, volume: 0.6 });
        }
      }
      e.view?.animator.setBase(going ? "Walk" : "Idle", going ? e.speed / 4 : 1);
      e.netWalk = going; // для снимка сетевой игры
    }
    this.entities.update(dt);
    profiler.end(PROF.creatures);
  }

  // Раз в кадр, после тиков: то, что видно. dt — время кадра; alpha — доля пути от прошлого тика к следующему
  frameUpdate(dt, alpha, { background = false } = {}) {
    const { engine, player } = this;
    if (this.dead || !this.move) return;
    const move = this.move;
    profiler.begin(PROF.player);
    // Сглаживание: рисуем между прошлым и последним тиком (герой, мобы, предметы, снаряды)
    for (const list of this.drawnLists()) Interpolation.blend(list, alpha);
    player.renderYaw = this.look.yaw; // герой смотрит туда же, куда камера (мышь — каждый кадр)
    // Покачивание головы: скорость по земле, на земле ли, бежим ли
    this.bob.update(dt, Math.hypot(player.velocity.x, player.velocity.z), player.onGround, !background && engine.input.isDown("run"));
    this.staminaFlash = Math.max(0, (this.staminaFlash || 0) - dt);
    this.syncEye(player.renderPosition);
    engine.sound.setListener(this.look.position, this.look.yaw); // «уши» — в глазах героя (объёмный звук)
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.blockFlash = Math.max(0, (this.blockFlash || 0) - dt);
    this.damageNumbers.update(dt);
    this.levelFlash = Math.max(0, this.levelFlash - dt);
    this.slashes.update(dt);
    this.crescents.update(dt);
    this.beams.update(dt);

    // 2. Анимации героя: тело «для мира» и рука «для экрана»
    // От 3-го лица: оружие в руке (или катана на бедре), руки держат его (слой поверх ходьбы)
    const heldNow = this.abilities.current?.held || null;
    this.game.models.hold(player, heldNow?.model ?? null, heldNow || {});
    player.view?.animator.setOverlay(heldNow?.pose ?? null);
    player.roll = -this.look.roll;
    // Голова героя смотрит вверх / вниз туда же, куда камера (поверх анимации; движок: animator.turnBone).
    // Взгляд вверх — голова назад (поворот вокруг X с минусом), не больше ±50°
    const look = Math.max(-0.87, Math.min(0.87, this.look.pitch));
    player.view?.animator.turnBone("head", [Math.sin(-look / 2), 0, 0, Math.cos(-look / 2)]);
    if (this.spearRun.active) player.view?.animator.setBase("Walk", this.spearRun.speed / 4); // разбег — бежим
    // стойка самурая: стоим — наклон 8°, идём — 20°, бежим (спринт) — 30°
    else if (this.lowStance) player.view?.animator.setBase(!move.moving ? "StanceIdle" : move.running ? "StanceRun" : "StanceWalk", move.moving ? move.speed / (move.running ? 5 : 3) : 1);
    else player.view?.animator.setBase(move.moving ? "Walk" : "Idle", move.moving ? move.speed / 4 : 1);
    const walking = move.moving && player.onGround && this.aimT < 0.5; // в прыжке и в прицеле рука не качается
    const vm = this.viewModel();
    // Рука на ходу не машет своей анимацией — её покачивает HeadBob.hand (дугой, как в Minecraft)
    vm?.setBase(this.spearRun.active ? "Charge" : this.abilities.current?.using ? "Use" : this.aimT > 0.5 ? "Aim" : "Idle", 1);
    if (vm) vm.sway = this.settings.general.headBob !== false ? this.bob.hand() /* сила сама плавно гаснет, когда стоишь */ : { x: 0, y: 0, z: 0, roll: 0 };
    if (vm) {
      vm.aim = this.aimT; // пистолет — к центру экрана, мушка — в прицел
      vm.aimOffset = AIM.offset;
    }
    vm?.update(dt);
    profiler.end(PROF.player);

    // Анимации: дальние — реже, невидимые — не считаем (движок: models.update near / far)
    profiler.begin(PROF.animation);
    this.game.models.update(this.entities.list, dt, { center: player.position, near: 24, far: (engine.renderer?.fadeDist || 60) + 5 });
    profiler.end(PROF.animation);

    // 4. Камера и прицел
    profiler.begin(PROF.camera);
    // Тряска: падаешь быстро — дрожь (растёт со скоростью), удары и приземления — сами гаснут
    const fallSpeed = -player.velocity.y;
    if (!player.onGround && fallSpeed > SHAKE.fall.from) this.shake.hold(Math.min(1, (fallSpeed - SHAKE.fall.from) / SHAKE.fall.range) * SHAKE.fall.max);
    this.shake.enabled = this.settings.general.screenShake !== false;
    this.shake.update(dt);
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
    this.lookPickup = this.aimedPickup(PICKUP_REACH)?.pickup || null;
    profiler.end(PROF.camera);

    // 5. HUD перерисовываем, только если хоть одна его часть поменялась (hud.js: у каждой части — свой watch)
    profiler.begin(PROF.hudCheck);
    if (this.hud.update(this)) engine.redraw();
    profiler.end(PROF.hudCheck);
  }

  // Что рисовать (движок спрашивает и когда мы под паузой — тогда без «призрака»)
  view() {
    // Рисуем через копию камеры с тряской (CameraShake): прицел, пули и удары идут по rig.camera — без тряски
    const camera = this.shake.apply(this.updateRig(), this.viewCamera);
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
    profiler.begin(PROF.hudDraw);
    this.hud.draw(ui, this);
    profiler.end(PROF.hudDraw);
  }

  // Для профайлера (ловушка рывков): что творилось в мире в момент рывка — одной строкой
  hitchContext() {
    let mobs = 0;
    for (const e of this.entities.list) if (e.alive && e.kind === "mob") mobs++;
    return `MOBS ${mobs}  PROJ ${this.projectiles.list.length}  PICKUPS ${this.pickups.list.length}  FUSES ${this.fuses?.length || 0}` +
      `${this.invasion?.active ? "  INVASION" : ""}${this.dead ? "  DEAD" : ""}  BLOCKS ${this.world.blocks.size}`;
  }

  // Строки тех. панели (F3, движок рисует сверху свои: кадры, память) — что в мире сейчас
  techLines() {
    const list = this.entities.list;
    const alive = list.filter((e) => e.alive);
    const mobs = alive.filter((e) => e.kind === "mob");
    const p = this.player.position;
    const now = performance.now();
    // Размер файлов на диске — раз в 2 с (stat — обращение к диску)
    if (!this.techDisk || now - this.techDisk.at > 2000) {
      const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
      let chunks = 0;
      try { for (const f of fs.readdirSync(path.join(SAVE_DIR, "chunks"))) chunks += size(path.join(SAVE_DIR, "chunks", f)); } catch {}
      this.techDisk = { at: now, save: size(SAVE_FILE) + chunks, log: size(path.join(path.dirname(SAVE_DIR), "log.txt")) };
    }
    const kb = (b) => (b / 1024).toFixed(0);
    return [
      `WORLD  BLOCKS ${this.world.blocks.size}  FOG CHUNKS ${this.fog.chunks.size}`,
      `CHUNKS ${this.world.chunks.size} (ON DISK ${saveStore.onDisk.size})  DRAWN ${this.engine.renderer?.worldStats?.drawn ?? "-"}  CUBES ${this.engine.renderer?.worldStats?.cubes ?? "-"}`, // куски мира: всего / в кадре, кубиков в кадре (закрытые не рисуем)
      `ENTITIES ${list.length} (ALIVE ${alive.length})  MOBS ${mobs.length}/${this.spawner.max}  BOSSES ${mobs.filter((e) => e.boss).length}`,
      `PICKUPS ${this.pickups.list.length}  PROJECTILES ${this.projectiles.list.length}  TRAPS ${this.traps.list.length}`,
      `SPAWNED ${this.spawner.spawned}  INVASION ${this.invasion.active ? `ON (${this.invasionKind?.id}) ${Math.ceil(this.invasion.timeLeft)} S` : "OFF"}`,
      `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  YAW ${Math.round((this.look.yaw * 180) / Math.PI) % 360}  PITCH ${Math.round((this.look.pitch * 180) / Math.PI)}`,
      `VIEW ${this.engine.renderer?.fadeDist ?? "-"} M  CAMERA ${this.rig.mode === "third" ? "THIRD" : "FIRST"}`,
      `DISK  SAVE ${kb(this.techDisk.save)} KB  LOG ${kb(this.techDisk.log)} KB`,
    ];
  }

  showStats({ fps, cpu }) {
    const key = (a) => Input.label(this.settings.controls.bindings[a]);
    this.engine.window.setTitle(
      `VOID · ${fps} FPS · cpu ${cpu.toFixed(2)} ms · blocks ${this.world.blocks.size} · ` +
      `${key("item1")}/${key("item2")} items · ${key("jump")} jump · ` +
      `${key("autoLoot")} auto loot · ${key("inventory")} inventory · ${key("pause")} pause`
    );
  }

}

// Части сцены по темам (scene/*.js) — их методы становятся методами GameScene
mixParts(GameScene, [SessionPart, InputPart, BuildingPart, WorldgenPart, CombatPart, ThrowersPart, MagicPart, AmmoPart, ProgressionPart, ShopPart, PetsPart, BuffsPart, BossesPart, InteractPart]);
