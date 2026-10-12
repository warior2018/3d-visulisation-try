// ============================================================
//  Прицеливание — возможность движка: плавный вход в прицел, приближение
//  камеры и замедление мыши. Каждое оружие задаёт своё:
//
//    const aim = new Aim();
//    aim.update(dt, aiming, { fov: 45, sensitivity: 0.6 }); // каждый кадр
//    camera.fov = aim.fov(baseFov);                         // приближение
//    camera.rotate(dx * aim.mouseScale(), dy * aim.mouseScale());
//
//  fov — угол обзора в прицеле (градусы): меньше — сильнее приближение.
//  sensitivity — скорость мыши в прицеле относительно обычной, КАК ЕЁ ВИДИТ ИГРОК:
//    1 — перекрестие бежит по экрану так же, как без прицела (картинка крупнее,
//        поэтому в градусах поворот медленнее ровно во столько, во сколько приближение);
//    0.5 — вдвое медленнее этого. Снайперке — поменьше, пистолету — побольше.
//  scale — общий множитель из настроек (ползунок «чувствительность в прицеле»).
// ============================================================

export class Aim {
  constructor({ speed = 14 } = {}) {
    this.t = 0; //          0 — у бедра, 1 — в прицеле (плавно)
    this.speed = speed; //  как быстро входим в прицел (~1/speed с)
    this.targetFov = null; // градусы
    this.sensitivity = 1;
    this.scale = 1;
    this.baseFov = null;
  }

  // aiming — зажата ли кнопка прицела; опции — у текущего оружия
  update(dt, aiming, { fov = 45, sensitivity = 1 } = {}, scale = 1) {
    this.t += ((aiming ? 1 : 0) - this.t) * Math.min(1, dt * this.speed);
    if (this.t < 1e-3) this.t = 0;
    this.targetFov = fov;
    this.sensitivity = sensitivity;
    this.scale = scale;
  }

  // Сразу выйти из прицела (сменили оружие: прицел прошлого не переносится на новое)
  reset() {
    this.t = 0;
  }

  // Угол обзора сейчас (радианы): от обычного к прицельному
  fov(baseFov) {
    this.baseFov = baseFov;
    const target = ((this.targetFov ?? 45) * Math.PI) / 180;
    return baseFov + (target - baseFov) * this.t;
  }

  // Во сколько раз медленнее мышь: под приближение и × чувствительность прицела × настройка
  mouseScale(baseFov = this.baseFov) {
    if (!baseFov || this.t === 0) return 1;
    const zoom = Math.tan(this.fov(baseFov) / 2) / Math.tan(baseFov / 2); // насколько крупнее картинка
    const feel = 1 + (this.sensitivity * this.scale - 1) * this.t;
    return zoom * feel;
  }
}
