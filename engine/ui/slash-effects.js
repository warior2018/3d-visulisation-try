// ============================================================
//  След удара («слэш») — возможность движка. Рисует прямо по хитбоксу удара:
//  сектор шириной arc градусов и длиной reach перед атакующим. След пробегает
//  от одного края сектора к другому (sweep секунд) и гаснет (life секунд).
//  Высота меняется по ходу — получается диагональный разрез.
//  pitch / roll — наклон и крен взгляда: сектор лежит в плоскости камеры (смотришь вниз — и разрез
//  наклоняется вниз, на экране остаётся там же). Без них — горизонтально, как раньше.
//
//    const slashes = new SlashEffects();
//    slashes.add({ origin: eye, yaw, pitch, arc: 120, reach: 3, from: -0.4, to: 0.5, dir: 1 });
//    //   from / to — высота (м, по «вверх» камеры) относительно origin в начале и в конце; dir: 1 — слева направо, -1 — справа налево
//    //   straight: true — след ложится на экране ПРЯМОЙ линией (а не дугой): высота точки растёт
//    //   вместе с её глубиной, и на экране они встают в линию (from/to — наклон этой линии)
//    //   corner: [x, y, z] — след «вылетает» из этой точки у самой камеры (м: вправо, вверх, вперёд от origin;
//    //   например [-0.45, -0.38, 0.32] — из левого нижнего угла экрана): первую долю пробега cornerSpan
//    //   кончик идёт от угла к сектору, дальше — по сектору. Для вида от 1-го лица; хитбокс это не меняет
//    slashes.update(dt);
//    slashes.draw(ui, camera);   // в интерфейсе, точки мира переводятся в пиксели (camera.toScreen)
// ============================================================

import { viewBasis, toWorld } from "../math/basis.js";

export class SlashEffects {
  constructor({ life = 0.32, sweep = 0.11, bands = 6, steps = 64 } = {}) {
    this.life = life; //   сколько живёт след
    this.sweep = sweep; // за сколько пробегает от края до края
    this.bands = bands; // сколько полос по глубине (от inner до reach) — толщина следа
    this.steps = steps; // сколько точек по дуге
    this.list = [];
  }

  get active() {
    return this.list.length > 0;
  }

  // origin — откуда (обычно глаза), yaw — куда смотрит атакующий (вперёд = (sin yaw, cos yaw)),
  // inner — с какого расстояния начинается след (доля reach),
  // delay — через сколько секунд след начнётся (подогнать под анимацию), sweep — свой темп пробега
  add({ origin, yaw, pitch = 0, roll = 0, arc = 120, reach = 3, inner = 0.7, from = 0, to = 0, dir = 1, color = [255, 255, 255], delay = 0, sweep = this.sweep, straight = false, corner = null, cornerSpan = 0.5 }) {
    this.list.push({ x: origin.x, y: origin.y, z: origin.z, yaw, basis: viewBasis(yaw, pitch, roll), arc: (arc * Math.PI) / 180, reach, inner, from, to, dir, color, age: -delay, sweep, straight, corner, cornerSpan });
  }

  update(dt) {
    for (const s of this.list) s.age += dt;
    this.list = this.list.filter((s) => s.age < s.sweep + this.life);
  }

  draw(ui, camera) {
    for (const s of this.list) {
      if (s.age < 0) continue; //                        ещё не начался (delay)
      const head = Math.min(1, s.age / s.sweep); //      докуда добежал передний край (0…1 по дуге)
      const fade = Math.min(1, 1 - (s.age - s.sweep) / this.life); // гаснет, когда пробежал
      for (let b = 0; b < this.bands; b++) {
        const k = b / (this.bands - 1); //                  0 — внутренняя полоса, 1 — внешняя (по краю хитбокса)
        const r = s.reach * (s.inner + (1 - s.inner) * k);
        const bandAlpha = 0.35 + 0.65 * k; //                 внешний край ярче
        // Точки дуги на экране; между соседними — сплошная линия из квадратиков (без дырок)
        let prev = null;
        for (let i = 0; i <= this.steps; i++) {
          const u = Math.min(i / this.steps, head); //         место на дуге: 0 — начало удара, 1 — конец
          const trail = Math.max(0, 1 - (head - u) * 1.6); //  ближе к переднему краю — ярче (хвост гаснет)
          const side = s.dir > 0 ? u - 0.5 : 0.5 - u; //       −0.5 — левый край сектора, 0.5 — правый
          const a = side * s.arc; //                          угол от «вперёд» в плоскости взгляда
          // straight — высота ∝ глубине (cos угла от «вперёд»): на экране — прямая
          const h = (s.from + (s.to - s.from) * u) * (s.straight ? Math.max(0.15, Math.cos(side * s.arc)) : 1);
          let lx = Math.sin(a) * r, ly = h, lz = Math.cos(a) * r;
          if (s.corner && u < s.cornerSpan) {
            // от угла камеры — к сектору (плавно); полосы веером расходятся из одной точки
            const t = u / s.cornerSpan, w = t * t * (3 - 2 * t);
            lx = s.corner[0] + (lx - s.corner[0]) * w;
            ly = s.corner[1] + (ly - s.corner[1]) * w;
            lz = s.corner[2] + (lz - s.corner[2]) * w;
          }
          const p = toWorld(s, s.basis, lx, ly, lz);
          const q = camera.toScreen(p, ui.width, ui.height);
          const alpha = Math.round(255 * fade * bandAlpha * trail);
          if (q && prev && alpha >= 8) {
            const size = Math.max(3, Math.min(16, Math.round(16 / q.depth))); // ближе — толще
            const n = Math.max(1, Math.ceil(Math.hypot(q.x - prev.x, q.y - prev.y) / (size * 0.5)));
            for (let t = 0; t < n; t++) {
              const x = prev.x + ((q.x - prev.x) * t) / n;
              const y = prev.y + ((q.y - prev.y) * t) / n;
              ui.rect(Math.round(x - size / 2), Math.round(y - size / 2), size, size, s.color, alpha);
            }
          }
          prev = q;
          if (u >= head) break;
        }
      }
    }
  }
}
