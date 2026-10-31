// ============================================================
//  Какие существа бывают в игре: «паспорта» (вид, hp, скорость, добыча, модель),
//  создание и сохранение. Классы — из движка (engine/world/creatures.js):
//    kind "player" → Player, "mob" → Mob (враг), "npc" → NPC (мирный, неуязвимый).
//  ИИ — тоже из движка (engine/ai): мобам HostileBrain, НПС — WanderBrain.
// ============================================================

import { Vec3, Inventory, Player, Mob, NPC, MeleeAttack, SlamAttack, ThrowAttack, HostileBrain, KamikazeBrain, WanderBrain, GuardBrain, FollowBrain, Taming, Rideable, grow, growth } from "../../engine/index.js";
import { GROWTH_SOFTCAP, SKELETON_AI, SKELETON_GROWTH, HERD, ATTACKS, MOB_WANDER, MOB_RANGED, BOSS, BLOATER, HERO_SCALE, PLAYER } from "./config.js";
import { maxStack } from "./items.js";

// Головы (хитбоксы хедшотов) — в осях существа: от ног вверх, +Z — куда смотрит.
// multiplier — во сколько раз больше урона при попадании в голову.
const HUMAN_HEAD = { id: "head", min: [-0.15, 1.6, -0.15], max: [0.15, 1.9, 0.15], multiplier: 2 };
// Голова героя — модель уменьшена до роста 1.6 (HERO_SCALE)
const HERO_HEAD = { ...HUMAN_HEAD, min: HUMAN_HEAD.min.map((v) => v * HERO_SCALE), max: HUMAN_HEAD.max.map((v) => v * HERO_SCALE) };
export const HITBOXES = {
  player: [HERO_HEAD],
  skeleton: [HUMAN_HEAD],
  // Зомби: голова в каске — шире и выше, но каска гасит часть урона (×1.5 вместо ×2)
  zombie: [{ id: "head", min: [-0.19, 1.6, -0.19], max: [0.19, 1.99, 0.19], multiplier: 1.5 }],
  warden: [HUMAN_HEAD],
  // Кабан: голова спереди и низко (морда с бивнями)
  boar: [{ id: "head", min: [-0.2, 0.38, 0.46], max: [0.2, 0.86, 0.96], multiplier: 2 }],
  // Тролль сутулится: голова впереди и чуть ниже макушки
  troll: [{ id: "head", min: [-0.25, 1.95, 0.15], max: [0.25, 2.45, 0.7], multiplier: 2 }],
  lich: [{ id: "head", min: [-0.2, 2.16, -0.2], max: [0.2, 2.57, 0.2], multiplier: 2 }], //    скелет ×1.35
  bloater: [{ id: "head", min: [-0.22, 1.84, -0.22], max: [0.22, 2.29, 0.22], multiplier: 1.5 }], // зомби ×1.15
};

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
    speed: SKELETON_AI.speed,
    inventorySize: 6,
    model: "skeleton",
    attack: "skeletonClaw", // какой атакой бьёт (config.js → ATTACKS)
    hostileTo: ["player", "town"], // охотится на героя и на стражу
    xp: 30, //                сколько опыта за победу
    resist: {}, //            сопротивления стихиям, например { fire: 0.5 }
    loot: [["bone", [0, 2]], ["skull", [0, 1]], ["coin", 5]], // с чем появляется (и что выпадет); [от, до] — случайно
    ranged: true, // может быть стрелком (MOB_RANGED: камень, нож или пистолет)
    brain: (w) => new HostileBrain({ ...SKELETON_AI, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER, ranged: rangedAI(w) }),
  },
  // Зомби: крепче (75 HP) и в каске (−25 % физического урона), но медленнее; тянется дальше
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
    resist: { physical: 0.25 }, // каска
    loot: [["bone", [0, 1]], ["coin", 8]],
    ranged: true, // может быть стрелком (MOB_RANGED)
    brain: (w) => new HostileBrain({ ...SKELETON_AI, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER, ranged: rangedAI(w) }),
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
  model: "troll", attack: "trollSlam", hostileTo: ["player", "town"], xp: 900, resist: { physical: 0.25 },
  loot: [["coin", 160], ["troll-hide", 1]],
  // Валун: всегда (не случайный стрелок), с перезарядкой 4 с; пока перезаряжается — идёт на тебя (в пределах зала)
  rangedWeapon: { attack: "boulderThrow", item: "stone", scale: 3.5, range: 16, minRange: 5, advance: true },
  brain: (w) => new HostileBrain({ aggroRadius: BOSS.aggroRadius, sightHeight: 2, leash: 80, stopDistance: 2.2, turnSpeed: 3, jumpSpeed: 7.5, ranged: rangedAI(w) }),
};

// Лич — второй босс логова (LICH в config.js): высокий скелет-колдун (модель скелета ×1.35, фиолетовая)
CREATURES.lich = {
  kind: "mob", name: "BONE LICH", boss: true, maxHp: 1200, speed: 2.2, radius: 0.4, height: 2.6, scale: 1.35, inventorySize: 4,
  model: "lich", attack: "lichTouch", hostileTo: ["player", "town"], xp: 900, resist: { physical: 0.15, fire: 0.3 },
  loot: [["coin", 160], ["bone-crown", 1]],
  // Сгусток: стоит и стреляет, пока видит (не подходит ближе); прыжки по залу и подъём скелетов — игра
  rangedWeapon: { attack: "lichBolt", item: "lichbolt", scale: 1.6, range: 18, minRange: 0, straight: true },
  brain: (w) => new HostileBrain({ aggroRadius: BOSS.aggroRadius + 1.5, sightHeight: 2, leash: 80, stopDistance: 1.4, turnSpeed: 4, jumpSpeed: 7.5, ranged: rangedAI(w) }),
};

// РАЗДУТЫЙ — моб-смертник (BLOATER): опухший зомби побольше; взрыв и запал — у игры (e.onBoom / e.onPrime)
CREATURES.bloater = {
  kind: "mob", name: "BLOATER", maxHp: 45, speed: 2.6, radius: 0.36, height: 2.2, scale: 1.15, inventorySize: 4,
  model: "bloater", hostileTo: ["player", "town"], xp: 40, loot: [["bone", [0, 1]], ["coin", 6]],
  brain: () => new KamikazeBrain({
    range: BLOATER.range, fuse: Infinity, trigger: BLOATER.trigger, prime: BLOATER.prime,
    onPrime: (e) => e.onPrime?.(e), onBoom: (e) => e.onBoom?.(e),
  }),
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
  return { bonusHp: grow(0, n, g.hp), damageMult: d.mult, bonusDamage: d.add, bonusXp: growth(index, g.xp).mult - 1 };
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
export function createCreature(type, { x = 0, y = 0, z = 0, yaw = 0, hp, inventory, bonusHp = 0, damageMult = 1, bonusDamage = 0, bonusXp = 0, ranged = false } = {}) {
  const def = CREATURES[type];
  if (!def) return null; // неизвестный тип (например, из старого сохранения) — пропускаем
  const weaponId = ranged && def.ranged ? pickRangedWeapon(ranged) : null;
  const weapon = def.rangedWeapon || (weaponId ? MOB_RANGED.weapons[weaponId] : null); // rangedWeapon — своё (босс)
  const maxHp = def.maxHp + bonusHp;
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
  const xp = Math.round((def.xp || 0) * (1 + bonusXp)); // сколько опыта за победу (мобы и звери)
  if (def.attack) {
    // Своя атака у каждого (свой кулдаун); урон — с прибавкой
    const a = ATTACKS[def.attack];
    const scale = (d) => Math.round(d * damageMult) + bonusDamage;
    const damage = Array.isArray(a.damage) ? a.damage.map(scale) : scale(a.damage);
    options.attack = new (a.slam ? SlamAttack : MeleeAttack)({ ...a, damage }); // slam — удар по земле (тролль)
  }
  // Стороны и защита — из паспорта (если заданы), иначе — как у класса по умолчанию
  for (const k of ["faction", "hostileTo", "protectedFrom", "invulnerable"]) if (def[k] !== undefined) options[k] = def[k];
  if (def.kind === "npc") options.role = def.role;
  const e = new CLASSES[def.kind || "mob"](options);
  e.xp = xp;
  e.bonusHp = bonusHp;
  e.damageMult = damageMult;
  e.bonusDamage = bonusDamage;
  // Стрелок: своя дальняя атака (перезарядка; урон растёт как у удара), имя и что в руке
  if (weapon) {
    const r = ATTACKS[weapon.attack];
    e.ranged = weapon;
    e.rangedWeapon = weaponId;
    e.name = MOB_RANGED.names[type]?.[weaponId] || e.name;
    e.rangedAttack = new ThrowAttack({ ...r, minDamage: 0, maxDamage: 0 });
    e.rangedDamage = r.damage.map((d) => Math.round(d * damageMult) + bonusDamage);
  }
  if (def.boss) {
    e.boss = true; // босс логова: не исчезает, не считается в мобах, сам в нашествие не идёт
    e.stunResist = BOSS.stunResist; //   оглушение и заморозка короче
    e.stunImmunity = BOSS.stunImmunity; // и после них — передышка
    e.percentDamageScale = BOSS.percentDamageScale; // горение / кровотечение / капкан (доля макс. HP) — слабее
  }
  if (type === "bloater") e.blastDamage = BLOATER.damage.map((d) => Math.round(d * damageMult) + bonusDamage); // взрыв крепчает, как удары
  e.bonusXp = bonusXp; // доля: 0.05 — опыта на 5 % больше
  if (def.regen) e.regen = def.regen;
  if (def.tauntRadius) e.tauntRadius = def.tauntRadius;
  if (def.scale) e.scale = def.scale; // размер модели
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
  return { type: e.type, x: p.x, y: p.y, z: p.z, yaw: e.yaw, hp: e.stats.hp, bonusHp: e.bonusHp, damageMult: e.damageMult, bonusDamage: e.bonusDamage, bonusXp: e.bonusXp, ...(e.ranged ? { ranged: e.rangedWeapon } : {}), inventory: e.inventory.toJSON() };
}
