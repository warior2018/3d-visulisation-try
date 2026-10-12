// ============================================================
//  Модель «для экрана» (viewmodel): рука или оружие от 1-го лица.
//
//  Так делают большие игры: игрок от 1-го лица видит не своё тело из мира,
//  а отдельную модель, приклеенную к камере, со своими анимациями. Её
//  делают крупнее и выразительнее, и она не проваливается в стены
//  (рендерер рисует её отдельным слоем — см. viewModels в gpu-renderer.js).
//
//  Модель хранится в координатах камеры: (0, 0, 0) — глаз, +Z — вперёд,
//  +X — вправо, +Y — вверх. Каждый кадр ставим её туда, где камера.
//
//    const arm = new ViewModel(models, "fp-arm");
//    arm.play("Attack");        // разово
//    arm.setBase("Walk", 1.2);  // по кругу
//    arm.update(dt);
//    renderer.render({ ..., viewModels: [arm.draw(camera)] });
//
//  Прицеливание (aim от 0 до 1). Если в модели есть кости-точки «sight»
//  (мушка) и «sight_rear» (целик), движок сам выравнивает оружие:
//  поворачивает его так, чтобы линия «целик → мушка» смотрела ровно вперёд,
//  и ставит мушку в центр экрана — как в шутерах. Без этих костей модель
//  просто сдвигается на aimOffset. aimOffset (вправо, вверх, вперёд)
//  добавляется и к выравниванию — подвинуть оружие ближе/дальше от глаза.
// ============================================================

export class ViewModel {
  constructor(models, name) {
    this.models = models;
    this.holder = {}; // модели «одеваются» на объект; своего объекта-сущности у руки нет
    this.loaded = models.attach(this.holder, name);
    this.matrix = new Float32Array(16);
    // Прицеливание: aim от 0 (у бедра) до 1 (у глаз) — модель плавно сдвигается на aimOffset
    // (в осях камеры: вправо, вверх, вперёд), например пистолет к центру экрана
    this.aim = 0;
    this.aimOffset = [0, 0, 0];
    this.sights = this.findSights();
  }

  // Мушка и целик в позе покоя (координаты камеры) — или null, если их нет в модели
  findSights() {
    const a = this.animator;
    if (!a) return null;
    const at = (name) => {
      const i = a.model.nodes.findIndex((n) => n.name === name);
      return i < 0 ? null : [a.global[i][12], a.global[i][13], a.global[i][14]];
    };
    const front = at("sight");
    const rear = at("sight_rear");
    if (!front || !rear) return null;
    // Поворот, после которого линия целик → мушка смотрит вдоль +Z (вперёд)
    let d = front.map((v, k) => v - rear[k]);
    const len = Math.hypot(...d);
    d = d.map((v) => v / len);
    const axis = [d[1], -d[0], 0]; // d × (0, 0, 1)
    const s = Math.hypot(...axis);
    const angle = Math.atan2(s, d[2]);
    return { front, axis: s > 1e-6 ? axis.map((v) => v / s) : [1, 0, 0], angle };
  }

  // Как поставить модель при прицеливании t: поворот R (3×3, по столбцам) и сдвиг T
  aimTransform(t) {
    const o = this.aimOffset.map((v) => v * t);
    const sg = this.sights;
    if (!sg || t <= 0) return { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], T: o };
    const R = axisAngle(sg.axis, sg.angle * t);
    const f = sg.front;
    // Крутим вокруг мушки, и мушка едет в центр экрана (0, 0, её дальность)
    const Rf = mul3(R, f);
    const target = [0, 0, f[2]];
    const T = [0, 1, 2].map((k) => f[k] - Rf[k] + t * (target[k] - f[k]) + o[k]);
    return { R, T };
  }

  get animator() {
    return this.holder.view?.animator;
  }

  setBase(name, speed = 1) {
    this.animator?.setBase(name, speed);
  }

  play(name) {
    this.animator?.playOnce(name);
  }

  update(dt) {
    this.animator?.update(dt);
  }

  // Что отдать рендереру (или null, если модели нет).
  // Матрица модели = «оси камеры» в мире: столбцы — вправо, вверх, вперёд и позиция глаза.
  // Так точка (x, y, z) модели оказывается на x вправо, y вверх и z вперёд от глаза.
  draw(camera) {
    const v = this.holder.view;
    if (!v) return null;
    let r = camera.right();
    const f = camera.lookDirection();
    // «Вверх» камеры: перпендикулярен «вправо» и «вперёд»
    const sp = Math.sin(camera.pitch);
    const cp = Math.cos(camera.pitch);
    let u = [-Math.sin(camera.yaw) * sp, cp, -Math.cos(camera.yaw) * sp];
    // Крен камеры: «вправо» и «вверх» поворачиваются вокруг «вперёд» — рука наклоняется вместе с головой
    const roll = camera.roll || 0;
    if (roll) {
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      const r0 = [r.x, r.y, r.z];
      const rr = [0, 1, 2].map((k) => r0[k] * c - u[k] * s);
      u = [0, 1, 2].map((k) => u[k] * c + r0[k] * s);
      r = { x: rr[0], y: rr[1], z: rr[2] };
    }
    // Оси камеры (по столбцам) × положение для прицеливания (в осях камеры)
    const C = [r.x, r.y, r.z, u[0], u[1], u[2], f.x, f.y, f.z];
    const { R, T } = this.aimTransform(this.aim);
    const M = [0, 1, 2].flatMap((c) => mul3(C, [R[c * 3], R[c * 3 + 1], R[c * 3 + 2]]));
    const p = mul3(C, T);
    const e = camera.position;
    this.matrix.set([M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, e.x + p[0], e.y + p[1], e.z + p[2], 1]);
    return { skin: v.skin, modelMatrix: this.matrix, jointMatrices: v.animator.jointMatrices, tint: null };
  }

  dispose() {
    this.models.detach(this.holder);
  }
}

// Матрица 3×3 (по столбцам) × вектор
function mul3(m, v) {
  return [0, 1, 2].map((k) => m[k] * v[0] + m[3 + k] * v[1] + m[6 + k] * v[2]);
}

// Поворот на angle радиан вокруг единичной оси — матрица 3×3 по столбцам (формула Родрига)
function axisAngle([x, y, z], angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c,
  ];
}
