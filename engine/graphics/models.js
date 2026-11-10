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
import { paintColors } from "./paint.js";
import { Animator } from "./animator.js";
import { fromTRS, quatY, quatX, quatMultiply, multiply } from "../math/mat4.js";

const HURT_FLASH = 0.25; // секунд красной вспышки после удара
const FALL_TIME = 0.55; //  за сколько павший валится на землю (с ускорением, как под силой тяжести)
// Падение тела: куда валится (по id — у каждого своё): на спину, вперёд, на бок. Чуть отскакивает от земли
const FALL_SIDES = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 0]];
function fallRotation(e) {
  const k = Math.min(e.deadTime / FALL_TIME, 1);
  const ease = k * k; //                                       ускоряется к земле
  const bounce = k >= 1 ? Math.max(0, Math.sin(Math.min(1, (e.deadTime - FALL_TIME) / 0.25) * Math.PI)) * 0.08 : 0;
  const angle = (Math.PI / 2) * ease - bounce;
  const [fx, fz] = FALL_SIDES[(e.id ?? 0) % FALL_SIDES.length];
  return fx ? quatX(fx * -angle) : [0, 0, Math.sin((fz * angle) / 2), Math.cos((fz * angle) / 2)];
}

export class ModelLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.models = new Map(); // имя -> { model, mesh, mirrorX }
    this.freeSkins = new Map(); // имя -> [свободные skin]
    // Скины: resolve(name, owner) → какую модель на самом деле взять (owner — сущность, которую одеваем).
    // Игра ставит свой: например "w-katana" у своего героя → variant("w-katana", "sakura", кисть)
    this.resolve = (name) => name;
    // Свет на моделях: lightAt(position) → 0..1 (как у блоков: под крышей и в пещере — темнее). Игра ставит
    // свою (по миру); null — все модели в полную силу. Темнее — тот же оттенок (tint) чёрным: шейдер прежний
    this.lightAt = null;
  }

  // Вариант модели name, перекрашенный кистью paint (engine/graphics/paint.js) — грузится один раз,
  // при первом спросе. Вернёт имя варианта ("name@key") или name, если такой модели нет
  variant(name, key, paint) {
    const id = `${name}@${key}`;
    if (this.models.has(id)) return id;
    const base = this.models.get(name);
    if (!base?.file) return name;
    this.load(id, base.file, { ...base.opts, paint });
    return id;
  }

  // mirrorX — отразить модель по X (если в файле левое и правое перепутаны относительно нашего мира)
  // recolor — перекрасить вершины: [{ from: [r, g, b], to: [r, g, b] }] (цвета 0..1).
  //   Так из одной модели получаются разноцветные: например, блок в руке под цвет палитры.
  // paint — кисть (r, g, b) → [r, g, b] | null на все вершины после recolor (скины: engine/graphics/paint.js)
  load(name, file, { mirrorX = false, recolor = [], paint = null } = {}) {
    const model = loadGLB(file);
    for (const { from, to } of recolor) {
      const c = model.colors;
      for (let i = 0; i < c.length; i += 3) {
        const same = Math.abs(c[i] - from[0]) < 0.01 && Math.abs(c[i + 1] - from[1]) < 0.01 && Math.abs(c[i + 2] - from[2]) < 0.01;
        if (same) c.set(to, i);
      }
    }
    if (paint) paintColors(model.colors, paint);
    this.models.set(name, { model, mesh: this.renderer.createMesh(model), mirrorX, file, opts: { mirrorX, recolor } });
    return model;
  }

  has(name) {
    return this.models.has(name);
  }

  // Одеть сущность в модель: появится entity.view = { skin, animator, ... }
  // name — какую спросили (view.name), key — какая на самом деле (скин: resolve)
  attach(entity, name) {
    const key = this.resolve(name, entity) || name;
    const m = this.models.get(key);
    if (!m) return false; // такой модели нет — сущность живёт, но невидима
    entity.view = {
      name, key, owner: entity,
      skin: this.freeSkins.get(key)?.pop() || this.renderer.createSkin(m.mesh),
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

  // Надеть на сущность вещь (каска, рюкзак...): модель name на кость bone, отдельно от предмета в руке.
  // name = null — снять. Сейчас — одна надетая вещь на сущность
  //   models.wear(mob, "mob-helmet", { bone: "head" });
  wear(entity, name, { bone, position = [0, 0, 0], rotation = [0, 0, 0, 1] } = {}) {
    const v = entity.view;
    if (!v) return false;
    if ((v.worn?.name ?? null) === (name ?? null) && v.worn?.bone === bone) return true;
    if (v.worn) this.release(v.worn);
    v.worn = name ? this.mount(v, name, { bone, position, rotation }) : null;
    return !!v.worn;
  }

  // Прицепить модель name к кости bone модели v — { name, bone, node, skin, ... } или null (нет модели / кости)
  mount(v, name, { bone, position = [0, 0, 0], rotation = [0, 0, 0, 1] }) {
    const key = name && (this.resolve(name, v.owner) || name);
    const m = key && this.models.get(key);
    if (!m) return null;
    const node = v.animator.model.nodes.findIndex((n) => n.name === bone);
    if (node < 0) return null;
    return {
      name, key, bone, node,
      skin: this.freeSkins.get(key)?.pop() || this.renderer.createSkin(m.mesh),
      animator: new Animator(m.model),
      offset: fromTRS(position, rotation),
      modelMatrix: new Float32Array(16),
      tmp: new Float32Array(16),
    };
  }

  release(held) {
    const key = held.key || held.name;
    if (!this.freeSkins.has(key)) this.freeSkins.set(key, []);
    this.freeSkins.get(key).push(held.skin);
  }

  // Снять модель (сущность исчезла): буфер — в запас
  detach(entity) {
    const v = entity.view;
    if (!v) return;
    if (v.held) this.release(v.held);
    if (v.extra) this.release(v.extra);
    if (v.worn) this.release(v.worn);
    this.release(v);
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
      // Павший: поза «Fallen» (если есть в модели) плавно, а потом анимация замирает
      if (!e.alive) {
        if (a.clips.has("Fallen")) a.setBase("Fallen", 1, 0.3);
        if (e.deadTime > FALL_TIME + 0.4) continue;
      }
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
      if (!e.alive && !e.silhouette) rotation = quatMultiply(rotation, fallRotation(e)); // призрак не падает — стоит
      const p = e.renderPosition || e.position;
      const k = e.scale ?? 1; // размер (маленький скелет — 0.6, большая турель — 2)
      fromTRS([p.x, p.y + (e.drawOffsetY || 0), p.z], rotation, [(v.mirrorX ? -1 : 1) * k, k, k], v.modelMatrix);

      // Красная вспышка после удара: от 0.7 до 0
      const flash = e.hurtTime < HURT_FLASH ? 0.7 * (1 - e.hurtTime / HURT_FLASH) : 0;
      if (flash > 0) v.tint.set([1, 0.12, 0.12, flash]);
      else {
        // свет места: плавно (за ~0.3 с) к тому, что вокруг, — вошёл под крышу, и модель потемнела
        const want = this.lightAt ? this.lightAt(p, e) : 1;
        v.light = v.light === undefined ? want : v.light + (want - v.light) * 0.15;
        v.tint.set([0, 0, 0, Math.max(0, Math.min(0.85, 1 - v.light))]);
      }

      // e.silhouette — "ally" (союзник: виден сквозь стены), "ghost" (призрак: только полупрозрачный силуэт),
      // "faint" (почти прозрачно своими цветами), "alert" (модель + красная обводка)
      const sil = e.silhouette || null, hidden = sil === "ghost" || sil === "faint"; // эти — только силуэтом
      out.push({ skin: v.skin, modelMatrix: v.modelMatrix, jointMatrices: v.animator.jointMatrices, tint: v.tint, sil, hidden });

      // Предмет в руке (и второй — extra, и надетая вещь — worn): матрица сущности × мировая матрица кости × сдвиг предмета
      for (const h of [v.held, v.extra, v.worn]) {
        if (!h) continue;
        multiply(v.modelMatrix, v.animator.global[h.node], h.tmp);
        multiply(h.tmp, h.offset, h.modelMatrix);
        out.push({ skin: h.skin, modelMatrix: h.modelMatrix, jointMatrices: h.animator.jointMatrices, tint: v.tint, sil, hidden });
      }
    }
    return out;
  }
}
