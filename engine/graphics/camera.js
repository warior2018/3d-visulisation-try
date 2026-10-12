import { Vec3, clamp } from "../math/vec3.js";

// Камера от первого лица: позиция + поворот (yaw) + наклон (pitch).
export class Camera {
  constructor({ position = new Vec3(0, 1.6, 0), fovDeg = 70 } = {}) {
    this.position = position; // 1.6 — высота глаз
    this.fov = (fovDeg * Math.PI) / 180;
    this.near = 0.1; // ближе этого не рисуем
    this.yaw = 0; // влево/вправо, 0 — смотрим вдоль +Z
    this.pitch = 0; // вверх/вниз, > 0 — смотрим вверх
    this.roll = 0; //  крен (наклон головы вбок), > 0 — вправо; рисуется, на «вперёд» не влияет
    this.maxPitch = (89 * Math.PI) / 180; // не даём перевернуться через голову
  }

  // Повернуть камеру (dx, dy — в радианах)
  rotate(dx, dy) {
    this.yaw += dx;
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    this.pitch = clamp(this.pitch - dy, -this.maxPitch, this.maxPitch);
  }

  // Куда «вперёд» и «вправо» по земле. Наклон (pitch) не учитываем:
  // если смотреть вверх и идти вперёд, мы идём по полу, а не взлетаем.
  forward() {
    return new Vec3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  right() {
    return new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  // Точное направление взгляда (с наклоном) — сюда летит луч из прицела
  lookDirection() {
    const cp = Math.cos(this.pitch);
    return new Vec3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  // Мир -> координаты камеры: сдвиг на -position, поворот на -yaw, потом на -pitch.
  toView(p) {
    const dx = p.x - this.position.x;
    const dy = p.y - this.position.y;
    const dz = p.z - this.position.z;

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const x1 = dx * cy - dz * sy;
    const z1 = dx * sy + dz * cy;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const y2 = dy * cp - z1 * sp;
    // Крен (как в шейдере): голова вправо — мир против часовой
    const cr = Math.cos(this.roll || 0);
    const sr = Math.sin(this.roll || 0);
    return new Vec3(x1 * cr - y2 * sr, x1 * sr + y2 * cr, dy * sp + z1 * cp);
  }

  // Точка мира -> пиксель экрана размером width × height: { x, y, depth } или null, если она за спиной.
  // Нужна интерфейсу: подписи над существами, цифры урона.
  toScreen(p, width, height) {
    const v = this.toView(p);
    if (v.z < this.near) return null;
    const f = 1 / Math.tan(this.fov / 2); // fov — по вертикали (как в шейдере)
    const aspect = width / height;
    return { x: ((v.x / v.z) * (f / aspect) * 0.5 + 0.5) * width, y: (0.5 - (v.y / v.z) * f * 0.5) * height, depth: v.z };
  }
}
