// ============================================================
//  Профиль игрока: простые счётчики на этом компьютере (победы, поражения, сыграно матчей...).
//  Файл profile.json рядом с настройками; пишется сразу (это редкие события).
//
//    engine.profile.add("duelWins");          // +1
//    engine.profile.get("duelWins")           // сколько
//    engine.profile.all()                     // { duelWins: 3, duelLosses: 1, ... }
// ============================================================

import fs from "node:fs";

export class Profile {
  constructor(file) {
    this.file = file;
    this.data = {};
    try {
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      if (d && typeof d === "object") this.data = d;
    } catch {} // файла ещё нет — с нуля
  }

  get(key) {
    return Number(this.data[key]) || 0;
  }

  all() {
    return { ...this.data };
  }

  add(key, n = 1) {
    this.data[key] = this.get(key) + n;
    this.save();
    return this.data[key];
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {} // не записалось — счётчик всё равно в памяти
  }
}
