// ============================================================
//  Обновления — возможность движка. Игра запущена, а код на диске поменялся
//  (вышла новая версия) — движок это замечает и может перезапустить игру.
//
//  Записи обновлений — файл CHANGELOG.json (новая версия — СВЕРХУ):
//    [
//      { "version": "0.15.0", "date": "2026-10-11", "title": "Автообновления",
//        "changes": ["Кнопка «Обновить» в главном меню", "..."] },
//      { "version": "0.14.0", ... }
//    ]
//  Добавить запись: node tools/add-update.js 0.16.0 "Заголовок" "изменение" "изменение"...
//
//    const updater = new Updater({ file, onAvailable: (u) => toast(...) });
//    updater.available   // запись новой версии или null
//    updater.newer(from) // все записи новее версии from (для окна «что нового»)
//    updater.restart(engine, { before: () => save() }) // перезапуск с новым кодом
//
//  Как узнаём: раз в interval мс смотрим, не поменялся ли файл. Верхняя версия
//  больше той, с которой игра стартовала — значит, есть обновление.
//  Перезапуск: запускаем тот же node с теми же аргументами и закрываемся сами.
// ============================================================

import fs from "node:fs";
import { spawn } from "node:child_process";

// Сравнить версии «1.2.10» и «1.2.9»: > 0 — первая новее
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Прочитать записи (битый или пустой файл — пустой список)
export function readChangelog(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(list) ? list.filter((e) => e && e.version) : [];
  } catch {
    return [];
  }
}

export class Updater {
  constructor({ file, interval = 2000, onAvailable = () => {} }) {
    this.file = file;
    this.entries = readChangelog(file);
    this.current = this.entries[0]?.version || "0.0.0"; // с этой версией игра запустилась
    this.available = null; //                              запись новой версии, когда появится
    this.onAvailable = onAvailable;
    this.mtime = this.stat();
    // Перезапустились после обновления — с какой версии (окно «что нового»)
    this.updatedFrom = process.env.VOID_UPDATED_FROM || null;
    this.timer = setInterval(() => this.check(), interval);
    this.timer.unref?.(); // таймер не держит процесс живым
  }

  stat() {
    try {
      return fs.statSync(this.file).mtimeMs;
    } catch {
      return 0;
    }
  }

  // Файл поменялся? Перечитываем; верхняя версия новее нашей — обновление готово
  check() {
    const m = this.stat();
    if (m === this.mtime) return;
    this.mtime = m;
    this.entries = readChangelog(this.file);
    const top = this.entries[0];
    if (!top || compareVersions(top.version, this.current) <= 0) return;
    if (this.available?.version === top.version) return;
    this.available = top;
    this.onAvailable(this);
  }

  // Записи новее версии from (по умолчанию — нашей): что нового
  newer(from = this.current) {
    return this.entries.filter((e) => compareVersions(e.version, from) > 0);
  }

  // Перезапустить игру с новым кодом: before() — успеть сохраниться
  restart(engine, { before = () => {} } = {}) {
    before();
    engine.log(`обновление: ${this.current} -> ${this.available?.version || "?"}, перезапуск`);
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, VOID_UPDATED_FROM: this.current },
    });
    child.unref();
    engine.quit(); // закрываем своё окно; новая игра откроет своё
  }

  stop() {
    clearInterval(this.timer);
  }
}
