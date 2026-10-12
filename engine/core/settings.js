// ============================================================
//  Хранилище настроек: JSON-файл + значения по умолчанию.
//  Если в файле чего-то нет (или там мусор) — берётся значение по умолчанию.
//  Так старый файл настроек не ломается, когда в игре появляются новые настройки.
// ============================================================

import fs from "node:fs";
import { writeJSON } from "./json-file.js";

export class SettingsStore {
  constructor(file, defaults) {
    this.file = file;
    this.defaults = defaults;
    this.data = merge(clone(defaults), this.read());
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return {}; // файла нет или он испорчен — работаем со значениями по умолчанию
    }
  }

  save() {
    writeJSON(this.file, this.data);
  }

  // Вернуть раздел (например "video") к значениям по умолчанию
  reset(section) {
    this.data[section] = clone(this.defaults[section]);
    this.save();
  }
}

// Глубокое слияние: значения из extra поверх base (для настроек «движок + игра»)
export function deepMerge(base, extra) {
  const out = clone(base);
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Накладываем значения из файла на значения по умолчанию.
// Берём только то, что совпадает по типу: число к числу, объект к объекту.
function merge(target, source) {
  if (!isObject(source)) return target;
  for (const key of Object.keys(target)) {
    const t = target[key];
    const s = source[key];
    if (s === undefined) continue;
    if (isObject(t)) merge(t, s);
    else if (typeof s === typeof t) target[key] = s;
  }
  return target;
}
