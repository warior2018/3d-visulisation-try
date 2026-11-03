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
//       worldgen: { seed } — зерно рельефа (по нему высота земли считается заново, кубики — в blocks);
//       traps — поставленные ловушки (необязательно: в старых сохранениях их нет).
//   7 — мир — папка saves/world/: meta.json (всё, кроме блоков) + chunks/ — блоки по кускам 16×16 в двоичных
//       файлах (движок: ChunkStore); пишутся только изменившиеся куски. surfaces — имена особых поверхностей
//       (номера в файлах кусков). Старый world.json (6) читается; после первой записи в новом формате
//       откладывается в saves/world-v6.json.
//  Автосохранение — в фоне (игра не ждёт диска); раз в BACKUP.every — копия папки в saves/backups/ (последние BACKUP.keep).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJSON, ChunkStore, writeAtomic, renameSafe } from "../../engine/index.js";
import { SAVES, PLAYER, BACKUP, STREAM } from "./config.js";
import { creatureToJSON } from "./creatures.js";

// Миры — слоты: saves/worlds/<id>/ — в каждом свой мир (world/: meta.json + chunks/), копии (backups/),
// погибшие миры (dead/) и info.json — имя, картинка, когда играли в последний раз (меню «ИГРАТЬ»).
// Какой мир сейчас — useWorld(id); пути ниже переключаются вместе с ним (export let — живые ссылки)
const WORLDS = path.join(SAVES, "worlds");
export const MAX_WORLDS = 9;
export let currentWorld = null;
export let WORLD_ROOT = null;
export let SAVE_DIR = null;
export let SAVE_FILE = null; // всё, кроме блоков
let OLD_FILE = null; //        формат 6 и раньше: всё в одном файле
let BACKUPS = null;
let DEAD = null;
export let store = null;
let lastBackup = 0;

export function useWorld(id) {
  currentWorld = String(id);
  WORLD_ROOT = path.join(WORLDS, currentWorld);
  SAVE_DIR = path.join(WORLD_ROOT, "world");
  SAVE_FILE = path.join(SAVE_DIR, "meta.json");
  OLD_FILE = path.join(WORLD_ROOT, "world.json");
  BACKUPS = path.join(WORLD_ROOT, "backups");
  DEAD = path.join(WORLD_ROOT, "dead");
  store = new ChunkStore(SAVE_DIR);
  lastBackup = 0;
  return currentWorld;
}

const infoFile = (id) => path.join(WORLDS, String(id), "info.json");
const readInfo = (id) => {
  try { return JSON.parse(fs.readFileSync(infoFile(id), "utf8")); } catch { return null; }
};
const writeInfo = (id, info) => {
  fs.mkdirSync(path.dirname(infoFile(id)), { recursive: true });
  writeAtomic(infoFile(id), JSON.stringify(info, null, 2), true);
};

// Старые сохранения (один мир в saves/) — в слот 1 (один раз)
function migrateToSlots() {
  if (fs.existsSync(WORLDS)) return;
  const any = ["world", "world.json"].some((f) => fs.existsSync(path.join(SAVES, f)));
  if (!any) return;
  const root = path.join(WORLDS, "1");
  fs.mkdirSync(root, { recursive: true });
  for (const f of ["world", "world.json", "world-v6.json", "dead", "backups"]) {
    const from = path.join(SAVES, f);
    if (fs.existsSync(from)) renameSafe(from, path.join(root, f));
  }
  writeInfo("1", { name: "WORLD 1", icon: "island", created: new Date().toISOString(), lastPlayed: Date.now() });
}

// Что показать в меню о мире: уровень, класс, здоровье, оружие в руках, бонусы (из meta.json)
function summaryOf(id) {
  const meta = path.join(WORLDS, String(id), "world", "meta.json");
  let d = null;
  try { d = JSON.parse(fs.readFileSync(meta, "utf8")); } catch {}
  if (!d && fs.existsSync(path.join(WORLDS, String(id), "world.json"))) return { saved: true, old: true };
  if (!d) return { saved: false };
  const mine = d.players?.[PROFILE];
  if (d.players && Object.keys(d.players).length && !mine) return { saved: true, noCharacter: true };
  if (mine) Object.assign(d, { player: mine.player, progression: mine.progression });
  const pr = d.progression || {};
  const hb = d.player?.hotbar;
  const weapon = Array.isArray(hb) ? hb[0] : Array.isArray(hb?.slots) ? hb.slots[0] : null; // ячейка оружия
  return {
    saved: true,
    level: pr.experience?.level || 1,
    cls: pr.class || null,
    hp: Math.round(d.player?.hp ?? 0),
    weapon: weapon ? { item: weapon.item, rarity: weapon.data?.rarity || null } : null,
    armor: (d.player?.armor || []).filter(Boolean).map((a) => a.item),
    hides: pr.trollHides || 0,
    crowns: pr.boneCrowns || 0,
    talents: pr.talents?.ranks || {},
    savedAt: d.savedAt || null,
  };
}

// Сведения о текущем мире (имя, картинка, размер, летающие ли острова) — из info.json
export const worldInfo = () => readInfo(currentWorld) || {};

// Все миры: сначала тот, в который играли последним
export function listWorlds() {
  if (!fs.existsSync(WORLDS)) return [];
  return fs.readdirSync(WORLDS)
    .filter((id) => /^\d+$/.test(id) && readInfo(id))
    .map((id) => ({ id, ...readInfo(id), ...summaryOf(id) }))
    .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
}

// size — 1 / 2 / 3 (config: WORLD_SIZES); новые миры — летающие острова (floating)
export function createWorld({ name, icon, size = 2, floating = true }) {
  let id = 1;
  while (fs.existsSync(path.join(WORLDS, String(id)))) id++;
  writeInfo(id, { name: String(name || `WORLD ${id}`).slice(0, 20), icon: icon || "island", size, floating, created: new Date().toISOString(), lastPlayed: Date.now() });
  return String(id);
}

export function updateWorld(id, patch) {
  const info = readInfo(id);
  if (info) writeInfo(id, { ...info, ...patch });
}

// Играем в этот мир: он — текущий и первый в списке
export function touchWorld(id) {
  updateWorld(id, { lastPlayed: Date.now() });
  useWorld(id);
}

// Удалить мир из списка: не насовсем — папка уходит в saves/deleted/
export function deleteWorld(id) {
  const from = path.join(WORLDS, String(id));
  if (!fs.existsSync(from)) return;
  const dir = path.join(SAVES, "deleted");
  fs.mkdirSync(dir, { recursive: true });
  renameSafe(from, path.join(dir, `world-${id}-${new Date().toISOString().replace(/[:.]/g, "-")}`));
}

migrateToSlots();
useWorld(listWorlds()[0]?.id || "1");

// Есть ли сохранённый мир (в любом формате) — у текущего слота
export const hasSave = () => fs.existsSync(SAVE_FILE) || fs.existsSync(OLD_FILE);

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

// Записать мир. background — в фоне (автосохранение: игра не ждёт диска); иначе — сразу и до конца.
// Вернёт { blocks, chunks, bytes } — блоков в мире, сколько кусков пишем и их размер
// Персонажи привязаны к миру по id игрока (PROFILE: id из настроек; позже — аккаунты): в meta.players[id] —
// герой и прогресс каждого, кто играл в этом мире. player / progression сверху — того, кто сохранял последним
// (старые сохранения — только они)
let PROFILE = "local";
export const setProfile = (id) => (PROFILE = String(id || "local"));
export const profileId = () => PROFILE;

function playersOf() {
  try { return JSON.parse(fs.readFileSync(SAVE_FILE, "utf8")).players || {}; } catch { return {}; }
}

export function saveGame({ world, player, look, creatures, progression, spawned = 0, pickups = [], traps = [], fog = null, worldgen = null, background = false }) {
  const p = player.position;
  const w = store.save(world, { sync: !background }); // сначала куски: при них дописываются имена поверхностей
  const me = { x: p.x, y: p.y, z: p.z, yaw: look.yaw, pitch: look.pitch, hp: player.stats.hp, mana: player.stats.mana, inventory: player.inventory.toJSON(), hotbar: player.hotbar?.toJSON(), armor: player.armor?.toJSON() };
  const players = { ...playersOf(), [PROFILE]: { player: me, progression } };
  const meta = JSON.stringify({
    version: 8,
    progression, // { experience: { level, xp }, talents: { points, ranks } }
    spawned, //    сколько скелетов уже появилось (каждый следующий крепче)
    savedAt: new Date().toISOString(),
    player: me,
    players, //    все персонажи этого мира: { id игрока: { player, progression } }
    entities: creatures.map(creatureToJSON),
    pickups, //    [{ item, count, x, y, z }] — что лежит на земле
    traps, //      [{ type, x, y, z, yaw, age }] — поставленные ловушки
    fog, //        туман войны карты: что разведано (движок: FogOfWar.toJSON)
    worldgen, //   { seed } — зерно рельефа (null — старый плоский мир)
    surfaces: store.surfaces, // имена особых поверхностей блоков (номера в файлах кусков)
    blocks: world.blocks.size, // сколько блоков (для журнала; сами блоки — в chunks/)
  });
  const after = () => {
    // старый формат больше не нужен — отложить (не стирать: вдруг что-то пошло не так)
    if (fs.existsSync(OLD_FILE)) renameSafe(OLD_FILE, path.join(WORLD_ROOT, "world-v6.json"));
  };
  if (background) {
    store.busy = store.busy
      .then(() => writeAtomic(SAVE_FILE, meta, false))
      .then(after)
      .then(() => backup())
      .catch((e) => console.error("Сохранение не записалось:", e.message));
  } else {
    writeAtomic(SAVE_FILE, meta, true);
    after();
    store.busy = store.busy.then(() => backup()).catch((e) => console.error("Копия мира не записалась:", e.message));
  }
  return { blocks: world.blocks.size, ...w };
}

// Гость сетевой игры: мир — чужой, его не пишем. А свой прогресс (уровень, таланты, класс, вещи, здоровье) —
// в своё сохранение: место героя и свой мир в нём не меняются. Своего сохранения нет — некуда (вернёт false)
export function saveGuestProgress({ player, progression }) {
  const file = fs.existsSync(SAVE_FILE) ? SAVE_FILE : fs.existsSync(OLD_FILE) ? OLD_FILE : null;
  if (!file) return false;
  const data = readJSON(file, (d) => d && d.player);
  if (!data) return false;
  data.progression = progression;
  Object.assign(data.player, { hp: player.stats.hp, mana: player.stats.mana, inventory: player.inventory.toJSON(), hotbar: player.hotbar?.toJSON(), armor: player.armor?.toJSON() });
  data.savedAt = new Date().toISOString();
  writeAtomic(file, JSON.stringify(data), true);
  return true;
}

// Копия мира — не чаще раза в BACKUP.every секунд, хранится BACKUP.keep последних (saves/backups/)
async function backup() {
  const now = Date.now();
  if (now - lastBackup < BACKUP.every * 1000 || !fs.existsSync(SAVE_FILE)) return;
  lastBackup = now;
  const name = `world-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.promises.mkdir(BACKUPS, { recursive: true });
  await fs.promises.cp(SAVE_DIR, path.join(BACKUPS, name), { recursive: true, filter: (f) => !f.endsWith(".tmp") });
  const old = (await fs.promises.readdir(BACKUPS)).filter((f) => f.startsWith("world-")).sort();
  for (const f of old.slice(0, -BACKUP.keep)) await fs.promises.rm(path.join(BACKUPS, f), { recursive: true, force: true });
}

// Загрузить: блоки — сразу в world, вернёт остальное (формат 3+) или null — нового мира ещё нет
export function loadGame(world) {
  if (fs.existsSync(SAVE_FILE)) {
    const data = readJSON(SAVE_FILE, (d) => d && d.player && d.version >= 7);
    if (!data) return null;
    // свой персонаж этого мира (по id игрока); в мире есть другие, а меня нет — новый персонаж (класс — заново)
    if (data.players && Object.keys(data.players).length) {
      const mine = data.players[PROFILE];
      if (mine) Object.assign(data, { player: mine.player, progression: mine.progression });
      else {
        const any = Object.values(data.players)[0].player;
        Object.assign(data, { player: { x: any.x, y: any.y, z: any.z, yaw: any.yaw, pitch: 0 }, progression: {}, newCharacter: true });
      }
    }
    // большой мир — только куски вокруг героя (остальные подгрузит store.stream по пути)
    let files = 0;
    try { files = fs.readdirSync(path.join(SAVE_DIR, "chunks")).filter((f) => f.endsWith(".bin")).length; } catch {}
    const big = files > STREAM.minChunks;
    store.load(world, Array.isArray(data.surfaces) ? data.surfaces : [], big ? { around: data.player, radius: STREAM.radius } : {});
    for (const b of store.broken || []) console.error("Кусок мира не прочитался:", b);
    return data;
  }
  const data = readJSON(OLD_FILE, (d) => d && Array.isArray(d.blocks) && d.player);
  if (!data) return null;
  if ((data.version || 1) < 3) data.player.y -= PLAYER.eyeHeight; // раньше хранили глаза, теперь ноги
  world.loadFrom(data.blocks);
  store.world = null; // первая запись — полная, в новом формате
  return data;
}

// Игрок погиб — мир начинается заново: сохранение мира убираем (настройки остаются).
// Не стираем насовсем, а переносим в saves/dead/ (последние 3) — если гибель была из-за ошибки,
// мир можно вернуть: положить файл обратно как saves/world.json. Вернёт имя файла или null.
export function deleteSave() {
  const what = fs.existsSync(SAVE_DIR) ? SAVE_DIR : fs.existsSync(OLD_FILE) ? OLD_FILE : null;
  store.world = null; // следующий мир пишется с нуля
  store.saved.clear();
  if (!what) return null;
  const dir = DEAD;
  fs.mkdirSync(dir, { recursive: true });
  const name = `world-${new Date().toISOString().replace(/[:.]/g, "-")}${what === OLD_FILE ? ".json" : ""}`;
  try {
    renameSafe(what, path.join(dir, name));
  } catch {
    // Windows: папку не переименовать, пока в ней что-то открыто — копируем и стираем
    fs.cpSync(what, path.join(dir, name), { recursive: true });
    fs.rmSync(what, { recursive: true, force: true });
  }
  if (what === SAVE_DIR && fs.existsSync(OLD_FILE)) fs.rmSync(OLD_FILE, { force: true });
  const old = fs.readdirSync(dir).filter((f) => f.startsWith("world-")).sort();
  for (const f of old.slice(0, -3)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  return `dead/${name}`;
}
