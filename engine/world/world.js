// ============================================================
//  Мир — одно пространство игры: свои блоки, свои сущности, своя физика,
//  свои предметы на земле, снаряды и ловушки.
//
//  Миров может быть несколько (главный мир, комнаты за порталами и т. д.):
//  у каждого своё пространство координат, они друг друга не видят.
//  Сцена держит их в Map и решает, какой сейчас активный.
//
//  Как пользоваться:
//    const w = new World({ id: "main", pickups: { onAdd, onRemove }, ... });
//    w.voxels.set(x, y, z, block); w.entities.add(mob);
//  В pickups / projectiles / traps — те же настройки, что у Pickups / Projectiles / Traps
//  (кроме physics / world / entities — их мир подставляет сам, свои).
// ============================================================

import { VoxelWorld } from "./voxel-world.js";
import { EntityManager } from "./entity.js";
import { Physics } from "./physics.js";
import { Pickups } from "./pickups.js";
import { Projectiles } from "./projectiles.js";
import { Traps } from "./traps.js";

export class World {
  // id — имя мира ("main", "room:7" ...); maxDrop — с какой высоты мобы спрыгивают к цели
  constructor({ id = "main", physics = {}, pickups = {}, projectiles = {}, traps = {}, maxDrop = 12 } = {}) {
    this.id = id;
    const v = (this.voxels = new VoxelWorld()); // блоки
    this.entities = new EntityManager(); //          существа и герои
    // Физика смотрит только в СВОИ блоки (v), а не в «текущий мир» сцены:
    // так два мира могут считаться рядом и не путаться.
    // surfaceAt — особые клетки (скользкий лёд и т. п.)
    this.physics = new Physics({
      ...physics,
      isSolid: (x, y, z) => v.isSolid(x, y, z),
      cellTop: (x, y, z) => v.cellTop(x, y, z),
      cellBottom: (x, y, z) => v.cellBottom(x, y, z),
      surfaceAt: (x, y, z) => v.surfaceAt(x, y, z),
      hasSurfaces: () => v.surfaces > 0,
      waterAt: (x, y, z) => v.water.size > 0 && v.water.has(x, y, z),
    });
    // Для поиска пути: те же твёрдые клетки (вода и лава — isWater: мобы их обходят) + «номер версии» (поставили блок — пересчитать путь)
    this.nav = { isSolid: this.physics.isSolid, cellTop: (x, y, z) => v.cellTop(x, y, z), version: () => v.version, maxDrop, gravity: this.physics.gravity, isWater: (x, y, z) => (v.water.size > 0 && v.water.has(x, y, z)) || (v.lava.size > 0 && v.lava.has(x, y, z)) };
    this.pickups = new Pickups({ ...pickups, physics: this.physics }); //                       предметы на земле
    this.projectiles = new Projectiles({ ...projectiles, world: v, entities: this.entities }); // снаряды
    this.traps = new Traps(traps); //                                                             ловушки
  }
}
