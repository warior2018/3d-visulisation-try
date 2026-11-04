// ============================================================
//  Сторож (watchdog) и журнал.
//
//  Журнал — текстовый файл, куда движок пишет, что происходит: сцены, нажатия,
//  настройки, ошибки. Пишем сразу на диск (appendFileSync), поэтому, даже если
//  игра намертво зависнет, последние строчки уже в файле — по ним видно, где.
//
//  Сторож — отдельный поток (Worker). Главный поток игры каждый кадр «отмечается»
//  (beat). Если отметок нет timeoutMs миллисекунд — игра зависла: сторож дописывает
//  в журнал, на каком этапе кадра она застряла, и закрывает процесс. Так зависшая
//  игра не держит мышь и видеокарту и не заставляет перезагружать компьютер.
//
//  Почему отдельный поток: если главный поток завис, он не может проверить сам себя.
// ============================================================

import fs from "node:fs";
import { renameSafe } from "./json-file.js";
import path from "node:path";
import { Worker } from "node:worker_threads";

// Этапы кадра: главный поток отмечает, где он сейчас. Номер = индекс в списке.
export const PHASES = ["отдых между кадрами", "логика (update)", "рисование (render)", "показ кадра (present)", "обработка нажатия", "смена сцены"];

const FLUSH_MS = 500; // журнал: как часто дописывать файл

export class Journal {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Прошлый журнал не теряем: он может понадобиться, если игру перезапустили после зависания
    if (fs.existsSync(file)) {
      try { renameSafe(file, file.replace(/\.txt$/, "-prev.txt")); } catch {} // занят (Windows) — допишем в старый
    }
    this.write("старт");
  }

  // Строки копятся в памяти и пишутся в файл пачкой (раз в FLUSH_MS или когда набралось много): запись на диск
  // на каждую строку тормозила игру, когда событий много (нашествие — десятки ударов в секунду).
  // Ошибки пишутся сразу. При выходе — всё дописывается
  write(text) {
    const time = new Date().toISOString().slice(11, 23); // часы:минуты:секунды.мс
    (this.buffer ||= []).push(`${time}  ${text}\n`);
    // последние строки — ещё и в памяти: отчёт о падении (engine.crash) показывает конец журнала
    const r = (this.recent ||= []);
    r.push(`${time}  ${text}`);
    if (r.length > 80) r.shift();
    if (/ОШИБКА|ERROR/.test(text) || this.buffer.length >= 300) return this.flush();
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), FLUSH_MS);
      this.timer.unref?.(); // таймер не держит программу открытой
    }
    if (!this.hooked) {
      this.hooked = true;
      process.on("exit", () => this.flush()); // закрыли игру — дописать хвост
    }
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer?.length) return;
    const text = this.buffer.join("");
    this.buffer = [];
    try {
      fs.appendFileSync(this.file, text);
    } catch {
      // журнал — не главное: если писать нельзя, игра всё равно работает
    }
  }
}

// Код сторожа. Worker из строки — без отдельного файла (eval: true → это CommonJS)
const WORKER_CODE = `
const { workerData } = require("node:worker_threads");
const fs = require("node:fs");
const { shared, timeoutMs, logFile, phases } = workerData;
const s = new Int32Array(shared); // [0] — счётчик отметок, [1] — этап кадра
let lastBeat = Atomics.load(s, 0);
let lastChange = Date.now();
let lastCheck = Date.now();
setInterval(() => {
  const now = Date.now();
  // Сторож сам долго не просыпался (крышку ноутбука закрывали) — главный поток не виноват
  if (now - lastCheck > 2000) lastChange = now;
  lastCheck = now;
  const beat = Atomics.load(s, 0);
  if (beat !== lastBeat) { lastBeat = beat; lastChange = now; return; }
  if (now - lastChange < timeoutMs) return;
  const time = new Date().toISOString().slice(11, 23);
  const phase = phases[Atomics.load(s, 1)] || "?";
  fs.appendFileSync(logFile, time + "  ЗАВИСАНИЕ: игра не отвечает " + Math.round((now - lastChange) / 1000) +
    " с, застряла на этапе «" + phase + "». Сторож закрыл игру.\\n");
  process.kill(process.pid, "SIGKILL"); // жёстко: зависший поток по-хорошему уже не закроется
}, 250);
`;

export class Watchdog {
  constructor({ logFile, timeoutMs = 8000 }) {
    this.shared = new SharedArrayBuffer(8);
    this.state = new Int32Array(this.shared);
    this.worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { shared: this.shared, timeoutMs, logFile, phases: PHASES },
    });
    this.worker.unref(); // сторож сам по себе не мешает программе завершиться
  }

  // «Я жив» — вызывается каждый кадр (и в меню, раз в 50 мс)
  beat() {
    Atomics.add(this.state, 0, 1);
  }

  // Отметить этап кадра (номер из PHASES)
  phase(n) {
    Atomics.store(this.state, 1, n);
  }

  stop() {
    this.worker.terminate();
  }
}
