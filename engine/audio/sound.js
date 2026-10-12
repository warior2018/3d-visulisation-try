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
//  СМЕШИВАНИЕ. Звуки накладываются, а не перебивают друг друга: при новом звуке берём
//  то, что ещё не проиграно (хвост очереди), подмешиваем новый и отдаём заново.
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

export class Sound {
  // hearing: refDistance — до этого расстояния в полную силу; maxDistance — дальше не слышно;
  // rolloff — как быстро затихает (1 — естественно: вдвое дальше — примерно вдвое тише)
  constructor({ refDistance = 3, maxDistance = 45, rolloff = 1 } = {}) {
    this.volume = 1; // 0..1
    this.hearing = { refDistance, maxDistance, rolloff };
    this.listener = null; // { x, y, z, yaw } — где «уши» (обычно глаза героя)
    this.tail = new Float32Array(0); // что последнее отдали в очередь (стерео: L, R, L, R...)
    this.sounds = { click: tone(1400, 1100, 35, 6) }; // щелчок кнопок интерфейса — свой у движка
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

  // Добавить звук (массив чисел -1..1) под именем
  define(name, samples) {
    this.sounds[name] = samples;
  }

  // Несколько сразу: { place: tone(...), remove: tone(...) }
  defineAll(map) {
    for (const [name, samples] of Object.entries(map)) this.define(name, samples);
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
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

  // Проиграть. at — точка мира (объёмный звук), volume — своя громкость звука
  play(name, { at = null, volume = 1 } = {}) {
    const samples = this.sounds[name];
    if (!this.device || !samples || this.volume === 0) return;
    const { gain, pan } = this.spatial(at);
    const g = gain * volume * this.volume;
    if (g < 0.01) return; // слишком далеко — не тратим время
    // Равномощная панорама: в центре оба канала по ~0.7, сбоку — один громче
    const angle = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(angle) * Math.SQRT2 * g;
    const gr = Math.sin(angle) * Math.SQRT2 * g;

    // Хвост: что из прошлых звуков ещё не проиграно (в очереди устройства)
    const queuedFrames = Math.floor((this.device.queued() || 0) / 8); // 2 канала × 4 байта
    const tailFrames = Math.min(queuedFrames, this.tail.length / 2);
    const frames = Math.max(tailFrames, samples.length);
    const out = new Float32Array(frames * 2);
    out.set(this.tail.subarray(this.tail.length - tailFrames * 2));
    for (let i = 0; i < samples.length; i++) {
      out[i * 2] = Math.max(-1, Math.min(1, out[i * 2] + samples[i] * gl));
      out[i * 2 + 1] = Math.max(-1, Math.min(1, out[i * 2 + 1] + samples[i] * gr));
    }
    this.device.clear(); // старая очередь — заменяем смешанной
    this.device.put(Buffer.from(out.buffer));
    this.tail = out;
  }

  close() {
    if (this.device) this.device.close();
  }
}
