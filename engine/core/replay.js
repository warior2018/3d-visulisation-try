// ============================================================
//  Запись и повтор (replay): записываем ввод кадр за кадром — время кадра, зажатые клавиши и кнопки мыши,
//  нажатия между кадрами, сдвиг мыши — и случайность (Math.random — по зерну с начала записи). Перед записью
//  игра сохраняет мир (snapshot), и повтор начинается с того же мира: тот же ввод → та же игра. Так баг,
//  пойманный в игре, повторяется в тестах (tools/sim/replay.mjs).
//
//    const rec = new ReplayRecorder({ seed });  rec.start(); ... rec.frame(engine) — раз в кадр, rec.event(e)
//    rec.stop() → { version, seed, frames: [...] }
//    seedRandom(seed) — Math.random по зерну (вернёт функцию, которая вернёт обычный Math.random)
//  Кадр: { dt, k?: [клавиши] (только если поменялись), b?: [кнопки], e?: [[тип, код]], m?: [dx, dy] }
// ============================================================

export const REPLAY_VERSION = 1;
const MAX_FRAMES = 60 * 60 * 10; // 10 минут при 60 FPS — дальше запись сама останавливается

// Детерминированная случайность (mulberry32)
export function seededRandomFn(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedRandom(seed) {
  const orig = Math.random;
  Math.random = seededRandomFn(seed);
  return () => {
    Math.random = orig;
  };
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export class ReplayRecorder {
  constructor({ seed = (Math.random() * 2 ** 31) >>> 0, meta = {} } = {}) {
    this.seed = seed;
    this.meta = meta;
    this.frames = [];
    this.events = [];
    this.lastK = [];
    this.lastB = [];
    this.recording = false;
    this.time = 0;
  }

  start() {
    this.recording = true;
    this.restoreRandom = seedRandom(this.seed);
  }

  // Нажатие между кадрами (engine.press): клавиша или кнопка мыши
  event(e) {
    if (!this.recording) return;
    if (e.scancode !== undefined) this.events.push(["k", e.scancode]);
    else if (e.button !== undefined) this.events.push(["b", e.button]);
  }

  // Кадр: зовёт движок в начале tick (до того, как сцена прочтёт ввод)
  frame({ dt, keys, buttons, dx = 0, dy = 0 }) {
    if (!this.recording) return;
    const f = { dt: Math.round(dt * 1e6) / 1e6 };
    const k = [...keys].sort((a, b) => a - b), b = [...buttons].sort((a, b2) => a - b2);
    if (!same(k, this.lastK)) f.k = this.lastK = k;
    if (!same(b, this.lastB)) f.b = this.lastB = b;
    if (this.events.length) f.e = this.events.splice(0);
    if (dx || dy) f.m = [dx, dy];
    this.frames.push(f);
    this.time += dt;
    if (this.frames.length >= MAX_FRAMES) this.stop();
  }

  stop() {
    if (this.recording) this.restoreRandom?.();
    this.recording = false;
    return { version: REPLAY_VERSION, seed: this.seed, meta: this.meta, frames: this.frames };
  }
}

// Повтор: кадр за кадром выставляет ввод движку. apply(engine, i) — перед tick кадра i
export class ReplayPlayer {
  constructor(data) {
    if (data?.version !== REPLAY_VERSION) throw new Error(`replay: версия ${data?.version}, нужна ${REPLAY_VERSION}`);
    this.data = data;
    this.index = 0;
    this.keys = [];
    this.buttons = [];
  }

  get done() {
    return this.index >= this.data.frames.length;
  }

  start() {
    this.restoreRandom = seedRandom(this.data.seed);
  }

  stop() {
    this.restoreRandom?.();
  }

  // Выставить ввод кадра движку; вернёт dt кадра
  apply(engine) {
    const f = this.data.frames[this.index++];
    if (f.k) this.keys = f.k;
    if (f.b) this.buttons = f.b;
    engine.input.keys = new Set(this.keys);
    engine.input.buttons = new Set(this.buttons);
    for (const [type, code] of f.e || []) {
      if (type === "k") {
        engine.input.keys.add(code);
        engine.press({ scancode: code });
      } else {
        engine.input.buttons.add(code);
        engine.press({ button: code });
      }
    }
    engine.mouse.captured = true;
    engine.mouse.dx = f.m?.[0] || 0;
    engine.mouse.dy = f.m?.[1] || 0;
    return f.dt;
  }
}
