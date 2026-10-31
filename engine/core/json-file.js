// ============================================================
//  Надёжные JSON-файлы — основа сохранений и настроек.
//  ЧТО сохранять, решает игра; КАК — надёжно записать и прочитать — движок.
// ============================================================

import fs from "node:fs";
import path from "node:path";

// Переименовать (в том числе поверх существующего файла). На Windows файл бывает ненадолго занят —
// антивирус, поиск Windows, OneDrive читают свежий файл — и переименование падает с EPERM / EBUSY / EACCES.
// Тогда пробуем ещё несколько раз с паузой (до ~1 с), а не теряем запись
const BUSY = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function renameSafe(from, to, tries = 12) {
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(from, to);
    } catch (e) {
      if (!BUSY.has(e.code) || i >= tries) throw e;
      pause(20 + i * 10);
    }
  }
}

export async function renameSafeAsync(from, to, tries = 12) {
  for (let i = 0; ; i++) {
    try {
      return await fs.promises.rename(from, to);
    } catch (e) {
      if (!BUSY.has(e.code) || i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 20 + i * 10));
    }
  }
}

// Записать. Сначала во временный файл, потом переименовать: если программа упадёт
// посреди записи, старый файл останется целым, а не обрезанным наполовину.
export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSafe(tmp, file);
}

// Прочитать. Файла нет — null. Файл испорчен (или validate сказал «не то») —
// не теряем его: переименовываем в *.broken-<время>.json и возвращаем null.
export function readJSON(file, validate = () => true) {
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!validate(data)) throw new Error("неверный формат");
    return data;
  } catch (e) {
    const broken = file.replace(/\.json$/, `.broken-${Date.now()}.json`);
    renameSafe(file, broken);
    console.error(`${path.basename(file)} не прочитался (${e.message}). Копия: ${path.basename(broken)}`);
    return null;
  }
}
