// ============================================================
//  Какие существа бывают в игре: «паспорта» (вид, hp, скорость, добыча, модель),
//  создание и сохранение. Классы — из движка (engine/world/creatures.js):
//    kind "player" → Player, "mob" → Mob (враг), "npc" → NPC (мирный, неуязвимый).
//  ИИ — тоже из движка (engine/ai): мобам HostileBrain, НПС — WanderBrain.
// ============================================================

import { Vec3, Inventory, Player, Mob, NPC, MeleeAttack, SlamAttack, ThrowAttack, HostileBrain, KamikazeBrain, WanderBrain, GuardBrain, FollowBrain, Taming, Rideable, grow, growth } from "../../engine/index.js";
import { GROWTH_SOFTCAP, SKELETON_AI, SHAMAN_BREAK_AURA, SKELETON_GROWTH, HERD, ATTACKS, MOB_WANDER, MOB_RANGED, BOSS, BLOATER, MOB_HELMET, MOB_REGEN, HERO_SCALE, PLAYER, MOB_SIZE, MOB_DAMAGE_SCALE } from "./config.js";
import { maxStack } from "./items.js";
import { BatBrain } from "./bat-brain.js";

// Головы (хитбоксы хедшотов) — в осях существа: от ног вверх, +Z — куда смотрит.
// multiplier — во сколько раз больше урона при попадании в голову.
const HUMAN_HEAD = { id: "head", min: [-0.15, 1.6, -0.15], max: [0.15, 1.9, 0.15], multiplier: 2 };
// Голова героя — модель уменьшена до роста 1.6 (HERO_SCALE)
const HERO_HEAD = { ...HUMAN_HEAD, min: HUMAN_HEAD.min.map((v) => v * HERO_SCALE), max: HUMAN_HEAD.max.map((v) => v * HERO_SCALE) };
export const HITBOXES = {
  player: [HERO_HEAD],
  skeleton: [HUMAN_HEAD],
  dummy: [HUMAN_HEAD], // манекен полигона — скелет: хедшоты как по скелету
  // Зомби: голова шире и выше (множитель хедшота — у оружия; каска — MOB_HELMET, не у всех)
  zombie: [{ id: "head", min: [-0.19, 1.6, -0.19], max: [0.19, 1.99, 0.19], multiplier: 2 }],
  warden: [HUMAN_HEAD],
  // Кабан: голова спереди и низко (морда с бивнями)
  boar: [{ id: "head", min: [-0.2, 0.38, 0.46], max: [0.2, 0.86, 0.96], multiplier: 2 }],
  // Тролль сутулится: голова впереди и чуть ниже макушки
  troll: [{ id: "head", min: [-0.25, 1.95, 0.15], max: [0.25, 2.45, 0.7], multiplier: 2 }],
  lich: [{ id: "head", min: [-0.2, 2.16, -0.2], max: [0.2, 2.57, 0.2], multiplier: 2 }], //    скелет ×1.35
  bloater: [{ id: "head", min: [-0.22, 1.84, -0.22], max: [0.22, 2.29, 0.22], multiplier: 2 }], // зомби ×1.15
  // Новые: упырь и мумия — модель зомби (×0.95 / ×1.05), шаман — скелет, гоблин — скелет ×0.7, вожак — зомби ×1.6
  ghoul: [{ id: "head", min: [-0.18, 1.52, -0.18], max: [0.18, 1.89, 0.18], multiplier: 2 }],
  mummy: [{ id: "head", min: [-0.2, 1.68, -0.2], max: [0.2, 2.09, 0.2], multiplier: 2 }],
  shaman: [HUMAN_HEAD],
  goblin: [{ id: "head", min: [-0.11, 1.12, -0.11], max: [0.11, 1.33, 0.11], multiplier: 2 }],
  champion: [{ id: "head", min: [-0.3, 2.56, -0.3], max: [0.3, 3.18, 0.3], multiplier: 2 }],
  // Летучая мышь (модель ×2, тело под 47°): голова впереди и вверху
  bat: [{ id: "head", min: [-0.17, 0.85, -0.01], max: [0.17, 1.17, 0.33], multiplier: 2 }],
};
// Мобы мельче на MOB_SIZE — и головы (хитбоксы) тоже (координаты выше — для полного размера)
for (const type of ["skeleton", "dummy", "zombie", "troll", "lich", "bloater", "ghoul", "mummy", "shaman", "goblin", "champion", "bat"]) {
  HITBOXES[type] = HITBOXES[type].map((h) => ({ ...h, min: h.min.map((v) => v * MOB_SIZE), max: h.max.map((v) => v * MOB_SIZE) }));
}

export const CREATURES = {
  player: {
    kind: "player",
    name: "PLAYER",
    maxHp: 100,
    inventorySize: 20,
    model: "hero", // скелет в боевой юкате (tools/make-skeleton.js → hero.glb), меньше — рост 1.6
    scale: HERO_SCALE,
    height: PLAYER.height,
  },
  skeleton: {
    kind: "mob",
    name: "SKELETON",
    maxHp: 50,
    speed: SKELETON_AI.speed * 0.9, // на 10 % медленнее
    inventorySize: 6,
    model: "skeleton",
    attack: "skeletonClaw", // какой атакой бьёт (config.js → ATTACKS)
    hostileTo: ["player", "town"], // охотится на героя и на стражу
    xp: 30, //                сколько опыта за победу
    resist: {}, //            сопротивления стихиям, например { fire: 0.5 }
    kindResist: { melee: 0.33 }, // стоек к виду атаки: ближний бой −33 % (цифра урона серая)
    loot: [["bone", [0, 2]], ["coin", 5]], // с чем появляется (и что выпадет); [от, до] — случайно
    ranged: true, // может быть стрелком (MOB_RANGED: камень, нож или пистолет)
    brain: (w) => new HostileBrain({ ...SKELETON_AI, stopDistance: 1.08, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER, ranged: rangedAI(w) }),
  },
  // Зомби: крепче (75 HP), стоек к стрельбе, но медленнее; тянется дальше
  zombie: {
    kind: "mob",
    name: "ZOMBIE",
    maxHp: 75,
    speed: 1.6,
    inventorySize: 6,
    model: "zombie",
    attack: "zombieClaw",
    hostileTo: ["player", "town"],
    xp: 45,
    kindResist: { ranged: 0.33 }, // стрельба −33 %
    loot: [["bone", [0, 1]], ["zombie-eye", 1], ["coin", 8]],
    ranged: true, // может быть стрелком (MOB_RANGED)
    brain: (w) => new HostileBrain({ ...SKELETON_AI, stopDistance: 1.08, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER, ranged: rangedAI(w) }),
  },
  // Кабан: мирный (НПС), низкий и широкий. Покормишь костями — приручишь и сможешь ездить.
  // Его можно ранить — но раненый герой кабан больше не приручается
  boar: {
    kind: "npc",
    name: "BOAR",
    role: "animal",
    maxHp: 80,
    regen: 1, //               HP в секунду — зализывает раны сам (таланты вкладки КАБАН добавляют)
    xp: 25, //                 опыт за кабана (если добил герой)
    speed: 1.4,
    radius: 0.45,
    height: 0.9,
    inventorySize: 0,
    model: "boar",
    attack: "boarTusk", //       бивни (растут с миром: game-scene.js → scaleBoars)
    brain: () => new WanderBrain({ radius: 8, pause: [3, 7], lookRadius: 2.5, flee: { time: 4, speed: 3 } }), // ранили — убегает
  },
  // Маунт героя (MOUNT): кабан под седлом, сам не думает; герой его не ранит; любой урон по нему — исчезает
  steed: {
    kind: "npc",
    name: "MOUNT",
    role: "mount",
    maxHp: 1000,
    speed: 1.4,
    radius: 0.45,
    height: 0.9,
    inventorySize: 0,
    model: "boar-saddle",
    faction: "player",
    protectedFrom: ["player"],
  },
  // Страж: герой ранить не может (protectedFrom), а мобы — могут; сам бьёт мобов мечом
  warden: {
    kind: "npc",
    name: "WARDEN",
    role: "warden", //         позже — разговор, задания
    maxHp: 300,
    regen: 2, //              HP в секунду — отходит после боя
    speed: 1.2,
    inventorySize: 0,
    model: "npc", //          скелет, перекрашенный в синий (main.js)
    faction: "town",
    hostileTo: ["monster"],
    protectedFrom: ["player"],
    attack: "wardenSword",
    tauntRadius: 8, //        аура провокации: мобы ближе 8 м злятся на стража и бросают героя
    brain: () => new GuardBrain({ radius: 8, leash: 16, wander: { radius: 5, pause: [2, 5], lookRadius: 3 } }),
  },
};

// Пещерный тролль — босс логова (BOSS в config.js): своё логово ставит игра (territory мозгов — зал)
CREATURES.troll = {
  kind: "mob", name: "CAVE TROLL", boss: true, maxHp: 1600, speed: 1.7, radius: 0.7, height: 2.5, inventorySize: 4,
  model: "troll", attack: "trollSlam", hostileTo: ["player", "town"], xp: 900, kindResist: { blast: 0.33, melee: 0.33 },
  loot: [["coin", 160], ["troll-hide", 1]],
  // Валун: всегда (не случайный стрелок), с перезарядкой 4 с; пока перезаряжается — идёт на тебя (в пределах зала)
  rangedWeapon: { attack: "boulderThrow", item: "stone", scale: 3.5, range: 16, minRange: 5, advance: true, spread: 30 },
  brain: (w) => new HostileBrain({ aggroRadius: BOSS.aggroRadius, sightHeight: 2, leash: 250, stopDistance: 2.2, turnSpeed: 3, jumpSpeed: 7.5, ranged: rangedAI(w), chase: BOSS.chase, windupSlow: SKELETON_AI.windupSlow }),
};

// Манекен полигона (scene/training.js): скелет, стоит, не дерётся и не умирает (здоровье — сразу обратно)
CREATURES.dummy = {
  kind: "mob", name: "TRAINING DUMMY", maxHp: 1000000, speed: 0, model: "skeleton", hostileTo: [], xp: 0, loot: [],
};

// Гигант-скример (scene/giant.js, GIANT): безвредный, неуязвимый, ни с кем не враждует; двигает игра (без мозгов)
CREATURES.giant = {
  kind: "npc", name: "???", maxHp: 1, speed: 9, radius: 1.6, height: 10, scale: 4, inventorySize: 0,
  model: "giant", faction: "neutral", hostileTo: [], invulnerable: true,
};

// Лич — второй босс логова (LICH в config.js): высокий скелет-колдун (модель скелета ×1.35, фиолетовая)
CREATURES.lich = {
  kind: "mob", name: "BONE LICH", boss: true, maxHp: 1200, speed: 2.2, radius: 0.4, height: 2.6, scale: 1.35, inventorySize: 4,
  model: "lich", attack: "lichTouch", hostileTo: ["player", "town"], xp: 900, kindResist: { ranged: 0.33 },
  loot: [["coin", 160], ["bone-crown", 1]],
  // Сгусток: стоит и стреляет, пока видит (не подходит ближе); прыжки по залу и подъём скелетов — игра
  rangedWeapon: { attack: "lichBolt", item: "lichbolt", scale: 1.6, range: 18, minRange: 0, straight: true, spread: 15 },
  brain: (w) => new HostileBrain({ aggroRadius: BOSS.aggroRadius + 1.5, sightHeight: 2, leash: 250, stopDistance: 1.4, turnSpeed: 4, jumpSpeed: 7.5, ranged: rangedAI(w), chase: BOSS.chase, windupSlow: SKELETON_AI.windupSlow }),
};

// РАЗДУТЫЙ — моб-смертник (BLOATER): опухший зомби побольше; взрыв и запал — у игры (e.onBoom / e.onPrime)
CREATURES.bloater = {
  kind: "mob", name: "BLOATER", maxHp: 45, speed: 2.6, radius: 0.36, height: 2.2, scale: 1.15, inventorySize: 4,
  model: "bloater", hostileTo: ["player", "town"], xp: 40, kindResist: { blast: 0.33 }, loot: [["bone", [0, 1]], ["powder-gut", 1], ["coin", 6]],
  brain: () => new KamikazeBrain({
    range: BLOATER.range, fuse: Infinity, trigger: BLOATER.trigger, prime: BLOATER.prime, primeSpeed: BLOATER.primeSpeed,
    onPrime: (e) => e.onPrime?.(e), onBoom: (e) => e.onBoom?.(e),
  }),
};

// УПЫРЬ (MOB_KINDS.ghoul): быстрый, хрупкий; кровотечение и вампиризм — scene/mob-kinds.js
CREATURES.ghoul = {
  kind: "mob", name: "GHOUL", maxHp: 45, speed: 3.3, scale: 0.95, height: 1.75, inventorySize: 4,
  model: "ghoul", attack: "ghoulClaw", hostileTo: ["player", "town"], xp: 40,
  kindResist: { ranged: 0.33, blast: -0.3 }, // стрелы и пули хуже, взрыв — больнее
  loot: [["bone", [0, 2]], ["ghoul-fang", 1], ["coin", 6]],
  brain: () => new HostileBrain({ ...SKELETON_AI, stopDistance: 1.04, aggroRadius: SKELETON_AI.radius * 1.2, leash: HERD.leash, herd: HERD, wander: MOB_WANDER }),
};

// МУМИЯ (MOB_KINDS.mummy): медленная, крепкая; бинты замедляют, горение — вдвое
CREATURES.mummy = {
  kind: "mob", name: "MUMMY", maxHp: 130, speed: 1.35, scale: 1.05, height: 1.95, inventorySize: 4,
  model: "mummy", attack: "mummyGrasp", hostileTo: ["player", "town"], xp: 60,
  kindResist: { melee: 0.33 },
  loot: [["coin", 10], ["bone", [0, 1]], ["linen-roll", 1]],
  brain: () => new HostileBrain({ ...SKELETON_AI, stopDistance: 1.18, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER }),
};

// КОСТЯНОЙ ШАМАН (MOB_KINDS.shaman): порча издалека, лечит своих
CREATURES.shaman = {
  kind: "mob", name: "BONE SHAMAN", maxHp: 70, speed: 2, inventorySize: 4,
  model: "shaman", attack: "shamanStaff", hostileTo: ["player", "town"], xp: 70,
  kindResist: { ranged: 0.33, melee: -0.25 },
  loot: [["bone", [1, 2]], ["shaman-skull", 1], ["coin", 9]],
  rangedWeapon: { attack: "shamanHex", item: "lichbolt", scale: 0.8, range: 15, minRange: 4, straight: true, spread: 25 },
  brain: (w) => new HostileBrain({ ...SKELETON_AI, aggroRadius: SKELETON_AI.radius * 1.3, breakAura: SHAMAN_BREAK_AURA, leash: HERD.leash, herd: HERD, wander: MOB_WANDER, ranged: rangedAI(w) }),
};

// ГОБЛИН-ТРАППЕР (MOB_KINDS.goblin): мелкий, ставит капканы, уворачивается от выстрелов, раненый убегает
CREATURES.goblin = {
  // скорость 3.15 — было 3.5 (−10 %)
  kind: "mob", name: "GOBLIN TRAPPER", maxHp: 35, speed: 3.15, scale: 0.7, height: 1.35, radius: 0.25, inventorySize: 4,
  model: "goblin", attack: "goblinStab", hostileTo: ["player", "town"], xp: 45,
  loot: [["coin", 8], ["bear-trap", [0, 1]]],
  brain: () => new HostileBrain({ ...SKELETON_AI, stopDistance: 0.75, aggroRadius: SKELETON_AI.radius * 1.2, leash: HERD.leash, herd: HERD, wander: MOB_WANDER }),
};

// ЧУМНОЙ ВОЖАК — минибосс (MOB_KINDS.champion): призывает упырей, чумная аура, богатая добыча
CREATURES.champion = {
  kind: "mob", name: "PLAGUE CHAMPION", miniboss: true, maxHp: 650, speed: 2.1, scale: 1.6, height: 3.1, radius: 0.55, inventorySize: 6,
  model: "champion", attack: "championCleave", hostileTo: ["player", "town"], xp: 400,
  kindResist: { melee: 0.2, ranged: 0.2 },
  loot: [["coin", 120], ["medkit", 1], ["skull", 2], ["champion-fang", 1]],
  brain: () => new HostileBrain({ ...SKELETON_AI, aggroRadius: SKELETON_AI.radius * 1.5, leash: 90, stopDistance: 2, wander: MOB_WANDER }),
};

// ЛЕТУЧАЯ МЫШЬ (MOB_KINDS.bat): летает взмахами (bat-brain.js), кружит над целью; пике — откусывает долю
// текущего HP, обычный удар — как у скелета; оба — кровотечение. Ночью, реже минибосса (scene/mob-kinds.js)
CREATURES.bat = {
  kind: "mob", name: "BAT", maxHp: 60, speed: 4.5, radius: 0.5, height: 1.2, scale: 2, inventorySize: 4, // модель ×2
  model: "bat", attack: "batClaw", hostileTo: ["player", "town"], xp: 55,
  loot: [["coin", 9], ["bat-wing", 1]],
  brain: () => new BatBrain({ aggroRadius: SKELETON_AI.radius * 1.5, orbit: [4.5, 5.5] }), // круг — радиус ~5 м
};

// Кто стоит в новом мире
export const DEFAULT_SPAWNS = [
  { type: "skeleton", x: -3, y: 0, z: 7, yaw: Math.PI },
  { type: "skeleton", x: 0, y: 0, z: 9, yaw: Math.PI },
  { type: "skeleton", x: 3, y: 0, z: 7, yaw: Math.PI },
];

// Кто должен быть в мире всегда (если в сохранении его нет — появится)
export const RESIDENTS = [{ type: "warden", x: -6.5, y: 0, z: -6.5, yaw: 0 }];

// Насколько крепче моб под номером index (0 — первый из спавнера): скелеты и зомби растут одинаково
export function mobGrowth(index) {
  const g = SKELETON_GROWTH;
  const S = GROWTH_SOFTCAP;
  const n = index <= S.soft ? index : S.soft + (index - S.soft) * S.after; // сила — с замедлением после soft
  const d = growth(n, g.damage); // урон: ×mult (проценты) + add (цифрой)
  // hpMult — здоровье ×(1 + pct × n) от базы своего вида (+2 % за моба); bonusHp — прибавка числом (flat), если задана
  return { hpMult: growth(n, g.hp).mult, bonusHp: grow(0, n, { flat: g.hp.flat || 0, every: g.hp.every || 1 }), damageMult: d.mult, bonusDamage: d.add, bonusXp: growth(index, g.xp).mult - 1 };
}

const CLASSES = { player: Player, mob: Mob, npc: NPC };

export const skeletonGrowth = mobGrowth; // старое имя

// Модель существа
export function modelFor(e) {
  return CREATURES[e.type].model;
}

// Стрелок для мозгов (движок: HostileBrain ranged): дальность оружия, ближе minRange — рукой; advance —
// на перезарядке подходит ближе (метательное), без него — держит дистанцию (пистолет)
const rangedAI = (w) => (w ? { range: w.range, minRange: w.minRange ?? MOB_RANGED.minRange, advance: !!w.advance } : null);

// Какое дальнее оружие у стрелка: из сохранения (id) или старое сохранение (true) — случайное по весам
export function pickRangedWeapon(saved) {
  if (typeof saved === "string" && MOB_RANGED.weapons[saved]) return saved;
  const list = Object.entries(MOB_RANGED.weapons);
  let r = Math.random() * list.reduce((s, [, w]) => s + w.weight, 0);
  for (const [id, w] of list) if ((r -= w.weight) < 0) return id;
  return list[0][0];
}

// Создать существо. hp, inventory, bonusHp, bonusDamage, bonusXp, tame — из сохранения, если есть.
// bonusHp — прибавка к здоровью, damageMult и bonusDamage — урон атаки ×damageMult + bonusDamage,
// bonusXp — к опыту (мобы крепчают). ranged — стрелок (у паспорта ranged: true): id оружия MOB_RANGED.weapons
// (stone / knife / pistol) или true — выбрать случайно
export function createCreature(type, { x = 0, y = 0, z = 0, yaw = 0, hp, inventory, bonusHp = 0, hpMult = 1, damageMult = 1, bonusDamage = 0, bonusXp = 0, ranged = false } = {}) {
  const def = CREATURES[type];
  if (!def) return null; // неизвестный тип (например, из старого сохранения) — пропускаем
  // мобы бьют сильнее таблицы (config.js); в сохранение — damageMult без этого множителя (иначе рос бы при каждой загрузке)
  const dmgK = damageMult * ((def.kind || "mob") === "mob" ? MOB_DAMAGE_SCALE : 1);
  const weaponId = ranged && def.ranged ? pickRangedWeapon(ranged) : null;
  const weapon = def.rangedWeapon || (weaponId ? MOB_RANGED.weapons[weaponId] : null); // rangedWeapon — своё (босс)
  const maxHp = Math.round(def.maxHp * hpMult) + bonusHp;
  const options = {
    type,
    name: def.name,
    position: new Vec3(x, y, z),
    yaw,
    maxHp,
    hp: hp ?? maxHp,
    inventorySize: def.inventorySize,
    resist: def.resist,
    maxStack,
    brain: def.brain?.(weapon) || null, // свои «мозги» у каждого (стрелок — со стрельбой своим оружием)
  };
  if (def.speed) options.speed = def.speed;
  options.hitboxes = HITBOXES[type] || [];
  if (def.radius) options.radius = def.radius;
  if (def.height) options.height = def.height;
  // мобы — мельче на MOB_SIZE: коробка (рост и ширина по умолчанию у движка — 1.8 и 0.3), модель — ниже (e.scale)
  const mobSized = (def.kind || "mob") === "mob";
  if (mobSized) {
    options.height = (options.height ?? 1.8) * MOB_SIZE;
    options.radius = (options.radius ?? 0.3) * MOB_SIZE;
  }
  const xp = Math.round((def.xp || 0) * (1 + bonusXp)); // сколько опыта за победу (мобы и звери)
  if (def.attack) {
    // Своя атака у каждого (свой кулдаун); урон — с прибавкой
    const a = ATTACKS[def.attack];
    const scale = (d) => Math.round(d * dmgK) + bonusDamage;
    const damage = Array.isArray(a.damage) ? a.damage.map(scale) : scale(a.damage);
    options.attack = new (a.slam ? SlamAttack : MeleeAttack)({ ...a, damage }); // slam — удар по земле (тролль)
  }
  // Стороны и защита — из паспорта (если заданы), иначе — как у класса по умолчанию
  for (const k of ["faction", "hostileTo", "protectedFrom", "invulnerable"]) if (def[k] !== undefined) options[k] = def[k];
  if (def.kind === "npc") options.role = def.role;
  const e = new CLASSES[def.kind || "mob"](options);
  if (def.kindResist) e.kindResist = { ...def.kindResist }; // стойкость к виду атаки (ближний / стрельба / взрыв)
  // Каска (MOB_HELMET): с шансом; урон в голову (уже с множителем хедшота) — меньше на headshot
  if (MOB_HELMET.types.includes(type) && Math.random() < MOB_HELMET.chance) {
    e.helmet = MOB_HELMET.headshot;
    const before = e.onIncoming;
    e.onIncoming = (d) => {
      before?.(d);
      if (d.tags?.has("headshot") || d.part === "head") d.amount *= 1 - e.helmet;
    };
  }
  e.xp = xp;
  e.bonusHp = bonusHp;
  e.hpMult = hpMult;
  e.damageMult = damageMult;
  e.bonusDamage = bonusDamage;
  // Стрелок: своя дальняя атака (перезарядка; урон растёт как у удара), имя и что в руке
  if (weapon) {
    const r = ATTACKS[weapon.attack];
    e.ranged = weapon;
    e.rangedWeapon = weaponId;
    e.name = MOB_RANGED.names[type]?.[weaponId] || e.name;
    e.rangedAttack = new ThrowAttack({ ...r, minDamage: 0, maxDamage: 0 });
    e.rangedDamage = r.damage.map((d) => Math.round(d * dmgK) + bonusDamage);
  }
  if (def.boss) {
    e.boss = true; // босс логова: не исчезает, не считается в мобах, сам в нашествие не идёт
    e.stunResist = BOSS.stunResist; //   оглушение и заморозка короче
    e.stunImmunity = BOSS.stunImmunity; // и после них — передышка
    e.percentDamageScale = BOSS.percentDamageScale; // горение / кровотечение / капкан (доля макс. HP) — слабее
  }
  if (type === "bloater") e.blastDamage = BLOATER.damage.map((d) => Math.round(d * dmgK) + bonusDamage); // взрыв крепчает, как удары
  e.bonusXp = bonusXp; // доля: 0.05 — опыта на 5 % больше
  if (def.regen) e.regen = def.regen;
  if ((def.kind || "mob") === "mob" && !def.boss) e.regenPct = MOB_REGEN.pct; // мобы зализывают раны: 1 % макс. HP/с (рана режет)
  if (def.tauntRadius) e.tauntRadius = def.tauntRadius;
  if (def.scale) e.scale = def.scale; // размер модели
  if (mobSized) e.scale = (def.scale || 1) * MOB_SIZE;
  if (inventory) e.inventory.loadFrom(inventory);
  else {
    // Добыча: число или [от, до] — случайно в этих пределах (0 — в этот раз не выпадет)
    for (const [item, count] of def.loot || []) {
      const n = Array.isArray(count) ? count[0] + Math.floor(Math.random() * (count[1] - count[0] + 1)) : count;
      if (n > 0) e.inventory.add(item, n);
    }
  }
  return e;
}

export function creatureToJSON(e) {
  const p = e.position;
  return { type: e.type, x: p.x, y: p.y, z: p.z, yaw: e.yaw, hp: e.stats.hp, bonusHp: e.bonusHp, hpMult: e.hpMult, damageMult: e.damageMult, bonusDamage: e.bonusDamage, bonusXp: e.bonusXp, ...(e.ranged ? { ranged: e.rangedWeapon } : {}), inventory: e.inventory.toJSON() };
}
