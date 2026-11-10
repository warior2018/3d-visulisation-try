// ============================================================
//  Анимации героя от 3-го лица — автомат состояний (движок: AnimStates). Порядок — приоритет:
//  верхом → разбег с копьём → в воздухе → стойка самурая → бег → шаг → стоим.
//  ctx: { mounted, air, stance, moving, running, speed }
// ============================================================

import { AnimStates } from "../../engine/index.js";

export const heroAnimStates = () => new AnimStates({
  states: [
    { id: "sit", clip: "Sit", when: (c) => c.mounted },
    { id: "air", clip: "Air", when: (c, m) => c.air && (m.state === "air" || c.airTime > 0.18) }, // короткий отрыв (ступенька) — не прыжок
    { id: "stance", clip: (c) => (!c.moving ? "StanceIdle" : c.running ? "StanceRun" : "StanceWalk"), when: (c) => c.stance, speed: (c) => (c.moving ? c.speed / (c.running ? 5 : 3) : 1) },
    { id: "run", clip: "Run", when: (c) => c.moving && c.running, speed: (c) => c.speed / 5.5 },
    { id: "walk", clip: "Walk", when: (c) => c.moving, speed: (c) => c.speed / 4 },
    { id: "idle", clip: "Idle" },
  ],
  fades: { "*>air": 0.12, "air>*": 0.1, "walk>run": 0.25, "run>walk": 0.25, "*>sit": 0.3, "idle>walk": 0.15 },
});
