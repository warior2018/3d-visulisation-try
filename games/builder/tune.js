// ============================================================
//  Окно баланса (F6, движок: TuneScene): числа из config.js по вкладкам — меняются сразу в игре, ЗАПИСАТЬ —
//  в сам config.js (engine/core/config-patch.js: только нужные цифры, комментарии целы). После записи файл
//  перезагрузится сам (main.js → watchModule) — в игре те же числа.
//  Добавить число: строка в TUNE ниже — путь до него в config.js.
// ============================================================

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as C from "./config.js";
import { TuneScene, patchNumber } from "../../engine/index.js";

const CONFIG_FILE = fileURLToPath(new URL("./config.js", import.meta.url));
const WEAPONS = ["punch", "machete", "pistol", "handGrenade", "spear", "katana", "warHammer", "auto", "shotgun", "rifle", "crossbow", "launcher", "dynamite"];

// Вкладки: [путь, подпись, шаг?]. Путь — ключи в config.js; подпись — по-английски (перевод — словарь)
export const TUNE = [
  { id: "move", name: "MOVE", rows: [
    ...Object.keys(C.MOVEMENT).map((k) => [["MOVEMENT", k], "MOVE " + k.toUpperCase(), 0.01]),
    [["MOUNT", "speed"], "MOUNT SPEED"], [["MOUNT", "cooldown"], "MOUNT COOLDOWN"],
    [["OUT_OF_COMBAT", "speed"], "OUT OF COMBAT SPEED", 0.01], [["OUT_OF_COMBAT", "regenMult"], "OUT OF COMBAT REGEN X"],
  ] },
  { id: "spawn", name: "SPAWN", rows: [
    [["SPAWN", "interval"], "SPAWN EVERY (S)", 0.1], [["SPAWN", "max"], "MOBS AT ONCE", 1],
    [["ELITE", "from"], "ELITES FROM MOB #", 1], [["ELITE", "chance"], "ELITE CHANCE", 0.01], [["ELITE", "hp"], "ELITE HP X"], [["ELITE", "damage"], "ELITE DAMAGE X"],
  ] },
  { id: "weapons", name: "WEAPONS", rows: WEAPONS.filter((w) => C.ATTACKS[w]).flatMap((w) => [
    [["ATTACKS", w, "damage"], `${C.ATTACKS[w].name} DMG`, 1],
    [["ATTACKS", w, "cooldown"], `${C.ATTACKS[w].name} COOLDOWN`, 0.05],
  ]) },
  { id: "economy", name: "ECONOMY", rows: [
    ...Object.keys(C.TIERS).map((t) => [["TIERS", t, "price"], `TIER ${t} PRICE`, 50]),
    [["MOUNT", "price"], "MOUNT PRICE", 50], [["WEAPON_UPGRADES", "primaryPick"], "BASE WEAPON PICK BONUS", 0.05],
    [["QUESTS", "perLevel"], "QUEST REWARD PER LEVEL", 0.01], [["ISLANDS", "chest", "coins"], "CHEST COINS", 10], [["ELITE", "coins"], "ELITE COINS", 5],
  ] },
  { id: "feel", name: "FEEL", rows: [
    [["HIT_FEEL", "stop", "from"], "HIT STOP FROM DMG", 5], [["HIT_FEEL", "stop", "time"], "HIT STOP TIME", 0.005],
    [["HIT_FEEL", "knock", "max"], "KNOCKBACK MAX", 0.5], [["DAMAGE_DIR", "time"], "DAMAGE ARC TIME", 0.1],
  ] },
];

const getAt = (path) => path.reduce((o, k) => o?.[k], C);
const setAt = (path, v) => {
  const o = path.slice(0, -1).reduce((x, k) => x?.[k], C);
  if (o) o[path.at(-1)] = v;
};

// Строки для TuneScene (только числа, что нашлись)
export function tuneTabs() {
  return TUNE.map((t) => ({
    id: t.id, name: t.name,
    rows: t.rows.filter(([path]) => typeof getAt(path) === "number").map(([path, label, step]) => ({
      id: path.join("."), path, label, step, min: 0, get: () => getAt(path), set: (v) => setAt(path, v),
    })),
  }));
}

// Записать изменённые числа в config.js. Вернёт { saved, missed }
export function saveTune(rows, file = CONFIG_FILE) {
  let src = fs.readFileSync(file, "utf8");
  const missed = [];
  for (const r of rows) {
    const next = patchNumber(src, r.path, r.get());
    if (next === null) missed.push(r.id);
    else src = next;
  }
  fs.writeFileSync(file, src);
  return { saved: rows.length - missed.length, missed };
}

export function openTuneScene(scene) {
  scene.engine.push(new TuneScene({
    title: "BALANCE (DEV)",
    tabs: tuneTabs(),
    onChange: () => scene.configReloaded?.(), // оружие — из новых ATTACKS
    onSave: (rows) => {
      try {
        const { saved, missed } = saveTune(rows);
        scene.engine.log(`баланс → config.js: ${rows.map((r) => `${r.id} = ${r.get()}`).join(", ")}${missed.length ? "; не нашли: " + missed.join(", ") : ""}`);
        return missed.length ? `SAVED ${saved}, NOT FOUND ${missed.length} - SEE LOG` : `SAVED TO CONFIG.JS: ${saved}`;
      } catch (e) {
        scene.engine.log("баланс: не записать config.js: " + (e.stack || e));
        return "CANNOT WRITE CONFIG.JS - SEE LOG";
      }
    },
  }));
}
