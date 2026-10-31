// ============================================================
//  ChunkStore — мир из кубиков на диске по чанкам: папка, в ней файл на кусок (chunks/<cx>_<cz>.bin).
//  Сохранение пишет только куски, которые поменялись с прошлой записи (у чанка свой счётчик edits), и стирает
//  файлы опустевших. Мир в 65 тысяч блоков целиком — ~0.5 МБ, а поставил блок — перепишется один файл ~2 КБ.
//
//    const store = new ChunkStore(dir);
//    store.load(world);                        // прочитать все куски в мир (вернёт, сколько блоков)
//    store.save(world);                        // записать изменившиеся (запись — в фоне, игра не ждёт)
//    store.save(world, { sync: true });        // сразу и до конца (закрытие игры)
//    await store.idle();                       // дождаться фоновой записи (автотесты)
//
//  Подгрузка по частям (большой мир не держим в памяти целиком):
//    store.load(world, surfaces, { around: { x, z }, radius: 8 })  // только куски в радиусе (в кусках)
//    store.stream(world, x, z, 8)              // раз в секунду: подгрузить близкие, выгрузить дальние
//                                              // (изменённый кусок перед выгрузкой записывается)
//    store.onDisk                              // какие куски есть на диске (имена файлов)
//
//  Формат куска (двоичный, little-endian): "VCH1", число блоков (u32), потом по 8 байт на блок:
//  x в куске (u8), z в куске (u8), y (i16), r, g, b (u8), поверхность (u8: 0 — обычная, 1+ — номер в
//  списке surfaces + 1; список имён хранит игра рядом, в своём файле — здесь только номера).
//
//  Надёжность: каждый файл — во временный и переименование (оборвалось посреди — старый файл цел).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { CHUNK, chunkOf } from "../world/voxel-world.js";
import { renameSafe, renameSafeAsync } from "./json-file.js";

const MAGIC = 0x31484356; // "VCH1"
const REC = 8;
let tmpN = 0;

// Кусок -> байты. surfaces — список имён поверхностей (номер в файле = индекс + 1); новые имена дописываются
export function encodeChunk(chunk, surfaces) {
  const buf = Buffer.alloc(8 + chunk.blocks.size * REC);
  buf.writeUInt32LE(MAGIC, 0);
  buf.writeUInt32LE(chunk.blocks.size, 4);
  let o = 8;
  const x0 = chunk.cx * CHUNK, z0 = chunk.cz * CHUNK;
  for (const b of chunk.blocks) {
    let s = 0;
    if (b.surface) {
      s = surfaces.indexOf(b.surface) + 1;
      if (!s) s = surfaces.push(b.surface);
    }
    buf[o] = b.x - x0;
    buf[o + 1] = b.z - z0;
    buf.writeInt16LE(b.y, o + 2);
    buf[o + 4] = b.color[0];
    buf[o + 5] = b.color[1];
    buf[o + 6] = b.color[2];
    buf[o + 7] = s;
    o += REC;
  }
  return buf;
}

// Байты -> блоки в мир. Испорченный файл — исключение (кто читает, решает, что делать)
export function decodeChunk(buf, cx, cz, world, surfaces) {
  if (buf.length < 8 || buf.readUInt32LE(0) !== MAGIC) throw new Error("не кусок мира");
  const n = buf.readUInt32LE(4);
  if (buf.length < 8 + n * REC) throw new Error("файл обрезан");
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const color = [0, 0, 0];
  let o = 8;
  for (let i = 0; i < n; i++, o += REC) {
    color[0] = buf[o + 4];
    color[1] = buf[o + 5];
    color[2] = buf[o + 6];
    const s = buf[o + 7];
    world.place(x0 + buf[o], buf.readInt16LE(o + 2), z0 + buf[o + 1], color, s ? surfaces[s - 1] || null : null);
  }
  return n;
}

// Записать файл надёжно: во временный (своё имя на каждую запись — две записи не мешают друг другу), потом
// переименовать поверх
export function writeAtomic(file, data, sync) {
  const tmp = `${file}.${process.pid}.${++tmpN}.tmp`;
  if (sync) {
    fs.writeFileSync(tmp, data);
    renameSafe(tmp, file);
    return null;
  }
  return fs.promises.writeFile(tmp, data).then(() => renameSafeAsync(tmp, file));
}

const nameOf = (cx, cz) => `${cx}_${cz}.bin`;

export class ChunkStore {
  constructor(dir) {
    this.dir = dir;
    this.chunksDir = path.join(dir, "chunks");
    this.surfaces = []; // имена поверхностей (игра сохраняет их рядом: store.surfaces)
    this.world = null; //  чей мир записан в папке (другой мир — первая запись полная)
    this.saved = new Map(); // chunk.key -> edits, с которыми кусок записан
    this.busy = Promise.resolve(); // фоновая запись (очередь: одна за другой)
    this.lastWrite = { chunks: 0, removed: 0, bytes: 0 };
    this.onDisk = new Set(); // имена файлов кусков на диске ("cx_cz.bin")
    this.streamed = { loaded: 0, unloaded: 0 }; // счётчики подгрузки (тех. панель, тесты)
  }

  // Прочитать один кусок с диска в мир (тихо: не «изменение»). Нет файла / испорчен — false
  loadChunk(world, cx, cz) {
    const name = nameOf(cx, cz);
    if (!this.onDisk.has(name) || world.chunk(cx, cz)?.blocks.size) return false;
    const file = path.join(this.chunksDir, name);
    const quiet = world.quiet;
    world.quiet = true;
    try {
      decodeChunk(fs.readFileSync(file), cx, cz, world, this.surfaces);
    } catch (e) {
      (this.broken ||= []).push(`${name}: ${e.message}`);
      this.onDisk.delete(name);
      try { fs.renameSync(file, `${file}.broken-${Date.now()}`); } catch {}
      return false;
    } finally {
      world.quiet = quiet;
    }
    const c = world.chunk(cx, cz);
    if (c) this.saved.set(c.key, c.edits);
    this.streamed.loaded++;
    return true;
  }

  // Подгрузить куски в радиусе radius (в кусках) от точки (x, z), выгрузить те, что дальше radius + 2
  // (запас: на границе не грузим-выгружаем туда-сюда). Изменённый кусок перед выгрузкой — на диск (сразу)
  stream(world, x, z, radius) {
    // идёт фоновая запись — подождём: иначе её старая копия куска могла бы лечь поверх свежей
    if (this.pending) return;
    const pcx = chunkOf(x), pcz = chunkOf(z);
    for (const name of this.onDisk) {
      const m = /^(-?\d+)_(-?\d+)\.bin$/.exec(name);
      const cx = +m[1], cz = +m[2];
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) <= radius && !world.chunk(cx, cz)) this.loadChunk(world, cx, cz);
    }
    const far = radius + 2;
    for (const c of [...world.chunks.values()]) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) <= far) continue;
      if (this.saved.get(c.key) !== c.edits) {
        const file = path.join(this.chunksDir, nameOf(c.cx, c.cz));
        fs.mkdirSync(this.chunksDir, { recursive: true });
        if (c.blocks.size) {
          writeAtomic(file, encodeChunk(c, this.surfaces), true);
          this.onDisk.add(nameOf(c.cx, c.cz));
        } else {
          fs.rmSync(file, { force: true });
          this.onDisk.delete(nameOf(c.cx, c.cz));
        }
      }
      world.unloadChunk(c);
      this.saved.delete(c.key);
      this.streamed.unloaded++;
    }
  }

  exists() {
    return fs.existsSync(this.chunksDir);
  }

  // Прочитать все куски в world (мир очищается). Испорченный кусок — пропустить и отложить файл в сторону
  load(world, surfaces = [], { around = null, radius = 8 } = {}) {
    world.clear();
    const quiet = world.quiet;
    world.quiet = true; // загрузка — не «изменения» (сети не рассылать)
    this.surfaces = [...surfaces];
    this.onDisk.clear();
    let blocks = 0;
    const broken = [];
    if (this.exists()) {
      for (const f of fs.readdirSync(this.chunksDir)) {
        const m = /^(-?\d+)_(-?\d+)\.bin$/.exec(f);
        if (!m) continue;
        this.onDisk.add(f);
        // по частям: дальние куски не читаем (подгрузит stream, когда подойдём)
        if (around && Math.max(Math.abs(+m[1] - chunkOf(around.x)), Math.abs(+m[2] - chunkOf(around.z))) > radius) continue;
        const file = path.join(this.chunksDir, f);
        try {
          blocks += decodeChunk(fs.readFileSync(file), +m[1], +m[2], world, this.surfaces);
        } catch (e) {
          broken.push(`${f}: ${e.message}`);
          this.onDisk.delete(f);
          try { fs.renameSync(file, `${file}.broken-${Date.now()}`); } catch {}
        }
      }
    }
    world.quiet = quiet;
    this.world = world;
    this.saved.clear();
    for (const c of world.chunks.values()) this.saved.set(c.key, c.edits);
    this.broken = broken;
    return blocks;
  }

  // Записать изменившиеся куски. Данные снимаются сразу (дальше мир можно менять), запись — в фоне
  // (sync — сразу). Вернёт { chunks, removed } — сколько кусков пишем и сколько файлов стираем
  save(world, { sync = false } = {}) {
    fs.mkdirSync(this.chunksDir, { recursive: true });
    const full = world !== this.world; // другой мир — пишем всё, лишние файлы убираем
    if (full) this.saved.clear();
    const writes = [];
    const removes = [];
    for (const c of world.chunks.values()) {
      if (!full && this.saved.get(c.key) === c.edits) continue;
      this.saved.set(c.key, c.edits);
      const file = path.join(this.chunksDir, nameOf(c.cx, c.cz));
      if (c.blocks.size) {
        writes.push([file, encodeChunk(c, this.surfaces)]);
        this.onDisk.add(nameOf(c.cx, c.cz));
      } else {
        removes.push(file);
        this.onDisk.delete(nameOf(c.cx, c.cz));
      }
    }
    if (full) {
      const keep = new Set([...world.chunks.values()].filter((c) => c.blocks.size).map((c) => nameOf(c.cx, c.cz)));
      for (const f of fs.readdirSync(this.chunksDir)) if (/\.bin$/.test(f) && !keep.has(f)) removes.push(path.join(this.chunksDir, f));
      this.onDisk = keep;
    }
    this.world = world;
    const bytes = writes.reduce((a, [, d]) => a + d.length, 0);
    this.lastWrite = { chunks: writes.length, removed: removes.length, bytes };
    if (sync) {
      for (const [f, d] of writes) writeAtomic(f, d, true);
      for (const f of removes) fs.rmSync(f, { force: true });
    } else {
      this.pending = (this.pending || 0) + 1;
      this.busy = this.busy
        .then(() => Promise.all([...writes.map(([f, d]) => writeAtomic(f, d, false)), ...removes.map((f) => fs.promises.rm(f, { force: true }))]))
        .catch((e) => {
          console.error("Запись мира не удалась:", e.message);
          for (const c of world.chunks.values()) this.saved.delete(c.key); // в следующий раз — эти куски заново
        })
        .finally(() => this.pending--);
    }
    return this.lastWrite;
  }

  idle() {
    return this.busy;
  }
}

// Номер куска по клетке — для тех, кто сам раскладывает (тесты)
export { chunkOf };
