// ============================================================
//  Генератор модели «гигант» (.glb) — скример (scene/giant.js): безвредный великан, который раз в несколько
//  минут прибегает со спины. Своя, не чья-то: тощий, бледный, без одежды и без волос, руки длинные (кисти —
//  ниже колен), голова крупная, застывшая широкая улыбка с рядом зубов, маленькие тёмные глаза.
//  Модель — в рост ~2.5 м; в игре — ×4 (CREATURES.giant.scale): 10 блоков.
//  Анимации: Idle (стоит, голова медленно клонится набок), Run (нелепый бег: наклон вперёд, руки болтаются),
//  Sit (сел на корточки, руки — на землю перед собой; голова — чуть набок).
//  Запуск: node tools/make-giant.js  ->  games/builder/assets/giant.glb
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, rotQ, move, quat, qmul, X, Y, Z } from "./glb-builder.js";

const OUT = fileURLToPath(new URL("../games/builder/assets/giant.glb", import.meta.url));

// Смотрит вдоль +Z, левая сторона — +X, ступни на y = 0
const BONES = [
  { name: "hips", parent: null, pos: [0, 1.1, 0] },
  { name: "spine", parent: "hips", pos: [0, 1.18, 0] },
  { name: "chest", parent: "spine", pos: [0, 1.5, 0] },
  { name: "neck", parent: "chest", pos: [0, 1.86, 0.02] },
  { name: "head", parent: "neck", pos: [0, 1.95, 0.03] },
  { name: "upperArm_L", parent: "chest", pos: [0.3, 1.8, 0] },
  { name: "forearm_L", parent: "upperArm_L", pos: [0.33, 1.3, 0] },
  { name: "upperArm_R", parent: "chest", pos: [-0.3, 1.8, 0] },
  { name: "forearm_R", parent: "upperArm_R", pos: [-0.33, 1.3, 0] },
  { name: "upperLeg_L", parent: "hips", pos: [0.14, 1.06, 0] },
  { name: "lowerLeg_L", parent: "upperLeg_L", pos: [0.14, 0.56, 0] },
  { name: "upperLeg_R", parent: "hips", pos: [-0.14, 1.06, 0] },
  { name: "lowerLeg_R", parent: "upperLeg_R", pos: [-0.14, 0.56, 0] },
];

const SKIN = [0.86, 0.72, 0.64]; //       бледная кожа
const SKIN_DARK = [0.74, 0.6, 0.53]; //   складки, суставы
const RIBS = [0.8, 0.66, 0.58];
const EYE = [0.06, 0.05, 0.05]; //        маленькие тёмные глаза
const MOUTH = [0.24, 0.07, 0.08]; //      десна
const TOOTH = [0.95, 0.93, 0.86];

const parts = [];
const box = (bone, center, size, color) => parts.push({ bone, center, size, color });

// Голова: крупная, вытянутая, лоб высокий; рот — во всю ширину лица, зубы в два ряда
box("head", [0, 2.16, 0.04], [0.44, 0.46, 0.42], SKIN);
box("head", [0, 2.4, 0.02], [0.4, 0.06, 0.38], SKIN); //            макушка
box("head", [0.1, 2.24, 0.255], [0.05, 0.04, 0.01], EYE);
box("head", [-0.1, 2.24, 0.255], [0.05, 0.04, 0.01], EYE);
box("head", [0, 2.29, 0.252], [0.3, 0.02, 0.01], SKIN_DARK); //      надбровье
box("head", [0, 2.17, 0.27], [0.06, 0.08, 0.04], SKIN_DARK); //     нос
// Улыбка от уха до уха — дугой: посередине ниже, к краям лица поднимается и уходит по щекам к ушам.
// Каждый кусочек дуги — полоска десны с зубом сверху и снизу
const smile = (x) => 2.0 + 2.2 * x * x; // высота середины рта в точке x (на лице)
for (let i = -10; i <= 10; i++) {
  const x = i * 0.021, y = smile(x);
  box("head", [x, y, 0.252], [0.023, 0.07, 0.01], MOUTH);
  box("head", [x, y + 0.02, 0.258], [0.017, 0.026, 0.01], TOOTH); //   верхний зуб
  box("head", [x, y - 0.02, 0.258], [0.017, 0.026, 0.01], TOOTH); //   нижний зуб
}
// по щекам — к ушам (на боковых гранях головы), продолжая подъём дуги
for (const s of [1, -1]) for (let k = 0; k < 5; k++) {
  const z = 0.2 - k * 0.04, y = smile(0.21) + 0.02 + k * 0.012;
  box("head", [0.222 * s, y, z], [0.01, 0.065 - k * 0.008, 0.042], MOUTH);
  if (k < 4) box("head", [0.228 * s, y + 0.016, z], [0.01, 0.022, 0.03], TOOTH);
}
box("head", [0.235, 2.18, 0.02], [0.04, 0.12, 0.08], SKIN); //      уши
box("head", [-0.235, 2.18, 0.02], [0.04, 0.12, 0.08], SKIN);
box("neck", [0, 1.9, 0.02], [0.14, 0.16, 0.14], SKIN_DARK);

// Туловище: узкое, видны рёбра, впалый живот
box("chest", [0, 1.66, 0], [0.5, 0.34, 0.26], SKIN);
for (const y of [1.58, 1.64, 1.7]) box("chest", [0, y, 0.135], [0.38, 0.015, 0.01], RIBS);
box("spine", [0, 1.34, 0], [0.36, 0.32, 0.2], SKIN);
box("hips", [0, 1.08, 0], [0.4, 0.18, 0.22], SKIN_DARK);

// Руки — длинные и тонкие (кисти ниже колен), ноги — тощие с большими ступнями
for (const [side, s] of [["L", 1], ["R", -1]]) {
  box("upperArm_" + side, [0.33 * s, 1.56, 0], [0.11, 0.52, 0.11], SKIN);
  box("upperArm_" + side, [0.32 * s, 1.79, 0], [0.16, 0.08, 0.16], SKIN_DARK); //  плечо
  box("forearm_" + side, [0.33 * s, 1.0, 0], [0.09, 0.62, 0.09], SKIN);
  box("forearm_" + side, [0.33 * s, 0.63, 0.02], [0.13, 0.14, 0.07], SKIN_DARK); // ладонь
  for (const f of [-0.04, 0, 0.04]) box("forearm_" + side, [0.33 * s + f, 0.5, 0.02], [0.025, 0.14, 0.03], SKIN); // пальцы
  box("upperLeg_" + side, [0.14 * s, 0.82, 0], [0.13, 0.5, 0.14], SKIN);
  box("lowerLeg_" + side, [0.14 * s, 0.31, 0], [0.11, 0.52, 0.12], SKIN);
  box("lowerLeg_" + side, [0.14 * s, 0.56, 0.02], [0.13, 0.06, 0.13], SKIN_DARK); // колено
  box("lowerLeg_" + side, [0.14 * s, 0.04, 0.08], [0.16, 0.08, 0.3], SKIN_DARK); //  ступня
}

// ---------- Анимации ----------
const hipsRest = [0, 1.1, 0];
const t5 = [0, 0.2, 0.4, 0.6, 0.8];
const ANIMATIONS = {
  // Стоит: руки висят, голова медленно клонится набок и обратно — смотрит
  Idle: [
    rot("head", Z, [0, 2, 4], [0, 14, 0]),
    rot("chest", X, [0, 2, 4], [4, 6, 4]),
    rot("upperArm_L", Z, [0, 2, 4], [4, 6, 4]),
    rot("upperArm_R", Z, [0, 2, 4], [-4, -6, -4]),
  ],
  // Бег (0.8 с — два шага): наклон вперёд, длинные шаги, руки болтаются вразнобой, голова неподвижна
  Run: [
    rot("upperLeg_L", X, t5, [-50, -10, 40, -10, -50]),
    rot("upperLeg_R", X, t5, [40, -10, -50, -10, 40]),
    rot("lowerLeg_L", X, t5, [20, 70, 15, 10, 20]),
    rot("lowerLeg_R", X, t5, [15, 10, 20, 70, 15]),
    rot("upperArm_L", X, t5, [50, 10, -60, 10, 50]),
    rot("upperArm_R", X, t5, [-45, 20, 55, 0, -45]),
    rot("forearm_L", X, t5, [-10, -30, -40, -20, -10]),
    rot("forearm_R", X, t5, [-40, -20, -10, -30, -40]),
    rotQ("chest", t5, [8, 0, -8, 0, 8].map((z) => qmul(quat(Z, z), quat(X, 22)))),
    rot("head", X, t5, [-20, -18, -20, -18, -20]),
    move("hips", t5, [hipsRest, [0, 1.16, 0], hipsRest, [0, 1.16, 0], hipsRest]),
  ],
  // Сидит на корточках: таз низко, колени вверх, руки упираются в землю перед собой
  Sit: [
    move("hips", [0], [[0, 0.5, 0]]),
    rot("upperLeg_L", X, [0], [-110]),
    rot("upperLeg_R", X, [0], [-110]),
    rot("lowerLeg_L", X, [0], [125]),
    rot("lowerLeg_R", X, [0], [125]),
    rot("chest", X, [0], [30]),
    rot("upperArm_L", X, [0], [-40]),
    rot("upperArm_R", X, [0], [-40]),
    rot("head", X, [0, 2.5, 5], [-35, -35, -35]),
    rot("neck", Z, [0, 2.5, 5], [0, 12, 0]),
  ],
};

writeGLB(OUT, buildGLB({ name: "Giant", generator: "VOID tools/make-giant.js", bones: BONES, parts, animations: ANIMATIONS }));
