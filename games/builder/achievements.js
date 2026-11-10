// ============================================================
//  Ачивки: каждая открывает скин (skins.js). Прогресс — счётчики в профиле аккаунта (engine.profile,
//  файл profile.json рядом с настройками), открытые — там же («ach:<id>»: 1). Без ачивки скин закрыт:
//  в меню СКИНЫ он тёмный и не надевается (skins.js → setSkinLock).
//
//  stat — какой счётчик профиля смотреть; goal — сколько нужно. Счётчики пишет игра (scene/achievements.js):
//    kill:<оружие>      — убийства этим оружием (WEAPON_OF_ATTACK: id атаки → оружие)
//    head:<оружие>      — убийства хедшотом этим оружием
//    mob:<вид>          — убийства мобов этого вида (skeleton, ghoul, champion...)
//    boss:<вид>         — убитые боссы (troll, lich); bossWith:<оружие> — босс, добитый этим оружием
//    kills              — всего убийств;  medkits, blocks, quests, trapKills:<ловушка>
//    level:<класс>      — лучший уровень этим классом (melee / ranged / demo); duelWins
// ============================================================

// id атаки → оружие (для счётчиков)
export const WEAPON_OF_ATTACK = {
  machete: "machete", "machete-leap": "machete",
  "war-hammer": "war-hammer", "hammer-swing": "war-hammer",
  katana: "katana", "katana-saddle": "katana", iai: "katana",
  pistol: "pistol", auto: "auto", shotgun: "shotgun", "shotgun-blast": "shotgun", rifle: "rifle",
  crossbow: "crossbow", bow: "bow", "bow-blast": "bow",
  "hand-grenade": "grenades", grenade: "grenades", launcher: "launcher", cluster: "launcher", dynamite: "dynamite",
  "bear-trap": "bear-trap", spikes: "spikes",
};

// skin — "цель/скин" из skins.js; tier — для порядка и цвета (1 лёгкая … 3 трудная)
export const ACHIEVEMENTS = [
  // ---------- оружие ближнего боя ----------
  { id: "machete-50", skin: "machete/jungle", name: "FIRST BLOOD", text: "KILL 50 MONSTERS WITH THE MACHETE", stat: "kill:machete", goal: 50, tier: 1 },
  { id: "machete-400", skin: "machete/bloodmoon", name: "BUTCHER", text: "KILL 400 MONSTERS WITH THE MACHETE", stat: "kill:machete", goal: 400, tier: 3 },
  { id: "hammer-100", skin: "war-hammer/molten", name: "BLACKSMITH", text: "KILL 100 MONSTERS WITH THE WAR HAMMER", stat: "kill:war-hammer", goal: 100, tier: 2 },
  { id: "hammer-boss", skin: "war-hammer/glacier", name: "GIANT SLAYER", text: "FINISH A BOSS WITH THE WAR HAMMER", stat: "bossWith:war-hammer", goal: 1, tier: 3 },
  { id: "katana-100", skin: "katana/sakura", name: "PETALS FALL", text: "KILL 100 MONSTERS WITH THE KATANA", stat: "kill:katana", goal: 100, tier: 2 },
  { id: "katana-boss", skin: "katana/shadow", name: "ONE CUT", text: "FINISH A BOSS WITH THE KATANA", stat: "bossWith:katana", goal: 1, tier: 3 },
  // ---------- стрелковое ----------
  { id: "pistol-75", skin: "pistol/gilded", name: "QUICK DRAW", text: "KILL 75 MONSTERS WITH THE PISTOL", stat: "kill:pistol", goal: 75, tier: 1 },
  { id: "pistol-head", skin: "pistol/neon", name: "DEADEYE", text: "30 HEADSHOT KILLS WITH THE PISTOL", stat: "head:pistol", goal: 30, tier: 2 },
  { id: "auto-200", skin: "auto/arctic", name: "SPRAY AND PRAY", text: "KILL 200 MONSTERS WITH THE ASSAULT RIFLE", stat: "kill:auto", goal: 200, tier: 2 },
  { id: "auto-head", skin: "auto/urban", name: "CONTROLLED BURST", text: "60 HEADSHOT KILLS WITH THE ASSAULT RIFLE", stat: "head:auto", goal: 60, tier: 3 },
  { id: "shotgun-150", skin: "shotgun/swamp", name: "CLOSE ENOUGH", text: "KILL 150 MONSTERS WITH THE SHOTGUN", stat: "kill:shotgun", goal: 150, tier: 2 },
  { id: "champion-1", skin: "shotgun/chrome", name: "PLAGUE DOCTOR", text: "KILL THE PLAGUE CHAMPION", stat: "mob:champion", goal: 1, tier: 2 },
  { id: "rifle-head", skin: "rifle/void", name: "THROUGH THE VOID", text: "50 HEADSHOT KILLS WITH THE SNIPER RIFLE", stat: "head:rifle", goal: 50, tier: 2 },
  { id: "rifle-boss", skin: "rifle/jade", name: "LONG SHOT", text: "FINISH A BOSS WITH THE SNIPER RIFLE", stat: "bossWith:rifle", goal: 1, tier: 3 },
  { id: "crossbow-150", skin: "crossbow/elven", name: "ELVEN AIM", text: "KILL 150 MONSTERS WITH THE CROSSBOW", stat: "kill:crossbow", goal: 150, tier: 2 },
  { id: "crossbow-head", skin: "crossbow/nighthunter", name: "NIGHT HUNTER", text: "40 HEADSHOT KILLS WITH THE CROSSBOW", stat: "head:crossbow", goal: 40, tier: 2 },
  { id: "mummy-30", skin: "crossbow/hellfire", name: "UNWRAPPED", text: "KILL 30 MUMMIES", stat: "mob:mummy", goal: 30, tier: 1 },
  { id: "bow-200", skin: "bow/phoenix", name: "RISING FLAME", text: "KILL 200 MONSTERS WITH THE BOW", stat: "kill:bow", goal: 200, tier: 2 },
  { id: "bow-head", skin: "bow/frost", name: "COLD PRECISION", text: "75 HEADSHOT KILLS WITH THE BOW", stat: "head:bow", goal: 75, tier: 3 },
  // ---------- взрывчатка ----------
  { id: "grenade-100", skin: "grenades/toxic", name: "PIN PULLER", text: "KILL 100 MONSTERS WITH GRENADES", stat: "kill:grenades", goal: 100, tier: 2 },
  { id: "bloater-40", skin: "grenades/candy", name: "POP GOES THE BLOATER", text: "KILL 40 BLOATERS", stat: "mob:bloater", goal: 40, tier: 1 },
  { id: "launcher-150", skin: "launcher/sandstorm", name: "ARTILLERY", text: "KILL 150 MONSTERS WITH THE GRENADE LAUNCHER", stat: "kill:launcher", goal: 150, tier: 2 },
  { id: "launcher-boss", skin: "launcher/lava", name: "ERUPTION", text: "FINISH A BOSS WITH THE GRENADE LAUNCHER", stat: "bossWith:launcher", goal: 1, tier: 3 },
  { id: "dynamite-100", skin: "dynamite/frostbite", name: "COLD FUSE", text: "KILL 100 MONSTERS WITH DYNAMITE", stat: "kill:dynamite", goal: 100, tier: 2 },
  { id: "kills-2000", skin: "dynamite/golden", name: "LEGEND", text: "KILL 2000 MONSTERS IN TOTAL", stat: "kills", goal: 2000, tier: 3 },
  // ---------- персонажи ----------
  { id: "melee-25", skin: "fighter/ronin", name: "MASTERLESS", text: "REACH LEVEL 25 AS A FIGHTER", stat: "level:melee", goal: 25, tier: 2 },
  { id: "ranged-25", skin: "ranger/outlaw", name: "WANTED", text: "REACH LEVEL 25 AS A RANGER", stat: "level:ranged", goal: 25, tier: 2 },
  { id: "demo-25", skin: "demolitionist/hazmat", name: "HANDLE WITH CARE", text: "REACH LEVEL 25 AS A DEMOLITIONIST", stat: "level:demo", goal: 25, tier: 2 },
  // ---------- броня ----------
  { id: "quests-10", skin: "leather/scorched", name: "ERRAND RUNNER", text: "TURN IN 10 QUESTS TO THE WARDEN", stat: "quests", goal: 10, tier: 1 },
  { id: "lich-3", skin: "bone/cursed", name: "PHYLACTERY", text: "KILL THE BONE LICH 3 TIMES", stat: "boss:lich", goal: 3, tier: 3 },
  { id: "troll-3", skin: "iron/royal", name: "KINGSLAYER", text: "KILL THE CAVE TROLL 3 TIMES", stat: "boss:troll", goal: 3, tier: 3 },
  // ---------- полезное ----------
  { id: "traps-40", skin: "bear-trap/rusted", name: "SNAP!", text: "KILL 40 MONSTERS WITH BEAR TRAPS", stat: "trapKills:bear-trap", goal: 40, tier: 1 },
  { id: "spikes-150", skin: "spikes/obsidian", name: "PINCUSHION", text: "KILL 150 MONSTERS WITH SPIKES", stat: "trapKills:spikes", goal: 150, tier: 2 },
  { id: "medkits-30", skin: "medkit/navy", name: "FIELD MEDIC", text: "USE 30 MEDKITS", stat: "medkits", goal: 30, tier: 1 },
  { id: "blocks-1500", skin: "builder/golden", name: "ARCHITECT", text: "PLACE 1500 BLOCKS", stat: "blocks", goal: 1500, tier: 2 },
];

const BY_SKIN = new Map(ACHIEVEMENTS.map((a) => [a.skin, a]));
export const achievementForSkin = (target, skin) => BY_SKIN.get(`${target}/${skin}`) || null;

// Открыта ли ачивка (профиль: «ach:<id>»)
export const isUnlocked = (profile, a) => !!a && profile?.get?.("ach:" + a.id) > 0;
// Прогресс 0..1
export const progressOf = (profile, a) => Math.min(1, (profile?.get?.(a.stat) || 0) / a.goal);

// Проверить ачивки, которые зависят от счётчика stat: дошли до цели — открыть. Вернёт список новых
export function checkAchievements(profile, stat = null) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (stat && a.stat !== stat) continue;
    if (isUnlocked(profile, a) || (profile.get(a.stat) || 0) < a.goal) continue;
    profile.data["ach:" + a.id] = 1;
    fresh.push(a);
  }
  if (fresh.length) profile.save();
  return fresh;
}
