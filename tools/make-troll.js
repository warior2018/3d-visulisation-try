// ============================================================
//  Генератор модели «пещерный тролль» (.glb) — босс логова в горе.
//  Сгорбленный великан ~2.5 м: серо-зелёная кожа, набедренная повязка из шкуры, клыки,
//  жёлтые глаза под тяжёлыми бровями. В правой руке — каменная дубина (тянется по земле),
//  левой бросает валуны.
//  Кости — как у скелета и зомби (те же имена), только крупнее.
//  Анимации: Idle, Walk, Attack (удар дубиной о землю: замах над головой, удар на 0.7 с — как
//  ATTACKS.trollSlam.windup), Throw (бросок валуна левой рукой).
//  Запуск: node tools/make-troll.js  ->  games/builder/assets/troll.glb
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, rotQ, move, quat, qmul, X, Y, Z } from "./glb-builder.js";

const OUT = fileURLToPath(new URL("../games/builder/assets/troll.glb", import.meta.url));

// Смотрит вдоль +Z, левая сторона — +X, ступни на y = 0
const BONES = [
  { name: "hips", parent: null, pos: [0, 1.2, 0] },
  { name: "spine", parent: "hips", pos: [0, 1.25, 0] },
  { name: "chest", parent: "spine", pos: [0, 1.65, 0.05] },
  { name: "neck", parent: "chest", pos: [0, 2.05, 0.15] },
  { name: "head", parent: "neck", pos: [0, 2.1, 0.2] },
  { name: "upperArm_L", parent: "chest", pos: [0.5, 1.95, 0.05] },
  { name: "forearm_L", parent: "upperArm_L", pos: [0.53, 1.45, 0.08] },
  { name: "upperArm_R", parent: "chest", pos: [-0.5, 1.95, 0.05] },
  { name: "forearm_R", parent: "upperArm_R", pos: [-0.53, 1.45, 0.08] },
  { name: "upperLeg_L", parent: "hips", pos: [0.22, 1.15, 0] },
  { name: "lowerLeg_L", parent: "upperLeg_L", pos: [0.22, 0.6, 0] },
  { name: "upperLeg_R", parent: "hips", pos: [-0.22, 1.15, 0] },
  { name: "lowerLeg_R", parent: "upperLeg_R", pos: [-0.22, 0.6, 0] },
];

const SKIN = [0.42, 0.5, 0.4]; //        серо-зелёная кожа
const SKIN_DARK = [0.32, 0.39, 0.3];
const BELLY = [0.5, 0.56, 0.44];
const HIDE = [0.4, 0.28, 0.17]; //       шкура (повязка)
const HIDE_DARK = [0.3, 0.2, 0.12];
const EYES = [0.98, 0.78, 0.18]; //      жёлтые глаза
const TUSK = [0.9, 0.86, 0.72];
const MOUTH = [0.16, 0.1, 0.09];
const WOOD = [0.38, 0.27, 0.16]; //      рукоять дубины
const STONE = [0.5, 0.5, 0.52]; //       каменная голова дубины
const STONE_DARK = [0.36, 0.36, 0.38];

const parts = [];
const box = (bone, center, size, color) => parts.push({ bone, center, size, color });

// Голова: тяжёлые брови, нос картошкой, широкая челюсть с клыками, уши
box("head", [0, 2.22, 0.28], [0.42, 0.38, 0.42], SKIN);
box("head", [0, 2.33, 0.49], [0.42, 0.07, 0.06], SKIN_DARK); //   брови
box("head", [0.09, 2.27, 0.5], [0.07, 0.05, 0.02], EYES);
box("head", [-0.09, 2.27, 0.5], [0.07, 0.05, 0.02], EYES);
box("head", [0, 2.18, 0.53], [0.1, 0.12, 0.08], SKIN_DARK); //    нос
box("head", [0, 2.06, 0.42], [0.38, 0.12, 0.2], SKIN); //         челюсть
box("head", [0, 2.08, 0.525], [0.22, 0.03, 0.01], MOUTH);
box("head", [0.11, 2.13, 0.53], [0.045, 0.1, 0.045], TUSK); //    клыки снизу вверх
box("head", [-0.11, 2.13, 0.53], [0.045, 0.1, 0.045], TUSK);
box("head", [0.25, 2.25, 0.25], [0.1, 0.15, 0.05], SKIN_DARK); // уши
box("head", [-0.25, 2.25, 0.25], [0.1, 0.15, 0.05], SKIN_DARK);
box("neck", [0, 2.04, 0.14], [0.3, 0.16, 0.3], SKIN_DARK);

// Туловище: широкая грудь, горб, пузо, повязка из шкуры
box("chest", [0, 1.8, 0.06], [0.88, 0.46, 0.56], SKIN);
box("chest", [0, 1.96, -0.16], [0.62, 0.3, 0.3], SKIN_DARK); //  горб
box("spine", [0, 1.44, 0.05], [0.72, 0.42, 0.52], SKIN);
box("spine", [0, 1.4, 0.3], [0.5, 0.32, 0.04], BELLY); //         пузо
box("hips", [0, 1.15, 0], [0.62, 0.24, 0.42], HIDE);
box("hips", [0, 0.94, 0.2], [0.32, 0.32, 0.04], HIDE_DARK); //    лоскут спереди
box("hips", [0, 0.96, -0.2], [0.4, 0.28, 0.04], HIDE_DARK); //    и сзади

// Руки — длинные и толстые, кулаки тяжёлые
for (const [side, s] of [["L", 1], ["R", -1]]) {
  box("upperArm_" + side, [0.53 * s, 1.7, 0.06], [0.27, 0.52, 0.27], SKIN);
  box("upperArm_" + side, [0.53 * s, 1.93, 0.04], [0.32, 0.16, 0.32], SKIN_DARK); // плечо
  box("forearm_" + side, [0.55 * s, 1.2, 0.1], [0.3, 0.5, 0.3], SKIN);
  box("forearm_" + side, [0.55 * s, 0.88, 0.12], [0.32, 0.22, 0.32], SKIN_DARK); //   кулак
  box("upperLeg_" + side, [0.22 * s, 0.88, 0], [0.28, 0.55, 0.3], SKIN);
  box("lowerLeg_" + side, [0.22 * s, 0.33, 0.02], [0.26, 0.55, 0.28], SKIN);
  box("lowerLeg_" + side, [0.22 * s, 0.06, 0.1], [0.32, 0.12, 0.44], SKIN_DARK); //  ступня
}

// Дубина в правом кулаке: рукоять продолжает руку вниз, каменная голова — у земли
box("forearm_R", [-0.55, 0.62, 0.12], [0.1, 0.42, 0.1], WOOD);
box("forearm_R", [-0.55, 0.3, 0.12], [0.34, 0.32, 0.34], STONE);
box("forearm_R", [-0.55, 0.3, 0.12], [0.38, 0.1, 0.38], STONE_DARK); // обвязка
box("forearm_R", [-0.73, 0.32, 0.12], [0.06, 0.1, 0.1], STONE_DARK); //  шипы
box("forearm_R", [-0.55, 0.32, 0.3], [0.1, 0.1, 0.06], STONE_DARK);

// ---------- Анимации ----------
const hipsRest = [0, 1.2, 0];
const HUNCH = 18; // сутулится вперёд
const t5 = [0, 0.25, 0.5, 0.75, 1.0];
const ANIMATIONS = {
  Idle: [
    rot("chest", X, [0, 1.6, 3.2], [HUNCH, HUNCH + 4, HUNCH]), // тяжело дышит
    rot("head", X, [0, 1.6, 3.2], [-12, -9, -12]), //            голова поднята (смотрит вперёд, а не в пол)
    rot("upperArm_R", Z, [0], [-12]), //                         дубина сбоку, у ноги
    rot("upperArm_L", X, [0, 1.6, 3.2], [-8, -14, -8]),
  ],
  // Тяжёлый шаг вразвалку
  Walk: [
    rot("upperLeg_L", X, t5, [-25, 0, 25, 0, -25]),
    rot("upperLeg_R", X, t5, [25, 0, -25, 0, 25]),
    rot("lowerLeg_L", X, t5, [10, 30, 10, 5, 10]),
    rot("lowerLeg_R", X, t5, [10, 5, 10, 30, 10]),
    rot("upperArm_L", X, t5, [20, 0, -25, 0, 20]),
    rot("upperArm_R", Z, [0], [-12]),
    rotQ("chest", t5, [6, 0, -6, 0, 6].map((z) => qmul(quat(Z, z), quat(X, HUNCH)))), // сутулый, раскачивается
    rot("head", X, [0], [-12]),
    move("hips", t5, [hipsRest, [0, 1.16, 0], hipsRest, [0, 1.16, 0], hipsRest]),
  ],
  // Удар о землю (1.3 с): дубину — над голову, на 0.7 с — в землю перед собой, пауза, обратно
  Attack: [
    rot("upperArm_R", X, [0, 0.2, 0.55, 0.7, 0.95, 1.3], [0, -60, -175, -35, -35, 0]),
    rot("upperArm_L", X, [0, 0.2, 0.55, 0.7, 0.95, 1.3], [-8, -60, -160, -40, -40, -8]),
    rot("chest", X, [0, 0.2, 0.55, 0.7, 0.95, 1.3], [HUNCH, 8, -8, 38, 34, HUNCH]),
    rot("head", X, [0, 0.55, 0.7, 1.3], [-12, -4, -30, -12]),
    move("hips", [0, 0.55, 0.7, 0.95, 1.3], [hipsRest, [0, 1.24, 0], [0, 1.08, 0], [0, 1.1, 0], hipsRest]),
  ],
  // Бросок валуна левой рукой (0.8 с): замах за голову — и вперёд
  Throw: [
    rot("upperArm_L", X, [0, 0.3, 0.45, 0.8], [-8, -165, -50, -8]),
    rot("forearm_L", X, [0, 0.3, 0.45, 0.8], [0, -50, -5, 0]),
    rotQ("chest", [0, 0.3, 0.45, 0.8], [0, -25, 20, 0].map((y) => qmul(quat(Y, y), quat(X, HUNCH)))),
  ],
};

writeGLB(OUT, buildGLB({ name: "CaveTroll", generator: "VOID tools/make-troll.js", bones: BONES, parts, animations: ANIMATIONS }));
