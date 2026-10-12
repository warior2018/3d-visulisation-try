// ============================================================
//  «Операторская тележка» для камеры: откуда показывать мир.
//
//   - "first"  — от 1-го лица: камера прямо в глазах героя;
//   - "third"  — от 3-го лица: за правым плечом. Если сзади стена,
//                камера подъезжает ближе, чтобы не оказаться внутри неё.
//
//  Чем проверять стены, решает игра: передаёт функцию raycast(origin, dir, maxDist),
//  которая возвращает расстояние до препятствия или null.
// ============================================================

import { Camera } from "./camera.js";
import { Vec3 } from "../math/vec3.js";

export class CameraRig {
  constructor({ distance = 3.2, shoulder = 0.45, lift = 0.2, pivotUp = 0.1, minHeight = 0.25 } = {}) {
    this.camera = new Camera(); // через неё и смотрим (её отдаём рендереру)
    this.mode = "first";
    this.distance = distance; // на сколько метров назад от глаз
    this.shoulder = shoulder; // на сколько вправо — «через плечо»
    this.lift = lift; //         и вверх
    this.pivotUp = pivotUp; //   точка, вокруг которой летает камера: чуть выше глаз
    this.minHeight = minHeight; // ниже не опускаемся (под пол не заглядываем)
    this.behind = 0; //          на сколько камера сейчас позади глаз (лучу прицела нужно знать)
  }

  // eye — камера-глаза героя (позиция и куда смотрит)
  update(eye, raycast) {
    const cam = this.camera;
    cam.yaw = eye.yaw;
    cam.pitch = eye.pitch;
    cam.fov = eye.fov;
    cam.roll = this.mode === "third" ? 0 : eye.roll || 0; // наклон головы — только от 1-го лица
    if (this.mode !== "third") {
      cam.position = eye.position;
      this.behind = 0;
      return cam;
    }

    const pivot = eye.position.add(new Vec3(0, this.pivotUp, 0));
    const wanted = pivot
      .sub(eye.lookDirection().scale(this.distance))
      .add(eye.right().scale(this.shoulder))
      .add(new Vec3(0, this.lift, 0));
    const offset = wanted.sub(pivot);
    const length = Math.hypot(offset.x, offset.y, offset.z);
    const dir = offset.scale(1 / length);

    // Стена между героем и камерой? Ставим камеру чуть ближе места удара
    const t = raycast ? raycast(pivot, dir, length) : null;
    const dist = t !== null && t !== undefined ? Math.max(0.3, t - 0.2) : length;
    const pos = pivot.add(dir.scale(dist));
    cam.position = new Vec3(pos.x, Math.max(pos.y, this.minHeight), pos.z);
    this.behind = dist;
    return cam;
  }
}
