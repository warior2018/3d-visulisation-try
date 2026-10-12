// ============================================================
//  Генератор модели «кабан» (.glb): четыре ноги, щетина на спине, пятачок
//  и БИВНИ. Два файла: boar.glb — дикий, boar-saddle.glb — приручённый (с седлом).
//  Запуск: node tools/make-boar.js  ->  games/builder/assets/boar*.glb
//
//  Смотрит вдоль +Z, ступни на y = 0, длина ~1.2 м, высота в холке ~0.8 м.
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, move, X, Y, Z } from "./glb-builder.js";

const out = (name) => fileURLToPath(new URL(`../games/builder/assets/${name}`, import.meta.url));

const BONES = [
  { name: "body", parent: null, pos: [0, 0.55, 0] },
  { name: "head", parent: "body", pos: [0, 0.62, 0.48] },
  { name: "leg_FL", parent: "body", pos: [0.17, 0.4, 0.33] },
  { name: "leg_FR", parent: "body", pos: [-0.17, 0.4, 0.33] },
  { name: "leg_BL", parent: "body", pos: [0.17, 0.4, -0.33] },
  { name: "leg_BR", parent: "body", pos: [-0.17, 0.4, -0.33] },
  { name: "tail", parent: "body", pos: [0, 0.62, -0.55] },
];

const FUR = [0.4, 0.27, 0.17]; //       бурая шерсть
const FUR_DARK = [0.27, 0.18, 0.11]; // щетина, уши
const SNOUT = [0.72, 0.5, 0.45]; //     пятачок
const HOOF = [0.14, 0.11, 0.09];
const TUSK = [0.94, 0.92, 0.84]; //     бивни
const EYE = [0.08, 0.06, 0.05];
const SADDLE = [0.55, 0.16, 0.12]; //   седло — красное
const SADDLE_DARK = [0.35, 0.22, 0.12];

function makeBoar(saddle) {
  const parts = [];
  const box = (bone, center, size, color) => parts.push({ bone, center, size, color });

  // Туловище и щетина по хребту
  box("body", [0, 0.58, 0], [0.5, 0.42, 1.0], FUR);
  box("body", [0, 0.6, 0.38], [0.54, 0.46, 0.26], FUR); //   плечи — шире и выше
  box("body", [0, 0.83, 0.1], [0.12, 0.08, 0.8], FUR_DARK); // щетина
  box("body", [0, 0.86, 0.32], [0.1, 0.08, 0.22], FUR_DARK);

  // Голова: морда, пятачок, глаза, уши, бивни (по два бруска — загибаются вверх)
  box("head", [0, 0.6, 0.62], [0.36, 0.32, 0.3], FUR);
  box("head", [0, 0.54, 0.82], [0.24, 0.2, 0.14], FUR);
  box("head", [0, 0.53, 0.9], [0.18, 0.14, 0.03], SNOUT);
  box("head", [0.1, 0.68, 0.775], [0.05, 0.05, 0.01], EYE);
  box("head", [-0.1, 0.68, 0.775], [0.05, 0.05, 0.01], EYE);
  box("head", [0.15, 0.8, 0.56], [0.08, 0.1, 0.05], FUR_DARK);
  box("head", [-0.15, 0.8, 0.56], [0.08, 0.1, 0.05], FUR_DARK);
  for (const s of [1, -1]) {
    box("head", [0.13 * s, 0.47, 0.88], [0.04, 0.04, 0.1], TUSK); //  вперёд
    box("head", [0.14 * s, 0.53, 0.94], [0.035, 0.1, 0.035], TUSK); // и вверх
  }

  // Ноги с копытами
  for (const [leg, x, z] of [["FL", 0.17, 0.33], ["FR", -0.17, 0.33], ["BL", 0.17, -0.33], ["BR", -0.17, -0.33]]) {
    box("leg_" + leg, [x, 0.22, z], [0.13, 0.36, 0.14], FUR);
    box("leg_" + leg, [x, 0.03, z + 0.01], [0.14, 0.06, 0.15], HOOF);
  }
  box("tail", [0, 0.6, -0.56], [0.04, 0.12, 0.04], FUR_DARK);

  // Седло: попона, сиденье и стремена
  if (saddle) {
    box("body", [0, 0.8, -0.02], [0.54, 0.04, 0.42], SADDLE);
    box("body", [0, 0.84, 0.0], [0.3, 0.06, 0.3], SADDLE_DARK);
    box("body", [0, 0.88, 0.13], [0.22, 0.06, 0.05], SADDLE_DARK); // передняя лука
    for (const s of [1, -1]) box("body", [0.28 * s, 0.6, 0], [0.03, 0.4, 0.05], SADDLE_DARK);
  }
  return parts;
}

const bodyRest = [0, 0.55, 0];
const t5 = [0, 0.25, 0.5, 0.75, 1.0];
const ANIMATIONS = {
  Idle: [
    rot("head", X, [0, 1, 2], [0, 6, 0]), //    роет носом
    rot("tail", Z, [0, 0.5, 1], [-20, 20, -20]),
  ],
  // Рысь: диагональные пары ног вместе
  Walk: [
    rot("leg_FL", X, t5, [-30, 0, 30, 0, -30]),
    rot("leg_BR", X, t5, [-30, 0, 30, 0, -30]),
    rot("leg_FR", X, t5, [30, 0, -30, 0, 30]),
    rot("leg_BL", X, t5, [30, 0, -30, 0, 30]),
    rot("head", X, t5, [0, 4, 0, 4, 0]),
    move("body", t5, [bodyRest, [0, 0.57, 0], bodyRest, [0, 0.57, 0], bodyRest]),
  ],
  // Удар бивнями: голова вниз и резко вверх
  Attack: [rot("head", X, [0, 0.2, 0.35, 0.6], [0, 25, -30, 0])],
};

for (const [file, saddle] of [["boar.glb", false], ["boar-saddle.glb", true]]) {
  writeGLB(out(file), buildGLB({ name: saddle ? "BoarSaddle" : "Boar", generator: "VOID tools/make-boar.js", bones: BONES, parts: makeBoar(saddle), animations: ANIMATIONS }));
}
