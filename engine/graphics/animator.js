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

    this.pose = this.restPose();
    this.global = model.nodes.map(() => new Float32Array(16));
    this.jointMatrices = new Float32Array(model.skin.joints.length * 16);
    this.update(0);
  }

  // Поза покоя: сдвиги, повороты и масштабы всех узлов — как в файле
  restPose() {
    return this.model.nodes.map((n) => ({ t: [...n.translation], r: [...n.rotation], s: [...n.scale] }));
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

  // Проиграть клип один раз поверх основного
  playOnce(name) {
    if (this.clips.has(name)) this.oneShot = { name, time: 0 };
  }

  update(dt) {
    this.base.time += dt * this.base.speed;
    if (this.fadeFrom) {
      this.fadeFrom.time += dt * this.fadeFrom.speed;
      this.fadeTime += dt;
      if (this.fadeTime >= FADE) this.fadeFrom = null;
    }
    if (this.oneShot) {
      this.oneShot.time += dt;
      if (this.oneShot.time >= this.clips.get(this.oneShot.name).duration) this.oneShot = null;
    }

    // 1–2. Поза покоя + основной клип
    const pose = this.restPose();
    this.sample(this.base.name, this.base.time, true, pose);

    // 3. Плавный переход: смешиваем позу старого клипа с новой
    if (this.fadeFrom) {
      const from = this.restPose();
      this.sample(this.fadeFrom.name, this.fadeFrom.time, true, from);
      const k = this.fadeTime / FADE; // 0 — ещё старый клип, 1 — уже новый
      pose.forEach((p, i) => {
        p.t = lerp(from[i].t, p.t, k);
        p.r = slerp(from[i].r, p.r, k);
        p.s = lerp(from[i].s, p.s, k);
      });
    }

    // 3б. Слой-поза (руки держат оружие)
    if (this.overlay) {
      this.overlay.time += dt;
      this.sample(this.overlay.name, this.overlay.time, true, pose);
    }

    // 4. Разовый клип поверх
    if (this.oneShot) this.sample(this.oneShot.name, this.oneShot.time, false, pose);

    this.pose = pose;
    this.computeMatrices();
  }

  // Записать в pose значения клипа в момент time
  sample(name, time, loop, pose) {
    const clip = this.clips.get(name);
    if (!clip) return;
    const t = loop && clip.duration > 0 ? time % clip.duration : Math.min(time, clip.duration);
    for (const ch of clip.channels) {
      const { times, values } = ch;
      const n = values.size;
      const cubic = ch.interpolation === "CUBICSPLINE"; // там на каждый кадр 3 значения, берём среднее
      const value = (k) => {
        const i = cubic ? k * 3 + 1 : k;
        return Array.from(values.array.subarray(i * n, i * n + n));
      };

      // Два ключевых кадра вокруг t (до первого — первый, после последнего — последний)
      let k = 0;
      while (k < times.length - 2 && times[k + 1] <= t) k++;
      let result;
      if (times.length === 1 || t <= times[0]) result = value(0);
      else if (t >= times[times.length - 1]) result = value(times.length - 1);
      else {
        const f = ch.interpolation === "STEP" ? 0 : (t - times[k]) / (times[k + 1] - times[k]);
        result = ch.path === "rotation" ? slerp(value(k), value(k + 1), f) : lerp(value(k), value(k + 1), f);
      }

      const p = pose[ch.node];
      if (ch.path === "translation") p.t = result;
      if (ch.path === "rotation") p.r = result;
      if (ch.path === "scale") p.s = result;
    }
  }

  // 5–6. Мировые матрицы костей (по дереву) и матрицы для видеокарты
  computeMatrices() {
    const done = new Uint8Array(this.model.nodes.length);
    const local = new Float32Array(16);
    const globalOf = (i) => {
      if (done[i]) return this.global[i];
      const p = this.pose[i];
      fromTRS(p.t, p.r, p.s, local);
      if (this.parent[i] >= 0) multiply(globalOf(this.parent[i]), local, this.global[i]);
      else this.global[i].set(local);
      done[i] = 1;
      return this.global[i];
    };

    const { joints, inverseBindMatrices } = this.model.skin;
    const tmp = new Float32Array(16);
    joints.forEach((node, j) => {
      multiply(globalOf(node), inverseBindMatrices.subarray(j * 16, j * 16 + 16), tmp);
      this.jointMatrices.set(tmp, j * 16);
    });
  }
}
