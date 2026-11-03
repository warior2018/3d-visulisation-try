// ============================================================
//  Музыка «Стройки»: синтезируется при запуске (файлов нет) — петли по 8 тактов.
//    calm     — мир спокоен (и главное меню): медленные аккорды и мягкое арпеджио
//    battle   — рядом враг охотится на героя: бас восьмыми, бочка и малый
//    invasion — нашествие: быстрее, бочка на каждую долю, тяжёлый бас
//  Свой трек — WAV-файлом в assets/music/<имя>.wav (заменит синтезированный).
//  Какой играет — решает игра (game-scene.js → updateMusic), движок плавно сменяет (sound.music).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeWAV } from "../../engine/index.js";

const RATE = 48000;
const DIR = fileURLToPath(new URL("./assets/music/", import.meta.url));
const NOTE = { C: -9, "C#": -8, D: -7, Eb: -6, E: -5, F: -4, "F#": -3, G: -2, Ab: -1, A: 0, Bb: 1, B: 2 };
// аккорд: корень и минор/мажор → три ноты
const chord = (root, minor, oct = 3) => {
  const r = NOTE[root] + (oct - 4) * 12;
  return [r, r + (minor ? 3 : 4), r + 7].map((n) => 440 * 2 ** (n / 12));
};

// Нота в буфер: wave — sine / tri / square / saw; attack и decay — с; release — хвост
function note(buf, t0, dur, f, { wave = "sine", vol = 0.2, attack = 0.01, decay = 0, detune = 0 } = {}) {
  const i0 = Math.floor(t0 * RATE), n = Math.floor(dur * RATE);
  let ph = 0;
  const step = (f * (1 + detune)) / RATE;
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    ph = (ph + step) % 1;
    const w = wave === "sine" ? Math.sin(ph * 2 * Math.PI) : wave === "tri" ? 1 - 4 * Math.abs(ph - 0.5) : wave === "square" ? (ph < 0.5 ? 0.6 : -0.6) : 2 * ph - 1;
    const t = i / RATE;
    let env = Math.min(1, t / attack);
    if (decay) env *= Math.exp(-t / decay);
    env *= Math.min(1, (n - i) / (0.02 * RATE)); // без щелчка в конце
    buf[i0 + i] += w * env * vol;
  }
}

function kick(buf, t0, vol = 0.5) {
  const i0 = Math.floor(t0 * RATE), n = Math.floor(0.28 * RATE);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const t = i / RATE;
    ph += (2 * Math.PI * (45 + 110 * Math.exp(-t * 30))) / RATE;
    buf[i0 + i] += Math.sin(ph) * Math.exp(-t * 9) * vol;
  }
}

function hiss(buf, t0, dur, vol, smooth) {
  const i0 = Math.floor(t0 * RATE), n = Math.floor(dur * RATE);
  let y = 0;
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    y += (Math.random() * 2 - 1 - y) * (1 - smooth);
    buf[i0 + i] += y * Math.exp((-6 * i) / n) * vol;
  }
}

// Трек: bpm, аккорды на такт (по 4 доли), что играть
function track({ bpm, chords, bars = 8, pad = 0, bass = 0, bassEvery = 1, arp = 0, arpEvery = 0.5, drums = null, bassWave = "tri" }) {
  const beat = 60 / bpm, len = bars * 4 * beat;
  const buf = new Float32Array(Math.ceil(len * RATE));
  for (let bar = 0; bar < bars; bar++) {
    const [root, minor] = chords[bar % chords.length];
    const notes = chord(root, minor);
    const t = bar * 4 * beat;
    if (pad) for (const f of notes) for (const d of [-0.004, 0.004]) note(buf, t, 4 * beat, f, { wave: "tri", vol: pad, attack: 0.6, detune: d });
    if (bass) for (let b = 0; b < 4; b += bassEvery) note(buf, t + b * beat, bassEvery * beat * 0.9, notes[0] / 2, { wave: bassWave, vol: bass, decay: bassEvery * beat * 0.8 });
    if (arp) {
      const seq = [notes[0] * 2, notes[1] * 2, notes[2] * 2, notes[1] * 2];
      for (let k = 0, b = 0; b < 4; b += arpEvery, k++) note(buf, t + b * beat, arpEvery * beat, seq[k % seq.length], { wave: "square", vol: arp, decay: 0.12 });
    }
    if (drums) for (let b = 0; b < 4; b += 0.5) {
      const at = t + b * beat, on = b % 1 === 0;
      if (on && (drums.four || b % 2 === 0)) kick(buf, at, drums.kick);
      if (on && b % 2 === 1) hiss(buf, at, 0.18, drums.snare, 0.35);
      hiss(buf, at, 0.05, drums.hat, 0.05);
    }
  }
  // мягко ограничить (сумма нот может выйти за 1)
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0.9 ? 0.9 / peak : 1;
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * k * 1.2) / 1.2;
  return buf;
}

export const MUSIC = {
  calm: () => track({ bpm: 72, chords: [["A", 1], ["F", 0], ["C", 0], ["G", 0]], pad: 0.05, arp: 0.035, arpEvery: 1, bass: 0.12, bassEvery: 2 }),
  battle: () => track({ bpm: 120, chords: [["A", 1], ["G", 0], ["F", 0], ["E", 0]], pad: 0.03, bass: 0.16, bassEvery: 0.5, arp: 0.03, arpEvery: 0.25, drums: { kick: 0.4, snare: 0.18, hat: 0.04 } }),
  invasion: () => track({ bpm: 140, chords: [["D", 1], ["Bb", 0], ["C", 0], ["A", 0]], pad: 0.035, bass: 0.17, bassEvery: 0.5, bassWave: "saw", arp: 0.03, arpEvery: 0.25, drums: { kick: 0.5, snare: 0.22, hat: 0.05, four: true } }),
};

// Загрузить треки в звук движка: свой WAV (assets/music/<имя>.wav) или синтезированный
export function loadMusic(sound) {
  for (const [name, make] of Object.entries(MUSIC)) {
    let samples = null;
    try {
      const f = path.join(DIR, `${name}.wav`);
      if (fs.existsSync(f)) samples = decodeWAV(fs.readFileSync(f));
    } catch (e) {
      console.warn(`Музыка ${name}.wav не прочиталась:`, e.message);
    }
    sound.defineMusic(name, samples || make());
  }
}

