// ============================================================
//  Сетка соседей: кто рядом с точкой — без перебора всех сущностей. Мир делится на клетки cell × cell м
//  (по X и Z); сущность лежит в клетке, где стоит. Спросить «кто в радиусе r» — посмотреть только клетки
//  вокруг. Для толкотни мобов (separate): 60 мобов «каждый с каждым» — 3600 проверок за тик, с сеткой —
//  только ближние.
//
//    const grid = new SpatialGrid(4);
//    grid.rebuild(entities.list);          // раз в тик (мобы за тик сдвигаются на сантиметры)
//    grid.near(x, z, 3, out)              // кто в клетках, задевающих круг радиуса 3 (out — переиспользуемый массив)
//
//  near возвращает кандидатов: тех, чьи клетки задевают круг (кто-то из них может быть чуть дальше r —
//  точное расстояние проверяет тот, кто спрашивал). Без мусора: корзины и массивы переиспользуются
// ============================================================

const cellKey = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

export class SpatialGrid {
  constructor(cell = 4) {
    this.cell = cell;
    this.cells = new Map(); // cellKey -> массив сущностей
    this.used = []; //         непустые корзины этого тика (очистить перед следующим)
  }

  rebuild(list) {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
    const c = this.cell;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const k = cellKey(Math.floor(e.position.x / c), Math.floor(e.position.z / c));
      let b = this.cells.get(k);
      if (!b) this.cells.set(k, (b = []));
      if (!b.length) this.used.push(b);
      b.push(e);
    }
    // корзин стало слишком много (все разбежались по миру) — выбросить пустые
    if (this.cells.size > 4096) for (const [k, b] of this.cells) if (!b.length) this.cells.delete(k);
  }

  near(x, z, r, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const b = this.cells.get(cellKey(ix, iz));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    return out;
  }
}
