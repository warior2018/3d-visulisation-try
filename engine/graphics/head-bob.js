// ============================================================
//  Покачивание головы при ходьбе и беге — возможность движка. Камера чуть подпрыгивает на
//  каждом шаге, качается вбок (раз в два шага) и слегка кренится. Чем быстрее идёшь — тем
//  чаще шаги; бег — сильнее. Остановился или в воздухе — плавно затихает.
//
//    const bob = new HeadBob({ height: 0.035, side: 0.025, roll: 0.6 });
//    bob.update(dt, speed, onGround, running);   // speed — м/с по земле
//    bob.apply(camera);                          // после того, как поставили камеру в глаза (и после наклона)
//  Крен apply ПРИБАВЛЯЕТ к camera.roll — игра сама обнуляет roll каждый кадр (или ставит наклон), иначе он копится
// ============================================================

import { Vec3 } from "../math/vec3.js";

export class HeadBob {
  // height — вверх-вниз (м), side — вбок (м), roll — крен (градусы), stride — длина шага (м),
  // run — во сколько раз сильнее на бегу, fade — как быстро затихает/появляется
  constructor({ height = 0.035, side = 0.025, roll = 0.6, stride = 1.4, run = 1.7, fade = 8 } = {}) {
    this.height = height;
    this.side = side;
    this.roll = (roll * Math.PI) / 180;
    this.stride = stride;
    this.run = run;
    this.fade = fade;
    this.phase = 0; //  где мы в цикле шагов (радианы: 2π — два шага)
    this.amount = 0; // 0…1 (×run на бегу) — сила качания сейчас (плавно)
  }

  update(dt, speed, onGround = true, running = false) {
    const target = onGround && speed > 0.3 ? (running ? this.run : 1) : 0;
    this.amount += (target - this.amount) * Math.min(1, dt * this.fade);
    if (onGround) this.phase += (dt * speed * Math.PI) / this.stride; // шаг — пол-оборота
  }

  // Покачивание ПРЕДМЕТА В РУКЕ, как в Minecraft (камера не качается): рука идёт дугой — вбок раз в два
  // шага и чуть вниз на каждом шаге, с лёгким креном. Вернёт сдвиг в осях камеры { x, y, z } и крен (рад) —
  // отдать модели руки (ViewModel.sway). k — сила (1 — обычная)
  hand(k = 1) {
    const a = this.amount * k;
    if (a < 1e-3) return { x: 0, y: 0, z: 0, roll: 0 };
    const s = Math.sin(this.phase);
    return { x: s * 0.03 * a, y: -Math.abs(Math.cos(this.phase)) * 0.025 * a, z: 0, roll: s * 0.04 * a };
  }

  apply(camera) {
    if (this.amount < 1e-3) return;
    const a = this.amount;
    const up = Math.abs(Math.sin(this.phase)) * this.height * a; //          подпрыгивает на каждом шаге
    const side = Math.sin(this.phase) * this.side * a; //                    вбок — раз в два шага
    const r = camera.right();
    camera.position = camera.position.add(new Vec3(r.x * side, up - this.height * a * 0.5, r.z * side));
    camera.roll = (camera.roll || 0) + Math.sin(this.phase) * this.roll * a;
  }
}
