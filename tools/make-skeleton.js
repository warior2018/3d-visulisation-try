// ============================================================
//  Генератор модели «скелет» в формате glTF (.glb) — без редактора, кодом.
//  Запуск: node tools/make-skeleton.js  ->  games/builder/assets/skeleton.glb
//
//  Модель собрана из брусков (как в Minecraft). Каждый брусок жёстко
//  привязан к одной кости: когда кость поворачивается, брусок едет с ней.
//
//  Что лежит в .glb:
//   - сетка: вершины (позиция, нормаль, цвет), треугольники;
//   - скелет: 13 костей-узлов в иерархии (таз -> позвоночник -> грудь -> ...);
//   - анимации Idle, Walk, Attack, Sit (верхом): ключевые кадры поворотов костей.
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, rotQ, move, quat, qmul, X, Y, Z } from "./glb-builder.js";

const OUT = fileURLToPath(new URL("../games/builder/assets/skeleton.glb", import.meta.url));

// ---------- Кости ----------
// Модель смотрит вдоль +Z, левая сторона персонажа — +X, рост ~1.8 м, ступни на y = 0.
// pos — где кость (сустав) находится в исходной позе, в мировых координатах.
const BONES = [
  { name: "hips", parent: null, pos: [0, 0.95, 0] },
  { name: "spine", parent: "hips", pos: [0, 1.0, 0] },
  { name: "chest", parent: "spine", pos: [0, 1.3, 0] },
  { name: "neck", parent: "chest", pos: [0, 1.52, 0] },
  { name: "head", parent: "neck", pos: [0, 1.6, 0] },
  { name: "upperArm_L", parent: "chest", pos: [0.23, 1.47, 0] },
  { name: "forearm_L", parent: "upperArm_L", pos: [0.23, 1.19, 0] },
  { name: "upperArm_R", parent: "chest", pos: [-0.23, 1.47, 0] },
  { name: "forearm_R", parent: "upperArm_R", pos: [-0.23, 1.19, 0] },
  { name: "upperLeg_L", parent: "hips", pos: [0.1, 0.92, 0] },
  { name: "lowerLeg_L", parent: "upperLeg_L", pos: [0.1, 0.5, 0] },
  { name: "upperLeg_R", parent: "hips", pos: [-0.1, 0.92, 0] },
  { name: "lowerLeg_R", parent: "upperLeg_R", pos: [-0.1, 0.5, 0] },
];

// ---------- Бруски ----------
// [кость, центр [x, y, z], размер [ширина, высота, глубина], цвет]
const BONE_COLOR = [0.86, 0.84, 0.76]; // цвет кости — тёплый белый
const DARK = [0.12, 0.1, 0.1]; //         глазницы, нос
const parts = [];
const box = (bone, center, size, color = BONE_COLOR) => parts.push({ bone, center, size, color });

// Голова: череп, глазницы, нос, челюсть
box("head", [0, 1.75, 0], [0.26, 0.24, 0.26]);
box("head", [0.06, 1.77, 0.125], [0.07, 0.06, 0.02], DARK);
box("head", [-0.06, 1.77, 0.125], [0.07, 0.06, 0.02], DARK);
box("head", [0, 1.71, 0.125], [0.03, 0.04, 0.02], DARK);
box("head", [0, 1.62, 0.02], [0.2, 0.05, 0.2]);
box("neck", [0, 1.56, 0], [0.06, 0.1, 0.06]);

// Позвоночник и таз
box("spine", [0, 1.15, -0.05], [0.06, 0.32, 0.06]);
box("hips", [0, 0.95, 0], [0.3, 0.09, 0.16]);

// Рёбра: четыре кольца, каждое из четырёх брусков (спереди посередине — щель, грудина отдельно)
for (const [i, y] of [1.24, 1.31, 1.38, 1.45].entries()) {
  const w = 0.3 + i * 0.02; // кверху грудная клетка чуть шире
  box("chest", [w / 2, y, 0], [0.03, 0.035, 0.2]); //       левый бок
  box("chest", [-w / 2, y, 0], [0.03, 0.035, 0.2]); //      правый бок
  box("chest", [w / 4 + 0.02, y, 0.09], [w / 2 - 0.04, 0.035, 0.03]); //  спереди слева
  box("chest", [-w / 4 - 0.02, y, 0.09], [w / 2 - 0.04, 0.035, 0.03]); // спереди справа
}
box("chest", [0, 1.35, 0.09], [0.04, 0.24, 0.03]); // грудина
box("chest", [0, 1.35, -0.05], [0.06, 0.3, 0.06]); // позвоночник в груди
box("chest", [0, 1.48, 0], [0.48, 0.04, 0.08]); //    ключицы

// Руки и ноги — для левой (+X) и правой (-X) стороны
for (const [side, s] of [["L", 1], ["R", -1]]) {
  box("upperArm_" + side, [0.23 * s, 1.33, 0], [0.055, 0.28, 0.055]);
  box("forearm_" + side, [0.23 * s, 1.06, 0], [0.045, 0.26, 0.045]);
  box("forearm_" + side, [0.23 * s, 0.88, 0.01], [0.07, 0.1, 0.04]); // кисть
  box("upperLeg_" + side, [0.1 * s, 0.71, 0], [0.065, 0.42, 0.065]);
  box("lowerLeg_" + side, [0.1 * s, 0.29, 0], [0.055, 0.42, 0.055]);
  box("lowerLeg_" + side, [0.1 * s, 0.04, 0.04], [0.09, 0.06, 0.2]); // ступня
}

// ---------- Анимации ----------
const hipsRest = [0, 0.95, 0]; // исходное положение таза (относительно корня)

const t5 = [0, 0.25, 0.5, 0.75, 1.0];
const ANIMATIONS = {
  // Дыхание: грудь чуть поднимается, голова покачивается, руки слегка разведены
  Idle: [
    rot("chest", X, [0, 1, 2], [0, -3, 0]),
    rot("head", Y, [0, 1, 2], [-6, 6, -6]),
    rot("upperArm_L", Z, [0, 1, 2], [4, 7, 4]),
    rot("upperArm_R", Z, [0, 1, 2], [-4, -7, -4]),
  ],
  // Шаг: ноги и руки в противофазе, колени сгибаются, таз пружинит
  Walk: [
    rot("upperLeg_L", X, t5, [-30, 0, 30, 0, -30]),
    rot("upperLeg_R", X, t5, [30, 0, -30, 0, 30]),
    rot("lowerLeg_L", X, t5, [10, 40, 10, 5, 10]),
    rot("lowerLeg_R", X, t5, [10, 5, 10, 40, 10]),
    rot("upperArm_L", X, t5, [25, 0, -25, 0, 25]),
    rot("upperArm_R", X, t5, [-25, 0, 25, 0, -25]),
    rot("forearm_L", X, t5, [-15, -10, -25, -10, -15]),
    rot("forearm_R", X, t5, [-25, -10, -15, -10, -25]),
    rot("chest", Y, t5, [6, 0, -6, 0, 6]),
    move("hips", t5, [hipsRest, [0, 0.93, 0], hipsRest, [0, 0.93, 0], hipsRest]),
  ],
  // Удар: правая рука замахивается вверх и резко бьёт вниз, корпус поворачивается
  Attack: [
    rot("upperArm_R", X, [0, 0.25, 0.4, 0.7], [0, -150, -40, 0]),
    rot("forearm_R", X, [0, 0.25, 0.4, 0.7], [0, -30, 0, 0]),
    rot("chest", Y, [0, 0.25, 0.4, 0.7], [0, 20, -15, 0]),
  ],
  // Верхом: бёдра вперёд и в стороны (обхватывают спину зверя), голени вниз
  Sit: [
    rotQ("upperLeg_L", [0], [qmul(quat(Z, 30), quat(X, -75))]),
    rotQ("upperLeg_R", [0], [qmul(quat(Z, -30), quat(X, -75))]),
    rot("lowerLeg_L", X, [0], [80]),
    rot("lowerLeg_R", X, [0], [80]),
    rot("upperArm_L", X, [0], [-25]), // руки чуть вперёд — держится
    rot("upperArm_R", X, [0], [-25]),
    rot("forearm_L", X, [0], [-30]),
    rot("forearm_R", X, [0], [-30]),
  ],

  // ---------- Герой с оружием (вид от 3-го лица) ----------
  // Позы рук — «слои» поверх ходьбы (animator.setOverlay): ноги шагают, руки держат оружие.
  // Правая рука — на −X (в файле), «поперёк тела» — к +X. Поворот: сначала X (вперёд/вверх), потом Y (вбок).
  ...HERO_CLIPS(),
};

function HERO_CLIPS() {
  const arm = (x, y = 0) => qmul(quat(Y, y), quat(X, x)); // рука: поднять вперёд на x, повести вбок на y
  const PISTOL_R = arm(-85); //          пистолет — правая рука вытянута вперёд
  const RIFLE_R = arm(-70, -8); //        винтовка/автомат — правая у приклада,
  const RIFLE_L = arm(-80, -32); //       левая тянется вперёд к цевью (к центру)
  const MELEE_R = arm(-35); //            клинок у пояса, остриё вперёд
  return {
    HoldPistol: [rotQ("upperArm_R", [0], [PISTOL_R]), rot("forearm_R", X, [0], [-5])],
    HoldRifle: [
      rotQ("upperArm_R", [0], [RIFLE_R]), rot("forearm_R", X, [0], [-25]),
      rotQ("upperArm_L", [0], [RIFLE_L]), rot("forearm_L", X, [0], [-12]),
    ],
    HoldMelee: [rotQ("upperArm_R", [0], [MELEE_R]), rot("forearm_R", X, [0], [-65])],
    HoldBlock: [rotQ("upperArm_R", [0], [arm(-40)]), rot("forearm_R", X, [0], [-50])],
    // Выстрелы: руку подбрасывает и она возвращается
    Shoot: [
      rotQ("upperArm_R", [0, 0.05, 0.25], [PISTOL_R, arm(-102), PISTOL_R]),
      rot("forearm_R", X, [0, 0.05, 0.25], [-5, -18, -5]),
    ],
    ShootRifle: [
      rotQ("upperArm_R", [0, 0.05, 0.3], [RIFLE_R, arm(-80, -8), RIFLE_R]),
      rotQ("upperArm_L", [0, 0.05, 0.3], [RIFLE_L, arm(-90, -32), RIFLE_L]),
    ],
    // Перезарядка: левая рука уходит к обойме и возвращается, оружие чуть опускается
    Reload: [
      rotQ("upperArm_R", [0, 0.2, 1.0, 1.3], [PISTOL_R, arm(-60), arm(-60), PISTOL_R]),
      rotQ("upperArm_L", [0, 0.25, 0.5, 0.9, 1.3], [arm(0), arm(-55, -40), arm(-20, -20), arm(-55, -40), arm(0)]),
      rot("forearm_L", X, [0, 0.25, 0.9, 1.3], [0, -50, -50, 0]),
    ],
    ReloadRifle: [
      rotQ("upperArm_R", [0, 0.25, 1.9, 2.2], [RIFLE_R, arm(-50, -8), arm(-50, -8), RIFLE_R]),
      rotQ("upperArm_L", [0, 0.3, 0.6, 1.2, 1.6, 2.2], [RIFLE_L, arm(-40, -30), arm(-15, -10), arm(-15, -10), arm(-50, -30), RIFLE_L]),
    ],
    // Бросок (камень): замах за голову и резко вперёд
    Throw: [
      rotQ("upperArm_R", [0, 0.12, 0.22, 0.45], [arm(0), arm(-160, 10), arm(-60, -10), arm(0)]),
      rot("forearm_R", X, [0, 0.12, 0.22, 0.45], [0, -60, -5, 0]),
      rot("chest", Y, [0, 0.12, 0.22, 0.45], [0, 20, -20, 0]),
    ],
    // Блок: правая рука (с оружием) поперёк перед лицом, левая — к груди
    Block: [
      rotQ("upperArm_R", [0, 0.06, 0.38, 0.5], [arm(0), arm(-95, 35), arm(-95, 35), arm(0)]),
      rot("forearm_R", X, [0, 0.06, 0.38, 0.5], [0, -70, -70, 0]),
      rotQ("upperArm_L", [0, 0.06, 0.38, 0.5], [arm(0), arm(-60, -30), arm(-60, -30), arm(0)]),
      rot("forearm_L", X, [0, 0.06, 0.38, 0.5], [0, -80, -80, 0]),
    ],
    // Катана из ножен (Iai, 0.7 с): правая рука тянется к левому бедру, выхватывает и проводит
    // клинок поперёк всего тела слева направо, потом возвращает в ножны
    Iai: [
      rotQ("upperArm_R", [0, 0.06, 0.12, 0.24, 0.4, 0.7], [arm(0), arm(-25, 55), arm(-75, 45), arm(-95, -45), arm(-55, -35), arm(0)]),
      rot("forearm_R", X, [0, 0.06, 0.12, 0.24, 0.4, 0.7], [0, -70, -20, -10, -30, 0]),
      rot("chest", Y, [0, 0.06, 0.24, 0.4, 0.7], [0, 25, -30, -15, 0]),
    ],
  };
}

// ---------- Сборка и запись (tools/glb-builder.js) ----------
writeGLB(OUT, buildGLB({ name: "Skeleton", generator: "VOID tools/make-skeleton.js", bones: BONES, parts, animations: ANIMATIONS }));
