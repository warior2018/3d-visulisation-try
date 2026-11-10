// ============================================================
//  Настройки и константы ИГРЫ «Стройка». Движок о них не знает:
//  другая игра на том же движке будет иметь свои.
// ============================================================

import { fileURLToPath } from "node:url";
import { tone, noise, mix, ELEMENTS } from "../../engine/index.js";
import { SKIN_DEFAULTS } from "./skins.js";

// Огонь (ОГНЕННЫЕ ПУЛИ) поджигает при КАЖДОМ попадании (в движке по умолчанию — с шансом 50 %)
ELEMENTS.fire.statusChance = 1;
ELEMENTS.ice.statusChance = 0; // лёд сам не замедляет случайно: холод и заморозка — приём жезла льда (FROST)

// Пути — от этого файла, а не от папки запуска: так игра запускается откуда угодно
export const ASSETS = fileURLToPath(new URL("./assets/", import.meta.url));
// Папка сохранений. VOID_SAVES — подменить (автотесты, tools/sim: работают на копии во временной папке
// и никогда не трогают настоящие сохранения)
export const SAVES = process.env.VOID_SAVES || fileURLToPath(new URL("./saves/", import.meta.url));
// Автосохранение: раз в every секунд, в фоне (только изменившиеся куски мира — обычно десятки КБ)
export const AUTOSAVE = { every: 120 };
// Подгрузка мира по частям: когда кусков на диске больше minChunks, в памяти держим только куски в радиусе
// radius (в кусках по 16 м) от героя; дальние выгружаем (изменённые — сначала на диск)
export const STREAM = { minChunks: 400, radius: 10 };
// Копии мира (saves/backups/): не чаще раза в every секунд, последние keep
export const BACKUP = { every: 600, keep: 2 };

// Свои настройки игры — добавляются к настройкам движка (видео, аудио, управление)
export const GAME_DEFAULTS = {
  skins: { ...SKIN_DEFAULTS }, // выбранные скины: id цели → id скина (skins.js; вкладка SKINS в меню)
  general: {
    cameraMode: "first", // "first" — от 1-го лица, "third" — от 3-го
    minimap: true, //       показывать миникарту
    minimapSide: "right", // где: "left" или "right" (сверху)
    aimMode: "hold", //     прицел (ПКМ): "hold" — пока держишь, "toggle" — нажал / нажал ещё раз
    crouchMode: "hold", //  присед (Ctrl): "hold" — пока держишь, "toggle" — нажал / нажал ещё раз
    damageNumbers: true, // цифры урона над целями
    headBob: true, //      покачивание предмета в руке при ходьбе и беге (как в Minecraft; камера не качается)
    screenShake: true, //  тряска камеры от ударов, взрывов, приземлений и при быстром падении (прицел не сдвигает)
    autoLoot: true, //     автоподбор предметов рядом (V)
    intro: true, //        заставка при запуске
    dayNight: true, //     смена дня и ночи (DAY)
    // Фоны меню (картинки assets/backgrounds; "" — градиент стиля окон): главный — на всех страницах, если
    // bgAllPages; иначе у страниц СКИНЫ и НАСТРОЙКИ — свои ("" — как главный)
    menuBg: "void", bgAllPages: true, bgSkins: "", bgSettings: "",
    uiStyle: 0, //         стиль окон (THEMES)
    profileId: "", //      id игрока: к нему в мире привязан персонаж (создаётся при первом запуске)
    hints: true, //        подсказки новичку (hints.js)
    hintsDone: [], //      какие подсказки уже выполнены (второй раз не показываем)
  },
  // Сетевая игра: своё имя, порт хоста (0 — по умолчанию), последний адрес JOIN (подставляется при следующем
  // заходе), друзья — сохранённые адреса с именами (вкладка FRIENDS: [{ name, address }])
  net: { name: "", port: 0, lastHost: "", friends: [] },
  controls: {
    bindings: {
      // Хотбар — 3 ячейки: оружие (своей клавиши нет: оно в руках, когда предмет не взят), предмет 1, предмет 2.
      // item1 / item2 — взять предмет; нажал ещё раз (или предмет использован) — обратно оружие.
      // Q / E — скиллы оружия в руках (Ability.skills, например ИАЙ катаны). ЛКМ/ПКМ — действия движка
      item1: "key:1",
      item2: "key:2",
      skill1: "key:Q",
      skill2: "key:E",
      skill3: "key:LSHIFT", // способность 3 (пока пусто; спринта нет — на Shift будет способность)
      run: "", //            спринта в игре нет
      ability1: "", // ячейки панели движка — не нужны: выбор ячеек — item1 / item2
      ability2: "",
      ability3: "",
      ability4: "",
      ability5: "",
      palette: "key:G", // панель цветов (когда выбрана стройка)
      save: "key:F5",
      autoLoot: "key:V", // автоподбор вкл/выкл (вид камеры — в настройках)
      inventory: "key:I",
      talents: "key:T",
      map: "key:M",
      interact: "key:F", // подобрать предмет под прицелом (матч: держать у урны союзника — оживить)
      scoreboard: "key:TAB", // сетевая игра: держать — таблица игроков и пинг
      chat: "key:RETURN", // чат (и «/команда» — консоль)
      mount: "key:Z", //    маунт: позвать / слезть (MOUNT)
      record: "key:F7", //  запись повтора (разработка): F7 — начать / закончить, в папку saves/replays
      tune: "key:F6", //    окно баланса (разработка): цифры config.js на ходу — tune.js
      mountMode: "key:LALT", // верхом: поводья / оружие
      crouch: "key:LCTRL", //  присед (CROUCH)
    },
  },
};

export const GAME_ACTION_LABELS = {
  scoreboard: "PLAYERS (TAB)",
  mount: "MOUNT",
  tune: "BALANCE (DEV)",
  record: "REPLAY (DEV)",
  mountMode: "MOUNT MODE",
  crouch: "CROUCH",
  item1: "ITEM 1",
  item2: "ITEM 2",
  skill1: "SKILL 1",
  skill2: "SKILL 2",
  skill3: "SKILL 3",
  run: null, // спринта нет — в списке клавиш не показываем
  palette: "BLOCK COLOR",
  save: "SAVE",
  autoLoot: "AUTO LOOT",
  inventory: "INVENTORY",
  talents: "TALENTS",
  map: "MAP",
  interact: "INTERACT",
  chat: "CHAT",
};

// Своя тема интерфейса (engine/ui/theme.js): «костяная» — тёплые рамки и заголовки.
// Указано только то, что отличается от темы движка по умолчанию.
export const THEME = {
  accent: [232, 196, 120],
  window: { border: [120, 108, 84], titleBar: [40, 34, 28], titleText: [236, 226, 200], fill: [20, 19, 22] },
  button: { fill: [36, 32, 30], hover: [96, 78, 50], border: [120, 108, 84], hoverBorder: [236, 210, 150] },
  backdrop: { top: [34, 30, 30], bottom: [12, 11, 14] },
};

// Стили интерфейса (настройка UI STYLE, стрелками): «кость» — своя тема игры, остальные — на выбор
export const THEMES = [
  { name: "BONE", theme: THEME },
  { name: "VOID", theme: {} }, // тема движка как есть
  {
    name: "EMBER", theme: {
      accent: [255, 150, 70],
      window: { border: [150, 70, 40], titleBar: [50, 20, 14], titleText: [255, 220, 190], fill: [22, 12, 10] },
      button: { fill: [44, 22, 16], hover: [120, 50, 25], border: [150, 70, 40], hoverBorder: [255, 170, 90] },
      backdrop: { top: [44, 18, 12], bottom: [10, 6, 6] },
    },
  },
  {
    name: "FROST", theme: {
      accent: [140, 210, 255],
      window: { border: [80, 120, 160], titleBar: [18, 30, 46], titleText: [220, 240, 255], fill: [10, 16, 24] },
      button: { fill: [20, 32, 48], hover: [40, 80, 120], border: [80, 120, 160], hoverBorder: [160, 220, 255] },
      backdrop: { top: [20, 36, 56], bottom: [6, 10, 16] },
    },
  },
  {
    name: "MOSS", theme: {
      accent: [170, 220, 110],
      window: { border: [90, 120, 70], titleBar: [24, 34, 20], titleText: [220, 240, 200], fill: [12, 18, 12] },
      button: { fill: [26, 38, 24], hover: [60, 90, 45], border: [90, 120, 70], hoverBorder: [190, 235, 140] },
      backdrop: { top: [26, 40, 24], bottom: [8, 12, 8] },
    },
  },
];

export const CAMERA_MODES = { first: "FIRST PERSON", third: "THIRD PERSON" };

export const PALETTE = [
  [200, 200, 205], // камень
  [140, 95, 60], //   дерево
  [90, 170, 80], //   трава
  [70, 120, 220], //  вода
  [220, 70, 70], //   кирпич
  [175, 225, 245], // лёд — скользкий (PALETTE_SURFACE): на нём не устоять, съезжаешь
  [255, 214, 130], // лампа — светится (LIGHTS): вокруг светло и ночью
];
// Светящиеся блоки (движок: world.setEmitters → chunk-mesh.js blockLightAt): цвет, яркость 0…1, радиус (блоков, ≤ 16).
// Лампа — из палитры стройки; факел — на столбиках мостов и у места появления (scene/islands.js)
export const LIGHTS = {
  lamp: { color: [255, 214, 130], power: 1, radius: 9 },
  torch: { color: [255, 160, 70], power: 0.9, radius: 7 },
  chest: { color: [196, 150, 60], power: 0.5, radius: 4 }, // крышка сундука (ISLANDS.chest.color) чуть светится
};
// Особые поверхности цветов палитры (номер цвета → поверхность блока): "slip" — скользкий (движок: Physics)
export const PALETTE_SURFACE = { 5: "slip" };

// Рост героя 1.6 (модель скелета 1.8 × HERO_SCALE). С катаной в руках — стойка самурая (STANCE): колени
// согнуты, герой ниже — и коробка столкновений, и глаза (game-scene.js → updateStance)
export const HERO_SCALE = 1.6 / 1.8;
export const STANCE = { height: 1.4, eyeHeight: 1.28 };
// Присед (Ctrl; настройки: держать / переключать): ниже рост (коробка и хитбоксы — голова ниже) и глаза, медленнее
// ходьба (speed), у стволов меньше отдача (recoil — множитель) и разброс дроби (spread — множитель)
// notice — во сколько раз ближе мобы замечают присевшего (радиус агра ×0.55 — на 45 % меньше)
export const CROUCH = { height: 1.15, eyeHeight: 1.0, speed: -0.5, recoil: 0.5, spread: 0.6, notice: 0.55 };
// Геймпад: в движке есть (engine/input/gamepad.js), в игре пока выключен — не проверен на настоящем
export const GAMEPAD_ENABLED = false;

// Разгон героя (движок: CharacterController.accel), секунд: ground — до скорости шага на земле, stop —
// остановиться, air / airStop — то же в воздухе (меньше — резче управление в полёте, как в Overwatch),
// over — сбросить скорость сверх бега (после рывка / отброса). Пробный вариант — подбираем (консоль: move_*)
// ещё ×1.3 быстрее (первая проба была 0.2 / 0.1 / 0.3 / 0.8 / 0.35, потом ×1.5)
export const MOVEMENT = { ground: 0.1, stop: 0.05, air: 0.15, airStop: 0.4, over: 0.18 };
// Маунт разгоняется дольше (тяжёлый зверь)
export const MOUNT_MOVEMENT = { ground: 0.55, stop: 0.35, air: 1.2, airStop: 2, over: 0.5 };

export const PLAYER = {
  height: 1.6, //     рост (коробка столкновений)
  eyeHeight: 1.48, // глаза над ногами (метры)
  speed: 4, //        шаг, м/с
  runMultiplier: 2,
  jumpHeight: 1.2, // прыжок на 1.2 блока — хватает, чтобы запрыгнуть на один
};

// Мобы появляются сами: раз в interval секунд в случайной точке ВОКРУГ ГЕРОЯ, в пределах
// дальности прорисовки (её берём у рендерера: fadeDist, VIEW_DISTANCE — 66 м). max — больше скольких живых мобов
// despawnDistance — спокойный моб, отставший дальше этого, исчезает (освобождает место у тебя рядом).
// despawnDistance — спокойный моб (и дикий кабан) дальше этого от героя исчезает; huntDespawn — даже злой
// (потерял героя из виду и отстал). Появляются не дальше 60 м (прорисовка), так что дальше 75 — значит «ушёл»
// interval — раз в сколько секунд новый моб (5 / 3: втрое чаще, чем было), max — предел живых мобов вокруг
// interval — раз во сколько секунд новый моб (было 5 / 3 — вдвое чаще; ещё раньше 5)
export const SPAWN = { interval: 10 / 3, max: 45, minPlayerDistance: 12, despawnDistance: 75, huntDespawn: 100 };
// Сетевая игра (матч из лобби, lobby.js): опыт общий и капает медленнее, мобов больше; погибший — урна с призраком,
// союзник оживляет, держа F revive.time с рядом (урон сбивает); погибли все — матч окончен
export const MULTIPLAYER = {
  xp: 0.5, //       опыт ×0.5 (общий на всех)
  spawn: 1.3, //    мобы появляются в 1.3 раза чаще
  revive: { time: 5, range: 2.5, hp: 0.5 }, // держать F 5 с ближе 2.5 м; встаёт с половиной здоровья
  ghostHeight: 1.1, // призрак — над урной на столько метров (оттуда же смотрит камера погибшего)
};
export const LOBBY = { countdown: 3, maxPlayers: 6 };
// Дуэль (режим лобби, scene/duel.js): каждый сам за себя на маленькой арене, до wins побед. Перед каждым раундом
// prep секунд подготовки в своей комнате (комнаты — по кругу вокруг арены): выдаются очки талантов и монеты,
// в 1-м раунде — выбор класса, во 2-м — второго оружия. Вещи на начало раунда возвращаются к следующему.
// У героя в дуэли своё здоровье и он быстрее ходит. Стены арены и комнат (серые) не ломаются;
// всё внутри — ломается и строится (сломанное не выпадает). Таланты — все, кроме трофеев
export const DUEL = {
  wins: 3, //        до 3 побед (до 5 раундов: 4-й и 5-й — если ещё никто не набрал 3)
  prep: 45, //       секунд подготовки перед раундом
  endPause: 4, //    секунд после раунда (кто победил)
  rounds: [
    { points: 5, coins: 200, pick: "class" },
    { points: 5, coins: 250, pick: "second" },
    { points: 10, coins: 250 },
    { points: 5, coins: 250 },
    { points: 5, coins: 250 },
  ],
  hp: 220, //        здоровье героя (вместо обычного)
  speed: 0.25, //    +25 % скорости
  build: 40, //      блоков для стройки на раунд (если меньше — до стольких)
  arena: { half: 18, height: 9, props: 54 }, // полуширина (м), высота стен, сколько случайных построек внутри
  room: { half: 3, height: 4, gap: 10 }, //     комната подготовки: полуширина, высота, отступ от арены
  wall: [112, 114, 122], //                     серые неразрушимые стены (поверхность "arena")
  lamp: [255, 214, 130], //                     светильники в потолке (цвет лампы — светится, LIGHTS.lamp)
  // Магазин в дуэли: броня (цены — ARMOR … duel) и полезное (shop: аптечка, ловушки, молоток-стройка).
  // Лучшее оружие и броня надеваются сами, лишнее — в утиль (scene/duel.js → duelOutfit)
  shop: { medkit: 40, "bear-trap": 35, spikes: 30, builder: 30 },
};

// Сколько живут в мире (секунды): спокойный моб (не злой) и предмет на земле исчезают через 2 минуты
export const LIFETIME = { mob: 120, pickup: 120 };

// Мобы без цели бродят вокруг места, где оказались (движок: HostileBrain → wander)
export const MOB_WANDER = { radius: 8, pause: [2, 6] };

// Нашествие (движок: RandomEvent): раз в секунду шанс chance (1/240 — в среднем раз в 4 минуты, в 1.5 раза чаще,
// чем было). Все мобы бегут на героя, где бы он ни был; спавн в spawnSpeed раз быстрее (5 с / 2.6 ≈ раз в 1.9 с),
// предел мобов — max. Идёт duration секунд, потом cooldown секунд не повторяется.
// Виды (types, выбор поровну по weight): обычное; БЫСТРОЕ — все мобы на 30 % быстрее (speed);
// ДАЛЬНЕЕ — половина новых мобов стрелки (rangedShare вместо обычных MOB_RANGED.chance)
export const INVASION = {
  chance: 1 / 240, every: 1, duration: 60, cooldown: 120, spawnSpeed: 2.6, max: 50,
  types: {
    normal: { weight: 1, name: "INVASION" },
    fast: { weight: 1, name: "FAST INVASION", speed: 0.3 },
    ranged: { weight: 1, name: "RANGED INVASION", rangedShare: 0.5 },
  },
};

// Поведение скелета: игрок ближе radius — поворачивается и идёт к нему
export const SKELETON_AI = { radius: 12, speed: 2.2, stopDistance: 1.1, turnSpeed: 4, jumpSpeed: 7.5 };

// Стадо: ударили скелета (хоть издалека) — он злится на обидчика, а с ним все скелеты
// в радиусе radius, от них — их соседи, и так по цепочке. alertOnSight — так же,
// когда скелет сам заметил игрока (ближе SKELETON_AI.radius). Злой скелет гонится,
// пока игрок не дальше leash блоков (дальше — успокаивается).
export const HERD = { radius: 5.5, alertOnSight: true, leash: 45 };

// Скелеты крепчают: каждый следующий (из спавнера) — на hpPerSpawn HP больше,
// каждые damageEvery появлений — на damageStep урона больше
// Какой моб появляется из спавнера: доли (в сумме — любые числа). Зомби — реже скелетов
export const MOB_MIX = { skeleton: 7, zombie: 3, bloater: 1 }; // РАЗДУТЫЙ — ~1 из 11

// РАЗДУТЫЙ (bloater): опухший зомби-смертник (движок: KamikazeBrain с запалом). Замечает ближе range, бежит;
// подбежал ближе trigger — встаёт и шипит prime с (на земле красный круг — беги!), потом взрыв: урон damage
// (растёт, как у мобов) всем в radius. Мобам взрыв не вредит. Убил до взрыва — просто лопается
export const BLOATER = { range: 14, trigger: 2.2, prime: 1.1, radius: 3, damage: [22, 32] };

// Кабан — мирный (НПС), появляется редко: раз в interval секунд с шансом chance, не больше max.
// Ранили — убегает; крепчает вместе с мобами (BOAR_SCALE)
export const BOARS = { interval: 30, chance: 0.3, max: 2 };

// Рост по счёту появлений мобов (движок: grow — проценты от базы + прибавка цифрой каждые every):
//   hp — здоровье, damage — урон атаки, xp — опыт за победу.
// Урон растёт в ПРОЦЕНТАХ (+0.4 % базы за каждого моба) и чуть-чуть цифрой (+1 за каждые 25) —
// так мобы крепчают, но не становятся «убивающими с двух ударов»: к 300-му скелет бьёт 23–34 (было 65–70).
const MOB_DAMAGE = { pct: 0.004, flat: 1, every: 25 };
// Страж растёт вместе с мобами: здоровье +4 % базы за каждого (300 → +12), урон — так же в процентах
export const WARDEN_GROWTH = { hp: { flat: 12 }, damage: MOB_DAMAGE };

// Босс логова — ПЕЩЕРНЫЙ ТРОЛЛЬ: живёт в зале внутри горы (логово — WORLDGEN.terrain.bossChance) и из него
// не выходит (движок: HostileBrain territory — зал + territory м). Злится, только если его ударили или подошёл
// ближе aggroRadius (5.5 м). Бьёт дубиной о землю (SlamAttack: замах 0.7 с — на земле красный круг, успей
// отойти) и кидает валуны, если ты далеко. Убит — новый через respawn секунд (3 мин).
// Растёт вместе с мобами (по счёту появлений, как страж): +20 HP за моба, урон — как у мобов.
// Награда: опыт (как ~20 скелетов), монеты и ШКУРА ТРОЛЛЯ (TROLL_HIDE)
// В логове — случайный из types (по весам) при каждом появлении: ТРОЛЛЬ или ЛИЧ.
// Баланс (0.38): боссы крепче — HP ×2.5, броня, стойкость к контролю: оглушение и заморозка на них короче на
// stunResist (60 %), а после оглушения stunImmunity с новое не действует (молотом «держать» нельзя).
// Ниже enrageAt здоровья — ЯРОСТЬ: атакуют на 30 % чаще (enrage.cooldown) и на 25 % быстрее ходят.
// Без цели (ушёл из логова) — лечатся regen доли макс. HP в секунду: «ударил и убежал» не работает
export const BOSS = {
  respawn: 180, // в логове в горе — ТРОЛЛЬ, на жёлтой площадке (WORLDGEN.arena) — ЛИЧ
  aggroRadius: 5.5, territory: 1.5,
  growth: { hp: { flat: 40 }, damage: MOB_DAMAGE },
  stunResist: 0.6, stunImmunity: 5, enrageAt: 0.5, enrage: { cooldown: 0.7, speed: 0.25 }, regen: 0.04,
  // Урон в процентах от макс. HP (горение, кровотечение, капкан +50 % HP) по боссу — в 8 раз слабее
  // (движок: entity.percentDamageScale; предел горения — тоже)
  percentDamageScale: 1 / 8,
};
// ЛИЧ (второй босс): высокий скелет-колдун. Держится на расстоянии и стреляет фиолетовыми сгустками; подошёл
// ближе blink.near — исчезает и появляется в другом конце зала (раз в blink.cooldown с); раз в summon.every с
// поднимает summon.count скелетов (не больше summon.max сразу; без добычи)
export const LICH = { blink: { near: 3.5, cooldown: 6 }, summon: { every: 15, count: 2, max: 3 } };
// Корона лича (трофей): навсегда +урон всем — первая +6 %, каждая следующая на 1 % меньше (6, 5, 4…)
export const BONE_CROWN = { first: 0.06, step: 0.01 };

// Шкура тролля (трофей босса): навсегда меньше физического урона — первая −10 %, каждая следующая на 1.5 % меньше
// (10, 8.5, 7, 5.5, 4, 2.5, 1 — дальше 0). Складывается с талантом TOUGH BONES (общий предел — 90 %)
export const TROLL_HIDE = { first: 0.1, step: 0.015 };

// Стрелки среди мобов: с шансом chance (10 %) моб появляется с дальним оружием — каким, по весам weight:
//   камень 45 %, нож 45 % — МЕТАТЕЛЬНЫЕ: бросил по дуге — перезарядка (5 с), и пока она идёт, подходит
//     ближе (advance); готово, цель ближе range и видна — снова бросает;
//   пистолет 10 % — держится на дистанции range (10 м): дальше — подходит, ближе — стоит и стреляет по перезарядке.
//     Целится преимущественно в голову (head — доля выстрелов в голову, остальные — в грудь), разброс spread,
//     отдача recoil (рад): ствол уводит вверх на 0…recoil и вбок на ±recoil/2 — небольшая, часть пуль мимо головы
// Вплотную (ближе minRange) — бьёт рукой, как обычный моб. names — как зовут стрелка (по типу моба)
export const MOB_RANGED = {
  chance: 0.1, minRange: 3.5, gravity: 20,
  weapons: {
    stone: { weight: 45, attack: "stoneThrow", item: "stone", held: "w-stone", range: 14, advance: true },
    knife: { weight: 45, attack: "knifeThrow", item: "knife", held: "w-knife", range: 14, advance: true },
    pistol: { weight: 10, attack: "mobPistol", held: "w-pistol", range: 10, hitscan: true, spread: 0.02, head: 0.75, recoil: 0.035 },
  },
  names: {
    skeleton: { stone: "SKELETON THROWER", knife: "SKELETON KNIFER", pistol: "SKELETON GUNNER" },
    zombie: { stone: "ZOMBIE THROWER", knife: "ZOMBIE KNIFER", pistol: "ZOMBIE GUNNER" },
  },
};

// Кабаны тоже крепчают по тому же счёту появлений мобов — и дикие, и приручённый:
// +3 HP за каждого появившегося моба (~4 % от 80), бивни — как урон мобов (проценты), опыт +2.5 %
export const BOAR_SCALE = { hp: { flat: 3 }, damage: MOB_DAMAGE, xp: { pct: 0.025 } };

export const SKELETON_GROWTH = { hp: { flat: 2 }, damage: MOB_DAMAGE, xp: { pct: 0.025 } }; // xp: +2.5 % за каждого следующего
// Рост мобов замедляется: после soft-го появившегося здоровье и урон растут вдвое медленнее (иначе к 600-му
// скелету он втрое опаснее героя на максимальном уровне — силы героя ограничены уровнем, а счёт мобов — нет).
// Опыт за них растёт как раньше
export const GROWTH_SOFTCAP = { soft: 400, after: 0.5 };

export const REACH = 8; // как далеко ставим блоки (метры)

// Стройка из камней: один блок стоит stonePerBlock камней. refundOnBreak — сломал блок, камень вернулся
// (как в Minecraft: блоки домов — тоже источник камня)
// Стройка: блоки — отдельный предмет («БЛОК», белый; в мире красится в цвет палитры). 1 блок — 1 клетка;
// сломал — блок вернулся. В магазине — пачкой по pack штук
// airPlace — ставить блок «в воздух»: прицел ни во что не упёрся, а на луче есть пустая клетка рядом с блоком
// (building.js → airTarget). false — выключить
export const BUILD = { item: "block", perBlock: 1, refundOnBreak: true, pack: 16, airPlace: true };

export const PICKUP_REACH = 3.5; // как далеко дотягиваемся до предмета на земле (метры от глаз)
export const PICKUP_AUTO_RADIUS = 1.6; // автоподбор: всё, что ближе — само в сумку (V — вкл/выкл)

// Рельеф мира до 0.40 (главный остров 50): по нему пересчитывается высота земли в СТАРЫХ сохранениях
// (в них параметров рельефа нет — только зерно). Новые миры пишут свои параметры в сохранение
export const TERRAIN_V1 = {
  radius: 50, edge: 14, flatCenter: 8, hills: { amp: 3, scale: 22 },
  plateaus: { count: 2, radius: [6, 9], height: [4, 6], edge: 4 },
  mountains: { count: 1, radius: [16, 20], height: [13, 18], distance: [26, 34] },
  islands: { count: [3, 6], radius: [9, 15], distance: [68, 86], edge: 5, hills: 2, mountainChance: 0.4, mountain: { radius: [6, 9], height: [7, 11] } },
  bossChance: 0.3,
};

// Новый мир (движок: engine/world/terrain.js, engine/world/structures.js):
// рельеф в круге 75 блоков — холмы, плато, две горы; к краю плавно сходит на нет, в центре ровно.
// На нём — домики, башни, кучи коробок (площадка под постройку выравнивается) и деревья.
export const WORLDGEN = {
  terrain: {
    radius: 75, edge: 18, flatCenter: 8, //                       круг рельефа, полоса спуска к краю, ровный центр
    hills: { amp: 3, scale: 22 }, //                              мягкие холмы: высота, ширина
    plateaus: { count: 3, radius: [7, 11], height: [4, 6], edge: 4 }, // плато: плоский верх, покатый край
    mountains: { count: 2, radius: [18, 24], height: [14, 20], distance: [38, 54] }, // горы
    // Маленькие острова вокруг главного (между ними — пустой пол); на острове с шансом — своя горка
    islands: { count: [3, 6], radius: [12, 20], distance: [102, 126], edge: 6, hills: 2, mountainChance: 0.4, mountain: { radius: [7, 11], height: [8, 12] } },
    bossChance: 0.3, //                                            в горе — логово босса (зал с проходом): ПЕЩЕРНЫЙ ТРОЛЛЬ (BOSS)
    minLairs: 1, maxLairs: 1, //                                   логово тролля — ровно одно в каждом мире (и всегда — площадка лича)
  },
  colors: { grass: [96, 160, 72], dirt: [130, 96, 62], stone: [140, 140, 146], snow: [236, 240, 246], rockLine: 10, snowLine: 14 },
  houses: 11, //             сколько домиков (на главном острове)
  towers: 3, //              сторожевых башен
  piles: 12, //              куч коробок
  trees: 64, //              деревьев
  area: [-66, -66, 66, 66],
  maxSlope: 3, //            постройку ставим, если перепад под ней не больше (иначе — другое место)
  house: { w: [5, 8], d: [5, 7], h: [3, 4], decay: [0, 0.18] }, // размеры: [от, до]; decay — сколько кубиков «выпало»
  tower: { size: [3, 4], h: [6, 8] },
  pile: { w: [2, 4], d: [2, 4], count: [2, 5] },
  tree: { height: [3, 5], crown: [2, 2] },
  gap: 3, //                 пустых клеток между постройками
  // Площадка лича — если в горах нет ни одного логова: жёлтый круглый настил radius (на маленьком острове без
  // горки, иначе — на главном в distance м от центра)
  arena: { radius: 5, distance: 48, color: [232, 200, 60] },
  // Маленькие острова: на каждом домиков [от, до], куч коробок, шанс сторожевой башни и деревьев
  islandStuff: { houses: [1, 2], piles: [0, 2], towerChance: 0.3, trees: [3, 6] },
  keepClear: 6, //           радиус пустоты вокруг места появления героя и жителей
};

// Размер мира (окно создания: 1 / 2 / 3) — во сколько раз главный остров, расстояния и число построек
// от WORLDGEN (3 — как WORLDGEN). floating — летающие острова: пола нет, под островами — каменный корень
export const WORLD_SIZES = {
  1: { name: "SMALL", scale: 0.6 },
  2: { name: "MEDIUM", scale: 0.8 },
  3: { name: "LARGE", scale: 1 },
};
export const FLOATING = { underside: 0.3, voidY: -40, voidDamage: 0.35 }; // глубина корня (× радиус), где бездна, сколько HP стоит падение
export function worldgenFor(size = 3, floating = false) {
  const k = WORLD_SIZES[size]?.scale ?? 1;
  const W = WORLDGEN, T = W.terrain;
  const sc = (v) => Math.round(v * k), pair = ([a, b]) => [sc(a), sc(b)];
  const cnt = (v) => Math.max(1, Math.round(v * k * k));
  return {
    ...W,
    terrain: {
      ...T,
      radius: sc(T.radius), edge: Math.max(8, sc(T.edge)),
      mountains: { ...T.mountains, count: Math.max(1, Math.round(T.mountains.count * k)), radius: pair(T.mountains.radius), distance: pair(T.mountains.distance) },
      islands: { ...T.islands, count: [Math.max(1, Math.round(T.islands.count[0] * k)), Math.max(2, Math.round(T.islands.count[1] * k))], distance: pair(T.islands.distance) },
    },
    colors: { ...W.colors, underside: floating ? FLOATING.underside : 0 },
    houses: cnt(W.houses), towers: cnt(W.towers), piles: cnt(W.piles), trees: cnt(W.trees),
    area: W.area.map(sc),
    arena: { ...W.arena, distance: sc(W.arena.distance) },
  };
}
// Атаки — параметры для классов движка (engine/combat/attacks.js).
// damage — число или [мин, макс]; element — стихия ("physical", "fire", "ice", "poison"...);
// modifiers — модификаторы, например [critical(0.1, 2)] (импорт из движка).
const PUNCH_REACH = 2.5;
// Маунт (как в Heroes of the Storm): покупается один раз в магазине (раздел ПРОЧЕЕ), зовётся клавишей Z
// мгновенно, исчезает от ЛЮБОГО урона по герою или по нему (таланты вкладки MOUNT: урон меньше 4 / 8 / 12 %
// макс. HP героя не сбрасывает), после — перезарядка cooldown с. Верхом: speed м/с (галопа нет: Shift — способность).
// Оружие в руках (режим ОРУЖИЕ) — двуручное замедляет скакуна (slowRanged / slowMelee). Скиллы движения оружия
// (ИАЙ, отскок дробовика, разбег с копьём) — сначала слезаем, потом скилл. Молот верхом не бьёт под себя
// (ATTACKS.hammerSwing: медленный взмах в сторону, слабее)
export const MOUNT = {
  price: 500, cooldown: 10, speed: 8.5, runMultiplier: 1, jumpHeight: 1.1, seat: 0.75,
  // Верхом два режима (Alt — переключить): ПОВОДЬЯ — обе руки держат поводья, атаковать нельзя, полная скорость;
  // ОРУЖИЕ — оружие в руках: одноручное — без замедления, двуручное дальнее — slowRanged, двуручное ближнее
  // (атака переделана, чтобы не ранить скакуна) — slowMelee
  slowRanged: 0.2, slowMelee: 0.08,
  twoHandedRanged: ["rifle", "auto", "shotgun", "launcher", "crossbow"],
  twoHandedMelee: ["war-hammer", "katana", "spear"],
};

export const ATTACKS = {
  katanaSaddle: { id: "katana-saddle", name: "SADDLE SLASH", damage: 52, reach: 3.4, cooldown: 1.3, arc: 150, maxTargets: 5 }, // катана верхом (MOUNT)
  hammerSwing: { id: "hammer-swing", name: "SADDLE SWING", damage: 55, reach: 3.2, cooldown: 1.7, arc: 150, maxTargets: 4 }, // молот верхом (MOUNT)
  // Рука игрока: ближний бой
  // Ближний бой игрока бьёт по ХИТБОКСУ — сектору arc° перед собой длиной reach (движок: MeleeAttack),
  // до maxTargets врагов (ближние первыми). Хедшотов у ближнего боя нет.
  punch: { id: "punch", name: "PUNCH", damage: 10, reach: PUNCH_REACH, cooldown: 1.1, arc: 70, maxTargets: 2 }, // ~0.9 удара в секунду; с талантом 3/3 — раз в 0.6 с
  // Пистолет: дальний бой, мгновенный луч
  // Стрелковое оружие: обойма (magazine) не бесконечная — кончилась, перезарядка reloadTime секунд (R — вручную).
  // Запас патронов бесконечный.
  // Дальность (range) и падение урона с расстоянием (falloff: [до скольких м полный, доля на range]):
  //   пистолет 65 м (с 35 м слабеет до 70 %) · автомат 75 м (с 30 м — до 60 %, плюс отдача) · дробовик 28 м
  //   (с 10 м — до 40 %: оружие вплотную) · арбалет 100 м (с 50 м — до 80 %) · снайперка 200 м БЕЗ падения —
  //   её дело — дальний бой (дальше всех прорисовок: DRAW_DISTANCES до 120 м, в оптике видно всё, что прорисовано)
  // БАЛАНС 0.5x (урон в секунду с перезарядкой, без хедшотов и талантов; «толпа» — сумма по задетым):
  //   базовое (с 1 уровня, улучшения +10 % ×2):   пистолет 37/с · мачете 30/с (×2 = 60) · граната 33/с (×3 ≈ 100)
  //   второе (10 уровень, ~1.4–2× базового, улучшения +15 % ×3):
  //     СТРЕЛОК  автомат 60/с (отдача) · дробовик 63/с вплотную · снайперка 58/с (хедшот ×2, далеко) ·
  //              арбалет 57/с, по линии ≈ 139/с
  //     БОЕЦ     копьё 61/с (×3 на линии) · катана 50/с (×4–6 в секторе) · молот 43/с (×3 в круге, оглушение, прыжок)
  //     ПОДРЫВНИК гранатомёт 51/с (r2) · динамит 47/с (r4, ×5 разом)
  //   «освоить базовое» на 10 уровне: +70 % сразу и улучшения второго → 2.35× базового (пистолет ≈ 87/с) —
  //   наравне со вторым по одной цели (2-е с улучшениями — 1.45× своего), но без его площади
  // Мобы: скелет 50 HP + 2 за каждого следующего (к 10 уровню ≈ 200), после 400-го — вдвое медленнее (GROWTH_SOFTCAP)
  pistol: { id: "pistol", name: "SHOT", damage: 28, range: 65, falloff: [35, 0.7], cooldown: 0.6, magazine: 7, reloadTime: 1.7, shake: 0.14 }, // «пустынный орёл»: редко, но больно (хедшот 56)
  auto: { id: "auto", name: "BURST", damage: 10, range: 75, falloff: [30, 0.6], cooldown: 0.1, magazine: 30, reloadTime: 2.1, headMultiplier: 1.5 }, // в голову ×1.5 (у остальных ×2)
  // Мачете: свои статы оружия — дальше достаёт и бьёт больнее, но медленнее кулака (раз в 1.4 с);
  // хитбокс шире кулака — задевает двоих. Таланты ближнего боя ускоряют её в процентах: 1.4 → 0.76 с
  machete: { id: "machete", name: "MACHETE SWING", damage: 42, reach: 2.9, cooldown: 1.4, arc: 80, maxTargets: 2 },
  // Копьё (БОЕЦ): укол далеко и узко — двоих на линии; без блока. Разбег (ПКМ) — SPEAR
  // Укол ~61 урона/с трём на линии (молот ~43/с по каждому в круге, катана — 50/с всем в секторе + ИАЙ);
  // разбег — 60 за врага в начале, на полной скорости с MOMENTUM ×2.6 (≈157) — по 11 врагам насквозь
  spear: { id: "spear", name: "SPEAR THRUST", damage: 52, reach: 3.8, cooldown: 0.85, arc: 24, maxTargets: 3 },
  spearCharge: { id: "spear-charge", name: "SPEAR CHARGE", damage: 60, reach: 1 },
  // Катана: удар режет всё перед собой — сектор 110° (не весь экран: по бокам уже не задевает), до 6 врагов
  // Приручённый кабан: бьёт бивнями врагов рядом с хозяином (средний урон, ближний бой, короткий замах)
  boarTusk: { id: "tusk", name: "TUSK HIT", damage: [10, 16], reach: 1.9, windup: 0.25, cooldown: 1.2 },
  // Боевой молот (БОЕЦ, покупной): медленный тяжёлый удар (~43 урона/с каждому в круге); таланты — оглушение
  // и «сплеш» (бьёт всех вокруг цели)
  // Боевой молот — удар ПО ЗЕМЛЕ (движок: SlamAttack): замах windup с, потом всем врагам в круге radius
  // (1 блок; талант SPLASH SLAM — больше) вокруг точки в distance м перед собой — полный урон
  // grounded — только о землю: ударил в прыжке — удар, когда приземлишься (HAMMER: падаешь быстрее)
  warHammer: { id: "war-hammer", name: "HAMMER SLAM", damage: 90, distance: 1.7, radius: 1, windup: 0.3, cooldown: 1.8, grounded: true },
  // ПОДРЫВНИК: всё — взрывы по площади (MagicAttack, снаряд летит, долетел — burst). Вид атак — "blast" (свои таланты).
  // Граната (базовая): бросок по дуге, взрыв от удара ~33 урона/с ПО ВСЕМ в радиусе; гранатомёт — быстрее и
  // настильнее, радиус меньше (~51/с); динамит — лежит fuse с и рвёт сильно и широко (~47/с, но разом по толпе)
  handGrenade: { id: "hand-grenade", name: "GRENADE", damage: 40, radius: 2.5, cooldown: 1.2, cost: 0, projectile: true, speed: 23.1 }, // бросок рукой: +40 % (было 15)
  launcher: { id: "launcher", name: "LAUNCHER SHELL", damage: 36, radius: 2, cooldown: 0.7, cost: 0, projectile: true, speed: 28 },
  dynamite: { id: "dynamite", name: "DYNAMITE", damage: 105, radius: 4, cooldown: 3, cost: 0, projectile: true, speed: 18.2 }, // бросок рукой: +40 % (было 13)
  clusterBomb: { id: "cluster", name: "CLUSTER BOMBLET", damage: 30, radius: 1.8, cooldown: 0, cost: 0, projectile: true },
  // Дробовик, скилл Q «ОТСКОК» (SHOTGUN_BLAST): залп в упор — всем в конусе перед собой (до 7 м)
  shotgunBlast: { id: "shotgun-blast", name: "BLAST JUMP", damage: 45, reach: 7, arc: 70, maxTargets: 6 },
  katana: { id: "katana", name: "KATANA SLASH", damage: 65, reach: 3.2, cooldown: 1.3, arc: 110, maxTargets: 6 }, // 65 каждому; ИАЙ — ×1.5 (талант — до ×3)
  // Снайперская винтовка: урон фиксированный (120, хедшот 240), бьёт далеко, но медленно перезаряжается
  rifle: { id: "rifle", name: "SNIPER SHOT", damage: 111, range: 200, cooldown: 1.75, magazine: 3, reloadTime: 2.4 }, // 1.75 с: передёргиваем затвор; в голову (×2) — 222
  // Арбалет: болт — снаряд (летит 80 м/с и слегка падает: на 100 м — ~3 м ниже; целься выше вдаль),
  // пробивает насквозь до 3 врагов на линии (каждому следующему — 80 % урона); после выстрела —
  // взвод (магазин 1). Один на один ~57/с, по толпе в ряд — до ~139/с
  // Лук: урон — от натяжения (BOW: min → damage), стрела — снаряд; бесконечные стрелы, после выстрела — cooldown
  bow: { id: "bow", name: "ARROW", damage: 126, range: 120, cooldown: 0.75 },
  bowBlast: { id: "bow-blast", name: "EXPLOSIVE ARROW", damage: 30, radius: 1.5, cooldown: 0, cost: 0 },
  crossbow: { id: "crossbow", name: "CROSSBOW BOLT", damage: 85, range: 100, falloff: [50, 0.8], projectile: { speed: 80, gravity: 4 }, cooldown: 0.2, magazine: 1, reloadTime: 1.3, pierce: 3, pierceFalloff: 0.8 },
  // Дробовик (СТРЕЛОК, покупной): 8 дробин с разбросом, вблизи — 72 за выстрел (~63/с, если все попали)
  shotgun: { id: "shotgun", name: "BUCKSHOT", damage: 9, range: 28, falloff: [10, 0.4], cooldown: 0.9, magazine: 6, reloadTime: 2.4, pellets: 8, spread: 0.06 },
  // Граната автомата (талант GRENADE): каждые every выстрелов — 200 % урона выстрела по площади
  grenade: { id: "grenade", name: "GRENADE", damage: 16, radius: 2.5, every: 15, speed: 22, cooldown: 0, cost: 0 },
  // Скелет: достаёт на 30 % ближе игрока (2.5 × 0.7), урон 5–10, замах 0.35 с (успел отойти — промах)
  skeletonClaw: { id: "claw", name: "SKELETON CLAW", damage: [5, 10], reach: PUNCH_REACH * 0.7, windup: 0.35, cooldown: 1.3, arc: 90, maxTargets: 2 },
  // Страж: меч — бьёт мобов, которые подошли к нему или к его дому
  wardenSword: { id: "warden-sword", name: "WARDEN SWORD", damage: [15, 22], reach: 2.3, windup: 0.25, cooldown: 1.0, arc: 110, maxTargets: 3 },
  // Зомби: тянется дальше скелета (× 1.25), бьёт чуть сильнее, но замахивается дольше
  // ---------- Ловушки ----------
  // Капкан: одноразовый, захлопывается на первом враге — урон (+50 % его макс. HP) и держит на месте (TRAPS root с)
  bearTrap: { id: "bear-trap", name: "BEAR TRAP", damage: 50, radius: 0.6, damageType: "pure" }, // чистый урон: броня и сопротивления не помогают (как pure в Dota)
  // Шипы: многоразовые, колют всех врагов на доске раз в rearm секунд
  spikes: { id: "spikes", name: "SPIKES", damage: 12, radius: 1.1, rearm: 0.8 },
  // Броски мобов-метателей (снаряд по дуге; урон растёт как у их удара)
  // Дальнее оружие мобов (MOB_RANGED): метательное — перезарядка 5 с (за это время подходит ближе), пистолет — 2.5 с
  stoneThrow: { id: "stone-throw", name: "STONE THROW", damage: [5, 9], speed: 16, cooldown: 5 },
  knifeThrow: { id: "knife-throw", name: "KNIFE THROW", damage: [7, 11], speed: 20, cooldown: 5 },
  mobPistol: { id: "mob-pistol", name: "PISTOL SHOT", damage: [6, 10], cooldown: 2.5 },
  // Пещерный тролль (BOSS): удар дубиной о землю (движок: SlamAttack, slam: true) — замах windup с, потом всем
  // в круге radius вокруг точки в distance м перед ним; достаёт, если цель ближе reach. Валун — бросок издалека
  trollSlam: { id: "troll-slam", name: "GROUND SLAM", damage: [34, 48], reach: 3.5, distance: 1.9, radius: 2.8, windup: 0.7, cooldown: 2.4, slam: true },
  boulderThrow: { id: "boulder-throw", name: "BOULDER", damage: [22, 32], speed: 15, cooldown: 3.5 },
  // Лич: костлявое касание вплотную и сгусток (летит прямо, без дуги)
  lichTouch: { id: "lich-touch", name: "BONE TOUCH", damage: [16, 22], reach: 1.8, windup: 0.3, cooldown: 1.4 },
  lichBolt: { id: "lich-bolt", name: "SOUL BOLT", damage: [18, 26], speed: 20, cooldown: 1.6 },
  zombieClaw: { id: "zombie-claw", name: "ZOMBIE CLAW", damage: [6, 11], reach: PUNCH_REACH * 0.7 * 1.25, windup: 0.45, cooldown: 1.5, arc: 100, maxTargets: 2 },
};

// Звуки игры (синтез — в движке)
export const SOUNDS = {
  place: tone(220, 110, 110, 5), //  глухой «тук» — блок поставлен
  remove: tone(520, 260, 90, 6), //  повыше — блок убран
  swing: tone(340, 90, 160, 4), //   «вжух» — удар мимо
  slash: mix(noise(190, 4, 0.2), tone(1400, 500, 150, 4)), // «вшш» катаны — свист клинка
  hit: tone(150, 55, 140, 5), //     попали по существу
  headshot: mix(tone(1600, 2400, 70, 6), tone(900, 1300, 90, 5), noise(30, 12, 0.4)), // хедшот: звонкий «дзынь»
  loot: tone(880, 1320, 180, 3), //  «дзынь» — добыча
  pickup: mix(tone(520, 780, 70, 3), noise(40, 6, 0.6)), // подобрали с земли (камень стукнул)
  shot: mix(noise(150, 7, 0.35), tone(170, 50, 150, 8)), // выстрел: шум + низкий «бум»
  shotHeavy: mix(noise(260, 5, 0.25), tone(130, 38, 300, 7), tone(68, 34, 380, 5)), // пистолет: тяжёлый раскатистый «БАХ»
  hurt: mix(tone(260, 110, 220, 4), noise(120, 9, 0.6)), // по игроку попали
  death: tone(300, 60, 900, 2), //   игрок погиб
  equip: tone(600, 900, 60, 6), //   сменили способность
  levelup: mix(tone(520, 1040, 350, 2), tone(780, 1560, 350, 2)), // новый уровень
  learn: tone(700, 1100, 120, 4), // вложили очко таланта
  boltOpen: mix(noise(45, 14, 0.45), tone(1400, 900, 45, 12)), //  затвор назад: «чк»
  boltClose: mix(noise(55, 12, 0.5), tone(800, 520, 60, 10)), //   затвор вперёд: «клац»
  shotAuto: mix(noise(80, 9, 0.3), tone(210, 80, 70, 8)), //        очередь: короче и суше выстрела
  reload: mix(noise(60, 10, 0.4), tone(500, 350, 70, 9)), //         обойма вынута: «щёлк»
  reloaded: mix(noise(50, 12, 0.5), tone(900, 650, 50, 10)), //      новая на месте: «клац»
  parry: mix(tone(1900, 1500, 160, 5), tone(1250, 1000, 200, 4), noise(60, 10, 0.3)), // блок: «дзынь» металла
  guard: tone(420, 620, 70, 8), //                                    поднял блок
  // Звуки мира (объёмные: слышно, откуда)
  step: mix(noise(45, 9, 0.88), tone(140, 90, 40, 9)), //            шаг существа
  hoof: mix(noise(35, 12, 0.8), tone(260, 170, 35, 10)), //          копыто кабана
  growl: mix(tone(115, 70, 380, 3), noise(320, 4, 0.92)), //         моб разозлился
  mobDeath: mix(tone(240, 60, 520, 3), noise(260, 5, 0.85)), //      моб погиб
  // Магия и ловушки
  cast: mix(noise(180, 5, 0.3), tone(300, 700, 180, 4)), //           огненный шар сорвался с посоха
  boom: mix(noise(420, 4, 0.12), tone(120, 40, 380, 3)), //           взрыв шара
  zap: mix(tone(1800, 900, 120, 6), noise(60, 10, 0.2)), //           ледяная стрела
  snap: mix(tone(900, 300, 80, 8), noise(70, 10, 0.4)), //            капкан захлопнулся
  spike: mix(tone(600, 250, 70, 9), noise(50, 10, 0.5)), //           шипы укололи
  trapSet: mix(tone(300, 200, 90, 6), noise(40, 10, 0.6)), //         поставил ловушку
};

// Музыка и окружение звука (scene/audio.js): раз в every с решаем трек; бой — моб охотится на героя ближе
// fightRadius, держится fightHold с после; смена треков — fade с; эхо — лучи до echoRange м
export const MUSIC_STATE = { every: 0.5, fightRadius: 32, fightHold: 6, fade: 2.5, echoRange: 10 };

// Объёмный звук: до refDistance — в полную силу, дальше maxDistance — не слышно (≈ дальность прорисовки)
export const HEARING = { refDistance: 3, maxDistance: 45, rolloff: 1 };

// Опыт: сколько нужно с уровня L до L+1 (100, 150, 200...). За уровень — 1 очко талантов.
// Сколько опыта даёт существо — в creatures.js (xp).
// xpMultiplier — весь получаемый опыт ×1.15 (на 15 % быстрее качаемся)
// Уровни: до 60 (было 45). После 45 опыта на уровень нужно больше (×1.5 сверху) — последние 15 уровней долгие,
// за них — «ветеранские» таланты ВЫЖИВАНИЯ (ярус 5)
export const PROGRESSION = { curve: (level) => (50 + level * 50) * (level >= 45 ? 1.5 : 1), pointsPerLevel: 1, maxLevel: 60, xpMultiplier: 1.15 };
// Дальность прорисовки, м (движок: GPURenderer fadeDist; было 60 — стало на 10 % дальше). От неё же — где появляются мобы
export const VIEW_DISTANCE = 66;
// Ступени дальности прорисовки и дымки (настройки → видео → DRAW DISTANCE): близко / средне / далеко, м.
// Мобы появляются и живут по VIEW_DISTANCE — от настройки графики не зависит (у всех одинаково)
export const DRAW_DISTANCES = [48, 72, 120];

// Портрет героя (лицо в кружке слева внизу): череп скелета, нарисованный символами.
// Каждый символ — цвет из PORTRAIT_PALETTE, «.» — прозрачно (виден фон кружка).
export const PORTRAIT = [
  "....######....",
  "..##########..",
  ".############.",
  ".############.",
  "##############",
  "###oo####oo###",
  "##oooo##oooo##",
  "##oooo##oooo##",
  "###oo####oo###",
  "+#####oo#####+",
  ".+####oo####+.",
  "..##########..",
  "..#o#o#o#o#o..",
  "...++++++++...",
];
export const PORTRAIT_PALETTE = {
  "#": [228, 220, 198], // кость
  "+": [186, 178, 156], // кость в тени
  o: [22, 18, 24], //      глазницы, нос, зубы
};

// Оружие в руках замедляет: пистолет маленький — на 5 %. Прицеливание (ПКМ, держать) —
// ещё на 10 % (вместе 15 %), камера приближается (fov), пистолет встаёт к центру экрана.
export const WEAPON_SPEED = { bow: -0.03, launcher: -0.08, pistol: -0.05, rifle: -0.1, crossbow: -0.06, auto: -0.08, shotgun: -0.08, warHammer: -0.08 }; // винтовка тяжелее
// Сколько секунд достают оружие после выбора (до этого не стреляет и не бьёт): тяжёлое — дольше
// Копьё, разбег (ПКМ, держать): бежишь вперёд сам (движок: Charge), куда — правишь взглядом. Посмотрел в сторону
// в пределах deadZone (20°) — без потерь (направление само доворачивает freeTurn °/с); дальше — скорость падает
// пропорционально лишнему углу (turnStop° сверх зоны — встал). Насквозь — до maxHits врагов (каждого по разу):
// урон ATTACKS.spearCharge × скорость / начальная. Отпустил ПКМ, упёрся в стену, набрал предел врагов
// или duration с — конец, перезарядка cooldown с. Скорость складывается со всеми прибавками (LIGHT STEP и т. п.).
// Талант MOMENTUM (ранг 1/2/3): разгон до +30/60/90 % скорости за rampTime с (быстрее — больнее),
// и насквозь на +2/4/6 врагов больше
// Разбег тратит выносливость, как бег (STAMINA.drain), и длится, пока она есть (своего предела по времени нет)
export const SPEAR = {
  charge: { speed: 8.5, maxSpeed: 8.5, deadZone: 20, freeTurn: 45, turnStop: 90, minSpeed: 3.5, duration: Infinity },
  minStamina: 10, //  начать разбег — нужно хотя бы столько выносливости
  maxHits: 5, hitRadius: 0.9, tip: 1.2, cooldown: 4,
  maxTime: 3, //      предел разбега, когда выносливость выключена (STAMINA.enabled: false)
  powerExp: 1.5, // урон разбега × (скорость / начальная) ^ powerExp: на разгоне бьёт заметно больнее
  momentum: { speed: [0.3, 0.6, 0.9], hits: [2, 4, 6], rampTime: 2 },
};

export const EQUIP_TIME = { bow: 0.35, launcher: 0.45, spear: 0.3, pistol: 0.3, auto: 0.45, rifle: 0.7, crossbow: 0.5, shotgun: 0.5, machete: 0.25, warHammer: 0.45, katana: 0.25, trap: 0.2, item: 0.15 };

// Ловушки: ставятся ЛКМ на любую грань блока или на землю под прицелом (не дальше reach м) — «клеятся»
// к стенам и потолку. Стоят, пока не сработают (капкан) или пока не поставишь сверх max (самая старая исчезает).
// percentHp — капкан: + доля макс. HP жертвы к урону; selfDamage — наступил сам: тебе эта доля урона
// alert — сколько секунд ловушка светится у хозяина красной обводкой, когда в неё попал враг (капкан держит 3 с).
// В сетевой игре ловушки видны всем: свои и союзников — как есть, вражеские — почти прозрачные (на 20 %)
export const TRAPS = {
  reach: 6,
  alert: 3,
  "bear-trap": { attack: "bearTrap", max: 5, root: 3, percentHp: 0.5, selfDamage: 0.5 },
  spikes: { attack: "spikes", max: 30, selfDamage: 0.5 }, // «постоянные шипы»: до 30 сразу (счётчик — над ячейкой)
};
// Обоймы (класс RANGER): у каждого ствола своя (items: оружие → предмет-обойма), берутся ТОЛЬКО в магазине.
// R — вставить обойму из сумки (самую полную): магазин полный, а недострелянная старая возвращается в сумку
// НЕПОЛНОЙ обоймой (на ячейке — сколько в ней патронов; такие в стопку не складываются).
// start — сколько обойм пистолета дают при выборе класса; refund — талант AMMO REFUND: патронов прямо в автомат
// Обоймы из сумки (движок: RangedAttack.reserve). enabled: false — обоймы не нужны: перезарядка всегда полная,
// запас бесконечный (кончается только магазин); в магазине их не продают. Вернуть — enabled: true
export const CLIPS = { enabled: false, items: { pistol: "pistol-clip", auto: "auto-clip", shotgun: "shotgun-clip", rifle: "rifle-clip" }, start: 3 };
// След пули (и у героя, и у мобов-стрелков): трассер — короткий светлый луч от ствола до попадания,
// в блок — чёрная точка на holeLife секунд
// День и ночь (scene/daylight.js): сутки — length с; ночью картинка темнее до night (доля яркости),
// рассвет и закат — по dusk доли суток. Выключить — настройки (DAY / NIGHT) или консоль daynight 0
export const DAY = { length: 900, night: 0.4, dusk: 0.08, start: 0.3 };
// Солнце и луна (scene/daylight.js): кубики на небе (как в Minecraft) — distance м от камеры (ближе дальней
// границы видимости 300 м), size — сторона. Ходят по кругу вокруг наклонённой оси (tilt — наклон к югу),
// луна — ровно напротив солнца. День — полцикла (7.5 мин при length 900), ночь — другая половина, с переходами
export const SKY_BODIES = { distance: 260, tilt: 0.38, sun: { size: 30, color: [255, 236, 150] }, moon: { size: 20, color: [214, 222, 240] } };

// Вне боя (scene/out-of-combat.js): рядом (radius блоков) нет моба, охотящегося на героя, и delay с героя не
// ранили мобы и он сам никого не ранил — бонусы: скорость +speed, регенерация ×regenMult
export const OUT_OF_COMBAT = { radius: 5, delay: 5, speed: 0.1, regenMult: 3 };
// Рана: попадание оружием (удар, выстрел, взрыв — не горение / кровотечение) режет регенерацию до regen (×0.5)
// на time секунд; новое попадание — отсчёт заново (не складывается)
export const WOUND = { regen: 0.5, time: 3 };

// Частицы (scene/effects.js): «кровь» по виду существа, сколько брызг (3 + урон / bloodPer, не больше bloodMax),
// огонь и дым взрыва, искры пули, пыль
export const FX = {
  blood: {
    default: [165, 18, 18], skeleton: [225, 218, 196], lich: [190, 170, 230], npc: [170, 200, 235], warden: [170, 200, 235],
    zombie: [95, 140, 55], bloater: [120, 150, 45], troll: [120, 60, 40], boar: [150, 20, 20], steed: [150, 20, 20],
  },
  bloodPer: 8, bloodMax: 16,
  fire: [255, 140, 40], fireCore: [255, 235, 160], smoke: [70, 70, 76], spark: [255, 215, 120], dust: [150, 145, 135],
};

export const BULLET = { color: [255, 215, 110], core: [255, 250, 225], life: 0.07, width: 3, hole: [15, 15, 15], holeLife: 3, holeSize: 0.012,
  // Трассер огнестрела — видно, откуда стреляли: чем мощнее выстрел, тем дольше висит и толще (по id атаки).
  // Нет в списке (арбалет — болт без пороха) — трассера нет, только след на блоке
  trace: {
    pistol: { life: 0.3, width: 3 }, auto: { life: 0.2, width: 3 }, shotgun: { life: 0.16, width: 2 },
    rifle: { life: 1.1, width: 5 }, "mob-pistol": { life: 0.35, width: 3 },
  },
};

// Выносливость (движок: Stamina): 100; бег (спринт) и разбег с копьём — drain в секунду (100 / 11 ≈ 9 с бега),
// восстанавливается regen в секунду через delay с после траты; выдохся — бегать снова, когда наберётся recover.
// Удары оружием ближнего боя стоят MELEE_STAMINA (по id атаки); не хватает — удара нет
// enabled: false — в этой игре выносливость выключена (класс Stamina в движке остался): бег без предела, удары
// бесплатно, шкалы нет; разбег с копьём тогда кончается через SPEAR.maxTime с
export const STAMINA = { enabled: false, max: 100, drain: 11, regen: 25, delay: 0.8, recover: 20 };
export const MELEE_STAMINA = { punch: 3, machete: 4, "war-hammer": 12, katana: 9, spear: 6 };

// Ультимейт (X; движок: UltimateCharge): заряд за 1 HP урона по врагам, за убийство и в секунду — доли
// полного заряда. Сейчас примерно: 3000 урона, или 66 убийств, или 4 минуты
export const ULTIMATE = { perDamage: 1 / 3000, perKill: 0.015, perSecond: 1 / 240 };

// Туман войны на карте (движок: FogOfWar): открывается всё в радиусе radius блоков вокруг героя и запоминается
export const MAP_FOG = { radius: 22 };

// Броня (инвентарь: шлем, нагрудник, поножи, ботинки). armor — доля физического урона, которую срезает часть;
// всё вместе (с шкурами тролля и талантом THICK SKIN) — не больше 90 %. speed — прибавка (или штраф) к скорости
// от части. Цены — в монетах (магазин, ПРОЧЕЕ).
// Три комплекта — три стиля: КОЖА — середина (−30 % за все части, без штрафа), ЖЕЛЕЗО — крепко, но тяжело
// (−51.5 %, части кроме ботинок замедляют), КОСТЬ — лёгкая (−17 %, каждая часть быстрее). Части можно смешивать.
// Роли частей: нагрудник и штаны — основная защита (в 2.5 раза больше, чем было); ботинки — скорость
// (кожа +7.5 %, кость +10 %, железо +12.5 % — выше тир, выше стат); шлем — headshot: меньше урона от попаданий
// в голову (кожа −15 %, кость −20 %, железо −25 %). Тиры — ARMOR_TIER.
// duel — цена в дуэли: по пользе (1 % защиты или скорости — 8.4 монеты, 1 % защиты головы — 4.2, штраф скорости —
// минус): 70…180, так что на монеты раунда (DUEL.rounds: 200, потом по 250) — 1–2 части
// full — бонус за полный комплект (все 4 части одного): speed — к скорости, hp — к макс. HP,
// attackSpeed — атаки быстрее (0.1 — на 10 %), text — как показать (F1, магазин)
export const ARMOR = {
  sets: {
    leather: {
      name: "LEATHER", color: [150, 105, 65],
      parts: {
        helmet: { name: "HELMET", armor: 0.03, headshot: 0.15, price: 240, duel: 90 },
        chest: { name: "CHEST", armor: 0.15, price: 420, duel: 125 },
        legs: { name: "LEGS", armor: 0.1, price: 300, duel: 85 },
        boots: { name: "BOOTS", armor: 0.02, speed: 0.075, price: 180, duel: 85 },
      },
      full: { speed: 0.05, text: "+5% SPEED" },
    },
    iron: {
      name: "IRON", color: [150, 156, 168],
      parts: {
        helmet: { name: "HELMET", armor: 0.05, speed: -0.02, headshot: 0.25, price: 540, duel: 135 },
        chest: { name: "CHEST", armor: 0.25, speed: -0.03, price: 1020, duel: 180 },
        legs: { name: "LEGS", armor: 0.175, speed: -0.02, price: 780, duel: 135 },
        boots: { name: "BOOTS", armor: 0.04, speed: 0.125, price: 420, duel: 140 },
      },
      full: { hp: 40, text: "+40 MAX HP" },
    },
    bone: {
      name: "BONE", color: [222, 214, 190],
      parts: {
        helmet: { name: "HELMET", armor: 0.02, speed: 0.02, headshot: 0.2, price: 360, duel: 120 },
        chest: { name: "CHEST", armor: 0.075, speed: 0.02, price: 540, duel: 85 },
        legs: { name: "LEGS", armor: 0.0625, speed: 0.02, price: 480, duel: 70 },
        boots: { name: "BOOTS", armor: 0.015, speed: 0.1, price: 300, duel: 100 },
      },
      full: { attackSpeed: 0.1, text: "+10% ATTACK SPEED" },
    },
  },
};

// Боевой молот: пока идёт удар — ходишь на 40 % медленнее (slow), в воздухе падаешь быстрее (fastFall м/с²
// сверху тяжести). Талант JUMP SLAM: с молотом в руках прыжок на 80 % выше (leap), а удар после прыжка
// сильнее — +perStep к множителю урона за каждые step блока падения (ступеньками: полблока — +0.5, целый
// блок — +1), не больше ×maxMult (×10 — с высоты 9 блоков; с обычного прыжка JUMP SLAM — около ×3)
// root — после удара о землю герой замирает на столько секунд (и камера стоит), как в конце рывка ИАЙ
export const HAMMER = { slow: -0.4, fastFall: 30, leap: 0.8, step: 0.5, perStep: 0.5, maxMult: 10, root: 0.15 };

// Тряска камеры (движок: CameraShake) — только картинки, прицел не сдвигается (как в Overwatch). «Встряска» 0…1:
// hammer — удар молотом о землю (с прыжка — сильнее: + jumpSlam за каждый «икс» множителя), bossSlam / bloater /
// explosion — удар тролля, взрыв раздутого, взрывы подрывника: в полную силу вплотную, к radius м — на нет.
// fall — дрожь, пока падаешь быстрее from м/с (растёт до max на from + range м/с); land — толчок при
// приземлении: с высоты от from блоков, + perBlock за каждый блок выше, не больше max
// Урон от падения (героя): с высоты больше from блоков — perBlock доли макс. HP за каждый блок сверху (8 блоков —
// 5 × 7 % = 35 %). Таланты на прыжок поднимают порог и режут урон: HIGH GROUND (sniper-jump) — всегда,
// JUMP SLAM — пока молот в руках. Удар молотом с прыжка (молот ждёт земли) героя не ранит
export const FALL_DAMAGE = {
  from: 5, perBlock: 0.07, // с 5 блоков ниже места прыжка (до 5 — без урона), дальше 7 % макс. HP за блок
  highGround: { from: 2, mult: 0.5 }, //   + к порогу (блоков) и множитель урона
  jumpSlam: { from: 3, mult: 0.5 },
};

// Острова (scene/islands.js), только в новых мирах: мосты — с главного острова на маленькие (с шансом chance,
// ширина width, перила — столбик через post блоков); на самом дальнем острове моста нет, зато там — СУНДУК:
// открыть (F рядом) — coins монет (+perLevel за уровень героя) и вещь не ниже rarity
export const ISLANDS = {
  bridge: { chance: 0.75, width: 3, post: 4, deck: [120, 84, 52], rail: [92, 64, 40] },
  chest: { reach: 2.6, coins: 150, perLevel: 15, rarity: "epic", color: [196, 150, 60], band: [90, 70, 40] },
};

// Задания стража (scene/quests.js): одно за раз. kinds — какие бывают и с какого уровня (level), count — сколько
// [от, до], reward — монет за штуку (perUnit) или сразу (flat); опыт — xp × монет. Награда растёт с уровнем: +perLevel
// за уровень героя. Не выполнил — можно отказаться (новое через cooldown с)
export const QUESTS = {
  perLevel: 0.08, xp: 1.5, cooldown: 20,
  kinds: [
    { id: "kill-any", kind: "kill", target: "any", count: [12, 25], perUnit: 4, title: "KILL {n} MONSTERS" },
    { id: "kill-skeleton", kind: "kill", target: "skeleton", count: [10, 20], perUnit: 5, title: "KILL {n} SKELETONS" },
    { id: "kill-zombie", kind: "kill", target: "zombie", count: [6, 12], perUnit: 7, title: "KILL {n} ZOMBIES" },
    { id: "bring-bone", kind: "bring", item: "bone", count: [8, 16], perUnit: 4, title: "BRING {n} BONES" },
    { id: "bring-skull", kind: "bring", item: "skull", count: [2, 5], perUnit: 15, title: "BRING {n} SKULLS" },
    { id: "elite", kind: "kill", target: "elite", count: [1, 1], flat: 80, level: 5, title: "KILL AN ELITE MONSTER" },
    { id: "boss", kind: "kill", target: "boss", count: [1, 1], flat: 300, level: 8, title: "KILL A BOSS" },
  ],
};

// Элитные мобы (scene/elites.js): с from-го появившегося каждый с шансом chance (в нашествие — ×invasion) — элита:
// больше (scale), крепче (hp), бьёт сильнее (damage), опыта ×xp, гарантированная вещь (не ниже rare) и coins монет.
// Аура — одна из auras: swift — быстрее; thorns — отражает share ближнего урона обратно; healer — лечит мобов
// вокруг (radius м) на heal их макс. HP раз в every с; frenzy — рядом мобы бьют сильнее (сила — damage)
export const ELITE = {
  from: 25, chance: 0.05, invasion: 0.5, scale: 1.25, hp: 3, damage: 1.35, xp: 4, coins: 25,
  auras: {
    swift: { name: "SWIFT", color: [120, 220, 255], speed: 0.45 },
    thorns: { name: "THORNS", color: [230, 120, 60], share: 0.3 },
    healer: { name: "HEALER", color: [120, 240, 140], radius: 7, heal: 0.05, every: 1 },
    frenzy: { name: "FRENZY", color: [240, 70, 90], radius: 7, damage: 0.3 },
  },
};

// Чувство удара (scene/feel.js): stop — стоп-кадр (мир на time с замедляется до scale) при ударе героя на from+
// урона или хедшоте; knock — отлёт задетого моба (м/с, на time с, вверх — up) от атак с этим id (боссы — ×boss);
// kick — встряска картинки при тяжёлом ударе (прицел не сдвигается); headSound — звук хедшота
export const HIT_FEEL = {
  stop: { from: 45, time: 0.04, head: 0.05, scale: 0.05, cooldown: 0.12 },
  knock: { time: 0.18, up: 2.5, max: 9, boss: 0.15, attacks: { "war-hammer": 7, "hammer-swing": 5, shotgun: 1.1, "shotgun-blast": 9, "spear-charge": 6, dynamite: 6 } },
  kick: { from: 45, amount: 0.12, head: 0.18 },
  headSound: "headshot",
};
// Индикатор урона (scene/feel.js → hud.js): красная дуга по кругу вокруг прицела — в сторону того, кто попал.
// time — сколько гаснет, max — сколько дуг сразу, radius — доля меньшей стороны экрана, spread — полуширина (°)
export const DAMAGE_DIR = { time: 1.3, max: 6, radius: 0.3, spread: 22 };

export const SHAKE = {
  hammer: 0.45, jumpSlam: 0.08,
  bossSlam: { amount: 0.65, radius: 12 }, bloater: { amount: 0.5, radius: 9 }, explosion: { amount: 0.35, radius: 8 },
  fall: { from: 12, range: 26, max: 0.4 },
  land: { from: 3, perBlock: 0.09, max: 0.8 },
};

// Магазин (клавиша B): цены в монетах (монеты выпадают из мобов: скелет 5, зомби 8, раздутый 6, босс 160).
// Доход: мобы появляются раз в ~1.7 с — если бить всех, ~200 монет в минуту, в нашествие ~550.
// Цены — на столько игры: базовое оружие класса (если потерял) — полминуты; первое продвинутое — ~10 минут;
// лучшее — ~20 минут. Расходники (ловушки, аптечки, блоки) — дёшево, чтобы не жалеть
// Тиры (уровни) вещей: у каждого тира — своя цена. Оружие: T1 — базовое класса, T4 — лучшее.
// Броня — по комплектам: кожа T1, кость T2, железо T3 (цены частей — в ARMOR)
export const TIERS = {
  1: { name: "T1", price: 100, color: [170, 170, 170] },
  2: { name: "T2", price: 2000, color: [120, 200, 120] },
  3: { name: "T3", price: 3000, color: [110, 170, 255] },
  4: { name: "T4", price: 4500, color: [230, 150, 255] },
};
export const ITEM_TIER = {
  machete: 1, pistol: 1, grenades: 1, //                      боец: мачете ~43/с, стрелок: пистолет ~35/с, подрывник: граната ~33/с
  "war-hammer": 2, auto: 2, shotgun: 2, launcher: 2, //       молот ~28/с + оглушение, автомат ~48/с, дробовик ~49/с вблизи, гранатомёт ~40/с
  spear: 3, crossbow: 3, dynamite: 3, bow: 3, //                      копьё — разбег, арбалет ~50/с насквозь, динамит 110 раз в 3 с
  katana: 4, rifle: 4, //                                     катана 75 всем, снайперка 90
};
export const ARMOR_TIER = { leather: 1, bone: 2, iron: 3 };
const tierPrice = (id) => TIERS[ITEM_TIER[id]].price;

// Добыча: удача и редкость (движок: engine/economy/loot.js — COMMON / RARE / EPIC / LEGENDARY).
//   gear — шанс, что моб уронит вещь (оружие или часть брони); босс — всегда (bossGear), в нашествие — чаще;
//   tiers(n) — какого тира вещь (n — сколько мобов уже появилось: позже — лучше);
//   sell — продать стражу: доля цены магазина (× редкость.sell); ресурсы — по своей цене
// Таланты на оружии с мобов (LOOT): шанс, что у выпавшего оружия будут прокачанные таланты его ветки, и сколько
// их (по редкости). Ранг — случайный от 1 до максимума. Действуют, пока это оружие в ячейке оружия
export const WEAPON_PERKS = {
  chance: { common: 0.25, rare: 0.5, epic: 0.8, legendary: 1 },
  count: { common: [1, 1], rare: [1, 1], epic: [1, 2], legendary: [2, 2] },
};
export const LOOT = {
  gear: 0.015, invasionMult: 1.5, bossGear: 1,
  tiers: (n) => ({ 1: Math.max(10, 60 - n / 8), 2: 30, 3: Math.min(35, 5 + n / 20), 4: Math.min(25, n / 40) }),
  sell: 0.25,
  resources: { bone: 1, skull: 3, block: 0 },
};

export const SHOP = {
  machete: tierPrice("machete"), "war-hammer": tierPrice("war-hammer"), spear: tierPrice("spear"), katana: tierPrice("katana"),
  grenades: tierPrice("grenades"), launcher: tierPrice("launcher"), dynamite: tierPrice("dynamite"),
  pistol: tierPrice("pistol"), auto: tierPrice("auto"), shotgun: tierPrice("shotgun"), crossbow: tierPrice("crossbow"), rifle: tierPrice("rifle"), bow: tierPrice("bow"),
  "bear-trap": 25, spikes: 40, //                                       ловушки
  "pistol-clip": 4, "auto-clip": 8, "shotgun-clip": 6, "rifle-clip": 8, // обоймы (CLIPS.enabled: false — не продаются)
  builder: 50, block: 15, medkit: 60, medkitHeal: 40, //                 прочее: молот-стройка, 16 блоков, аптечка
};
// Броня — цены в ARMOR: кожа ~1150 за комплект, кость ~1700, железо ~2750
// Аптечка: держишь ЛКМ useTime секунд (вокруг прицела заполняется круг, как в PEAK) — тогда лечит SHOP.medkitHeal;
// отпустил раньше — не потратилась. Пока лечишься — медленнее на slow
export const MEDKIT = { useTime: 2.5, slow: -0.5 };
export const THROW = { gravity: 20 }; // тяжесть для брошенного (м/с²)

// Блок (ПКМ с оружием ближнего боя — кулак, мачете, катана): window секунд после нажатия удары
// спереди блокируются (поставил вовремя — пока враг замахивается, ~0.3–0.45 с). Потом cooldown.
// share — какую долю урона удара срезает блок (0.5 — половину; урон уже с модификаторами атакующего)
// Блок (ПКМ у оружия ближнего боя): window с отбивает удары и выстрелы спереди, проходит (1 - share) урона.
// С талантом REFLECT (боец) отбитая доля выстрела (пули и снаряды — игроков и мобов) отражается туда, куда
// смотрит блокирующий: пуля — лучом на reflect.range м, снаряд — снарядом; попал во врага — урон (ранг: 50 / 100 %
// отбитого). duel — во сколько раз дольше перезарядка блока в дуэли
export const BLOCK = { window: 0.4, cooldown: 1.5, share: 0.5, reflect: { range: 80 }, duel: 1.5 };

// ИАЙ — скилл катаны (Q), как «Стремительный удар» Гэндзи: рывок на distance м со скоростью dashSpeed м/с туда,
// куда смотришь (и вверх, и вниз, и наискось); все враги в пределах width м от пути получают удар катаны ×damage
// (каждый один раз). Камера стоит весь рывок; в конце пути — замираем на pause с, камера отпускается после
// lockShare этой паузы (чуть раньше движения). Перезарядка cooldown с (идёт и без катаны в руках).
// damage — базовый множитель (талант IAI MULTIPLIER: ×2/×3/×4), speed — прибавка к бегу, пока ИАЙ готов (талант IAI SPEED)
// shape — коробка столкновений героя на время рывка (как Гэндзи: вытянулся в рывке и «плоский»): уже и ниже,
// от макушки вниз на height (anchor "top" — от камеры, у головы): низ коробки выше блока — смотришь
// прямо и пролетаешь над блоком перед собой, щель в блок — тоже; после рывка — снова в рост, на ноги
// (катана — всегда в стойке, рост 1.4: коробка 0.35 у макушки → низ на 1.05 над ногами, выше блока)
// ПОДРЫВНИК: тяжесть для брошенного (gravity — граната и динамит, launcherGravity — снаряд гранатомёта летит
// настильнее), fuse — сколько секунд горит фитиль лежащего динамита (талант SHORT FUSE — shortFuse: фитиль по рангам).
// Скилл Q гранатомёта — КАССЕТА: снаряд рвётся и разбрасывает count бомбочек (ATTACKS.clusterBomb) вокруг,
// каждая взрывается, где упадёт. Перезарядка cooldown с
export const DEMO = { gravity: 20, launcherGravity: 9, fuse: 1, shortFuse: [0.75, 0.5, 0.3], cluster: { cooldown: 10, count: 6, up: 7, spread: 4.5 } };

// Дробовик — скилл Q «ОТСКОК»: залп в упор (ATTACKS.shotgunBlast, патроны не тратит) оглушает задетых на stun с,
// а отдача отбрасывает героя назад — против взгляда: смотришь вниз — подлетаешь вверх (выпрыгнуть из толпы, на крышу).
// push — скорость отброса (м/с), pushTime — сколько секунд (≈ 5 м), lift — добавка вверх к направлению.
// Баланс: дробовик ~49 урона/с; залп — до 6 × 45 = 270 раз в 9 с плюс уход из окружения
// Ракетный прыжок (пассивно у гранат, гранатомёта, динамита и бомбочек кассеты): свой взрыв ближе radius × reach
// от героя (от середины тела) отбрасывает его от центра взрыва: рывок push м/с на pushTime с (вплотную — в полную
// силу, к краю — на нет; слабее min — не толкает), плюс lift вверх. Урона себе нет
export const ROCKET_JUMP = { push: 14, pushTime: 0.32, lift: 0.6, reach: 1.1, min: 0.15 };
export const SHOTGUN_BLAST = { cooldown: 9, stun: 0.6, push: 17, pushTime: 0.3, lift: 0.3 };
// Скольжение рывков по стенам (движок: dash slide), как в Overwatch: влетел в стену почти в лоб (ближе stopAngle°
// к перпендикуляру) — стоп, иначе рывок едет вдоль стены на keep своей скорости и, кончилась стена, — дальше
// Прощение краёв у рывков: stepUp — задел край блока низом тела не глубже 0.5 — поднимает на него; stepDown —
// задел головой край потолка не глубже 0.25 — проходишь под ним; corner — задел угол стены краешком до 0.25 м — огибаешь
export const DASH_SLIDE = { stopAngle: 30, keep: 0.9, stepUp: 0.5, stepDown: 0.25, corner: 0.25 };
// Прыжок с мачете (Q): нож — обратным хватом (лезвием вниз), прыжок вперёд на distance м с замахом. Хитбокс — там,
// где сам клинок (впереди героя на forward м, на высоте height, радиус radius — чуть больше клинка): коснулся
// врага — удар ×damage одному (первому), прыжок кончается; никого не задел — урона нет. lift — подскок вверх (м/с)
export const MACHETE_LEAP = { cooldown: 5.5, damage: 1.5, distance: 4.5, speed: 15, lift: 4, hitbox: { forward: 0.85, height: 0.95, radius: 0.55 } };
// Лук (СТРЕЛОК, второе оружие): зажал ЛКМ — тетива натягивается (draw с до полного), отпустил — выстрел: урон
// minDamage → ATTACKS.bow.damage и скорость стрелы minSpeed → maxSpeed растут с натяжением; gravity — дуга.
// Q — залп: volley.count стрел веером (spread° между ними), сразу полное натяжение, перезарядка volley.cooldown.
// Таланты (вкладка ЛУК): пробивание, урон за натяжение, взрывная стрела (ATTACKS.bowBlast), быстрее натяжение (до 2 с)
export const BOW = { draw: 3, minDamage: 58, minSpeed: 29, maxSpeed: 98, gravity: 6, volley: { count: 3, spread: 6, cooldown: 8 } };
export const KATANA_IAI = { cooldown: 6, damage: 1.5, distance: 10, dashSpeed: 40, width: 1.2, pause: 0.1, lockShare: 0.7, speed: 0, shape: { radius: 0.2, height: 0.35, anchor: "top" } };
// Прицеливание (движок: engine/input/aim.js). fov — угол обзора в прицеле, sensitivity — мышь в прицеле
// так, как её чувствует игрок (1 — перекрестие бегает по экрану как без прицела, 0.5 — вдвое медленнее).
// moveSpeed — замедление ходьбы в прицеле, offset — сдвиг модели оружия.
export const AIM = { moveSpeed: -0.1, offset: [0, 0, 0] };
export const AIM_PISTOL = { fov: 45, sensitivity: 0.6 };
export const AIM_RIFLE = { fov: 18, sensitivity: 0.35 }; // в оптике — заметно медленнее: точная наводка
export const AIM_AUTO = { fov: 42, sensitivity: 0.55 };

// Отдача (движок: engine/input/recoil.js). pattern — броски [вверх, вбок] в градусах для 1-го, 2-го...
// выстрела подряд; scale — уровень; recovery — какая доля вернётся сама; aim — множитель в прицеле.
// Пистолет: лёгкая, ствол «гуляет» влево-вправо и чуть растёт. Снайперка: один сильный бросок вверх.
// Пистолет («пустынный орёл»): каждый выстрел сильно подбрасывает ствол, ведёт вбок — лучше не спешить
export const RECOIL_PISTOL = {
  pattern: [[2.6, 0.3], [2.9, -0.6], [3.1, 0.7], [3.2, -0.8], [3.3, 0.8], [3.3, -0.8], [3.4, 0.9]],
  scale: 1, random: 0.25, recovery: 0.8, recoverSpeed: 7, aim: 0.6, resetTime: 0.75,
};
export const RECOIL_RIFLE = {
  pattern: [[5.5, 0.8]],
  scale: 1, random: 0.6, recovery: 0.7, recoverSpeed: 7, aim: 0.75, resetTime: 3,
};
// Автомат: каждый выстрел маленький, но очередь ползёт вверх и раскачивается — держи мышь вниз
export const RECOIL_AUTO = {
  pattern: [[0.5, 0.05], [0.6, -0.1], [0.7, 0.15], [0.8, -0.2], [0.85, 0.25], [0.9, -0.3], [0.9, 0.35], [0.9, -0.35], [0.85, 0.3], [0.85, -0.3]],
  scale: 1, random: 0.3, recovery: 0.55, recoverSpeed: 8, aim: 0.6, resetTime: 0.35,
};

// ---------- Классы ----------
// В начале класса нет: оружие из магазина не купить, таланты — только ВЫЖИВАНИЕ и КАБАН. На первом новом
// уровне выбираешь класс — открываются его вкладка талантов и его раздел магазина (остальные не видны),
// и даётся стартовое оружие. tab — вкладка талантов, shop — раздел магазина (= класс предметов, items.js)
export const CLASSES = {
  melee: { name: "FIGHTER", tab: "melee", shop: "melee", starter: ["machete", 1], text: "MELEE: MACHETE, BLOCK ON RMB. LEVEL 10: WAR HAMMER OR KATANA" },
  ranged: { name: "RANGER", tab: "ranged", shop: "ranged", outfit: "hero-ranged", starter: ["pistol", 1], text: "RANGED: PISTOL. LEVEL 10: ASSAULT RIFLE, SHOTGUN, SNIPER OR CROSSBOW" },
  demo: { name: "DEMOLITIONIST", tab: "demo", shop: "demo", outfit: "hero-demo", starter: ["grenades", 1], text: "EXPLOSIVES: GRENADES, EVERYTHING BLOWS UP IN AN AREA. LEVEL 10: GRENADE LAUNCHER OR DYNAMITE" },
};
// Подкласс: на SUBCLASS.level уровне герой выбирает ОДНО покупное оружие своего класса — только его можно купить,
// и открывается его вкладка талантов (talents.js → weaponTab). Остальное покупное оружие класса закрыто
export const SUBCLASS = {
  level: 10,
  weapons: { melee: ["war-hammer", "katana"], ranged: ["auto", "shotgun", "rifle", "crossbow", "bow"], demo: ["launcher", "dynamite"] },
};
export const SUBCLASS_WEAPONS = new Set(Object.values(SUBCLASS.weapons).flat());
// Что можно выбрать на SUBCLASS.level: базовое оружие класса (усиливается — primaryPick) или одно из покупных
export const subclassOptions = (cls) => (CLASSES[cls] ? [CLASSES[cls].starter[0], ...(SUBCLASS.weapons[cls] || [])] : []);

// Улучшения оружия в магазине (+урон этим оружием, по уровням):
//   primary — базовое оружие класса: 50 / 100 монет, +10 % за уровень (есть с начала)
//   second  — оружие, выбранное на 10 уровне (выдаётся сразу): 200 / 400 / 600 монет, +15 % за уровень
//   primaryPick — на 10 уровне выбрал базовое вместо нового: у нового урон в разы больше, поэтому базовое
//                 сразу крепнет (+60 %) и дальше улучшается как второе (200 / 400 / 600)
export const WEAPON_UPGRADES = {
  primary: { prices: [50, 100], bonus: 0.1 },
  second: { prices: [200, 400, 600], bonus: 0.15 },
  primaryPick: 0.7,
  rebuy: 100, // потерял выбранное оружие — купить снова
};
// outfit — модель героя этого класса (одежда; без него — юката "hero"), main.js грузит её
// Вкладки талантов, открытые всем (и до выбора класса). у классов — своя вкладка
export const COMMON_TABS = ["survival"];
