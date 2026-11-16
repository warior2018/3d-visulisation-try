// ============================================================
//  Генератор модели летучей мыши (.glb): тело, голова с ушами и клыками, два крыла (кость на плече).
//  Смотрит вдоль +Z, низ — y = 0 (коробка столкновений ~0.6 м). Анимации:
//    Idle / Walk — машет крыльями (взмах вниз — резкий, вверх — медленнее); Attack — рывок головой (укус);
//    Dive — крылья сложены назад (пике); Death — крылья сложены, тело кувыркается.
//  Запуск: node tools/make-bat.js  ->  games/builder/assets/bat.glb
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, X, Z } from "./glb-builder.js";

const OUT = fileURLToPath(new URL("../games/builder/assets/bat.glb", import.meta.url));

const Y0 = 0.32; // высота тела
const BONES = [
  { name: "root", parent: null, pos: [0, 0, 0] },
  { name: "body", parent: "root", pos: [0, Y0, 0] },
  { name: "head", parent: "body", pos: [0, Y0 + 0.06, 0.14] },
  { name: "wingL", parent: "body", pos: [0.08, Y0 + 0.05, 0.02] },
  { name: "wingR", parent: "body", pos: [-0.08, Y0 + 0.05, 0.02] },
];

const FUR = [0.24, 0.2, 0.22], FUR_D = [0.16, 0.13, 0.15], SKIN = [0.36, 0.26, 0.3], MEMB = [0.3, 0.2, 0.24];
const EYE = [0.95, 0.25, 0.15], FANG = [0.95, 0.94, 0.88];

const parts = [];
const box = (bone, center, size, color) => parts.push({ bone, center, size, color });

// тело
box("body", [0, Y0, 0], [0.18, 0.16, 0.26], FUR);
box("body", [0, Y0 - 0.05, -0.06], [0.14, 0.1, 0.16], FUR_D);
box("body", [0.05, Y0 - 0.12, -0.04], [0.03, 0.08, 0.03], SKIN); // лапки
box("body", [-0.05, Y0 - 0.12, -0.04], [0.03, 0.08, 0.03], SKIN);
// голова: уши, глаза, клыки
box("head", [0, Y0 + 0.07, 0.19], [0.14, 0.12, 0.12], FUR);
box("head", [0, Y0 + 0.04, 0.26], [0.07, 0.05, 0.04], SKIN); // морда
box("head", [0.045, Y0 + 0.16, 0.17], [0.04, 0.09, 0.03], SKIN);
box("head", [-0.045, Y0 + 0.16, 0.17], [0.04, 0.09, 0.03], SKIN);
box("head", [0.035, Y0 + 0.09, 0.252], [0.025, 0.02, 0.01], EYE);
box("head", [-0.035, Y0 + 0.09, 0.252], [0.025, 0.02, 0.01], EYE);
box("head", [0.015, Y0 + 0.01, 0.27], [0.012, 0.03, 0.012], FANG);
box("head", [-0.015, Y0 + 0.01, 0.27], [0.012, 0.03, 0.012], FANG);
// крылья: кость-«рука» и перепонка, к концу — уже
for (const [b, s] of [["wingL", 1], ["wingR", -1]]) {
  box(b, [s * 0.24, Y0 + 0.06, 0.02], [0.4, 0.025, 0.025], SKIN); //         «рука»
  box(b, [s * 0.2, Y0 + 0.05, -0.06], [0.32, 0.01, 0.16], MEMB); //          перепонка у тела
  box(b, [s * 0.38, Y0 + 0.05, -0.04], [0.14, 0.01, 0.12], MEMB); //         к концу
  box(b, [s * 0.44, Y0 + 0.05, 0.03], [0.03, 0.02, 0.06], SKIN); //          коготь
}

// Взмах: крылья вверх (+) / вниз (−) вокруг оси вдоль тела (Z); левое и правое — зеркально
const FLAP_T = [0, 0.12, 0.3];
const flap = (up, down) => [rot("wingL", Z, FLAP_T, [up, down, up]), rot("wingR", Z, FLAP_T, [-up, -down, -up])];
const ANIMATIONS = {
  Idle: [...flap(45, -40), rot("body", X, [0, 0.3], [-8, -8])],
  Walk: [...flap(50, -45), rot("body", X, [0, 0.12, 0.3], [-12, -6, -12])],
  Attack: [...flap(35, -30), rot("head", X, [0, 0.08, 0.2, 0.3], [0, -25, 15, 0]), rot("body", X, [0, 0.1, 0.3], [-10, 10, -10])],
  Death: [rot("wingL", Z, [0, 1], [70, 70]), rot("wingR", Z, [0, 1], [-70, -70]), rot("body", X, [0, 0.6, 1], [0, 160, 180])],
};
// Dive: крылья сложены назад (по X), тело наклонено вперёд
ANIMATIONS.Dive = [rot("wingL", X, [0, 1], [-70, -70]), rot("wingR", X, [0, 1], [-70, -70]), rot("body", X, [0, 1], [30, 30]), rot("head", X, [0, 1], [-20, -20])];

writeGLB(OUT, buildGLB({ name: "Bat", generator: "VOID tools/make-bat.js", bones: BONES, parts, animations: ANIMATIONS }));
