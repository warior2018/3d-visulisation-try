// ============================================================
//  Туман войны — что игрок уже разведал. Карта мира сначала тёмная: клетки (столбики блоков) вокруг
//  игрока в радиусе radius открываются и запоминаются навсегда. На карте (engine/ui/minimap.js, параметр fog):
//    не разведано — темно; разведано, но далеко от игрока — серым (как запомнилось); рядом — в цвете.
//
//    const fog = new FogOfWar({ radius: 15 });
//    fog.reveal(player.position);          // каждый кадр (считает, только когда игрок перешёл в другую клетку)
//    fog.explored(x, z)                    // разведана ли клетка
//    fog.visible(x, z)                     // видна ли сейчас (в радиусе от игрока)
//    save: fog.toJSON()   load: fog.load(data)
//
//  Хранение — кусками 16×16 клеток по 256 бит (32 байта): большой мир занимает мало, в сохранении — base64.
// ============================================================

const SIZE = 16;

export class FogOfWar {
  constructor({ radius = 15 } = {}) {
    this.radius = radius;
    this.chunks = new Map(); // "cx,cz" → Uint8Array(32)
    this.center = null; //      где игрок (для visible)
    this.lastCell = null; //    клетка прошлого reveal — не пересчитывать, пока стоим
  }

  // Кусок 16×16, где лежит клетка (x, z). Последний найденный запоминаем: миникарта и карта спрашивают клетки
  // подряд, почти всегда из того же куска — без новой строки-ключа на каждую клетку (мусор для сборщика)
  chunkAt(cx, cz, create) {
    const last = this.lastChunk;
    if (last && last.cx === cx && last.cz === cz && last.c) return last.c;
    const key = cx + "," + cz;
    let c = this.chunks.get(key);
    if (!c && create) {
      c = new Uint8Array((SIZE * SIZE) / 8);
      this.chunks.set(key, c);
    }
    if (c) this.lastChunk = { cx, cz, c };
    return c || null;
  }

  bit(x, z, create) {
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
    const key = cx + "," + cz;
    let c = this.chunks.get(key);
    if (!c) {
      if (!create) return null;
      c = new Uint8Array((SIZE * SIZE) / 8);
      this.chunks.set(key, c);
    }
    const i = (x - cx * SIZE) * SIZE + (z - cz * SIZE);
    return { c, byte: i >> 3, mask: 1 << (i & 7) };
  }

  explored(x, z) {
    x = Math.floor(x);
    z = Math.floor(z);
    const cx = Math.floor(x / SIZE), cz = Math.floor(z / SIZE);
    const c = this.chunkAt(cx, cz, false);
    if (!c) return false;
    const i = (x - cx * SIZE) * SIZE + (z - cz * SIZE);
    return (c[i >> 3] & (1 << (i & 7))) !== 0;
  }

  // Видна ли клетка прямо сейчас (в радиусе от того места, где игрок был в последнем reveal)
  visible(x, z) {
    if (!this.center) return false;
    const dx = Math.floor(x) + 0.5 - this.center.x, dz = Math.floor(z) + 0.5 - this.center.z;
    return dx * dx + dz * dz <= this.radius * this.radius;
  }

  reveal(pos) {
    this.center = { x: pos.x, z: pos.z };
    const px = Math.floor(pos.x), pz = Math.floor(pos.z);
    if (this.lastCell && this.lastCell.x === px && this.lastCell.z === pz) return;
    this.lastCell = { x: px, z: pz };
    const r = this.radius;
    for (let x = px - r; x <= px + r; x++) {
      for (let z = pz - r; z <= pz + r; z++) {
        const dx = x + 0.5 - pos.x, dz = z + 0.5 - pos.z;
        if (dx * dx + dz * dz > r * r) continue;
        const b = this.bit(x, z, true);
        b.c[b.byte] |= b.mask;
      }
    }
  }

  clear() {
    this.chunks.clear();
    this.lastCell = null;
    this.lastChunk = null;
  }

  toJSON() {
    const chunks = {};
    for (const [k, c] of this.chunks) chunks[k] = Buffer.from(c).toString("base64");
    return { size: SIZE, chunks };
  }

  load(data) {
    this.clear();
    if (!data || data.size !== SIZE || typeof data.chunks !== "object") return; // чужой формат — начинаем заново
    for (const [k, s] of Object.entries(data.chunks)) {
      const buf = Buffer.from(String(s), "base64");
      if (buf.length === (SIZE * SIZE) / 8) this.chunks.set(k, new Uint8Array(buf));
    }
  }
}
