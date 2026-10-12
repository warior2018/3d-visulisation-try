// ============================================================
//  Генератор модели «зомби» (.glb): человек из брусков — зелёная кожа,
//  рваная рубаха, штаны и железная КАСКА (поэтому он крепче: броня).
//  Скелет костей — тот же, что у скелета (tools/make-skeleton.js), так что
//  и размеры у них одни. Руки зомби вытянуты вперёд.
//  Запуск: node tools/make-zombie.js  ->  games/builder/assets/zombie.glb
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, move, X, Y, Z } from "./glb-builder.js";

const OUT = fileURLToPath(new URL("../games/builder/assets/zombie.glb", import.meta.url));

// Кости — как у скелета: смотрит вдоль +Z, левая сторона — +X, ступни на y = 0
const BONES = [
  { name: "hips", parent: null, pos: [0, 0.95, 0] },
  { name: "spine", parent: "hips", pos: [0, 1.0, 0] },
  { name: "chest", parent: "spine", pos: [0, 1.3, 0] },
  { name: "neck", parent: "chest", pos: [0, 1.52, 0] },
  { name: "head", parent: "neck", pos: [0, 1.6, 0] },
  { name: "upperArm_L", parent: "chest", pos: [0.25, 1.47, 0] },
  { name: "forearm_L", parent: "upperArm_L", pos: [0.25, 1.19, 0] },
  { name: "upperArm_R", parent: "chest", pos: [-0.25, 1.47, 0] },
  { name: "forearm_R", parent: "upperArm_R", pos: [-0.25, 1.19, 0] },
  { name: "upperLeg_L", parent: "hips", pos: [0.1, 0.92, 0] },
  { name: "lowerLeg_L", parent: "upperLeg_L", pos: [0.1, 0.5, 0] },
  { name: "upperLeg_R", parent: "hips", pos: [-0.1, 0.92, 0] },
  { name: "lowerLeg_R", parent: "upperLeg_R", pos: [-0.1, 0.5, 0] },
];

const SKIN = [0.42, 0.58, 0.32]; //      зеленоватая кожа
const SKIN_DARK = [0.32, 0.45, 0.24];
const SHIRT = [0.32, 0.4, 0.55]; //      выцветшая синяя рубаха
const SHIRT_TORN = [0.24, 0.3, 0.42];
const PANTS = [0.3, 0.24, 0.18]; //      коричневые штаны
const BOOTS = [0.16, 0.13, 0.11];
const HELMET = [0.42, 0.45, 0.4]; //     каска — тусклый металл
const HELMET_DARK = [0.3, 0.33, 0.29];
const EYES = [0.85, 0.9, 0.2]; //        жёлтые глаза
const MOUTH = [0.15, 0.08, 0.08];

const parts = [];
const box = (bone, center, size, color) => parts.push({ bone, center, size, color });

// Голова, лицо и каска
box("head", [0, 1.74, 0], [0.28, 0.28, 0.28], SKIN);
box("head", [0.065, 1.76, 0.142], [0.06, 0.04, 0.01], EYES);
box("head", [-0.065, 1.76, 0.142], [0.06, 0.04, 0.01], EYES);
box("head", [0, 1.66, 0.142], [0.12, 0.03, 0.01], MOUTH);
box("head", [0, 1.89, 0], [0.32, 0.08, 0.32], HELMET); //       купол каски
box("head", [0, 1.95, 0], [0.24, 0.05, 0.24], HELMET); //       верх купола
box("head", [0, 1.85, 0], [0.38, 0.025, 0.38], HELMET_DARK); // поля каски
box("head", [0, 1.85, 0.2], [0.2, 0.025, 0.04], HELMET_DARK); // козырёк чуть вперёд
box("neck", [0, 1.56, 0], [0.12, 0.1, 0.12], SKIN_DARK);

// Туловище: рубаха (с рваными краями) и пояс
box("chest", [0, 1.36, 0], [0.42, 0.3, 0.22], SHIRT);
box("spine", [0, 1.12, 0], [0.38, 0.2, 0.2], SHIRT);
box("spine", [0.12, 1.02, 0.08], [0.1, 0.06, 0.06], SHIRT_TORN); // рваный край
box("spine", [-0.08, 1.0, 0.09], [0.12, 0.05, 0.05], SHIRT_TORN);
box("chest", [0.08, 1.4, 0.115], [0.08, 0.08, 0.01], SKIN_DARK); // дыра в рубахе
box("hips", [0, 0.95, 0], [0.36, 0.12, 0.2], PANTS);

// Руки (кожа, рукава до локтя) и ноги (штаны, ботинки)
for (const [side, s] of [["L", 1], ["R", -1]]) {
  box("upperArm_" + side, [0.25 * s, 1.34, 0], [0.11, 0.28, 0.11], SHIRT);
  box("forearm_" + side, [0.25 * s, 1.06, 0], [0.09, 0.26, 0.09], SKIN);
  box("forearm_" + side, [0.25 * s, 0.89, 0.01], [0.1, 0.09, 0.07], SKIN_DARK); // кисть
  box("upperLeg_" + side, [0.1 * s, 0.71, 0], [0.13, 0.42, 0.14], PANTS);
  box("lowerLeg_" + side, [0.1 * s, 0.29, 0], [0.12, 0.42, 0.13], PANTS);
  box("lowerLeg_" + side, [0.1 * s, 0.05, 0.03], [0.13, 0.1, 0.22], BOOTS);
}

// ---------- Анимации: руки всё время вытянуты вперёд (−80° по X) ----------
const hipsRest = [0, 0.95, 0];
const t5 = [0, 0.25, 0.5, 0.75, 1.0];
const ANIMATIONS = {
  Idle: [
    rot("upperArm_L", X, [0, 1.5, 3], [-80, -76, -80]),
    rot("upperArm_R", X, [0, 1.5, 3], [-78, -82, -78]),
    rot("head", Z, [0, 1.5, 3], [-6, 4, -6]), // голова свёрнута набок
    rot("chest", X, [0, 1.5, 3], [6, 9, 6]), //   сутулится
  ],
  // Шаг медленный и шаркающий: ноги ходят меньше, тело раскачивается
  Walk: [
    rot("upperLeg_L", X, t5, [-20, 0, 20, 0, -20]),
    rot("upperLeg_R", X, t5, [20, 0, -20, 0, 20]),
    rot("lowerLeg_L", X, t5, [10, 25, 10, 5, 10]),
    rot("lowerLeg_R", X, t5, [10, 5, 10, 25, 10]),
    rot("upperArm_L", X, t5, [-75, -85, -75, -85, -75]),
    rot("upperArm_R", X, t5, [-85, -75, -85, -75, -85]),
    rot("chest", Z, t5, [5, 0, -5, 0, 5]),
    rot("head", Z, t5, [-8, 0, 8, 0, -8]),
    move("hips", t5, [hipsRest, [0, 0.93, 0], hipsRest, [0, 0.93, 0], hipsRest]),
  ],
  // Удар: обе руки поднимаются и падают вниз
  Attack: [
    rot("upperArm_L", X, [0, 0.3, 0.45, 0.8], [-80, -150, -50, -80]),
    rot("upperArm_R", X, [0, 0.3, 0.45, 0.8], [-80, -150, -50, -80]),
    rot("chest", X, [0, 0.3, 0.45, 0.8], [6, -5, 15, 6]),
  ],
};

writeGLB(OUT, buildGLB({ name: "Zombie", generator: "VOID tools/make-zombie.js", bones: BONES, parts, animations: ANIMATIONS }));
