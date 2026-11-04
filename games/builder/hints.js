// ============================================================
//  Подсказки новичку (движок: engine/progression/hints.js) — по очереди, каждая со своим началом (start) и
//  концом (done). {key} в тексте — клавиша действия из настроек (talents → T). Выполненные — в настройках
//  (general.hintsDone): второй раз не появятся; ВКЛ / ВЫКЛ и «показать заново» — в настройках, вкладка ОБЩЕЕ.
// ============================================================

import { WEAPON_UPGRADES, MOUNT } from "./config.js";

const coins = (g) => g.itemCount?.("coin") || 0;

export const HINTS = [
  { id: "move", text: "{forward}{left}{back}{right} - MOVE, {jump} - JUMP, {primary} - ATTACK",
    done: (g, { time }) => time > 10 || (g.run?.kills || 0) > 0, max: 30 },
  { id: "xp", text: "KILL SKELETONS FOR XP - AT LEVEL 2 YOU CHOOSE A CLASS",
    done: (g) => !!g.playerClass, max: 300 },
  { id: "talents", text: "{talents} - TALENTS: SPEND YOUR POINTS",
    start: (g) => g.talents.points > 0, done: (g, { events }) => events.has("talents") || g.talents.points === 0, max: 60 },
  { id: "shop", text: "{shop} - SHOP: COINS FROM MOBS BUY WEAPON UPGRADES",
    start: (g) => coins(g) >= WEAPON_UPGRADES.primary.prices[0], done: (g, { events }) => events.has("shop"), max: 60 },
  { id: "map", text: "{map} - MAP: A SKULL IS A BOSS LAIR, THE BOSS DROPS RARE LOOT",
    start: (g) => g.experience.level >= 4, done: (g, { events }) => events.has("map"), max: 60 },
  { id: "mount", text: "ENOUGH COINS FOR A MOUNT: BUY IT IN THE SHOP, {mount} - CALL IT",
    start: (g) => coins(g) >= MOUNT.price && !g.hasMount, done: (g) => !!g.hasMount, max: 45 },
];
