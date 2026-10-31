// ============================================================
//  Аниматор: проигрывает анимации модели и считает матрицы костей.
//
//  Каждый кадр:
//   1. Для каждой кости берём «позу покоя» (как в файле).
//   2. Накладываем основной клип (Idle/Walk): ищем два ближайших ключевых кадра
//      и интерполируем между ними (mix для сдвигов, slerp для поворотов).
//   3. Если клип только что сменился — 0.2 с плавно смешиваем старый и новый.
//   3б. Слой (overlay) — клип-поза поверх основного, только на свои кости, крутится по кругу:
//      например, руки держат винтовку (HoldRifle), а ноги при этом шагают (Walk).
//   4. Сверху накладываем «разовый» клип (Attack) — только на те кости, которые он двигает.
//      Поэтому можно бить на ходу: руки бьют, ноги продолжают шагать.
//   5. Проходим по дереву костей от корня (рекурсия!): мировая матрица кости =
//      матрица родителя × своя. Кисть зависит от предплечья, оно — от плеча...
//   6. Матрица для видеокарты = мировая матрица кости × обратная матрица привязки.
// ============================================================

import { fromTRS, multiply, lerp, slerp } from "../math/mat4.js";

const FADE = 0.2; // секунд на плавный переход между клипами

export class Animator {
  constructor(model) {
    this.model = model;
    this.clips = new Map(model.animations.map((a) => [a.name, a]));

    // Родитель каждого узла (для обхода дерева)
    this.parent = new Int32Array(model.nodes.length).fill(-1);
    model.nodes.forEach((n, i) => n.children.forEach((c) => (this.parent[c] = i)));

    this.base = { name: null, time: 0, speed: 1 }; // основной клип, крутится по кругу
    this.fadeFrom = null; //                         предыдущий клип, пока идёт переход
    this.fadeTime = 0;
    this.oneShot = null; //                           разовый клип поверх: { name, time }
    this.overlay = null; //                           слой-поза поверх основного: { name, time }
    this.boneTurns = new Map(); //                     доворот костей поверх всех клипов: узел → кватернион (lookAt)

    // Позы и временные буферы — ОДНИ на всё время (каждый кадр только переписываем числа): при десятках
    // существ новые массивы на каждую кость каждый кадр — это мегабайты мусора в секунду и паузы сборщика
    this.pose = this.restPose();
    this.fromPose = this.restPose(); // поза старого клипа во время плавного перехода
    this.global = model.nodes.map(() => new Float32Array(16));
    this.jointMatrices = new Float32Array(model.skin.joints.length * 16);
    // Порядок обхода костей: родитель раньше детей (мировая матрица кости = родителя × своя)
    this.order = [];
    const seen = new Uint8Array(model.nodes.length);
    const visit = (i) => {
      if (seen[i]) return;
      if (this.parent[i] >= 0) visit(this.parent[i]);
      seen[i] = 1;
      this.order.push(i);
    };
    model.nodes.forEach((_, i) => visit(i));
    this.local = new Float32Array(16);
    this.tmp = new Float32Array(16);
    const ibm = model.skin.inverseBindMatrices;
    this.inverseBind = model.skin.joints.map((_, j) => ibm.subarray(j * 16, j * 16 + 16));
    this.update(0);
  }

  // Поза покоя: сдвиги, повороты и масштабы всех узлов — как в файле
  restPose() {
    return this.model.nodes.map((n) => ({ t: [...n.translation], r: [...n.rotation], s: [...n.scale] }));
  }

  // Вернуть позу покоя в уже существующую позу (без новых массивов)
  resetPose(pose) {
    const nodes = this.model.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], p = pose[i];
      copy3(n.translation, p.t);
      copy4(n.rotation, p.r);
      copy3(n.scale, p.s);
    }
    return pose;
  }

  // Основной клип (меняется каждый кадр игрой: стоим — Idle, идём — Walk)
  setBase(name, speed = 1) {
    if (this.base.name === name) {
      this.base.speed = speed;
      return;
    }
    if (this.base.name) {
      this.fadeFrom = { ...this.base };
      this.fadeTime = 0;
    }
    this.base = { name, time: 0, speed };
  }

  // Слой поверх основного клипа (null — убрать). Тот же — ничего не меняем
  setOverlay(name) {
    if ((this.overlay?.name ?? null) === (name ?? null)) return;
    this.overlay = name && this.clips.has(name) ? { name, time: 0 } : null;
  }

  // Длина клипа в секундах (нет такого — null)
  clipDuration(name) {
    return this.clips.get(name)?.duration ?? null;
  }

  // Проиграть клип один раз поверх основного
  // speed — быстрее / медленнее (2 — вдвое быстрее)
  playOnce(name, speed = 1) {
    if (this.clips.has(name)) this.oneShot = { name, time: 0, speed };
  }

  update(dt) {
    this.base.time += dt * this.base.speed;
    if (this.fadeFrom) {
      this.fadeFrom.time += dt * this.fadeFrom.speed;
      this.fadeTime += dt;
      if (this.fadeTime >= FADE) this.fadeFrom = null;
    }
    if (this.oneShot) {
      this.oneShot.time += dt * (this.oneShot.speed ?? 1);
      if (this.oneShot.time >= this.clips.get(this.oneShot.name).duration) this.oneShot = null;
    }

    // 1–2. Поза покоя + основной клип
    const pose = this.resetPose(this.pose);
    this.sample(this.base.name, this.base.time, true, pose);

    // 3. Плавный переход: смешиваем позу старого клипа с новой (результат — прямо в pose)
    if (this.fadeFrom) {
      const from = this.resetPose(this.fromPose);
      this.sample(this.fadeFrom.name, this.fadeFrom.time, true, from);
      const k = this.fadeTime / FADE; // 0 — ещё старый клип, 1 — уже новый
      for (let i = 0; i < pose.length; i++) {
        const p = pose[i], f = from[i];
        lerp(f.t, p.t, k, p.t);
        slerp(f.r, p.r, k, p.r);
        lerp(f.s, p.s, k, p.s);
      }
    }

    // 3б. Слой-поза (руки держат оружие)
    if (this.overlay) {
      this.overlay.time += dt;
      this.sample(this.overlay.name, this.overlay.time, true, pose);
    }

    // 4. Разовый клип поверх
    if (this.oneShot) this.sample(this.oneShot.name, this.oneShot.time, false, pose);

    // 5. Доворот костей (голова смотрит туда, куда камера) — поверх всего, в осях самой кости
    for (const [i, q] of this.boneTurns) copy4(qmul(pose[i].r, q), pose[i].r);

    this.pose = pose;
    this.computeMatrices();
  }

  // Довернуть кость name на кватернион q поверх анимации (null — убрать). Например, голова героя смотрит
  // вверх / вниз вместе с камерой: turnBone("head", [sin(a/2), 0, 0, cos(a/2)])
  turnBone(name, q) {
    const i = this.model.nodes.findIndex((n) => n.name === name);
    if (i < 0) return;
    if (q) this.boneTurns.set(i, q);
    else this.boneTurns.delete(i);
  }

  // Записать в pose значения клипа в момент time — прямо в массивы позы, читая ключевые кадры из файла
  // по смещению (без копий-массивов на каждый канал)
  sample(name, time, loop, pose) {
    const clip = this.clips.get(name);
    if (!clip) return;
    const t = loop && clip.duration > 0 ? time % clip.duration : Math.min(time, clip.duration);
    for (const ch of clip.channels) {
      const { times } = ch;
      const n = ch.values.size;
      const arr = ch.values.array;
      const cubic = ch.interpolation === "CUBICSPLINE"; // там на каждый кадр 3 значения, берём среднее
      const at = (k) => (cubic ? k * 3 + 1 : k) * n; // где в массиве значения кадра k

      const p = pose[ch.node];
      const out = ch.path === "translation" ? p.t : ch.path === "rotation" ? p.r : ch.path === "scale" ? p.s : null;
      if (!out) continue;
      // Два ключевых кадра вокруг t (до первого — первый, после последнего — последний)
      let k = 0;
      while (k < times.length - 2 && times[k + 1] <= t) k++;
      if (times.length === 1 || t <= times[0]) copyFrom(arr, at(0), n, out);
      else if (t >= times[times.length - 1]) copyFrom(arr, at(times.length - 1), n, out);
      else {
        const f = ch.interpolation === "STEP" ? 0 : (t - times[k]) / (times[k + 1] - times[k]);
        if (ch.path === "rotation") slerpAt(arr, at(k), at(k + 1), f, out);
        else for (let i = 0; i < n; i++) out[i] = arr[at(k) + i] + (arr[at(k + 1) + i] - arr[at(k) + i]) * f;
      }
    }
  }

  // 5–6. Мировые матрицы костей (по дереву: родитель раньше детей — this.order) и матрицы для видеокарты
  computeMatrices() {
    const { local, tmp } = this;
    for (const i of this.order) {
      const p = this.pose[i];
      fromTRS(p.t, p.r, p.s, local);
      if (this.parent[i] >= 0) multiply(this.global[this.parent[i]], local, this.global[i]);
      else this.global[i].set(local);
    }
    const joints = this.model.skin.joints;
    for (let j = 0; j < joints.length; j++) {
      multiply(this.global[joints[j]], this.inverseBind[j], tmp);
      this.jointMatrices.set(tmp, j * 16);
    }
  }
}

const copy3 = (a, out) => { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; };
const copy4 = (a, out) => { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]; };
const copyFrom = (arr, off, n, out) => { for (let i = 0; i < n; i++) out[i] = arr[off + i]; };

// slerp двух кватернионов, лежащих в массиве arr по смещениям o0 и o1, — результат в out
function slerpAt(arr, o0, o1, t, out) {
  const ax = arr[o0], ay = arr[o0 + 1], az = arr[o0 + 2], aw = arr[o0 + 3];
  let bx = arr[o1], by = arr[o1 + 1], bz = arr[o1 + 2], bw = arr[o1 + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; } // кратчайший путь
  let k0, k1;
  if (cos > 0.9995) {
    k0 = 1 - t;
    k1 = t;
  } else {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    k0 = Math.sin((1 - t) * angle) / sin;
    k1 = Math.sin(t * angle) / sin;
  }
  const x = ax * k0 + bx * k1, y = ay * k0 + by * k1, z = az * k0 + bz * k1, w = aw * k0 + bw * k1;
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  out[0] = x / len; out[1] = y / len; out[2] = z / len; out[3] = w / len;
}

// Произведение кватернионов a·b ([x, y, z, w]): сначала b, потом a
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
