// ============================================================
//  Какие существа бывают в игре: «паспорта» (вид, hp, скорость, добыча, модель),
//  создание и сохранение. Классы — из движка (engine/world/creatures.js):
//    kind "player" → Player, "mob" → Mob (враг), "npc" → NPC (мирный, неуязвимый).
//  ИИ — тоже из движка (engine/ai): мобам HostileBrain, НПС — WanderBrain.
// ============================================================

import { Vec3, Player, Mob, NPC, MeleeAttack, HostileBrain, WanderBrain, GuardBrain, FollowBrain, Taming, Rideable } from "../../engine/index.js";
import { SKELETON_AI, SKELETON_GROWTH, HERD, ATTACKS, BOARS, MOB_WANDER, BOAR_FOLLOW } from "./config.js";
import { maxStack } from "./items.js";

// Головы (хитбоксы хедшотов) — в осях существа: от ног вверх, +Z — куда смотрит.
// multiplier — во сколько раз больше урона при попадании в голову.
const HUMAN_HEAD = { id: "head", min: [-0.15, 1.6, -0.15], max: [0.15, 1.9, 0.15], multiplier: 2 };
export const HITBOXES = {
  player: [HUMAN_HEAD],
  skeleton: [HUMAN_HEAD],
  // Зомби: голова в каске — шире и выше, но каска гасит часть урона (×1.5 вместо ×2)
  zombie: [{ id: "head", min: [-0.19, 1.6, -0.19], max: [0.19, 1.99, 0.19], multiplier: 1.5 }],
  warden: [HUMAN_HEAD],
  // Кабан: голова спереди и низко (морда с бивнями)
  boar: [{ id: "head", min: [-0.2, 0.38, 0.46], max: [0.2, 0.86, 0.96], multiplier: 2 }],
};

export const CREATURES = {
  player: {
    kind: "player",
    name: "ИГРОК",
    maxHp: 100,
    inventorySize: 20,
    model: "skeleton", // пока у всех одна модель
  },
  skeleton: {
    kind: "mob",
    name: "СКЕЛЕТ",
    maxHp: 50,
    speed: SKELETON_AI.speed,
    inventorySize: 6,
    model: "skeleton",
    attack: "skeletonClaw", // какой атакой бьёт (config.js → ATTACKS)
    hostileTo: ["player", "town"], // охотится на героя и на стражу
    xp: 30, //                сколько опыта за победу
    resist: {}, //            сопротивления стихиям, например { fire: 0.5 }
    loot: [["bone", [0, 2]], ["skull", [0, 1]], ["coin", 5]], // с чем появляется (и что выпадет); [от, до] — случайно
    brain: () => new HostileBrain({ ...SKELETON_AI, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER }),
  },
  // Зомби: крепче (75 HP) и в каске (−25 % физического урона), но медленнее; тянется дальше
  zombie: {
    kind: "mob",
    name: "ЗОМБИ",
    maxHp: 75,
    speed: 1.6,
    inventorySize: 6,
    model: "zombie",
    attack: "zombieClaw",
    hostileTo: ["player", "town"],
    xp: 45,
    resist: { physical: 0.25 }, // каска
    loot: [["bone", [0, 1]], ["coin", 8]],
    brain: () => new HostileBrain({ ...SKELETON_AI, aggroRadius: SKELETON_AI.radius, leash: HERD.leash, herd: HERD, wander: MOB_WANDER }),
  },
  // Кабан: мирный (НПС), низкий и широкий. Покормишь костями — приручишь и сможешь ездить.
  // Его можно ранить — но раненый герой кабан больше не приручается
  boar: {
    kind: "npc",
    name: "КАБАН",
    role: "зверь",
    maxHp: 80,
    regen: 1, //               HP в секунду — зализывает раны сам (таланты вкладки КАБАН добавляют)
    xp: 25, //                 опыт за кабана (если добил герой)
    speed: 1.4,
    radius: 0.45,
    height: 0.9,
    inventorySize: 0,
    model: "boar",
    tamedModel: "boar-saddle", // приручённый — с седлом
    attack: "boarTusk", //       бивни: бьёт ими, когда приручён (защищает хозяина)
    brain: () => new WanderBrain({ radius: 8, pause: [3, 7], lookRadius: 2.5 }),
    taming: () => new Taming({ food: "bone", need: BOARS.tameBones }),
    // seat — где ноги всадника относительно ног кабана: так таз (0.95 над ногами) ложится на седло
    rideable: () => new Rideable({ seat: -0.03, speed: 6.5, runMultiplier: 1.35, jumpHeight: 1.25 }),
  },
  // Страж: герой ранить не может (protectedFrom), а мобы — могут; сам бьёт мобов мечом
  warden: {
    kind: "npc",
    name: "СТРАЖ",
    role: "страж", //         позже — разговор, задания
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
  return { bonusHp: index * g.hpPerSpawn, bonusDamage: Math.floor(index / g.damageEvery) * g.damageStep, bonusXp: index * g.xpPerSpawn };
}

const CLASSES = { player: Player, mob: Mob, npc: NPC };

export const skeletonGrowth = mobGrowth; // старое имя

// Модель существа сейчас (приручённый кабан — с седлом)
export function modelFor(e) {
  const def = CREATURES[e.type];
  return e.taming?.tamed && def.tamedModel ? def.tamedModel : def.model;
}

// Создать существо. hp, inventory, bonusHp, bonusDamage, bonusXp, tame — из сохранения, если есть.
// bonusHp — прибавка к здоровью, bonusDamage — к урону атаки, bonusXp — к опыту (скелеты крепчают)
export function createCreature(type, { x = 0, y = 0, z = 0, yaw = 0, hp, inventory, bonusHp = 0, bonusDamage = 0, bonusXp = 0, tame, trophyHp = 0, trophyPct = 0 } = {}) {
  const def = CREATURES[type];
  if (!def) return null; // неизвестный тип (например, из старого сохранения) — пропускаем
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
    brain: def.brain?.() || null, // свои «мозги» у каждого
  };
  if (def.speed) options.speed = def.speed;
  options.hitboxes = HITBOXES[type] || [];
  if (def.radius) options.radius = def.radius;
  if (def.height) options.height = def.height;
  const xp = Math.round((def.xp || 0) * (1 + bonusXp)); // сколько опыта за победу (мобы и звери)
  if (def.attack) {
    // Своя атака у каждого (свой кулдаун); урон — с прибавкой
    const a = ATTACKS[def.attack];
    const damage = Array.isArray(a.damage) ? a.damage.map((d) => d + bonusDamage) : a.damage + bonusDamage;
    options.attack = new MeleeAttack({ ...a, damage });
  }
  // Стороны и защита — из паспорта (если заданы), иначе — как у класса по умолчанию
  for (const k of ["faction", "hostileTo", "protectedFrom", "invulnerable"]) if (def[k] !== undefined) options[k] = def[k];
  if (def.kind === "npc") options.role = def.role;
  const e = new CLASSES[def.kind || "mob"](options);
  e.xp = xp;
  e.bonusHp = bonusHp;
  e.bonusDamage = bonusDamage;
  e.bonusXp = bonusXp; // доля: 0.05 — опыта на 5 % больше
  // Свои трофеи приручённого зверя (копит, пока жив; у хозяина — свои): +HP и +% урона
  e.trophyHp = trophyHp;
  e.trophyPct = trophyPct;
  if (def.taming) {
    e.taming = def.taming();
    e.taming.loadFrom(tame);
    if (e.taming.tamed) makePet(e);
  }
  if (def.rideable) e.rideable = def.rideable();
  if (def.regen) e.regen = def.regen;
  if (def.tauntRadius) e.tauntRadius = def.tauntRadius;
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

// Приручённый зверь — на стороне героя: мобы видят в нём врага (нападают), а герой его ранить не может;
// ходит за хозяином (FollowBrain; кого слушаться — e.leader, ставит игра, когда хозяин известен)
export function makePet(e, owner = null) {
  e.faction = "player";
  e.hostileTo = new Set(["monster"]); // враги хозяина — его враги
  e.protectedFrom.add("player");
  e.brain = new FollowBrain(BOAR_FOLLOW);
  if (owner) e.leader = owner;
}

export function creatureToJSON(e) {
  const p = e.position;
  return { type: e.type, x: p.x, y: p.y, z: p.z, yaw: e.yaw, hp: e.stats.hp, bonusHp: e.bonusHp, bonusDamage: e.bonusDamage, bonusXp: e.bonusXp, inventory: e.inventory.toJSON(), ...(e.taming ? { tame: e.taming.toJSON() } : {}), ...(e.trophyHp || e.trophyPct ? { trophyHp: e.trophyHp, trophyPct: e.trophyPct } : {}) };
}
