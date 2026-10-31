// ============================================================
//  Тряска камеры — только картинки, а не прицела (как в Overwatch): куда целишься и куда летят пули — не
//  меняется, трясётся лишь то, что рисуется. Игра стреляет и бьёт по своей камере, а рендереру отдаёт копию
//  с тряской: shake.apply(camera, out).
//
//    const shake = new CameraShake();
//    shake.add(0.5);            // удар: «встряска» 0…1 (складываются, но не больше 1), гаснет сама
//    shake.hold(0.3);           // держать не меньше 0.3 в этом кадре (падение: пока летишь — трясёт)
//    shake.update(dt);          // каждый кадр
//    const view = shake.apply(rig.camera, viewCam); // копия камеры с тряской — её рисовать
//
//  Сила тряски — квадрат «встряски»: слабые толчки еле заметны, сильные — резкие. Движение — плавный шум
//  (сумма синусов разной частоты), а не случайные скачки: трясёт, но не дёргает.
// ============================================================

import { Vec3 } from "../math/vec3.js";

const RAD = Math.PI / 180;

export class CameraShake {
  // yaw / pitch / roll — наибольший поворот (градусы) при встряске 1, offset — наибольший сдвиг (м),
  // decay — сколько встряски гаснет за секунду, frequency — как часто трясёт (Гц)
  constructor({ yaw = 1.6, pitch = 1.6, roll = 2.4, offset = 0.05, decay = 1.8, frequency = 16 } = {}) {
    this.maxYaw = yaw * RAD;
    this.maxPitch = pitch * RAD;
    this.maxRoll = roll * RAD;
    this.maxOffset = offset;
    this.decay = decay;
    this.frequency = frequency;
    this.trauma = 0; //  встряска от ударов (гаснет)
    this.sustain = 0; // удержание этого кадра (падение)
    this.level = 0; //   итог этого кадра: max(встряска, удержание)
    this.t = Math.random() * 100;
    this.enabled = true; // выключатель (настройка «тряска экрана»)
  }

  add(amount) {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  hold(level) {
    this.sustain = Math.max(this.sustain, Math.min(1, level));
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    this.level = this.enabled ? Math.max(this.trauma, this.sustain) : 0;
    this.sustain = 0;
  }

  // Плавный шум −1…1 для канала i (у каждого канала свои частоты — оси не трясутся в такт)
  noise(i) {
    const f = this.frequency, t = this.t, s = i * 12.9898;
    return (Math.sin(t * f * 1.0 + s) * 0.5 + Math.sin(t * f * 2.17 + s * 1.7) * 0.3 + Math.sin(t * f * 3.31 + s * 2.3) * 0.2);
  }

  // Копия камеры src в out (тот же объект каждый кадр — без мусора) и поверх — тряска
  apply(src, out) {
    out.position = out.position && out.position !== src.position ? out.position : new Vec3(0, 0, 0);
    out.fov = src.fov;
    out.near = src.near;
    out.maxPitch = src.maxPitch;
    out.yaw = src.yaw;
    out.pitch = src.pitch;
    out.roll = src.roll || 0;
    const k = this.level * this.level;
    if (k < 1e-5) {
      out.position.x = src.position.x;
      out.position.y = src.position.y;
      out.position.z = src.position.z;
      return out;
    }
    out.yaw += this.maxYaw * k * this.noise(0);
    out.pitch += this.maxPitch * k * this.noise(1);
    out.roll += this.maxRoll * k * this.noise(2);
    out.position.x = src.position.x + this.maxOffset * k * this.noise(3);
    out.position.y = src.position.y + this.maxOffset * k * this.noise(4);
    out.position.z = src.position.z + this.maxOffset * k * this.noise(5);
    return out;
  }
}
