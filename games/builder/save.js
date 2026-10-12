// ============================================================
//  Сохранение «Стройки»: что именно лежит в saves/world.json.
//  Надёжная запись и чтение файла — в движке (engine/core/json-file.js).
//
//  Версии формата:
//   1 — блоки и позиция игрока (y — глаза);
//   2 — + hp, инвентарь игрока и существа;
//   3 — позиция игрока — ноги (как у всех сущностей);
//   4 — + опыт, уровень и таланты игрока (progression).
//   5 — + spawned (сколько скелетов появилось), у существ bonusHp и bonusDamage.
//   6 — + pickups: предметы, лежащие на земле (камни, выброшенное);
//       worldgen: { seed } — зерно рельефа (по нему высота земли считается заново, кубики — в blocks).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJSON, writeJSON } from "../../engine/index.js";
import { SAVES, PLAYER } from "./config.js";
import { creatureToJSON } from "./creatures.js";

export const SAVE_FILE = path.join(SAVES, "world.json");

// Раньше (до разделения на движок и игры) сохранения лежали в nodejs_visual/saves.
// Один раз копируем их сюда, чтобы мир и настройки не пропали. Старые файлы не трогаем.
// Только если папки сохранений игры ещё нет вообще: иначе после гибели (мир удалён)
// старый мир вернулся бы обратно.
export function migrateOldSaves() {
  if (fs.existsSync(SAVES)) return;
  const old = fileURLToPath(new URL("../../saves/", import.meta.url));
  for (const name of ["settings.json", "world.json"]) {
    const from = path.join(old, name);
    const to = path.join(SAVES, name);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.mkdirSync(SAVES, { recursive: true });
      fs.copyFileSync(from, to);
      console.log(`Перенёс старое сохранение: saves/${name} -> games/builder/saves/${name}`);
    }
  }
}

export function saveGame({ world, player, look, creatures, progression, spawned = 0, pickups = [], worldgen = null }) {
  const p = player.position;
  writeJSON(SAVE_FILE, {
    version: 6,
    progression, // { experience: { level, xp }, talents: { points, ranks } }
    spawned, //    сколько скелетов уже появилось (каждый следующий крепче)
    savedAt: new Date().toISOString(),
    player: { x: p.x, y: p.y, z: p.z, yaw: look.yaw, pitch: look.pitch, hp: player.stats.hp, inventory: player.inventory.toJSON(), hotbar: player.hotbar?.toJSON() },
    entities: creatures.map(creatureToJSON),
    pickups, //    [{ item, count, x, y, z }] — что лежит на земле
    worldgen, //   { seed } — зерно рельефа (null — старый плоский мир)
    blocks: world.toJSON(),
  });
  return world.blocks.size;
}

// Данные сохранения (уже в формате версии 3) или null — новый мир
export function loadGame() {
  const data = readJSON(SAVE_FILE, (d) => d && Array.isArray(d.blocks) && d.player);
  if (!data) return null;
  if ((data.version || 1) < 3) data.player.y -= PLAYER.eyeHeight; // раньше хранили глаза, теперь ноги
  return data;
}

// Игрок погиб — мир начинается заново: сохранение мира убираем (настройки остаются).
// Не стираем насовсем, а переносим в saves/dead/ (последние 3) — если гибель была из-за ошибки,
// мир можно вернуть: положить файл обратно как saves/world.json. Вернёт имя файла или null.
export function deleteSave() {
  if (!fs.existsSync(SAVE_FILE)) return null;
  const dir = path.join(SAVES, "dead");
  fs.mkdirSync(dir, { recursive: true });
  const name = `world-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.renameSync(SAVE_FILE, path.join(dir, name));
  const old = fs.readdirSync(dir).filter((f) => f.startsWith("world-")).sort();
  for (const f of old.slice(0, -3)) fs.rmSync(path.join(dir, f), { force: true });
  return `dead/${name}`;
}
