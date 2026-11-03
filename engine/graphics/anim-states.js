// ============================================================
//  Автомат состояний анимации: вместо цепочки «если сидим — Sit, иначе если бежим...» — список состояний
//  с условиями. Каждый кадр выбирается ПЕРВОЕ состояние, чьё условие верно (порядок = приоритет), и
//  аниматору ставится его клип со своей скоростью; переход — плавный, длина — по паре «откуда > куда».
//
//    const legs = new AnimStates({
//      states: [
//        { id: "sit", clip: "Sit", when: (c) => c.mounted },
//        { id: "walk", clip: "Walk", when: (c) => c.moving, speed: (c) => c.speed / 4 },
//        { id: "idle", clip: "Idle" }, //                     без when — всегда (последнее — «по умолчанию»)
//      ],
//      fades: { "idle>walk": 0.12, "*>sit": 0.3 }, //        свои длины переходов (по умолчанию — fade)
//    });
//    legs.update(animator, { mounted, moving, speed });    // каждый кадр
//    legs.state                                             // id текущего состояния
// ============================================================

export class AnimStates {
  constructor({ states, fades = {}, fade = 0.2 }) {
    this.states = states;
    this.fades = fades;
    this.fade = fade;
    this.state = null;
    this.time = 0; // сколько в текущем состоянии (секунд)
  }

  // Длина перехода из a в b: "a>b", "*>b", "a>*" или по умолчанию
  fadeFor(a, b) {
    const f = this.fades;
    return f[`${a}>${b}`] ?? f[`*>${b}`] ?? f[`${a}>*`] ?? this.fade;
  }

  // Выбрать состояние (первое подходящее) и поставить клип. dt — для счётчика времени в состоянии
  update(animator, ctx, dt = 0) {
    const s = this.states.find((x) => !x.when || x.when(ctx, this)) || this.states.at(-1);
    if (s.id !== this.state) {
      const fade = this.state ? this.fadeFor(this.state, s.id) : 0.01;
      this.state = s.id;
      this.time = 0;
      animator?.setBase(clipOf(s, ctx), speedOf(s, ctx), fade);
    } else {
      this.time += dt;
      animator?.setBase(clipOf(s, ctx), speedOf(s, ctx), this.fadeFor(this.state, s.id));
    }
    return s;
  }
}

const clipOf = (s, ctx) => (typeof s.clip === "function" ? s.clip(ctx) : s.clip);
const speedOf = (s, ctx) => (typeof s.speed === "function" ? s.speed(ctx) : s.speed ?? 1);
