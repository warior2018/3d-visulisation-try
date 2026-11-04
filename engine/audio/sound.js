// ============================================================
//  Звук. Движок умеет синтезировать и проигрывать звуки, а КАКИЕ звуки есть,
//  решает игра: sound.define("place", tone(220, 110, 110, 5)).
//
//  Готовых звуковых файлов у нас нет, поэтому звуки синтезируем:
//  звук — это просто массив чисел от -1 до 1 (колебания мембраны динамика),
//  48 000 чисел в секунду. Синусоида нужной частоты + плавное затухание.
//
//  ОБЪЁМНЫЙ ЗВУК. Слушатель — герой: sound.setListener(position, yaw) каждый кадр.
//  sound.play("swing", { at: position }) — звук из точки мира:
//   - громкость падает с расстоянием (ближе refDistance — в полную силу, дальше
//     maxDistance — не слышно совсем; это «радиус слышимости»);
//   - панорама: источник справа — громче в правом наушнике, слева — в левом;
//   - сзади — чуть глуше.
//  Без at — звук «в голове» (интерфейс, свои шаги и выстрелы).
//
//  СМЕШИВАНИЕ (микшер). Играющие звуки — «голоса»: у каждого своя позиция. Устройству отдаём смесь
//  на LEAD секунд вперёд (update() каждый кадр доливает). Новый звук должен зазвучать СРАЗУ, а не через
//  LEAD: тогда «отматываем» голоса на то, что ещё не проиграно, чистим очередь и смешиваем заново — уже с ним.
//
//  КАНАЛЫ громкости: effects (по умолчанию), music, voices (голоса существ), ui. setChannels({ music: 0.5 }).
//  МУЗЫКА: defineMusic(name, samples) — петля; music(name) — плавно сменить (crossfade), music(null) — тишина.
//  ОКРУЖЕНИЕ: environment = (at) => ({ muffle 0..1, echo 0..1 }) — игра говорит, глушат ли звук стены
//  (между ушами и точкой) и эхо (пещера, тесная комната). Звук обрабатывается один раз и кэшируется.
// ============================================================

import sdl from "@kmamal/sdl";

const RATE = 48000; // чисел (сэмплов) в секунду

// Короткий звук: частота плавно меняется от f0 до f1 (Гц) за durationMs, громкость затухает
export function tone(f0, f1, durationMs, decay) {
  const n = Math.round((RATE * durationMs) / 1000);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n; // 0..1 — прошедшая доля звука
    const freq = f0 + (f1 - f0) * t;
    phase += (2 * Math.PI * freq) / RATE;
    const envelope = Math.exp(-decay * t) * Math.min(1, i / 48); // мягкое начало, затухание
    out[i] = Math.sin(phase) * envelope * 0.5;
  }
  return out;
}

// Шум (как «ш-ш-ш»): случайные числа. smooth от 0 до 1 срезает высокие частоты —
// чем больше, тем глуше (выстрел, удар). Громкость затухает так же, как у tone.
export function noise(durationMs, decay, smooth = 0.5) {
  const n = Math.round((RATE * durationMs) / 1000);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += (Math.random() * 2 - 1 - y) * (1 - smooth); // простейший фильтр: шаг к новому случайному числу
    out[i] = y * Math.exp((-decay * i) / n) * 0.6;
  }
  return out;
}

// Сложить несколько звуков в один (например, шум выстрела + низкий «бум»)
export function mix(...sounds) {
  const out = new Float32Array(Math.max(...sounds.map((s) => s.length)));
  for (const s of sounds) s.forEach((v, i) => (out[i] += v));
  return out.map((v) => Math.max(-1, Math.min(1, v)));
}

export const LEAD = 0.25; // сколько секунд смеси держим в очереди устройства

// Обработанная копия звука: muffle — глуше (стены: срезаем высокие), echo — эхо (3 отражения)
export function processSamples(src, { muffle = 0, echo = 0 } = {}) {
  let out = src;
  if (muffle > 0) {
    const a = 1 - 0.88 * muffle; // одно-полюсный фильтр: чем меньше a, тем глуше
    out = new Float32Array(src.length);
    let y = 0;
    for (let i = 0; i < src.length; i++) out[i] = y += (src[i] - y) * a;
    const k = 1 - 0.45 * muffle; // сквозь стену ещё и тише
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  if (echo > 0) {
    const taps = [[0.09, 0.45], [0.17, 0.3], [0.28, 0.18]].map(([t, g]) => [Math.round(t * RATE), g * echo]);
    const extra = taps.at(-1)[0];
    const e = new Float32Array(out.length + extra);
    e.set(out);
    for (const [d, g] of taps) for (let i = 0; i < out.length; i++) e[i + d] += out[i] * g;
    for (let i = 0; i < e.length; i++) e[i] = Math.max(-1, Math.min(1, e[i]));
    out = e;
  }
  return out;
}

export class Sound {
  // hearing: refDistance — до этого расстояния в полную силу; maxDistance — дальше не слышно;
  // rolloff — как быстро затихает (1 — естественно: вдвое дальше — примерно вдвое тише).
  // device — своё устройство (тесты): { play, clear, put(buffer), queued() → байт в очереди, close }
  constructor({ refDistance = 3, maxDistance = 45, rolloff = 1, device = undefined } = {}) {
    this.volume = 1; // общая громкость 0..1 (master)
    this.focused = true; // окно в фокусе; нет (Alt+Tab) — тишина, музыка ждёт (setFocused)
    this.channels = { effects: 1, music: 1, voices: 1, ui: 1 };
    this.hearing = { refDistance, maxDistance, rolloff };
    this.listener = null; // { x, y, z, yaw } — где «уши» (обычно глаза героя)
    this.sounds = { click: tone(1400, 1100, 35, 6) }; // щелчок кнопок интерфейса — свой у движка
    this.channelOf = { click: "ui" };
    this.tracks = {}; //  музыка: имя -> сэмплы (петля)
    this.voices = []; //  что играет: { buf, pos, gl, gr, channel, loop, gain, target, rate }
    this.current = null; // имя музыки, что играет (или затихает к ней)
    this.environment = null; // (at) => { muffle, echo } — от игры
    this.processed = new Map(); // кэш обработанных звуков
    if (device !== undefined) {
      this.device = device;
      return;
    }
    try {
      // Стерео, 48 кГц, числа float32; маленький буфер — меньше задержка между кликом и звуком.
      // Библиотека окна бывает двух версий: SDL3 (@kmamal/sdl 1.x) и SDL2 (0.11) — звук открывается по-разному.
      const options = { channels: 2, frequency: RATE, format: "f32", buffered: 512 };
      if (sdl.audio.playback) {
        const stream = sdl.audio.playback.openDevice(null, options); // null — устройство по умолчанию
        this.device = { play: () => stream.play(), clear: () => stream.clear(), put: (b) => stream.putData(b), close: () => stream.close(), queued: () => stream.queued };
      } else {
        const d = sdl.audio.openDevice({ type: "playback" }, options);
        this.device = { play: () => d.play(), clear: () => d.clearQueue(), put: (b) => d.enqueue(b), close: () => d.close(), queued: () => d.queued };
      }
      this.device.play();
    } catch (e) {
      this.device = null; // нет звукового устройства — игра работает молча
      console.warn("Звук недоступен:", e.message);
    }
  }

  // Добавить звук (массив чисел -1..1) под именем; channel — канал громкости (effects / voices / ui)
  define(name, samples, { channel = "effects" } = {}) {
    this.sounds[name] = samples;
    this.channelOf[name] = channel;
  }

  // Несколько сразу: { place: tone(...), remove: tone(...) }
  defineAll(map, opts) {
    for (const [name, samples] of Object.entries(map)) this.define(name, samples, opts);
  }

  defineMusic(name, samples) {
    this.tracks[name] = samples;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Окно в фокусе или нет: без фокуса всё замолкает сразу (очередь устройства чистим), вернулись — играет дальше
  setFocused(on) {
    on = !!on;
    if (this.focused === on) return;
    this.focused = on;
    if (!this.device) return;
    this.rewind(); //       не проигранное — назад голосам
    if (on) this.refill(true);
  }

  // Громкость каналов: { effects, music, voices, ui } (0..1)
  setChannels(map) {
    for (const [k, v] of Object.entries(map)) this.channels[k] = Math.max(0, Math.min(1, Number(v) || 0));
  }

  // Где «уши»: позиция и поворот (yaw, как у камеры)
  setListener(position, yaw) {
    this.listener = { x: position.x, y: position.y, z: position.z, yaw };
  }

  // Громкость и панорама для звука из точки at: { gain 0..1, pan -1 (слева)..1 (справа) }
  spatial(at) {
    const l = this.listener;
    if (!at || !l) return { gain: 1, pan: 0 };
    const dx = at.x - l.x;
    const dy = at.y - l.y;
    const dz = at.z - l.z;
    const dist = Math.hypot(dx, dy, dz);
    const { refDistance: ref, maxDistance: max, rolloff } = this.hearing;
    if (dist >= max) return { gain: 0, pan: 0 };
    // Затухание: ближе ref — 1; дальше — как 1/расстояние; у края слышимости плавно до нуля
    let gain = dist <= ref ? 1 : ref / (ref + rolloff * (dist - ref));
    gain *= 1 - Math.pow(dist / max, 4);
    // Панорама: насколько источник справа (вектор «вправо» камеры: cos yaw, 0, -sin yaw)
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-3) return { gain, pan: 0 };
    const right = (dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw)) / flat;
    const front = (dx * Math.sin(l.yaw) + dz * Math.cos(l.yaw)) / flat;
    if (front < 0) gain *= 1 + 0.25 * front; // сзади — до 25 % тише
    return { gain, pan: right * Math.min(1, flat / ref) }; // совсем рядом — почти по центру
  }

  // Звук с окружением: стены глушат, пещера — эхо (кэш по ступеням 0 / ⅓ / ⅔ / 1)
  shaped(name, env) {
    const q = (v) => Math.round(Math.max(0, Math.min(1, v || 0)) * 3) / 3;
    const muffle = q(env?.muffle), echo = q(env?.echo);
    const src = this.sounds[name];
    if (!muffle && !echo) return src;
    const key = `${name}|${muffle}|${echo}`;
    if (!this.processed.has(key)) this.processed.set(key, processSamples(src, { muffle, echo }));
    return this.processed.get(key);
  }

  // Проиграть. at — точка мира (объёмный звук), volume — своя громкость звука, channel — канал (иначе — как
  // при define). env — окружение (иначе спросим environment(at), если игра его дала)
  play(name, { at = null, volume = 1, channel = null, env = undefined } = {}) {
    if (!this.device || !this.sounds[name] || this.volume === 0 || !this.focused) return;
    const ch = channel || this.channelOf[name] || "effects";
    const { gain, pan } = this.spatial(at);
    const g = gain * volume;
    if (g * this.volume * (this.channels[ch] ?? 1) < 0.01) return; // слишком далеко или канал выключен
    const e = env !== undefined ? env : this.environment?.(at) || null;
    const buf = this.shaped(name, e);
    // Равномощная панорама: в центре оба канала по ~0.7, сбоку — один громче
    const angle = ((pan + 1) * Math.PI) / 4;
    this.rewind();
    this.voices.push({ buf, pos: 0, gl: Math.cos(angle) * Math.SQRT2 * g, gr: Math.sin(angle) * Math.SQRT2 * g, channel: ch, loop: false, gain: 1, target: 1, rate: 0 });
    this.refill(true);
  }

  // Музыка: плавно (fade с) перейти на трек name; null — затихнуть. Тот же трек — ничего
  music(name, { fade = 2 } = {}) {
    if (name === this.current) return;
    this.current = name;
    const step = 1 / Math.max(0.05, fade) / RATE; // на сколько меняется громкость за сэмпл
    for (const v of this.voices) if (v.channel === "music") { v.target = 0; v.rate = step; }
    const buf = name && this.tracks[name];
    if (!buf || !this.device) return;
    this.rewind();
    this.voices.push({ buf, pos: 0, gl: 1, gr: 1, channel: "music", loop: true, gain: 0, target: 1, rate: step, name });
    this.refill(true);
  }

  // Каждый кадр: долить смесь в очередь (музыка и длинные звуки не кончаются на полуслове)
  update() {
    if (this.device && this.voices.length && this.focused) this.refill(false);
  }

  queuedFrames() {
    return Math.floor((Number(this.device?.queued?.()) || 0) / 8); // 2 канала × 4 байта
  }

  // То, что лежит в очереди, но ещё не прозвучало, — «вернуть» голосам (их позиции назад), очередь — очистить
  rewind() {
    const q = this.queuedFrames();
    if (!q) return;
    for (const v of this.voices) {
      v.pos -= q;
      if (v.loop && v.pos < 0) v.pos = ((v.pos % v.buf.length) + v.buf.length) % v.buf.length;
      if (v.rate) v.gain = Math.max(0, Math.min(1, v.gain - Math.sign(v.target - v.gain) * v.rate * q)); // и затухание назад
    }
    this.device.clear();
  }

  // Смешать и отдать, чтобы в очереди было не меньше LEAD с (force — после rewind: с нуля)
  refill(force) {
    if (!this.focused) return; // окно не в фокусе — устройству ничего не даём (тишина)
    const want = Math.round(LEAD * RATE);
    const have = force ? 0 : this.queuedFrames();
    if (have >= want / 2 && !force) return;
    const n = want - have;
    const out = this.render(n);
    if (out) this.device.put(Buffer.from(out.buffer));
  }

  // Смесь всех голосов на n кадров вперёд (стерео L, R, L, R...); голоса сдвигаются на n
  render(n) {
    const out = new Float32Array(n * 2);
    const master = this.volume;
    for (const v of this.voices) {
      const chGain = master * (this.channels[v.channel] ?? 1);
      const len = v.buf.length;
      for (let i = 0; i < n; i++) {
        let idx = v.pos + i;
        if (idx < 0) continue;
        if (idx >= len) {
          if (!v.loop) break;
          idx %= len;
        }
        if (v.rate && v.gain !== v.target) v.gain = v.gain < v.target ? Math.min(v.target, v.gain + v.rate) : Math.max(v.target, v.gain - v.rate);
        const s = v.buf[idx] * v.gain * chGain;
        out[i * 2] += s * v.gl;
        out[i * 2 + 1] += s * v.gr;
      }
      v.pos += n;
      if (v.loop) v.pos %= len;
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    // Отыгравшие (с запасом на «отмотку» — их хвост может быть ещё в очереди) и затихшую музыку — убираем
    const keep = Math.round(LEAD * RATE) * 2;
    this.voices = this.voices.filter((v) => (v.loop ? !(v.target === 0 && v.gain === 0) : v.pos < v.buf.length + keep));
    return out;
  }

  close() {
    if (this.device) this.device.close();
  }
}

// WAV (PCM 16 бит или float 32, моно/стерео) → моно Float32Array на 48 кГц (свою музыку можно положить файлом)
export function decodeWAV(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= u8.length;) {
    const id = tag(o), size = dv.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { format: dv.getUint16(o + 8, true), channels: dv.getUint16(o + 10, true), rate: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
    if (id === "data") data = { start: o + 8, size };
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error("WAV without fmt/data");
  const bytes = fmt.bits / 8, frames = Math.floor(data.size / (bytes * fmt.channels));
  const read = (i, c) => {
    const o = data.start + (i * fmt.channels + c) * bytes;
    return fmt.format === 3 ? dv.getFloat32(o, true) : fmt.bits === 16 ? dv.getInt16(o, true) / 32768 : (u8[o] - 128) / 128;
  };
  const k = fmt.rate / RATE, n = Math.floor(frames / k);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const src = Math.min(frames - 1, Math.floor(i * k));
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += read(src, c);
    out[i] = sum / fmt.channels;
  }
  return out;
}
