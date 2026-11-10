// ============================================================
//  Подробная справка к командам консоли «Стройки» (help <имя>): что делает, аргументы, примеры.
//  Регистрирует scene/commands.js → registerCommands (console.describe). Тексты — английские, как и вся консоль.
// ============================================================

const R = "required", O = "optional";
export const GAME_GUIDES = {
  god: { what: "Invulnerability: nothing can hurt you. The same command turns it off.", examples: ["god"] },
  heal: { what: "Restores full health (and mana, if you have it).", examples: ["heal"] },
  luck: { what: "Extra luck on top of talents: mobs drop gear more often and of a better rarity. Without a value - shows the current one.", args: [["0..10", O, "extra luck (0 - none)"]], examples: ["luck", "luck 2"] },
  give: {
    what: "Puts an item into your inventory (weapons and armor - into their slot if it is free). Without an item - lists every item id.",
    args: [["item", O, "an item id (give - list), e.g. stone, katana, medkit, iron-chest"], ["count", O, "how many, default 1"], ["rarity", O, "rare | epic | legendary - for weapons and armor"]],
    examples: ["give", "give block 64", "give katana 1 legendary", "give medkit 3"],
    notes: ["no room in the inventory - the rest is not given (it says how many)"],
  },
  spawn: {
    what: "Spawns creatures 5-9 m in front of you, facing you. Without a name - lists every creature.",
    args: [["creature", O, "a creature id (spawn - list), e.g. skeleton, zombie, troll"], ["count", O, "how many, default 1, at most 50"]],
    examples: ["spawn", "spawn skeleton 5", "spawn troll"],
  },
  killall: { what: "Kills every mob in the world, or only one kind.", args: [["creature", O, "only this kind (e.g. zombie)"]], examples: ["killall", "killall skeleton"] },
  xp: { what: "Gives experience as if you earned it (levels and talent points come as usual).", args: [["amount", R, "how much experience"]], examples: ["xp 500"] },
  points: { what: "Adds talent points (negative - takes away).", args: [["n", R, "how many points"]], examples: ["points 10"] },
  class: { what: "Chooses a class right away (as the window on the first new level). Without an id - lists the classes.", args: [["id", O, "melee | ranged | demo"]], examples: ["class", "class ranged"] },
  tp: {
    what: "Teleports you. With two numbers - onto the ground at x, z; with three - exactly to x, y, z. Fall damage from a teleport does not count.",
    args: [["x", R, "east-west"], ["y", O, "height (only in the 3-number form)"], ["z", R, "north-south"]],
    examples: ["tp 0 0", "tp 120 -40", "tp 10 80 10"],
    notes: ["pos - shows where you are now"],
  },
  daytime: { what: "Time of day: 0 - midnight, 0.25 - morning, 0.5 - noon, 0.75 - evening.", args: [["0..1", O, "the time of day"]], examples: ["daytime 0.5", "daytime 0"] },
  daynight: { what: "Day and night cycle on or off (off - the time of day stands still). Saved.", args: [["0|1", O, "1 - on, 0 - off"]], examples: ["daynight 0"] },
  skin: {
    what: "Changes a skin (as the SKINS tab in the menu). Without a target - every target, its skin and the choices; without a skin - the choices of that target.",
    args: [["target", O, "what to repaint: katana, pistol, fighter, iron..."], ["skin", O, "a skin id of that target (default - the original)"]],
    examples: ["skin", "skin katana", "skin katana shadow", "skin pistol default"],
  },
  pos: { what: "Where you are: x, y, z and where you look (yaw, degrees).", examples: ["pos"] },
  invasion: {
    what: "Starts or stops an invasion (a wave of mobs hunting the nearest hero).",
    args: [["start|stop", R, "start or stop"], ["seconds", O, "how long the invasion lasts (start only)"]],
    examples: ["invasion start", "invasion start 60", "invasion stop"],
  },
  save: { what: "Saves the world right now (it also saves by itself).", examples: ["save"], notes: ["a network match is never saved"] },
  mobs: { what: "How many living creatures are in the world, by kind.", examples: ["mobs"] },
  net: { what: "Network game status: host or guest, players, ping.", examples: ["net"] },
  say: { what: "Sends a chat message (as Enter - chat).", args: [["text", R, "the message"]], examples: ["say hi", "say \"meet at the bridge\""] },
  move_ground: { what: "How fast the hero reaches walking speed on the ground (seconds). Only the feel - the speed is the same.", args: [["seconds", O, "0..3, 0 - instantly"]], examples: ["move_ground 0.1"] },
  move_stop: { what: "How fast the hero stops on the ground (seconds).", args: [["seconds", O, "0..3, 0 - instantly"]], examples: ["move_stop 0.05"] },
  move_air: { what: "How fast the hero changes direction in the air (seconds).", args: [["seconds", O, "0..3, 0 - instantly"]], examples: ["move_air 0.3"] },
  move_airstop: { what: "How fast the hero stops in the air (seconds).", args: [["seconds", O, "0..3, 0 - instantly"]], examples: ["move_airstop 0.5"] },
  move_over: { what: "How fast extra speed after a dash fades (seconds).", args: [["seconds", O, "0..3, 0 - instantly"]], examples: ["move_over 0.2"] },
};

export function describeGameCommands(c) {
  for (const [name, info] of Object.entries(GAME_GUIDES)) c.describe(name, info);
}
