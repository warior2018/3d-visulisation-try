// ============================================================
//  Генератор моделей «для экрана» (viewmodel) — что игрок видит от 1-го лица.
//  Запуск: node tools/make-viewmodels.js  ->  games/builder/assets/fp-*.glb
//
//   fp-arm.glb    — пустая рука (способность «рука»: удар);
//   fp-pistol.glb — рука с пистолетом (способность «пистолет»), со вспышкой выстрела;
//   fp-machete.glb — рука с мачете (ближний бой);
//   fp-katana.glb — рука с катаной: два рассекающих удара по диагонали (SlashUp / SlashDown);
//   fp-rifle.glb  — рука со снайперской винтовкой (оптика сверху), со вспышкой выстрела;
//   fp-auto.glb   — рука с автоматом (магазин снизу, мушка и целик сверху), со вспышкой;
//   у стрелкового оружия есть Reload — перезарядка (магазин — своя кость mag: выпадает и вставляется новый);
//   fp-stone.glb  — рука с камнем: Charge (замах назад — держим, пока копим силу), Throw (бросок);
//   fp-hammer.glb — рука с молотом (стройка): Use (удар — поставить), Attack (взмах — сломать);
//   fp-block.glb  — рука держит блок (способность «стройка»). Блок покрашен «меткой»
//                   (ярко-розовым), игра при загрузке перекрашивает его в цвет из палитры.
//
//  Модели заданы в координатах КАМЕРЫ: камера в (0, 0, 0) смотрит вдоль +Z,
//  +X — вправо, +Y — вверх. Рука выходит снизу справа.
//
//  Анимации у всех: Idle (покой), Walk (покачивание при шагах), Equip (рука
//  поднимается снизу — когда способность выбрали). Плюс свои:
//   рука — Attack (взмах), Use (толчок); пистолет — Shoot (отдача + вспышка);
//   блок — Use (поставить: толчок), Attack (убрать: взмах).
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, quat, qmul, rotQ, move, scale, X, Y, Z } from "./glb-builder.js";

const out = (name) => fileURLToPath(new URL(`../games/builder/assets/${name}`, import.meta.url));

const BONE_COLOR = [0.86, 0.84, 0.76];
const JOINT = [0.74, 0.71, 0.63]; //   суставы чуть темнее
const METAL = [0.2, 0.21, 0.24]; //    пистолет
const METAL_LIGHT = [0.34, 0.35, 0.39];
const FLASH = [1, 0.85, 0.35]; //      вспышка выстрела
export const BLOCK_MARK = [1, 0, 1]; // «метка»: этот цвет игра заменит на цвет блока

// Рука: локоть в точке P, исходный поворот BASE. Возвращает всё, что нужно для модели.
function makeArm({ P, BASE }) {
  const at = (dx, dy, dz) => [P[0] + dx, P[1] + dy, P[2] + dz];
  // Поворот относительно исходного: сначала исходный, потом добавка в осях камеры
  const pose = (xDeg = 0, yDeg = 0, zDeg = 0) => qmul(qmul(quat(Z, zDeg), qmul(quat(Y, yDeg), quat(X, xDeg))), BASE);
  const parts = [];
  // Бруски задаём для «прямой» руки вдоль +Z от локтя; BASE повернёт её как надо
  const box = (center, size, color = BONE_COLOR, bone = "arm") => parts.push({ bone, center: at(...center), size, color });

  box([-0.02, 0, 0.21], [0.038, 0.042, 0.4]); //  две кости предплечья
  box([0.022, -0.004, 0.21], [0.034, 0.038, 0.4]);
  box([0, 0, 0.005], [0.075, 0.06, 0.05], JOINT); // локоть
  box([0, 0, 0.42], [0.085, 0.05, 0.045], JOINT); // запястье
  box([0, 0, 0.48], [0.11, 0.035, 0.08]); //         ладонь

  // Общие анимации: покой, шаги, «достать»
  const common = {
    Idle: [
      rotQ("arm", [0, 1.2, 2.4], [pose(), pose(-2.5), pose()]),
      move("arm", [0, 1.2, 2.4], [at(0, 0, 0), at(0, 0.006, 0), at(0, 0, 0)]),
    ],
    // Цикл = 2 шага: вбок рука качается один раз, вниз — на каждый шаг
    Walk: [
      move("arm", [0, 0.25, 0.5, 0.75, 1], [at(0, 0, 0), at(-0.014, -0.02, 0), at(0, 0, 0), at(0.014, -0.02, 0), at(0, 0, 0)]),
      rotQ("arm", [0, 0.25, 0.5, 0.75, 1], [pose(), pose(2, 0, -2), pose(), pose(2, 0, 2), pose()]),
    ],
    // Рука поднимается снизу: способность только что выбрали
    Equip: [
      move("arm", [0, 0.25], [at(0.02, -0.28, -0.05), at(0, 0, 0)]),
      rotQ("arm", [0, 0.25], [pose(35, 0, 10), pose()]),
    ],
  };
  // Взмах (удар рукой, уборка блока): вперёд-влево-вверх и обратно
  const swing = [
    move("arm", [0, 0.08, 0.17, 0.35], [at(0, 0, 0), at(-0.1, 0.06, 0.1), at(-0.08, -0.04, 0.12), at(0, 0, 0)]),
    rotQ("arm", [0, 0.08, 0.17, 0.35], [pose(), pose(-30, -20), pose(15, -25), pose()]),
  ];
  // Блок (ПКМ ближнего боя): рука резко к центру и вверх — закрыться, подержать окно блока, опустить
  const guard = [
    move("arm", [0, 0.06, 0.38, 0.5], [at(0, 0, 0), at(-0.14, 0.1, 0.02), at(-0.14, 0.1, 0.02), at(0, 0, 0)]),
    rotQ("arm", [0, 0.06, 0.38, 0.5], [pose(), pose(-25, -20, 55), pose(-25, -20, 55), pose()]),
  ];
  // Толчок вперёд (поставить блок)
  const push = [
    move("arm", [0, 0.08, 0.25], [at(0, 0, 0), at(-0.03, -0.03, 0.09), at(0, 0, 0)]),
    rotQ("arm", [0, 0.08, 0.25], [pose(), pose(10), pose()]),
  ];
  return { at, pose, parts, box, common, swing, push, guard, bones: [{ name: "arm", parent: null, pos: P, rotation: BASE }] };
}

// Пальцы: раскрытые (пустая рука) или сжатые (держат пистолет или блок)
function fingers(arm, curled) {
  for (const x of [-0.04, -0.013, 0.013, 0.04]) {
    if (curled) arm.box([x, -0.02, 0.53], [0.02, 0.04, 0.025]); // согнуты вниз, к ладони
    else {
      arm.box([x, 0, 0.55], [0.02, 0.022, 0.065]); //               фаланга
      arm.box([x, -0.012, 0.59], [0.018, 0.02, 0.03], JOINT); //    кончик, чуть согнут вниз
    }
  }
  arm.box([-0.066, -0.004, 0.49], [0.02, 0.022, 0.055]); // большой палец — с внутренней стороны
}

// ---------- 1. Пустая рука ----------
{
  const arm = makeArm({ P: [0.3, -0.36, 0.1], BASE: qmul(quat(Y, -12), quat(X, -16)) });
  fingers(arm, false);
  writeGLB(out("fp-arm.glb"), buildGLB({
    name: "FirstPersonArm", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: { ...arm.common, Attack: arm.swing, Use: arm.push, Block: arm.guard },
  }));
}

// ---------- 2. Пистолет ----------
// Рука ближе к центру и смотрит почти прямо вперёд — ствол идёт к прицелу
{
  const arm = makeArm({ P: [0.22, -0.3, 0.06], BASE: qmul(quat(Y, -9), quat(X, -9)) });
  fingers(arm, true);
  arm.box([0, 0.03, 0.5], [0.036, 0.1, 0.05], METAL); //          рукоять — в кулаке
  arm.box([0, 0.095, 0.57], [0.042, 0.045, 0.21], METAL_LIGHT); // затвор и ствол
  arm.box([0, 0.06, 0.53], [0.012, 0.03, 0.04], METAL); //        спусковая скоба
  arm.box([0, 0.123, 0.665], [0.008, 0.012, 0.012], METAL); //    мушка
  arm.box([-0.012, 0.123, 0.475], [0.01, 0.012, 0.012], METAL); // целик: два зубца,
  arm.box([0.012, 0.123, 0.475], [0.01, 0.012, 0.012], METAL); //  мушка видна между ними
  // Точки прицела (кости без брусков): движок совмещает их с центром экрана (ViewModel)
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.129, 0.665) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, 0.129, 0.475) });
  // Вспышка — отдельная кость у дула. В покое масштаб 0 (не видно), при выстреле на миг 1.
  const muzzle = arm.at(0, 0.095, 0.7);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.08, 0.08, 0.05], color: FLASH });
  arm.parts.push({ bone: "flash", center: [muzzle[0], muzzle[1], muzzle[2] + 0.03], size: [0.045, 0.045, 0.06], color: [1, 1, 0.8] });
  // Магазин — низ рукояти, своя кость: при перезарядке выпадает вниз, потом вставляется новый
  const MAG = arm.at(0, -0.025, 0.5);
  arm.bones.push({ name: "mag", parent: "arm", pos: MAG });
  arm.parts.push({ bone: "mag", center: MAG, size: [0.03, 0.03, 0.045], color: METAL_LIGHT });
  const magDown = [MAG[0], MAG[1] - 0.14, MAG[2]];

  const { at, pose } = arm;
  writeGLB(out("fp-pistol.glb"), buildGLB({
    name: "FirstPersonPistol", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      // Прицел: рука замерла (без покачивания), чтобы мушка стояла ровно
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // Отдача: ствол подбрасывает вверх, рука уходит назад и возвращается
      Shoot: [
        move("arm", [0, 0.04, 0.22], [at(0, 0, 0), at(0, 0.015, -0.05), at(0, 0, 0)]),
        rotQ("arm", [0, 0.04, 0.22], [pose(), pose(-14), pose()]),
        scale("flash", [0, 0.01, 0.06, 0.07], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0]]),
      ],
      // Перезарядка (1.3 с): пистолет наклоняется, пустой магазин падает, новый — снизу вверх
      Reload: [
        rotQ("arm", [0, 0.15, 1.05, 1.3], [pose(), pose(22, 0, 28), pose(22, 0, 28), pose()]),
        move("arm", [0, 0.15, 1.05, 1.3], [at(0, 0, 0), at(-0.04, -0.05, 0), at(-0.04, -0.05, 0), at(0, 0, 0)]),
        move("mag", [0, 0.3, 0.5, 0.75, 0.95], [MAG, MAG, magDown, magDown, MAG]),
        scale("mag", [0, 0.49, 0.5, 0.74, 0.75], [[1, 1, 1], [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1]]),
      ],
    },
  }));
}

// ---------- 2б. Мачете ----------
// Клинок смотрит вверх-вперёд из кулака; удар — тот же взмах, что у руки, но шире
{
  const arm = makeArm({ P: [0.3, -0.36, 0.1], BASE: qmul(quat(Y, -14), quat(X, -18)) });
  fingers(arm, true);
  const HANDLE = [0.26, 0.17, 0.1];
  const BLADE = [0.72, 0.74, 0.78];
  const EDGE = [0.9, 0.92, 0.95];
  arm.box([0, 0.0, 0.5], [0.04, 0.16, 0.045], HANDLE); //        рукоять в кулаке
  arm.box([0, 0.09, 0.5], [0.07, 0.02, 0.06], METAL); //         гарда
  arm.box([0, 0.24, 0.52], [0.012, 0.28, 0.065], BLADE); //       клинок
  arm.box([0, 0.24, 0.558], [0.014, 0.28, 0.01], EDGE); //        светлая режущая кромка
  arm.box([0, 0.395, 0.53], [0.012, 0.04, 0.05], BLADE); //       скос на конце
  const { at, pose } = arm;
  writeGLB(out("fp-machete.glb"), buildGLB({
    name: "FirstPersonMachete", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      // Рубящий удар: замах вверх-вправо и резко вниз-влево
      Attack: [
        move("arm", [0, 0.1, 0.2, 0.42], [at(0, 0, 0), at(0.04, 0.08, -0.02), at(-0.12, -0.06, 0.12), at(0, 0, 0)]),
        rotQ("arm", [0, 0.1, 0.2, 0.42], [pose(), pose(-35, 10, -15), pose(30, -25, 20), pose()]),
      ],
      Block: arm.guard, // клинок поперёк — закрыться
    },
  }));
}

// ---------- 2в. Катана ----------
// Как у самурая: в покое катана в ножнах (сая) слева у бедра, рука лежит на рукояти — видна только
// рукоять снизу слева. Удар (Iai): выхватить и одним движением разрезать всё перед собой —
// клинок проходит почти через весь экран слева направо, стряхнуть кровь (тибури) и убрать в ножны.
// У руки есть кисть (кость wrist): меч поворачивается отдельно от предплечья.
// Кадры задаём не углами, а тем, ГДЕ кисть (в координатах камеры), куда смотрит предплечье
// и куда — клинок; повороты костей считаются сами.
{
  // Немного векторной математики для кадров (кватернион — [x, y, z, w])
  const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const inverse = ([x, y, z, w]) => [-x, -y, -z, w];
  const rotate = (q, v) => { // повернуть вектор v кватернионом q
    const [x, y, z, w] = q;
    const t = cross([x, y, z], v).map((c) => 2 * c);
    const u = cross([x, y, z], t);
    return [v[0] + w * t[0] + u[0], v[1] + w * t[1] + u[1], v[2] + w * t[2] + u[2]];
  };
  const turn = (from, to) => { // кратчайший поворот, переводящий направление from в to
    const a = norm(from), b = norm(to);
    const c = cross(a, b);
    const q = [c[0], c[1], c[2], 1 + dot(a, b)];
    const l = Math.hypot(...q);
    return q.map((v) => v / l);
  };
  const FOREARM = 0.5; // от локтя до кисти
  // Кадр: кисть в точке hand, предплечье смотрит вдоль forearm (от локтя к кисти), клинок — вдоль blade
  const frame = (hand, forearm, blade) => {
    const a = norm(forearm);
    const armRot = turn([0, 0, 1], a); //                               предплечье: +Z → a
    const wristRot = turn([0, 1, 0], rotate(inverse(armRot), blade)); // меч в осях предплечья: +Y → клинок
    return { pos: hand.map((h, i) => h - a[i] * FOREARM), arm: armRot, wrist: wristRot, hand };
  };

  // Покой — в ножнах: кисть внизу слева, клинок уходит вниз-назад вдоль бедра
  const SHEATHED = frame([-0.3, -0.27, 0.45], [-0.85, -0.12, 0.5], [-0.2, -0.85, -0.5]);
  const arm = makeArm({ P: SHEATHED.pos, BASE: SHEATHED.arm });
  fingers(arm, true);
  arm.bones.push({ name: "wrist", parent: "arm", pos: arm.at(0, 0, FOREARM), rotation: SHEATHED.wrist });
  const sword = (center, size, color) => arm.box(center, size, color, "wrist");
  const WRAP = [0.12, 0.1, 0.12]; //        оплётка рукояти — тёмная
  const WRAP_LIGHT = [0.42, 0.36, 0.3]; //   ромбики оплётки
  const GOLD = [0.62, 0.5, 0.24]; //         цуба (гарда) и хабаки
  const STEEL = [0.74, 0.76, 0.8];
  const EDGE = [0.93, 0.95, 0.98]; //        режущая кромка (светлее)
  const HAMON = [0.86, 0.88, 0.92]; //       линия закалки
  const LACQUER = [0.1, 0.07, 0.08]; //      ножны — чёрный лак
  const LACQUER_RED = [0.45, 0.08, 0.08]; // шнур на ножнах
  // Рукоять — длинная, хват у цубы; конец рукояти торчит из кулака вниз
  sword([0, -0.04, 0.5], [0.036, 0.22, 0.04], WRAP);
  for (const y of [-0.11, -0.06, 0.0, 0.05]) sword([0, y, 0.521], [0.03, 0.016, 0.004], WRAP_LIGHT);
  sword([0, -0.155, 0.5], [0.04, 0.02, 0.044], GOLD); //             навершие
  sword([0, 0.08, 0.5], [0.075, 0.012, 0.075], GOLD); //              цуба
  sword([0, 0.1, 0.5], [0.016, 0.03, 0.04], GOLD); //                 хабаки
  // Клинок: три отрезка, каждый чуть смещён вперёд — получается изгиб
  const BLADE = [[0.2, 0.5], [0.37, 0.51], [0.54, 0.525]];
  for (const [y, z] of BLADE) {
    sword([0, y, z], [0.01, 0.17, 0.03], STEEL);
    sword([0, y, z + 0.017], [0.012, 0.17, 0.006], EDGE); //          кромка — спереди
    sword([0.0055, y, z + 0.004], [0.002, 0.17, 0.004], HAMON); //    линия закалки
  }
  sword([0, 0.64, 0.535], [0.009, 0.035, 0.024], STEEL); //           кончик (киссаки)
  sword([0, 0.665, 0.54], [0.008, 0.018, 0.015], EDGE);

  // Ножны (сая): висят у бедра неподвижно — своя кость без родителя, повёрнута как клинок в покое,
  // поэтому в покое клинок целиком внутри них. Бруски — в осях клинка (от кисти: +Y — к острию)
  const sayaRot = qmul(SHEATHED.arm, SHEATHED.wrist);
  const H = SHEATHED.hand;
  arm.bones.push({ name: "saya", parent: null, pos: H, rotation: sayaRot });
  const saya = (y, z, size, color) => arm.parts.push({ bone: "saya", center: [H[0], H[1] + y, H[2] + z], size, color });
  for (const [y, z] of BLADE) saya(y, z, [0.026, 0.18, 0.05], LACQUER);
  saya(0.64, 0.035, [0.024, 0.06, 0.042], LACQUER);
  saya(0.15, 0.0, [0.03, 0.025, 0.056], LACQUER_RED); //               шнур у устья
  saya(0.11, 0.0, [0.032, 0.02, 0.058], GOLD); //                       устье (кольцо)

  // Рез — по ПРЯМОЙ: кисть идёт слева снизу вправо почти горизонтально (чуть поднимаясь),
  // клинок всё время лежит почти плашмя вдоль этой линии — без дуги вверх
  const OUT = frame([-0.32, -0.27, 0.45], [-0.8, -0.1, 0.6], [-0.65, -0.72, 0.25]); //   выходит из ножен — вниз-влево, не вверх
  const LEFT = frame([-0.3, -0.25, 0.47], [-0.7, -0.05, 0.7], [-0.97, -0.1, 0.22]); //  выхватили: клинок у левого края
  const MID = frame([0.0, -0.21, 0.56], [0.0, 0.0, 1], [0.75, -0.02, 0.65]); //          середина: клинок вправо-вперёд, плашмя
  const RIGHT = frame([0.3, -0.17, 0.47], [0.7, 0.03, 0.7], [0.98, -0.02, 0.2]); //       конец реза: у правого края
  const CHIBURI = frame([0.2, -0.17, 0.45], [0.5, -0.1, 0.85], [0.6, -0.65, 0.45]); //   тибури: стряхнуть вниз
  const BACK = frame([-0.08, -0.24, 0.45], [-0.7, -0.15, 0.7], [-0.35, -0.8, -0.2]); //  несём к ножнам
  const REST = SHEATHED;
  const GUARD = frame([-0.05, -0.12, 0.42], [-0.6, 0.2, 0.75], [-0.9, 0.35, 0.25]); // блок: клинок поперёк перед лицом
  // Сам рез — частыми кадрами по горизонтальной дуге (между далёкими кадрами поворот «срезал» бы
  // через верх — клинок вставал вертикально). u — доля реза 0…1 (с 0.07 по 0.23 с):
  // кисть идёт слева направо чуть поднимаясь, предплечье и клинок поворачиваются слева направо плашмя
  const CUT = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const phi = Math.PI * (170 - 160 * u) / 180; //  клинок: 170° (влево) → 90° (вперёд) → 10° (вправо)
    const psi = Math.PI * (140 - 100 * u) / 180; //  предплечье: 140° → 40°
    const hand = [-0.3 + 0.6 * u, -0.25 + 0.08 * u, 0.47 + 0.09 * Math.sin(Math.PI * u)];
    CUT.push([0.07 + 0.16 * u, frame(hand, [Math.cos(psi), -0.04 + 0.07 * u, Math.sin(psi)], [Math.cos(phi), -0.08 + 0.08 * u, Math.sin(phi)])]);
  }
  const keys = (list) => {
    const times = list.map((k) => k[0]);
    return [
      move("arm", times, list.map((k) => k[1].pos)),
      rotQ("arm", times, list.map((k) => k[1].arm)),
      rotQ("wrist", times, list.map((k) => k[1].wrist)),
    ];
  };
  writeGLB(out("fp-katana.glb"), buildGLB({
    name: "FirstPersonKatana", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      // Удар из ножен (0.7 с): выхватить → прямой рез через весь экран слева направо → тибури → в ножны
      Iai: keys([[0, REST], [0.035, OUT], ...CUT, [0.38, CHIBURI], [0.56, BACK], [0.7, REST]]),
      // Блок: катану чуть выхватить и поставить перед собой поперёк (рукоять и цуба принимают удар)
      Block: keys([[0, REST], [0.06, GUARD], [0.38, GUARD], [0.5, REST]]),
    },
  }));
}

// ---------- 3. Снайперская винтовка ----------
// Длинная: приклад у плеча, ствол далеко вперёд, оптика сверху. Точки прицела — на оси оптики
{
  const arm = makeArm({ P: [0.2, -0.3, 0.02], BASE: qmul(quat(Y, -6), quat(X, -7)) });
  fingers(arm, true);
  const WOOD = [0.42, 0.28, 0.16];
  const WOOD_DARK = [0.3, 0.2, 0.12];
  arm.box([0, 0.03, 0.5], [0.04, 0.11, 0.05], WOOD_DARK); //       рукоять в кулаке
  arm.box([0, 0.06, 0.3], [0.055, 0.1, 0.32], WOOD); //            приклад (назад, к плечу)
  arm.box([0, 0.1, 0.62], [0.06, 0.07, 0.34], WOOD); //            цевьё
  arm.box([0, 0.105, 0.62], [0.05, 0.05, 0.5], METAL); //          ствольная коробка
  arm.box([0, 0.115, 0.98], [0.026, 0.026, 0.44], METAL); //       длинный ствол
  arm.box([0, 0.115, 1.2], [0.036, 0.036, 0.05], METAL_LIGHT); //  дульный тормоз
  arm.box([0, 0.06, 0.53], [0.012, 0.03, 0.04], METAL); //         спусковая скоба
  // Оптика: полая труба из четырёх стенок (сквозь неё видно), кольца-крепления, линзы по краям
  const sy = 0.19;
  for (const z of [0.5, 0.72]) arm.box([0, 0.15, z], [0.03, 0.05, 0.03], METAL); // кольца
  arm.box([0, sy + 0.026, 0.61], [0.05, 0.008, 0.3], METAL_LIGHT); //  верх трубы
  arm.box([0, sy - 0.026, 0.61], [0.05, 0.008, 0.3], METAL_LIGHT); //  низ
  arm.box([0.026, sy, 0.61], [0.008, 0.05, 0.3], METAL_LIGHT); //      бока
  arm.box([-0.026, sy, 0.61], [0.008, 0.05, 0.3], METAL_LIGHT);
  for (const z of [0.46, 0.76]) {
    arm.box([0, sy + 0.032, z], [0.066, 0.01, 0.02], METAL); //        раструбы по краям
    arm.box([0, sy - 0.032, z], [0.066, 0.01, 0.02], METAL);
    arm.box([0.032, sy, z], [0.01, 0.066, 0.02], METAL);
    arm.box([-0.032, sy, z], [0.01, 0.066, 0.02], METAL);
  }
  // Точки прицела — центр оптики спереди и сзади: движок совместит её ось с центром экрана
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, sy, 0.76) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, sy, 0.46) });
  const muzzle = arm.at(0, 0.115, 1.25);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.1, 0.1, 0.06], color: FLASH });
  arm.parts.push({ bone: "flash", center: [muzzle[0], muzzle[1], muzzle[2] + 0.04], size: [0.05, 0.05, 0.08], color: [1, 1, 0.8] });
  // Затвор: рукоятка справа на ствольной коробке — отдельная кость (её дёргает анимация Bolt)
  const BOLT = [0.04, 0.115, 0.56]; // где затвор относительно локтя (= кости arm)
  arm.bones.push({ name: "bolt", parent: "arm", pos: arm.at(...BOLT) });
  arm.parts.push({ bone: "bolt", center: arm.at(0.04, 0.115, 0.56), size: [0.04, 0.014, 0.014], color: METAL_LIGHT });
  arm.parts.push({ bone: "bolt", center: arm.at(0.065, 0.115, 0.56), size: [0.022, 0.022, 0.022], color: METAL }); // шарик рукоятки

  const { at, pose } = arm;
  writeGLB(out("fp-rifle.glb"), buildGLB({
    name: "FirstPersonRifle", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // Передёрнуть затвор: винтовку чуть заваливаем вправо, рукоятку — вверх, назад, вперёд, вниз
      Bolt: [
        rotQ("arm", [0, 0.15, 0.75, 0.9], [pose(), pose(-6, 8, 18), pose(-6, 8, 18), pose()]),
        move("arm", [0, 0.15, 0.75, 0.9], [at(0, 0, 0), at(-0.03, 0.02, -0.03), at(-0.03, 0.02, -0.03), at(0, 0, 0)]),
        rotQ("bolt", [0, 0.2, 0.3, 0.6, 0.7], [quat(Z, 0), quat(Z, 70), quat(Z, 70), quat(Z, 70), quat(Z, 0)]),
        move("bolt", [0, 0.3, 0.42, 0.55, 0.6], [BOLT, BOLT, [BOLT[0], BOLT[1], BOLT[2] - 0.09], [BOLT[0], BOLT[1], BOLT[2] - 0.09], BOLT]),
      ],
      // Отдача сильнее пистолетной: рука уходит назад, ствол — вверх
      Shoot: [
        move("arm", [0, 0.05, 0.4], [at(0, 0, 0), at(0, 0.02, -0.09), at(0, 0, 0)]),
        rotQ("arm", [0, 0.05, 0.4], [pose(), pose(-10), pose()]),
        scale("flash", [0, 0.01, 0.06, 0.07], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0]]),
      ],
      // Перезарядка (2.4 с): винтовку заваливаем, затвор открыт, патроны по одному (рука «кивает»), затвор закрыт
      Reload: [
        rotQ("arm", [0, 0.25, 0.9, 1.15, 1.4, 1.65, 1.9, 2.15, 2.4],
          [pose(), pose(-4, 10, 26), pose(-4, 10, 26), pose(2, 10, 26), pose(-4, 10, 26), pose(2, 10, 26), pose(-4, 10, 26), pose(-4, 10, 26), pose()]),
        move("arm", [0, 0.25, 2.15, 2.4], [at(0, 0, 0), at(-0.04, 0.02, -0.04), at(-0.04, 0.02, -0.04), at(0, 0, 0)]),
        rotQ("bolt", [0, 0.35, 0.45, 1.95, 2.05], [quat(Z, 0), quat(Z, 70), quat(Z, 70), quat(Z, 70), quat(Z, 0)]),
        move("bolt", [0, 0.45, 0.6, 1.8, 1.95], [BOLT, BOLT, [BOLT[0], BOLT[1], BOLT[2] - 0.09], [BOLT[0], BOLT[1], BOLT[2] - 0.09], BOLT]),
      ],
    },
  }));
}

// ---------- 3б. Автомат ----------
// Короче снайперки, магазин снизу (кость mag), мушка и целик сверху — прицел через них, как у пистолета
{
  const arm = makeArm({ P: [0.21, -0.31, 0.04], BASE: qmul(quat(Y, -7), quat(X, -8)) });
  fingers(arm, true);
  const DARK = [0.14, 0.15, 0.17];
  arm.box([0, 0.03, 0.5], [0.04, 0.1, 0.05], DARK); //               пистолетная рукоять в кулаке
  arm.box([0, 0.075, 0.33], [0.045, 0.07, 0.24], METAL); //          приклад (к плечу)
  arm.box([0, 0.1, 0.6], [0.055, 0.075, 0.36], METAL); //            ствольная коробка
  arm.box([0, 0.11, 0.86], [0.05, 0.05, 0.18], METAL_LIGHT); //      цевьё
  arm.box([0, 0.115, 1.02], [0.024, 0.024, 0.2], DARK); //           ствол
  arm.box([0, 0.06, 0.53], [0.012, 0.03, 0.04], DARK); //            спусковая скоба
  arm.box([0, 0.152, 0.93], [0.008, 0.026, 0.012], DARK); //         мушка
  arm.box([-0.012, 0.152, 0.5], [0.01, 0.02, 0.014], DARK); //       целик: два зубца
  arm.box([0.012, 0.152, 0.5], [0.01, 0.02, 0.014], DARK);
  arm.box([0.032, 0.11, 0.66], [0.012, 0.016, 0.03], METAL_LIGHT); // рукоятка затвора справа
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.162, 0.93) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, 0.162, 0.5) });
  const MAG = arm.at(0, 0.02, 0.66);
  arm.bones.push({ name: "mag", parent: "arm", pos: MAG });
  arm.parts.push({ bone: "mag", center: MAG, size: [0.035, 0.13, 0.06], color: DARK });
  arm.parts.push({ bone: "mag", center: [MAG[0], MAG[1] - 0.06, MAG[2] + 0.02], size: [0.035, 0.05, 0.06], color: DARK }); // изгиб
  const magDown = [MAG[0], MAG[1] - 0.2, MAG[2]];
  const muzzle = arm.at(0, 0.115, 1.13);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.07, 0.07, 0.05], color: FLASH });
  arm.parts.push({ bone: "flash", center: [muzzle[0], muzzle[1], muzzle[2] + 0.03], size: [0.04, 0.04, 0.06], color: [1, 1, 0.8] });
  const { at, pose } = arm;
  writeGLB(out("fp-auto.glb"), buildGLB({
    name: "FirstPersonAuto", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // Короткая отдача — очередью выстрелы идут часто
      Shoot: [
        move("arm", [0, 0.03, 0.09], [at(0, 0, 0), at(0, 0.006, -0.03), at(0, 0, 0)]),
        rotQ("arm", [0, 0.03, 0.09], [pose(), pose(-4), pose()]),
        scale("flash", [0, 0.005, 0.04, 0.045], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0]]),
      ],
      // Перезарядка (2.1 с): наклон, пустой магазин вниз, новый вверх, передёрнуть затвор
      Reload: [
        rotQ("arm", [0, 0.2, 1.55, 1.75, 1.85, 2.1], [pose(), pose(14, 6, 30), pose(14, 6, 30), pose(6, 10, 22), pose(6, 10, 22), pose()]),
        move("arm", [0, 0.2, 1.55, 1.75, 1.85, 2.1], [at(0, 0, 0), at(-0.04, -0.06, 0), at(-0.04, -0.06, 0), at(-0.02, -0.03, -0.06), at(-0.02, -0.03, 0), at(0, 0, 0)]),
        move("mag", [0, 0.35, 0.6, 1.15, 1.45], [MAG, MAG, magDown, magDown, MAG]),
        scale("mag", [0, 0.59, 0.6, 1.14, 1.15], [[1, 1, 1], [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1]]),
      ],
    },
  }));
}

// ---------- 3в. Камень в руке (бросок на Q) ----------
{
  const arm = makeArm({ P: [0.3, -0.36, 0.1], BASE: qmul(quat(Y, -12), quat(X, -14)) });
  fingers(arm, true);
  arm.box([0, 0.03, 0.5], [0.09, 0.07, 0.08], [0.5, 0.5, 0.53]); //   камень в ладони
  arm.box([0.02, 0.06, 0.49], [0.06, 0.03, 0.05], [0.64, 0.64, 0.67]);
  const { at, pose } = arm;
  writeGLB(out("fp-stone.glb"), buildGLB({
    name: "FirstPersonStone", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common, Attack: arm.swing, Block: arm.guard,
      // Замах: рука уходит назад-вверх за плечо и там держится (клип длинный — пока копим силу)
      Charge: [
        move("arm", [0, 0.25, 3], [at(0, 0, 0), at(0.06, 0.12, -0.16), at(0.06, 0.12, -0.16)]),
        rotQ("arm", [0, 0.25, 3], [pose(), pose(-55, 10, -10), pose(-55, 10, -10)]),
      ],
      // Бросок: из замаха — резко вперёд и вниз, потом обратно
      Throw: [
        move("arm", [0, 0.08, 0.35], [at(0.06, 0.12, -0.16), at(-0.04, -0.02, 0.18), at(0, 0, 0)]),
        rotQ("arm", [0, 0.08, 0.35], [pose(-55, 10, -10), pose(35, -10, 5), pose()]),
      ],
    },
  }));
}

// ---------- 3г. Молот (стройка) ----------
{
  const arm = makeArm({ P: [0.3, -0.36, 0.1], BASE: qmul(quat(Y, -14), quat(X, -12)) });
  fingers(arm, true);
  const WOODH = [0.45, 0.3, 0.17];
  arm.box([0, 0.06, 0.5], [0.035, 0.26, 0.04], WOODH); //               рукоять
  arm.box([0, 0.2, 0.5], [0.075, 0.07, 0.17], METAL_LIGHT); //          боёк
  arm.box([0, 0.2, 0.585], [0.06, 0.055, 0.02], METAL); //              ударная часть
  const { at, pose } = arm;
  writeGLB(out("fp-hammer.glb"), buildGLB({
    name: "FirstPersonHammer", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      // Поставить блок: замах вверх и удар молотом вниз-вперёд
      Use: [
        move("arm", [0, 0.08, 0.18, 0.35], [at(0, 0, 0), at(0, 0.06, -0.04), at(-0.02, -0.04, 0.08), at(0, 0, 0)]),
        rotQ("arm", [0, 0.08, 0.18, 0.35], [pose(), pose(-40), pose(35), pose()]),
      ],
      Attack: arm.swing,
    },
  }));
}

// ---------- 4. Рука с блоком ----------
{
  const arm = makeArm({ P: [0.28, -0.36, 0.1], BASE: qmul(quat(Y, -14), quat(X, -10)) });
  fingers(arm, true);
  arm.box([0, 0.085, 0.5], [0.15, 0.15, 0.15], BLOCK_MARK); // блок лежит на ладони
  writeGLB(out("fp-block.glb"), buildGLB({
    name: "FirstPersonBlock", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: { ...arm.common, Use: arm.push, Attack: arm.swing },
  }));
}
