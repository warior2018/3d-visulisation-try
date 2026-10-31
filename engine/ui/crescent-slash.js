// ============================================================
//  Разрез-серп в мире — возможность движка. Пиксельный (крупными клетками) белый серп с голубой каймой
//  лежит ВДОЛЬ пореза и ПЛОСКО — в плоскости пореза (горизонтально перед атакующим, чуть ниже глаз), слева
//  направо (dir: -1 — справа налево); тонкий кончик в начале, к концу шире и загибается крючком к атакующему,
//  на внутренней стороне — зазубрины (как росчерк клинка в аниме). Появляется сразу целиком и гаснет
//  (reveal > 0 — прорисовка от кончика к хвосту за эту долю жизни).
//  Это точки мира (в осях взгляда атакующего) → экран камеры: от 1-го лица серп поперёк экрана, от 3-го —
//  виден вокруг героя, с перспективой.
//
//    const cuts = new CrescentSlash();
//    cuts.add({ anchor: () => hero.eye, yaw, pitch, dir: 1 }); // anchor — откуда (едет вместе с героем)
//    cuts.update(dt); cuts.draw(ui, camera);
//
//  add({ anchor, yaw, pitch, dir, life, reveal, size, color, edge }): size — масштаб формы (1 — ~2.2 м в ширину)
// ============================================================

import { viewBasis, toWorld } from "../math/basis.js";

// Форма в осях взгляда (м): x — вправо, y — вверх, z — вперёд; t — от кончика (0) к хвосту (1)
function along(t) {
  const x = -1.1 + 2.2 * t;
  let z = 1.25 + 0.55 * Math.sin(Math.PI * Math.min(t, 0.85) / 0.85 * 0.5); // дуга выгибается вперёд
  const y = -0.3; //                                                          плоско, чуть ниже глаз
  if (t > 0.82) {
    const h = (t - 0.82) / 0.18; //                                           крючок — к атакующему
    z -= 0.7 * h * h;
  }
  return [x, y, z];
}
// Ширина (м, в плоскости пореза — вперёд): тонкий кончик → шире к хвосту → сходит на нет в крючке
const thick = (t) => 0.42 * (t < 0.8 ? Math.pow(t / 0.8, 1.4) : Math.max(0, (1 - t) / 0.2) ** 0.7);
// Зазубрины на внутренней стороне: где, длина (м), толщина у основания (м)
const SPIKES = [{ t: 0.45, len: 0.45, w: 0.14 }, { t: 0.62, len: 0.38, w: 0.12 }, { t: 0.78, len: 0.28, w: 0.1 }];

export class CrescentSlash {
  constructor() {
    this.list = [];
  }

  get active() {
    return this.list.length > 0;
  }

  add({ anchor, yaw = 0, pitch = 0, dir = 1, life = 0.22, reveal = 0, size = 1, color = [255, 255, 255], edge = [150, 220, 255] }) {
    this.list.push({ anchor: typeof anchor === "function" ? anchor : () => anchor, basis: viewBasis(yaw, pitch, 0), dir, life, reveal, size, color, edge, age: 0 });
  }

  update(dt) {
    for (const c of this.list) c.age += dt;
    this.list = this.list.filter((c) => c.age < c.life);
  }

  draw(ui, camera) {
    const cell = Math.max(4, Math.round(Math.min(ui.width, ui.height) / 150)); // пиксельно: крупные клетки
    for (const c of this.list) {
      const k = c.age / c.life;
      const shown = c.reveal > 0 ? Math.min(1, k / c.reveal) : 1; //                    сразу или от кончика к хвосту
      const fade = k < c.reveal ? 1 : 1 - (k - c.reveal) / (1 - c.reveal);
      const a = Math.round(255 * Math.max(0, fade));
      if (a < 8) continue;
      const o = c.anchor();
      const s = c.size;
      const at = (x, y, z) => toWorld(o, c.basis, x * c.dir * s, y * s, z * s);
      const cells = new Map(); // "cx,cy" → core
      // Круг радиуса (м) r в точке мира p, лежащий в плоскости пореза → клетки экрана (с каймой в одну клетку).
      // Плоский: ширина на экране — как видна полоса «вперёд» в перспективе (сверху — шире, сбоку — тоньше)
      const stamp = (p, r) => {
        const q = camera.toScreen(p, ui.width, ui.height);
        if (!q) return;
        const f = c.basis.forward, rt = c.basis.right;
        const qf = camera.toScreen({ x: p.x + f.x * r, y: p.y + f.y * r, z: p.z + f.z * r }, ui.width, ui.height);
        const qr = camera.toScreen({ x: p.x + rt.x * r, y: p.y + rt.y * r, z: p.z + rt.z * r }, ui.width, ui.height);
        const R = Math.max(qf ? Math.hypot(qf.x - q.x, qf.y - q.y) : 0, qr ? Math.hypot(qr.x - q.x, qr.y - q.y) * 0.25 : 0);
        const x0 = Math.floor((q.x - R - cell) / cell), x1 = Math.floor((q.x + R + cell) / cell);
        const y0 = Math.floor((q.y - R - cell) / cell), y1 = Math.floor((q.y + R + cell) / cell);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const d = Math.hypot((cx + 0.5) * cell - q.x, (cy + 0.5) * cell - q.y);
            if (d > R + cell) continue;
            const key = cx + "," + cy;
            if (d <= R) cells.set(key, true);
            else if (!cells.has(key)) cells.set(key, false);
          }
        }
      };
      const N = 90;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        if (t > shown) break;
        const [x, y, z] = along(t);
        stamp(at(x, y, z), thick(t) / 2);
      }
      // Зазубрины: назад по ходу пореза и вверх (внутренняя сторона дуги)
      for (const sp of SPIKES) {
        if (sp.t > shown) continue;
        const [x0, y0, z0] = along(sp.t);
        const [x1, , z1] = along(sp.t - 0.02);
        let tx = x1 - x0, tz = z1 - z0;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        // внутрь дуги — к атакующему (−вперёд) и назад по ходу; в той же плоскости
        const dx = tx * 0.75, dz = tz * 0.75 - 0.65;
        for (let j = 0; j <= 8; j++) {
          const f = j / 8;
          stamp(at(x0 + dx * sp.len * f, y0, z0 - thick(sp.t) * 0.3 + dz * sp.len * f), (sp.w * (1 - f)) / 2);
        }
      }
      for (const [key, core] of cells) {
        const [cx, cy] = key.split(",").map(Number);
        ui.rect(cx * cell, cy * cell, cell, cell, core ? c.color : c.edge, core ? a : Math.round(a * 0.8));
      }
    }
  }
}
