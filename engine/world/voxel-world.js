// ============================================================
//  Мир из кубиков 1×1×1 — возможность движка. Игра решает, нужен ли он ей
//  и какие в нём бывают блоки (цвета, палитра — это уже игра).
//
//  Клетка (x, y, z) занимает пространство от x до x+1 и т. д.
//  Блоки хранятся в Map по ключу "x,y,z" — так мгновенно видно, занята ли клетка.
// ============================================================

const key = (x, y, z) => `${x},${y},${z}`;

export class VoxelWorld {
  constructor() {
    this.blocks = new Map(); // "x,y,z" -> { x, y, z, color: [r, g, b] }
    this.version = 0;
    this.maxY = 0; //  самый высокий блок (миникарте — откуда искать верхний блок столбика) // растёт при каждом изменении — рендерер по нему понимает, что пора обновиться
  }

  has(x, y, z) {
    return this.blocks.has(key(x, y, z));
  }

  // Верхний блок столбика (x, z) — что видно сверху (для миникарты). null — пусто
  topBlock(x, z) {
    for (let y = this.maxY; y >= 0; y--) {
      const b = this.blocks.get(key(x, y, z));
      if (b) return b;
    }
    return null;
  }

  // Высота поверхности столбика: где стоять (над верхним кубиком). 0 — пусто (пол мира)
  surfaceY(x, z) {
    const b = this.topBlock(Math.floor(x), Math.floor(z));
    return b ? b.y + 1 : 0;
  }

  // Твёрдая ли клетка: блок или пол (всё, что ниже y = 0). Это спрашивает физика.
  isSolid(x, y, z) {
    return y < 0 || this.blocks.has(key(x, y, z));
  }

  place(x, y, z, color) {
    if (this.has(x, y, z)) return false;
    this.blocks.set(key(x, y, z), { x, y, z, color: [...color] });
    if (y > this.maxY) this.maxY = y;
    this.version++;
    return true;
  }

  remove(x, y, z) {
    const removed = this.blocks.delete(key(x, y, z));
    if (removed) this.version++;
    return removed;
  }

  clear() {
    this.blocks.clear();
    this.version++;
  }

  // Луч по клеткам (алгоритм DDA — «digital differential analyzer»).
  // Идём от клетки к клетке ровно вдоль луча и на каждом шаге знаем,
  // через какую грань перешли. Пол (y < 0) считаем сплошным.
  //
  // Возвращает { block, place, t } или null:
  //   block — клетка с кубиком, в который попали (null, если попали в пол)
  //   place — соседняя клетка со стороны луча: туда можно поставить новый кубик
  //   t     — расстояние по лучу до попадания (камере 3-го лица — чтобы не залезть в стену)
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);

    // Сколько пути по лучу нужно пройти, чтобы пересечь одну клетку по каждой оси
    const deltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const deltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const deltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    // Сколько пути до первой границы клетки по каждой оси
    const first = (pos, cell, step, delta) =>
      step > 0 ? (cell + 1 - pos) * delta : step < 0 ? (pos - cell) * delta : Infinity;
    let tMaxX = first(origin.x, x, stepX, deltaX);
    let tMaxY = first(origin.y, y, stepY, deltaY);
    let tMaxZ = first(origin.z, z, stepZ, deltaZ);

    let t = 0;
    let normal = [0, 0, 0];
    while (t <= maxDist) {
      // Шаг в ту соседнюю клетку, до границы которой ближе всего
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += deltaX; normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += deltaY; normal = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += deltaZ; normal = [0, 0, -stepZ];
      }
      if (t > maxDist) break;

      const place = { x: x + normal[0], y: y + normal[1], z: z + normal[2] };
      if (y < 0) return { block: null, place, t }; // упёрлись в пол
      if (this.has(x, y, z)) return { block: { x, y, z }, place, t };
    }
    return null;
  }

  // ---------- Сохранение: мир -> обычный объект для JSON и обратно ----------

  toJSON() {
    return [...this.blocks.values()].map((b) => ({ x: b.x, y: b.y, z: b.z, color: b.color }));
  }

  loadFrom(list) {
    this.clear();
    for (const b of list) {
      const ok = [b.x, b.y, b.z].every(Number.isInteger) && Array.isArray(b.color) && b.color.length === 3;
      if (ok) this.place(b.x, b.y, b.z, b.color);
    }
  }
}
