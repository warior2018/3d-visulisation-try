// ============================================================
//  Звук мира (движок: engine/audio/sound.js):
//   - музыка: спокойно / бой (враг охотится на героя рядом) / нашествие — плавная смена (sound.music);
//   - стены глушат: между ушами и источником твёрдые блоки — звук глуше и тише (muffle);
//   - эхо: вокруг ушей тесно и сверху крыша (пещера, комната) — отражения (echo).
// ============================================================

import { MUSIC_STATE } from "../config.js";

export class AudioPart {
  // Каждый тик: раз в MUSIC_STATE.every с — какой трек и сколько эха вокруг
  updateAudio(dt) {
    this.audioIn = (this.audioIn ?? 0) - dt;
    if (this.audioIn > 0) return;
    this.audioIn = MUSIC_STATE.every;
    const p = this.player, S = MUSIC_STATE;
    const now = performance.now() / 1000;
    const fight = p.alive && this.entities.list.some((e) => e.kind === "mob" && e.alive && e.aggro === p
      && Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) < S.fightRadius);
    if (fight) this.fightUntil = now + S.fightHold;
    const track = this.invasion?.active ? "invasion" : now < (this.fightUntil || 0) ? "battle" : "calm";
    this.engine.sound.music(track, { fade: S.fade });
    this.echoNow = this.listenerEcho();
  }

  // Эхо у ушей: лучи во все стороны (и вверх); упираются близко и над головой крыша — тесно → эхо 0..1
  listenerEcho() {
    const o = this.look?.position;
    if (!o) return 0;
    const W = this.world, R = MUSIC_STATE.echoRange;
    const up = W.raycast(o, { x: 0, y: 1, z: 0 }, R);
    if (!up) return 0; // над головой небо — эха нет
    let hits = 0, near = 0;
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7]];
    for (const [x, y, z] of dirs) {
      const h = W.raycast(o, { x, y, z }, R);
      if (h) { hits++; near += 1 - h.t / R; }
    }
    return Math.min(1, (hits / dirs.length) * 0.6 + (near / dirs.length) * 0.6);
  }

  // Окружение звука из точки at (движок спрашивает при play): стены между — глуше; эхо — вокруг ушей
  soundEnvironment(at) {
    const echo = this.echoNow || 0;
    const o = this.look?.position;
    if (!at || !o) return echo ? { muffle: 0, echo } : null;
    const dx = at.x - o.x, dy = at.y + 0.5 - o.y, dz = at.z - o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1.5) return echo ? { muffle: 0, echo } : null;
    // сколько твёрдых блоков на прямой (шаг 0.5 м; начало и конец — не в счёт)
    let walls = 0, last = "";
    for (let t = 0.75; t < d - 0.75; t += 0.5) {
      const x = Math.floor(o.x + (dx * t) / d), y = Math.floor(o.y + (dy * t) / d), z = Math.floor(o.z + (dz * t) / d);
      const key = `${x},${y},${z}`;
      if (key !== last && this.world.has(x, y, z)) walls++;
      last = key;
      if (walls >= 3) break;
    }
    return walls || echo ? { muffle: walls / 3, echo } : null;
  }
}
