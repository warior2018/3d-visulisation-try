// ============================================================
//  Горячая перезагрузка модуля с настройками (config.js игры): сохранил файл — игра подхватила без перезапуска.
//
//  Как: следим за файлом (fs.watch по папке — редакторы часто сохраняют «заменой» файла), после сохранения
//  импортируем его заново (import("config.js?v=2") — Node даёт новый экземпляр модуля) и ПЕРЕНОСИМ новые
//  значения в старые объекты (applyLive): все, кто сделал import { ATTACKS } from "./config.js", держат тот же
//  объект — он просто поменялся внутри. Поэтому подхватывается всё, что лежит в объектах (ATTACKS.pistol.damage,
//  MOVEMENT.ground, цены...). Отдельные числа (export const REACH = 8) так поменять нельзя — их список вернётся
//  в skipped («нужен перезапуск»). Ключи, которых в новом файле нет, остаются (ничего не ломаем на ходу).
//  Ошибка в файле (опечатка) — старые значения целы, вернётся error.
//
//    const hot = watchModule(new URL("./config.js", import.meta.url), {
//      live: await import("./config.js"),
//      onReload: ({ updated, skipped, error }) => ...,
//    });
//    hot.close();
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// Перенести значения source в target (на месте). Вернёт, сколько значений поменялось
export function applyLive(target, source) {
  let n = 0;
  if (Array.isArray(target) && Array.isArray(source)) {
    const deep = target.length === source.length && source.every((v, i) => (plain(v) && plain(target[i])) || (Array.isArray(v) && Array.isArray(target[i])));
    if (deep) {
      for (let i = 0; i < source.length; i++) n += applyLive(target[i], source[i]);
      return n;
    }
    if (target.length !== source.length || source.some((v, i) => !same(v, target[i]))) {
      target.length = 0;
      target.push(...source);
      return 1;
    }
    return 0;
  }
  for (const k of Object.keys(source)) {
    const a = target[k], b = source[k];
    if ((plain(a) && plain(b)) || (Array.isArray(a) && Array.isArray(b))) n += applyLive(a, b);
    else if (!same(a, b)) {
      target[k] = b;
      n++;
    }
  }
  return n;
}

// Одинаковые ли значения (функции — по тексту: новый модуль — новые функции, но код тот же)
function same(a, b) {
  if (typeof a === "function" && typeof b === "function") return a.toString() === b.toString();
  return Object.is(a, b);
}

// Перенести весь модуль: объекты — на месте, отдельные значения — в skipped
export function applyModule(live, fresh) {
  let updated = 0;
  const skipped = [];
  for (const k of Object.keys(fresh)) {
    const a = live[k], b = fresh[k];
    if ((plain(a) && plain(b)) || (Array.isArray(a) && Array.isArray(b))) updated += applyLive(a, b);
    else if (!same(a, b)) skipped.push(k);
  }
  return { updated, skipped };
}

export function watchModule(url, { live, onReload = () => {}, delay = 150 }) {
  const file = url instanceof URL ? fileURLToPath(url) : url;
  const href = pathToFileURL(file).href;
  let timer = null, version = 0, last = readSafe(file);
  const reload = async () => {
    timer = null;
    const text = readSafe(file);
    if (text === null || text === last) return; // не поменялся (часть редакторов сохраняет дважды)
    last = text;
    try {
      const fresh = await import(`${href}?v=${++version}`);
      onReload({ ...applyModule(live, fresh), error: null });
    } catch (error) {
      onReload({ updated: 0, skipped: [], error });
    }
  };
  let watcher = null;
  try {
    watcher = fs.watch(path.dirname(file), (ev, name) => {
      if (name && path.basename(String(name)) !== path.basename(file)) return;
      clearTimeout(timer);
      timer = setTimeout(reload, delay);
    });
    watcher.unref?.();
  } catch {}
  return { reload, close: () => { clearTimeout(timer); watcher?.close(); } };
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
