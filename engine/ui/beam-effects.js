// ============================================================
//  Лучи — возможность движка: светящаяся линия из точки from в точку to (выстрел жезла, лазер,
//  молния). Рисуется в интерфейсе поверх мира: концы переводятся в пиксели (camera.toScreen),
//  между ними — сплошная линия из квадратиков, у ближнего конца толще. Живёт life секунд и гаснет.
//
//    const beams = new BeamEffects();
//    beams.add({ from: hand, to: hitPoint, color: [140, 210, 255], life: 0.18, width: 6 });
//    beams.ring(center, 3, { color: [255, 120, 40], life: 0.05 }); // круг на земле (прицел, предупреждение)
//    beams.mark(point, { color: [20, 20, 20], life: 3, size: 0.05 }); // точка в мире: след пули на блоке
//    beams.update(dt);
//    beams.draw(ui, camera);
// ============================================================

export class BeamEffects {
  constructor() {
    this.list = [];
    this.marks = []; // точки в мире (следы пуль): { at, color, life, size, age }
    // Частицы в 3D (engine/graphics/particles.js): есть — лучи и точки рисуются ими, с глубиной (стены
    // закрывают); нет (видеокарта не смогла) — как раньше, плоско поверх мира
    this.particles = null;
  }

  get active() {
    return this.list.length > 0 || this.marks.length > 0;
  }

  // Точка в мире: квадратик size метров (на экране — меньше вдали), живёт life секунд, в конце гаснет
  mark(at, { color = [20, 20, 20], life = 3, size = 0.05 } = {}) {
    if (this.particles) return this.particles.emit({ at, life, size: Math.max(0.03, size * 3), color, grow: 1, fade: true });
    this.marks.push({ at: { ...at }, color, life, size, age: 0 });
    if (this.marks.length > 200) this.marks.shift(); // не копим бесконечно
  }

  add({ from, to, color = [255, 255, 255], life = 0.2, width = 6, core = [255, 255, 255] }) {
    if (this.particles) {
      // ширина в точках экрана → метры: снаружи цвет луча, внутри — яркая сердцевина
      const size = Math.max(0.025, width * 0.011);
      this.particles.line(from, to, { size, life, color, alpha: 0.75, step: size * 1.6 });
      this.particles.line(from, to, { size: size * 0.5, life, color: core, alpha: 1, step: size * 1.6 });
      return;
    }
    this.list.push({ from: { ...from }, to: { ...to }, color, core, life, width, age: 0 });
  }

  // Круг из лучей в горизонтальной плоскости: центр center, радиус radius, segments отрезков
  ring(center, radius, { color = [255, 255, 255], core = color, life = 0.05, width = 4, segments = 20 } = {}) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2, b = ((i + 1) / segments) * Math.PI * 2;
      this.add({
        from: { x: center.x + Math.sin(a) * radius, y: center.y, z: center.z + Math.cos(a) * radius },
        to: { x: center.x + Math.sin(b) * radius, y: center.y, z: center.z + Math.cos(b) * radius },
        color, core, life, width,
      });
    }
  }

  update(dt) {
    for (const b of this.list) b.age += dt;
    this.list = this.list.filter((b) => b.age < b.life);
    for (const m of this.marks) m.age += dt;
    this.marks = this.marks.filter((m) => m.age < m.life);
  }

  // visible(point) — необязательно: видна ли точка мира из камеры (не за стеной). Лучи рисуются поверх
  // мира, и без этой проверки круги и лучи видно СКВОЗЬ блоки. Проверяем каждую 4-ю точку линии
  // (между ними — тот же ответ): точки за стеной не рисуем
  draw(ui, camera, { visible = null } = {}) {
    for (const m of this.marks) {
      const s = camera.toScreen(m.at, ui.width, ui.height);
      if (!s || (visible && !visible(m.at))) continue;
      const fade = Math.min(1, (m.life - m.age) / 0.5); // последние полсекунды — гаснет
      const size = Math.max(2, Math.min(12, Math.round((m.size * ui.height) / Math.max(0.3, s.depth))));
      ui.rect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), size, size, m.color, Math.round(220 * fade));
    }
    for (const b of this.list) {
      const fade = 1 - b.age / b.life;
      // Конец за камерой не спроецируешь — подтягиваем его к камере, пока не окажется впереди
      const a = this.project(camera, b.from, b.to, ui);
      const c = this.project(camera, b.to, b.from, ui);
      if (!a || !c) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / 3));
      let seen = true;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (visible && (i % 4 === 0 || i === n)) {
          const w = { x: a.world.x + (c.world.x - a.world.x) * t, y: a.world.y + (c.world.y - a.world.y) * t, z: a.world.z + (c.world.z - a.world.z) * t };
          seen = visible(w);
        }
        if (!seen) continue;
        const x = a.x + (c.x - a.x) * t;
        const y = a.y + (c.y - a.y) * t;
        const depth = a.depth + (c.depth - a.depth) * t;
        const size = Math.max(2, Math.min(b.width * 3, Math.round(b.width / Math.max(0.3, depth))));
        ui.rect(Math.round(x - size / 2), Math.round(y - size / 2), size, size, b.color, Math.round(150 * fade));
        const inner = Math.max(1, Math.round(size * 0.4));
        ui.rect(Math.round(x - inner / 2), Math.round(y - inner / 2), inner, inner, b.core, Math.round(230 * fade));
      }
    }
  }

  project(camera, p, other, ui) {
    for (let k = 0; k <= 1; k += 0.1) {
      const q = { x: p.x + (other.x - p.x) * k, y: p.y + (other.y - p.y) * k, z: p.z + (other.z - p.z) * k };
      const s = camera.toScreen(q, ui.width, ui.height);
      if (s) return { ...s, world: q }; // world — какая точка мира спроецирована (для проверки видимости)
    }
    return null;
  }
}
