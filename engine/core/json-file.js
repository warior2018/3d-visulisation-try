// ============================================================
//  Надёжные JSON-файлы — основа сохранений и настроек.
//  ЧТО сохранять, решает игра; КАК — надёжно записать и прочитать — движок.
// ============================================================

import fs from "node:fs";
import path from "node:path";

// Записать. Сначала во временный файл, потом переименовать: если программа упадёт
// посреди записи, старый файл останется целым, а не обрезанным наполовину.
export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
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
    fs.renameSync(file, broken);
    console.error(`${path.basename(file)} не прочитался (${e.message}). Копия: ${path.basename(broken)}`);
    return null;
  }
}
