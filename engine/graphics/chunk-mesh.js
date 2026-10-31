// ============================================================
//  Чанки мира для рисования: что из куска видно и попадает ли кусок в кадр. Чистые функции —
//  рисовальщик (gpu-renderer.js) зовёт их, автотесты проверяют без видеокарты.
//
//    exposedCubes(world, chunk, out) — данные кубиков чанка, у которых открыта хоть одна грань
//        (x, y, z, r, g, b на кубик — как ждёт шейдер); кубики, закрытые со всех сторон, не рисуем:
//        внутри холма их тысячи, а видно только кожу. Вернёт { data, count } (data может быть новым,
//        если out не хватило)
//    chunkInView(view, chunk) — попадает ли кусок в кадр: не дальше дымки и не за спиной / сбоку
//        view — viewOf(camera, aspect, maxDist): заранее посчитанное направление взгляда и угол обзора
// ============================================================

import { CHUNK } from "../world/voxel-world.js";

export const FLOATS_PER_CUBE = 6; // x, y, z, r, g, b

export function exposedCubes(world, chunk, out = null) {
  let data = out && out.length >= chunk.blocks.size * FLOATS_PER_CUBE ? out : new Float32Array(Math.max(64, chunk.blocks.size) * FLOATS_PER_CUBE);
  let n = 0;
  for (const b of chunk.blocks) {
    const { x, y, z } = b;
    // закрыт со всех 6 сторон (снизу — блок или пол мира) — не видно
    if (world.has(x + 1, y, z) && world.has(x - 1, y, z) && world.has(x, y, z + 1) && world.has(x, y, z - 1) && world.has(x, y + 1, z) && world.isSolid(x, y - 1, z)) continue;
    const i = n * FLOATS_PER_CUBE;
    data[i] = x;
    data[i + 1] = y;
    data[i + 2] = z;
    data[i + 3] = b.color[0] / 255;
    data[i + 4] = b.color[1] / 255;
    data[i + 5] = b.color[2] / 255;
    n++;
  }
  return { data, count: n };
}

// Камера -> то, что нужно для отсечения кусков (раз в кадр). maxDist — дальше по горизонтали не рисуем
// (там всё уже растворилось в дымке)
export function viewOf(camera, aspect, maxDist, out = {}) {
  const cp = Math.cos(camera.pitch);
  out.x = camera.position.x;
  out.y = camera.position.y;
  out.z = camera.position.z;
  out.fx = Math.sin(camera.yaw) * cp;
  out.fy = Math.sin(camera.pitch);
  out.fz = Math.cos(camera.yaw) * cp;
  // угол от центра кадра до его угла (по диагонали) — конус, в который влезает весь кадр
  const t = Math.tan(camera.fov / 2);
  const half = Math.atan(t * Math.sqrt(1 + aspect * aspect));
  out.sin = Math.sin(half);
  out.cos = Math.cos(half);
  out.maxDist = maxDist;
  return out;
}

export function chunkInView(v, chunk) {
  if (chunk.maxY < chunk.minY) return false; // пустой
  const h = (chunk.maxY - chunk.minY + 1) / 2;
  const cx = chunk.cx * CHUNK + CHUNK / 2, cz = chunk.cz * CHUNK + CHUNK / 2, cy = chunk.minY + h;
  const r = Math.sqrt(CHUNK * CHUNK / 2 + h * h); // шар, в который влезает кусок
  const dx = cx - v.x, dy = cy - v.y, dz = cz - v.z;
  // далеко по горизонтали (ближняя точка куска дальше дымки)
  if (Math.hypot(dx, dz) - CHUNK * 0.7072 > v.maxDist) return false;
  // конус взгляда против шара: d — вдоль взгляда, side — вбок от оси
  const d = dx * v.fx + dy * v.fy + dz * v.fz;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 <= r * r) return true; // камера внутри куска
  const side = Math.sqrt(Math.max(0, len2 - d * d));
  return side * v.cos - d * v.sin <= r;
}
