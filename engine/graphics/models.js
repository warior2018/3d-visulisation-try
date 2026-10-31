// ============================================================
//  Библиотека моделей: загрузить .glb один раз — и одевать в неё сколько угодно сущностей.
//
//  Модель (сетка, кости) лежит в видеокарте в ОДНОМ экземпляре. Каждой сущности
//  достаётся только своё: маленький буфер с матрицами («skin») и свой аниматор,
//  чтобы каждый скелет шагал и бил в своём ритме.
//
//  Буферы ушедших сущностей не уничтожаем, а складываем в запас и отдаём следующим:
//  уничтожать буфер, пока видеокарта, возможно, ещё рисует с ним кадр, опасно.
// ============================================================

import { loadGLB } from "./gltf.js";
import { Animator } from "./animator.js";
import { fromTRS, quatY, quatX, quatMultiply, multiply } from "../math/mat4.js";

const HURT_FLASH = 0.25; // секунд красной вспышки после удара
const FALL_TIME = 0.5; //   за сколько павший заваливается на спину

export class ModelLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.models = new Map(); // имя -> { model, mesh, mirrorX }
    this.freeSkins = new Map(); // имя -> [свободные skin]
  }

  // mirrorX — отразить модель по X (если в файле левое и правое перепутаны относительно нашего мира)
  // recolor — перекрасить вершины: [{ from: [r, g, b], to: [r, g, b] }] (цвета 0..1).
  //   Так из одной модели получаются разноцветные: например, блок в руке под цвет палитры.
  load(name, file, { mirrorX = false, recolor = [] } = {}) {
    const model = loadGLB(file);
    for (const { from, to } of recolor) {
      const c = model.colors;
      for (let i = 0; i < c.length; i += 3) {
        const same = Math.abs(c[i] - from[0]) < 0.01 && Math.abs(c[i + 1] - from[1]) < 0.01 && Math.abs(c[i + 2] - from[2]) < 0.01;
        if (same) c.set(to, i);
      }
    }
    this.models.set(name, { model, mesh: this.renderer.createMesh(model), mirrorX });
    return model;
  }

  has(name) {
    return this.models.has(name);
  }

  // Одеть сущность в модель: появится entity.view = { skin, animator, ... }
  attach(entity, name) {
    const m = this.models.get(name);
    if (!m) return false; // такой модели нет — сущность живёт, но невидима
    entity.view = {
      name,
      skin: this.freeSkins.get(name)?.pop() || this.renderer.createSkin(m.mesh),
      animator: new Animator(m.model),
      modelMatrix: new Float32Array(16),
      tint: new Float32Array(4),
      mirrorX: m.mirrorX,
    };
    return true;
  }

  // Дать сущности предмет в руку (оружие от 3-го лица): модель name крепится к кости bone
  // со сдвигом position и поворотом rotation (в осях кости). name = null — убрать из руки.
  //   models.hold(player, "w-pistol", { bone: "forearm_R", position: [0, -0.29, 0], rotation: q });
  // extra — второй предмет на теле одновременно с первым ({ model, bone, position, rotation }): например,
  // пустые ножны на бедре, пока клинок в руке. Не передан — второго предмета нет
  hold(entity, name, { bone, position = [0, 0, 0], rotation = [0, 0, 0, 1], extra = null } = {}) {
    const v = entity.view;
    if (!v) return false;
    if ((v.extra?.name ?? null) !== (extra?.model ?? null) || v.extra?.bone !== extra?.bone) {
      if (v.extra) this.release(v.extra);
      v.extra = extra ? this.mount(v, extra.model, extra) : null;
    }
    if ((v.held?.name ?? null) === (name ?? null) && v.held?.bone === bone) return true;
    if (v.held) this.release(v.held);
    v.held = name ? this.mount(v, name, { bone, position, rotation }) : null;
    return !!v.held;
  }

  // Прицепить модель name к кости bone модели v — { name, bone, node, skin, ... } или null (нет модели / кости)
  mount(v, name, { bone, position = [0, 0, 0], rotation = [0, 0, 0, 1] }) {
    const m = name && this.models.get(name);
    if (!m) return null;
    const node = v.animator.model.nodes.findIndex((n) => n.name === bone);
    if (node < 0) return null;
    return {
      name, bone, node,
      skin: this.freeSkins.get(name)?.pop() || this.renderer.createSkin(m.mesh),
      animator: new Animator(m.model),
      offset: fromTRS(position, rotation),
      modelMatrix: new Float32Array(16),
      tmp: new Float32Array(16),
    };
  }

  release(held) {
    if (!this.freeSkins.has(held.name)) this.freeSkins.set(held.name, []);
    this.freeSkins.get(held.name).push(held.skin);
  }

  // Снять модель (сущность исчезла): буфер — в запас
  detach(entity) {
    const v = entity.view;
    if (!v) return;
    if (v.held) this.release(v.held);
    if (v.extra) this.release(v.extra);
    if (!this.freeSkins.has(v.name)) this.freeSkins.set(v.name, []);
    this.freeSkins.get(v.name).push(v.skin);
    entity.view = null;
  }

  // Прокрутить анимации всех одетых сущностей
  // Анимации. center / near / far — экономия, когда существ много: дальше far (не видно) — не считаем вовсе,
  // между near и far — раз в два кадра (с накопленным временем: анимация идёт с той же скоростью)
  update(entities, dt, { center = null, near = Infinity, far = Infinity } = {}) {
    this.frame = (this.frame || 0) + 1;
    for (const e of entities) {
      const a = e.view?.animator;
      if (!a) continue;
      const d = center ? Math.hypot(e.position.x - center.x, e.position.z - center.z) : 0;
      if (d > far) {
        e.animDt = (e.animDt || 0) + dt; // не видно — время копим (покажется — догонит)
        continue;
      }
      const t = (e.animDt || 0) + dt;
      if (d > near && (this.frame + e.id) % 2) {
        e.animDt = t; // далеко — через кадр
        continue;
      }
      e.animDt = 0;
      a.update(Math.min(t, 0.5)); // долго не считали — не прыгаем дальше полсекунды
    }
  }

  // Что отдать рендереру: [{ skin, modelMatrix, jointMatrices, tint }]. hide — кого не рисовать
  drawList(entities, hide = null) {
    const out = [];
    for (const e of entities) {
      const v = e.view;
      if (!v || e === hide) continue;

      // Поворот по yaw; крен (roll — наклон вбок, например Q/E) — вокруг оси «вперёд» у ног;
      // павший заваливается на спину (поворот вокруг оси X)
      // Где и как повёрнут на картинке: сглаженное между тиками (engine/world/interpolation.js), если есть
      let rotation = quatY(e.renderYaw ?? e.yaw);
      if (e.tilt) rotation = quatMultiply(rotation, quatX(e.tilt)); // наклон вперёд (ловушка на стене — tilt π/2)
      if (e.roll) rotation = quatMultiply(rotation, [0, 0, Math.sin(e.roll / 2), Math.cos(e.roll / 2)]);
      if (!e.alive) rotation = quatMultiply(rotation, quatX(-Math.min(e.deadTime / FALL_TIME, 1) * (Math.PI / 2)));
      const p = e.renderPosition || e.position;
      const k = e.scale ?? 1; // размер (маленький скелет — 0.6, большая турель — 2)
      fromTRS([p.x, p.y + (e.drawOffsetY || 0), p.z], rotation, [(v.mirrorX ? -1 : 1) * k, k, k], v.modelMatrix);

      // Красная вспышка после удара: от 0.7 до 0
      const flash = e.hurtTime < HURT_FLASH ? 0.7 * (1 - e.hurtTime / HURT_FLASH) : 0;
      v.tint.set([1, 0.12, 0.12, flash]);

      out.push({ skin: v.skin, modelMatrix: v.modelMatrix, jointMatrices: v.animator.jointMatrices, tint: v.tint });

      // Предмет в руке (и второй — extra): матрица сущности × мировая матрица кости × сдвиг предмета
      for (const h of [v.held, v.extra]) {
        if (!h) continue;
        multiply(v.modelMatrix, v.animator.global[h.node], h.tmp);
        multiply(h.tmp, h.offset, h.modelMatrix);
        out.push({ skin: h.skin, modelMatrix: h.modelMatrix, jointMatrices: h.animator.jointMatrices, tint: v.tint });
      }
    }
    return out;
  }
}
