// ============================================================
//  Оси взгляда — «вправо», «вверх» и «вперёд» для поворота yaw, наклона pitch и крена roll.
//  Те же оси, что у камеры (engine/graphics/camera.js): yaw = 0 — смотрим вдоль +Z,
//  pitch > 0 — вверх, roll — наклон головы вбок (выглядывание).
//
//    const { right, up, forward } = viewBasis(camera.yaw, camera.pitch, camera.roll);
//    // точка «2 м вперёд и 0.5 м вправо от глаз» в мире:
//    const p = toWorld(eye, { right, up, forward }, 0.5, 0, 2);
//    // и обратно — где точка мира относительно глаз (x — вправо, y — вверх, z — вперёд):
//    const local = toLocal(eye, { right, up, forward }, point);
// ============================================================

export function viewBasis(yaw, pitch = 0, roll = 0) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  let right = { x: cy, y: 0, z: -sy };
  let up = { x: -sy * sp, y: cp, z: -cy * sp };
  const forward = { x: sy * cp, y: sp, z: cy * cp };
  if (roll) {
    // Крен: «вправо» и «вверх» поворачиваются вокруг «вперёд»
    const c = Math.cos(roll), s = Math.sin(roll);
    const r = right, u = up;
    right = { x: r.x * c - u.x * s, y: r.y * c - u.y * s, z: r.z * c - u.z * s };
    up = { x: u.x * c + r.x * s, y: u.y * c + r.y * s, z: u.z * c + r.z * s };
  }
  return { right, up, forward };
}

// Точка в осях взгляда (x вправо, y вверх, z вперёд от origin) → точка мира
export function toWorld(origin, { right, up, forward }, x, y, z) {
  return {
    x: origin.x + right.x * x + up.x * y + forward.x * z,
    y: origin.y + right.y * x + up.y * y + forward.y * z,
    z: origin.z + right.z * x + up.z * y + forward.z * z,
  };
}

// Точка мира → где она относительно origin в осях взгляда: { x: вправо, y: вверх, z: вперёд }
export function toLocal(origin, { right, up, forward }, p) {
  const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
  return {
    x: dx * right.x + dy * right.y + dz * right.z,
    y: dx * up.x + dy * up.y + dz * up.z,
    z: dx * forward.x + dy * forward.y + dz * forward.z,
  };
}
