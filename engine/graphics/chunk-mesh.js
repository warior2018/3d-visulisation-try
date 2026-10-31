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

// Освещение «как в Minecraft», запечённое в цвет кубика (шейдер не меняется): у каждого видимого кубика —
// яркость 0…1 от неба и соседей. lightOf(world, x, y, z):
//   небо — открыт ли столбик над кубиком (верхний блок столбика — он сам) и столбики вокруг (3×3): под крышей,
//          в пещере, у стены — темнее; чем глубже под крышей — тем темнее (до LIGHT.minSky);
//   заслон — сколько соседей сверху-сбоку (4 клетки на уровень выше): угол у стены чуть темнее (как AO).
export const LIGHT = { minSky: 0.5, ao: 0.05 };

export function lightOf(world, x, y, z) {
  let sky = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const top = world.topBlock(x + dx, z + dz);
      const open = !top || top.y <= y; // над этим уровнем в столбике ничего нет
      const w = dx === 0 && dz === 0 ? 0.5 : 0.0625;
      if (open) sky += w;
      else {
        const depth = top.y - y; // на сколько блоков выше нас закрыт столбик
        // свой столбик закрыт (крыша над головой) — света мало, и чем выше крыша, тем меньше;
        // соседний закрыт невысоко (ступенька, низкая стенка) — почти не мешает, высокая стена — заслоняет
        sky += dx === 0 && dz === 0 ? w * Math.max(0, 0.35 - depth * 0.03) : w * Math.max(0, 1 - depth * 0.25);
      }
    }
  let near = 0;
  if (world.has(x + 1, y + 1, z)) near++;
  if (world.has(x - 1, y + 1, z)) near++;
  if (world.has(x, y + 1, z + 1)) near++;
  if (world.has(x, y + 1, z - 1)) near++;
  const k = LIGHT.minSky + (1 - LIGHT.minSky) * Math.min(1, sky);
  return k * (1 - LIGHT.ao * near);
}

// light — запекать освещение (false — как раньше: чистый цвет)
export function exposedCubes(world, chunk, out = null, light = false) {
  let data = out && out.length >= chunk.blocks.size * FLOATS_PER_CUBE ? out : new Float32Array(Math.max(64, chunk.blocks.size) * FLOATS_PER_CUBE);
  let n = 0;
  for (const b of chunk.blocks) {
    const { x, y, z } = b;
    // закрыт со всех 6 сторон (снизу — блок или пол мира) — не видно
    if (world.has(x + 1, y, z) && world.has(x - 1, y, z) && world.has(x, y, z + 1) && world.has(x, y, z - 1) && world.has(x, y + 1, z) && world.isSolid(x, y - 1, z)) continue;
    const i = n * FLOATS_PER_CUBE;
    const k = light ? lightOf(world, x, y, z) / 255 : 1 / 255;
    data[i] = x;
    data[i + 1] = y;
    data[i + 2] = z;
    data[i + 3] = b.color[0] * k;
    data[i + 4] = b.color[1] * k;
    data[i + 5] = b.color[2] * k;
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
