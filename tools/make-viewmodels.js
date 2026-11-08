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
const GRIP = [0.14, 0.1, 0.08]; //     тёмная рукоять пистолета (не серая: скин «металла» её не перекрашивает)
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
  // «Пустынный орёл»: длинный массивный затвор с ребром сверху, широкое дуло, курок, квадратная скоба
  arm.box([0, 0.025, 0.495], [0.04, 0.11, 0.055], GRIP); //        рукоять — в кулаке (тёмная накладка)
  arm.box([0, 0.066, 0.6], [0.046, 0.024, 0.2], METAL); //         рама под затвором
  arm.box([0, 0.1, 0.59], [0.054, 0.058, 0.27], METAL_LIGHT); //   затвор
  arm.box([0, 0.135, 0.6], [0.022, 0.012, 0.25], METAL); //        ребро сверху во всю длину
  arm.box([0, 0.1, 0.727], [0.056, 0.06, 0.008], METAL); //        дуло — срез затвора
  arm.box([0, 0.1, 0.732], [0.018, 0.018, 0.004], [0.05, 0.05, 0.06]); // канал ствола
  arm.box([0.0275, 0.108, 0.665], [0.002, 0.014, 0.07], METAL); // прорези на боку затвора
  arm.box([-0.0275, 0.108, 0.665], [0.002, 0.014, 0.07], METAL);
  arm.box([0, 0.036, 0.585], [0.014, 0.012, 0.06], METAL); //      спусковая скоба: низ
  arm.box([0, 0.05, 0.615], [0.014, 0.03, 0.012], METAL); //       и квадратный перед
  arm.box([0, 0.128, 0.445], [0.016, 0.026, 0.02], METAL); //      курок
  arm.box([0, 0.147, 0.715], [0.008, 0.012, 0.012], METAL); //     мушка
  arm.box([-0.012, 0.147, 0.47], [0.01, 0.012, 0.012], METAL); //  целик: два зубца,
  arm.box([0.012, 0.147, 0.47], [0.01, 0.012, 0.012], METAL); //   мушка видна между ними
  // Точки прицела (кости без брусков): движок совмещает их с центром экрана (ViewModel)
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.153, 0.715) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, 0.153, 0.47) });
  // Вспышка — отдельная кость у дула. В покое масштаб 0 (не видно), при выстреле на миг 1.
  const muzzle = arm.at(0, 0.1, 0.745);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.08, 0.08, 0.05], color: FLASH });
  arm.parts.push({ bone: "flash", center: [muzzle[0], muzzle[1], muzzle[2] + 0.03], size: [0.045, 0.045, 0.06], color: [1, 1, 0.8] });
  // Магазин — низ рукояти, своя кость: при перезарядке выпадает вниз, потом вставляется новый
  const MAG = arm.at(0, -0.04, 0.495);
  arm.bones.push({ name: "mag", parent: "arm", pos: MAG });
  arm.parts.push({ bone: "mag", center: MAG, size: [0.034, 0.03, 0.05], color: METAL_LIGHT });
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
        move("arm", [0, 0.04, 0.32], [at(0, 0, 0), at(0, 0.03, -0.09), at(0, 0, 0)]), // тяжёлый: сильнее назад и дольше
        rotQ("arm", [0, 0.04, 0.32], [pose(), pose(-26, 0, 4), pose()]),
        scale("flash", [0, 0.01, 0.06, 0.07], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0]]),
      ],
      // Перезарядка: пистолет наклоняется, пустой магазин падает, новый — снизу вверх
      Reload: [ // 1.7 с (ATTACKS.pistol.reloadTime)
        rotQ("arm", [0, 0.2, 1.4, 1.7], [pose(), pose(22, 0, 28), pose(22, 0, 28), pose()]),
        move("arm", [0, 0.2, 1.4, 1.7], [at(0, 0, 0), at(-0.04, -0.05, 0), at(-0.04, -0.05, 0), at(0, 0, 0)]),
        move("mag", [0, 0.4, 0.65, 1.0, 1.25], [MAG, MAG, magDown, magDown, MAG]),
        scale("mag", [0, 0.64, 0.65, 0.99, 1.0], [[1, 1, 1], [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1]]),
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
      // Широкий горизонтальный взмах (как у героя от 3-го лица): клинок кладётся плашмя, рука отводится
      // вправо — и резко проходит справа налево через центр экрана, обратно в стойку
      Attack: [
        move("arm", [0, 0.07, 0.17, 0.4], [at(0, 0, 0), at(0.08, 0.03, -0.02), at(-0.18, 0.0, 0.12), at(0, 0, 0)]),
        rotQ("arm", [0, 0.07, 0.17, 0.4], [pose(), pose(-12, 28, -70), pose(4, -48, -80), pose()]),
      ],
      Block: arm.guard, // клинок поперёк — закрыться
      // Прыжок (Q): рука переворачивается — нож обратным хватом, лезвием вниз, — поднята в полёте и бьёт вниз-вперёд
      Leap: [
        move("arm", [0, 0.1, 0.3, 0.42, 0.7], [at(0, 0, 0), at(0.02, 0.12, -0.04), at(0.02, 0.12, -0.04), at(-0.05, -0.12, 0.18), at(0, 0, 0)]),
        rotQ("arm", [0, 0.1, 0.3, 0.42, 0.7], [pose(), pose(-20, 0, 170), pose(-20, 0, 170), pose(50, 0, 170), pose()]),
      ],
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

// ---------- 3а-лук. Лук ----------
// Лук стоймя в руке перед экраном, тетива и стрела — свои кости: натяжение (Draw) — тетива и стрела назад;
// выстрел (Shoot) — тетива хлопает вперёд, стрела улетает (прячем); новая стрела (Reload) — появляется на месте
{
  const arm = makeArm({ P: [0.2, -0.3, 0.02], BASE: qmul(quat(Y, -6), quat(X, -7)) });
  fingers(arm, true);
  const WOOD = [0.42, 0.28, 0.16];
  const WOOD_DARK = [0.3, 0.2, 0.12];
  arm.box([0, 0.06, 0.55], [0.05, 0.13, 0.06], WOOD_DARK); //      рукоять в кулаке
  arm.box([0, 0.27, 0.56], [0.035, 0.3, 0.045], WOOD); //          верхнее плечо
  arm.box([0, 0.47, 0.5], [0.03, 0.14, 0.035], WOOD); //           верхний конец (назад)
  arm.box([0, -0.15, 0.56], [0.035, 0.3, 0.045], WOOD); //         нижнее плечо
  arm.box([0, -0.35, 0.5], [0.03, 0.14, 0.035], WOOD);
  const STRING = arm.at(0, 0.06, 0.46), ARROW = arm.at(0, 0.08, 0.66);
  arm.bones.push({ name: "string", parent: "arm", pos: STRING });
  arm.parts.push({ bone: "string", center: STRING, size: [0.006, 0.9, 0.006], color: [0.85, 0.85, 0.8] }); // тетива
  arm.bones.push({ name: "arrow", parent: "arm", pos: ARROW });
  arm.parts.push({ bone: "arrow", center: ARROW, size: [0.012, 0.012, 0.5], color: [0.62, 0.45, 0.28] }); //        древко
  arm.parts.push({ bone: "arrow", center: arm.at(0, 0.08, 0.92), size: [0.024, 0.024, 0.05], color: [0.6, 0.62, 0.66] }); // наконечник
  arm.parts.push({ bone: "arrow", center: arm.at(0, 0.08, 0.43), size: [0.004, 0.04, 0.06], color: [0.9, 0.3, 0.25] }); //  оперение
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.1, 0.92) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, 0.1, 0.5) });
  const { at, pose } = arm;
  const back = (p, d) => [p[0], p[1], p[2] - d];
  writeGLB(out("fp-bow.glb"), buildGLB({
    name: "FirstPersonBow", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // натянут: тетива и стрела назад (держится, пока тянем — база клипа)
      Draw: [
        move("string", [0, 0.3], [back(STRING, 0.26), back(STRING, 0.26)]),
        move("arrow", [0, 0.3], [back(ARROW, 0.26), back(ARROW, 0.26)]),
        move("arm", [0, 0.3], [at(-0.02, 0.01, 0.02), at(-0.02, 0.01, 0.02)]),
      ],
      Shoot: [
        move("arm", [0, 0.05, 0.3], [at(0, 0, 0), at(0, 0.01, -0.04), at(0, 0, 0)]),
        move("string", [0, 0.04], [back(STRING, 0.26), STRING]),
        scale("arrow", [0, 0.02], [[1, 1, 1], [0, 0, 0]]),
      ],
      Reload: [
        scale("arrow", [0, 0.6, 0.75], [[0, 0, 0], [0, 0, 0], [1, 1, 1]]),
        move("arrow", [0, 0.6, 0.9], [ARROW, [ARROW[0], ARROW[1] - 0.06, ARROW[2] - 0.12], ARROW]),
      ],
    },
  }));
}

// ---------- 3а. Арбалет ----------
// Ложа вдоль руки, плечи лука поперёк впереди, тетива и болт сверху. Прицел — по болту (точки sight)
{
  const arm = makeArm({ P: [0.2, -0.3, 0.02], BASE: qmul(quat(Y, -6), quat(X, -7)) });
  fingers(arm, true);
  const WOOD = [0.42, 0.28, 0.16];
  const WOOD_DARK = [0.3, 0.2, 0.12];
  arm.box([0, 0.03, 0.5], [0.04, 0.11, 0.05], WOOD_DARK); //        рукоять в кулаке
  arm.box([0, 0.06, 0.32], [0.055, 0.09, 0.3], WOOD); //            приклад
  arm.box([0, 0.1, 0.72], [0.06, 0.06, 0.56], WOOD); //             ложа
  arm.box([0, 0.105, 1.0], [0.62, 0.04, 0.04], METAL); //           плечи лука
  arm.box([0.29, 0.105, 0.94], [0.05, 0.03, 0.1], METAL); //         загнутые концы
  arm.box([-0.29, 0.105, 0.94], [0.05, 0.03, 0.1], METAL);
  arm.box([0, 0.06, 0.53], [0.012, 0.03, 0.04], METAL); //          спуск
  arm.bones.push({ name: "string", parent: "arm", pos: arm.at(0, 0.11, 0.62) });
  arm.parts.push({ bone: "string", center: arm.at(0, 0.11, 0.62), size: [0.56, 0.008, 0.008], color: [0.85, 0.85, 0.8] }); // тетива (натянута)
  arm.bones.push({ name: "bolt", parent: "arm", pos: arm.at(0, 0.14, 0.8) });
  arm.parts.push({ bone: "bolt", center: arm.at(0, 0.14, 0.8), size: [0.012, 0.012, 0.42], color: [0.74, 0.76, 0.8] }); // болт
  arm.parts.push({ bone: "bolt", center: arm.at(0, 0.14, 1.02), size: [0.022, 0.022, 0.04], color: [0.36, 0.37, 0.41] }); // наконечник
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.16, 1.0) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, 0.16, 0.6) });
  const muzzle = arm.at(0, 0.14, 1.05);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.01, 0.01, 0.01], color: FLASH }); // вспышки нет — пустышка (клипу Shoot)
  const STRING = arm.at(0, 0.11, 0.62), BOLT = arm.at(0, 0.14, 0.8);
  const { at, pose } = arm;
  writeGLB(out("fp-crossbow.glb"), buildGLB({
    name: "FirstPersonCrossbow", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // Выстрел: тетива хлопает вперёд, болт улетает (прячем), лёгкая отдача
      Shoot: [
        move("arm", [0, 0.05, 0.35], [at(0, 0, 0), at(0, 0.015, -0.06), at(0, 0, 0)]),
        rotQ("arm", [0, 0.05, 0.35], [pose(), pose(-6), pose()]),
        move("string", [0, 0.04], [STRING, [STRING[0], STRING[1], STRING[2] + 0.3]]),
        scale("bolt", [0, 0.02], [[1, 1, 1], [0, 0, 0]]),
      ],
      // Взвод (перезарядка): арбалет носом вниз, тетива назад, новый болт — на место
      Reload: [
        rotQ("arm", [0, 0.25, 0.9, 1.2], [pose(), pose(30, 4, 10), pose(30, 4, 10), pose()]),
        move("arm", [0, 0.25, 0.9, 1.2], [at(0, 0, 0), at(0, -0.06, -0.05), at(0, -0.06, -0.05), at(0, 0, 0)]),
        move("string", [0, 0.3, 0.7], [[STRING[0], STRING[1], STRING[2] + 0.3], [STRING[0], STRING[1], STRING[2] + 0.3], STRING]),
        scale("bolt", [0, 0.75, 0.85], [[0, 0, 0], [0, 0, 0], [1, 1, 1]]),
        move("bolt", [0, 0.75, 0.95], [BOLT, [BOLT[0], BOLT[1] + 0.05, BOLT[2] - 0.1], BOLT]),
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

// ---------- 3в². Взрывчатка в руке: граната и динамит (бросок — Throw, как у камня) ----------
for (const [file, build] of [
  ["fp-grenade.glb", (arm) => {
    const OLIVE = [0.27, 0.33, 0.18], OLIVE_D = [0.2, 0.25, 0.13];
    arm.box([0, 0.045, 0.5], [0.075, 0.085, 0.075], OLIVE); //         корпус
    for (const y of [0.025, 0.065]) arm.box([0, y, 0.5], [0.08, 0.008, 0.08], OLIVE_D); // насечка
    arm.box([0, 0.1, 0.5], [0.03, 0.03, 0.03], METAL_LIGHT); //         запал
    arm.box([0.025, 0.1, 0.5], [0.012, 0.012, 0.06], METAL_LIGHT); //   скоба
    arm.box([-0.03, 0.12, 0.5], [0.02, 0.02, 0.005], [0.7, 0.7, 0.72]); // кольцо чеки
  }],
  ["fp-dynamite.glb", (arm) => {
    const RED = [0.72, 0.12, 0.1];
    for (const x of [-0.028, 0, 0.028]) arm.box([x, 0.045, 0.5], [0.026, 0.026, 0.2], RED); // три шашки
    arm.box([0, 0.045, 0.5], [0.09, 0.03, 0.025], [0.85, 0.8, 0.6]); //  перевязка
    arm.box([0, 0.06, 0.62], [0.008, 0.008, 0.06], [0.2, 0.18, 0.15]); // фитиль
    arm.box([0, 0.06, 0.655], [0.016, 0.016, 0.016], [1, 0.75, 0.3]); //   искра
  }],
]) {
  const arm = makeArm({ P: [0.3, -0.36, 0.1], BASE: qmul(quat(Y, -12), quat(X, -14)) });
  fingers(arm, true);
  build(arm);
  const { at, pose } = arm;
  writeGLB(out(file), buildGLB({
    name: "FirstPerson" + file, generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common, Attack: arm.swing,
      Throw: [
        move("arm", [0, 0.06, 0.14, 0.4], [at(0, 0, 0), at(0.06, 0.12, -0.16), at(-0.04, -0.02, 0.18), at(0, 0, 0)]),
        rotQ("arm", [0, 0.06, 0.14, 0.4], [pose(), pose(-55, 10, -10), pose(35, -10, 5), pose()]),
      ],
    },
  }));
}

// ---------- 3в³. Гранатомёт: толстая короткая труба с барабаном ----------
{
  const arm = makeArm({ P: [0.24, -0.32, 0.04], BASE: qmul(quat(Y, -10), quat(X, -8)) });
  fingers(arm, true);
  const OLIVE = [0.27, 0.33, 0.18];
  arm.box([0, 0.03, 0.5], [0.04, 0.1, 0.05], [0.2, 0.2, 0.22]); //        рукоять
  arm.box([0, 0.1, 0.62], [0.11, 0.11, 0.14], METAL); //                    барабан
  for (const a of [0, 1, 2, 3]) arm.box([Math.cos(a * 1.57) * 0.035, 0.1 + Math.sin(a * 1.57) * 0.035, 0.55], [0.03, 0.03, 0.006], [0.75, 0.65, 0.2]); // донца гранат
  arm.box([0, 0.11, 0.86], [0.07, 0.07, 0.36], OLIVE); //                   ствол
  arm.box([0, 0.11, 1.045], [0.08, 0.08, 0.02], METAL_LIGHT); //            дульце
  arm.box([0, 0.17, 0.78], [0.012, 0.03, 0.012], METAL); //                 прицельная рамка
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.19, 0.78) });
  const muzzle = arm.at(0, 0.11, 1.07);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.14, 0.12, 0.06], color: FLASH });
  const { at, pose } = arm;
  writeGLB(out("fp-launcher.glb"), buildGLB({
    name: "FirstPersonLauncher", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // Глухой «пум»: ствол вверх, рука назад
      Shoot: [
        move("arm", [0, 0.06, 0.4], [at(0, 0, 0), at(0, 0.04, -0.1), at(0, 0, 0)]),
        rotQ("arm", [0, 0.06, 0.4], [pose(), pose(-24), pose()]),
        scale("flash", [0, 0.01, 0.07, 0.08], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0]]),
      ],
    },
  }));
}

// ---------- 3в⁴. Аптечка: держим ДВУМЯ руками перед собой ----------
// Правая рука — makeArm (кость arm), левая — её зеркальная копия (кость armL: x → −x, поворот зеркалим),
// сама аптечка — своя кость kit между ладонями. Use — пока лечимся: аптечку подносят ближе и чуть трясут
{
  const BASE_R = qmul(quat(Y, -20), quat(X, -20));
  const arm = makeArm({ P: [0.22, -0.42, 0.05], BASE: BASE_R });
  fingers(arm, true);
  const mirrorQ = ([x, y, z, w]) => [x, -y, -z, w];
  const mirrorP = ([x, y, z]) => [-x, y, z];
  const right = arm.parts.slice();
  for (const p of right) arm.parts.push({ ...p, bone: "armL", center: mirrorP(p.center) });
  const R0 = arm.bones[0];
  arm.bones.push({ name: "armL", parent: null, pos: mirrorP(R0.pos), rotation: mirrorQ(R0.rotation) });
  const KIT = [0, -0.31, 0.5];
  arm.bones.push({ name: "kit", parent: null, pos: KIT });
  const kit = (c, size, color) => arm.parts.push({ bone: "kit", center: [KIT[0] + c[0], KIT[1] + c[1], KIT[2] + c[2]], size, color });
  const WHITE = [0.92, 0.92, 0.9], RED = [0.85, 0.15, 0.13];
  kit([0, 0, 0], [0.26, 0.17, 0.1], WHITE); //                 коробка
  kit([0, 0, -0.052], [0.05, 0.12, 0.006], RED); //             крест — к нам
  kit([0, 0, -0.052], [0.12, 0.05, 0.006], RED);
  kit([0, 0.095, 0], [0.1, 0.02, 0.03], [0.5, 0.5, 0.52]); //    ручка сверху
  kit([0, 0, 0], [0.27, 0.02, 0.105], RED); //                  полоса по боку
  const { at, pose } = arm;
  // Канал одной руки → та же для обеих (левая — зеркально) и коробка — следом за руками
  const both = (times, offs, rots) => [
    move("arm", times, offs.map((o) => at(...o))),
    rotQ("arm", times, rots.map((r) => pose(...r))),
    move("armL", times, offs.map((o) => mirrorP(at(...o)))),
    rotQ("armL", times, rots.map((r) => mirrorQ(pose(...r)))),
    move("kit", times, offs.map(([x, y, z]) => [KIT[0], KIT[1] + y, KIT[2] + z])),
  ];
  writeGLB(out("fp-medkit.glb"), buildGLB({
    name: "FirstPersonMedkit", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      Idle: both([0, 1.2, 2.4], [[0, 0, 0], [0, 0.006, 0], [0, 0, 0]], [[0], [-2.5], [0]]),
      Walk: both([0, 0.25, 0.5, 0.75, 1], [[0, 0, 0], [0, -0.02, 0], [0, 0, 0], [0, -0.02, 0], [0, 0, 0]], [[0], [2], [0], [2], [0]]),
      Equip: both([0, 0.25], [[0, -0.28, -0.05], [0, 0, 0]], [[35], [0]]),
      // Лечимся: аптечку подняли ближе к груди и раскрыли — мелкая дрожь, пока заполняется круг
      Use: both([0, 0.2, 0.35, 0.5, 0.65, 0.8], [[0, 0, 0], [0, 0.06, -0.08], [0.004, 0.065, -0.08], [0, 0.06, -0.08], [-0.004, 0.065, -0.08], [0, 0.06, -0.08]], [[0], [-12], [-13], [-12], [-13], [-12]]),
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

// ---------- 3д. Боевой молот (БОЕЦ) ----------
// Двуручный молот: ДВЕ руки на длинной рукояти (правая — у конца, левая — выше). Удар — как ульта
// Райнхардта: молот вскидывается над головой и с размаху бьёт в землю перед собой (боёк внизу по центру
// экрана), отскок, пауза, обратно. Кость arm — сам молот (в точке хвата правой руки, +Y — к бойку);
// кости rhand / lhand — предплечья (начало — в кисти на рукояти, +Z — от локтя к кисти).
// Кадры задаём так же, как у катаны: где хват (R), куда смотрит рукоять (D) и где локти — повороты считаются сами.
{
  const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const inverse = ([x, y, z, w]) => [-x, -y, -z, w];
  const rotate = (q, v) => {
    const [x, y, z, w] = q;
    const t = cross([x, y, z], v).map((c) => 2 * c);
    const u = cross([x, y, z], t);
    return [v[0] + w * t[0] + u[0], v[1] + w * t[1] + u[1], v[2] + w * t[2] + u[2]];
  };
  const turn = (from, to) => {
    const a = norm(from), b = norm(to);
    const c = cross(a, b);
    const q = [c[0], c[1], c[2], 1 + dot(a, b)];
    const l = Math.hypot(...q);
    return q.map((v) => v / l);
  };
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const LGRIP = 0.3; // левая рука — на столько выше по рукояти
  // Кадр: хват правой R, рукоять вдоль D, локти правой ER и левой EL (всё в координатах камеры)
  const frame = (R, D, ER, EL) => {
    const rot = turn([0, 1, 0], D);
    const L = add(R, rotate(rot, [0, LGRIP, 0])); // где левая кисть
    return {
      pos: R, rot,
      rhand: qmul(inverse(rot), turn([0, 0, 1], sub(R, ER))),
      lhand: qmul(inverse(rot), turn([0, 0, 1], sub(L, EL))),
    };
  };
  const REST = frame([0.3, -0.3, 0.45], [-0.15, 0.85, 0.35], [0.45, -0.65, 0.1], [-0.05, -0.5, 0.2]); // молот на плече, боёк справа вверху
  const UP = frame([0.14, 0.0, 0.38], [0.05, 0.85, -0.53], [0.4, -0.4, 0.1], [-0.15, -0.4, 0.15]); //     вскинули над головой
  const SWING = frame([0.08, -0.12, 0.5], [0.02, 0.7, 0.7], [0.35, -0.5, 0.15], [-0.2, -0.5, 0.25]); //   летит вниз
  const HIT = frame([0.05, -0.33, 0.52], [0, -0.32, 1], [0.32, -0.62, 0.15], [-0.22, -0.62, 0.35]); //    удар в землю: боёк внизу по центру
  const BOUNCE = frame([0.05, -0.29, 0.5], [0, -0.2, 1], [0.32, -0.59, 0.15], [-0.22, -0.59, 0.35]); //  отскок
  const HOLD = frame([0.05, -0.31, 0.5], [0, -0.28, 1], [0.32, -0.61, 0.15], [-0.22, -0.61, 0.35]);
  // Блок: рукоять поперёк перед собой
  const GUARD = frame([0.22, -0.18, 0.45], [-0.95, 0.25, 0.15], [0.45, -0.55, 0.15], [-0.35, -0.5, 0.2]);

  const arm = makeArm({ P: REST.pos, BASE: REST.rot }); // у makeArm берём только общие анимации (Idle/Walk/Equip)
  arm.parts.length = 0; //                              предплечье makeArm не нужно — руки свои
  const P = REST.pos;
  const WOOD = [0.36, 0.24, 0.14];
  const LEATHER = [0.22, 0.14, 0.09];
  const hammer = (center, size, color) => arm.parts.push({ bone: "arm", center: add(P, center), size, color });
  hammer([0, 0.25, 0], [0.045, 0.8, 0.045], WOOD); //               рукоять (от −0.15 до 0.65)
  hammer([0, -0.16, 0], [0.065, 0.05, 0.065], METAL); //             навершие
  hammer([0, 0, 0], [0.052, 0.1, 0.052], LEATHER); //               обмотка под правой
  hammer([0, LGRIP, 0], [0.052, 0.1, 0.052], LEATHER); //           и под левой
  hammer([0, 0.72, 0], [0.18, 0.18, 0.38], METAL_LIGHT); //          боёк — большой, вдоль «вперёд-назад»
  hammer([0, 0.65, 0], [0.19, 0.04, 0.39], METAL); //                обода
  hammer([0, 0.79, 0], [0.19, 0.04, 0.39], METAL);
  hammer([0, 0.72, 0.195], [0.2, 0.2, 0.03], METAL); //              ударные грани
  hammer([0, 0.72, -0.195], [0.2, 0.2, 0.03], METAL);

  // Руки: бруски в осях предплечья (начало — кисть, −Z — к локтю), side — с какой стороны большой палец
  const LPOS = add(P, [0, LGRIP, 0]);
  arm.bones.push({ name: "rhand", parent: "arm", pos: P, rotation: REST.rhand });
  arm.bones.push({ name: "lhand", parent: "arm", pos: LPOS, rotation: REST.lhand });
  const handParts = (bone, origin, side) => {
    const box = (c, size, color = BONE_COLOR) => arm.parts.push({ bone, center: add(origin, c), size, color });
    box([-0.02, 0, -0.29], [0.038, 0.042, 0.4]); //  две кости предплечья
    box([0.022, -0.004, -0.29], [0.034, 0.038, 0.4]);
    box([0, 0, -0.495], [0.075, 0.06, 0.05], JOINT); // локоть
    box([0, 0, -0.08], [0.085, 0.05, 0.045], JOINT); // запястье
    box([0, 0, -0.02], [0.11, 0.035, 0.08]); //         ладонь
    for (const x of [-0.04, -0.013, 0.013, 0.04]) box([x, -0.03, 0.03], [0.02, 0.045, 0.025]); // пальцы обхватили рукоять
    box([side * 0.066, -0.004, -0.01], [0.02, 0.022, 0.055]); // большой палец
  };
  handParts("rhand", P, -1);
  handParts("lhand", LPOS, 1);

  const keys = (list) => {
    const times = list.map((k) => k[0]);
    return [
      move("arm", times, list.map((k) => k[1].pos)),
      rotQ("arm", times, list.map((k) => k[1].rot)),
      rotQ("rhand", times, list.map((k) => k[1].rhand)),
      rotQ("lhand", times, list.map((k) => k[1].lhand)),
    ];
  };
  writeGLB(out("fp-war-hammer.glb"), buildGLB({
    name: "FirstPersonWarHammer", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      // Удар (0.85 с): замах над головой → удар в землю на 0.3 с (ATTACKS.warHammer.windup) → отскок → обратно
      Attack: keys([[0, REST], [0.16, UP], [0.25, SWING], [0.3, HIT], [0.37, BOUNCE], [0.5, HOLD], [0.85, REST]]),
      Block: keys([[0, REST], [0.06, GUARD], [0.38, GUARD], [0.5, REST]]),
    },
  }));
}

// ---------- 3ж. Копьё (БОЕЦ) ----------
// Длинное древко вперёд из кулака, листовидный наконечник у центра экрана. Attack — укол вперёд;
// Charge — разбег (ПКМ): копьё опущено и выставлено вперёд, держим, пока бежим
{
  const arm = makeArm({ P: [0.26, -0.33, 0.0], BASE: qmul(quat(Y, -6), quat(X, -4)) });
  fingers(arm, true);
  const WOODS = [0.45, 0.31, 0.18];
  const STEEL = [0.74, 0.76, 0.8];
  arm.box([0, -0.01, 0.75], [0.035, 0.035, 1.3], WOODS); //      древко (от локтя и далеко вперёд)
  arm.box([0, -0.01, 1.39], [0.045, 0.045, 0.05], METAL); //     обмотка у наконечника
  arm.box([0, -0.01, 1.48], [0.07, 0.014, 0.14], STEEL); //      лист наконечника
  arm.box([0, -0.01, 1.58], [0.035, 0.014, 0.08], STEEL); //     остриё
  const { at, pose } = arm;
  writeGLB(out("fp-spear.glb"), buildGLB({
    name: "FirstPersonSpear", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      // Укол: короткий отвод назад и резко вперёд, обратно
      Attack: [
        move("arm", [0, 0.08, 0.16, 0.45], [at(0, 0, 0), at(0.01, 0.01, -0.08), at(-0.03, 0.02, 0.34), at(0, 0, 0)]),
        rotQ("arm", [0, 0.08, 0.16, 0.45], [pose(), pose(4, 0, 0), pose(-3, 4, 0), pose()]),
      ],
      // Разбег: копьё ниже и ближе к центру, наконечник вперёд
      Charge: [
        move("arm", [0, 1], [at(-0.07, -0.03, 0.14), at(-0.07, -0.03, 0.14)]),
        rotQ("arm", [0, 1], [pose(-2, 7, 0), pose(-2, 7, 0)]),
      ],
    },
  }));
}

// ---------- 3е. Дробовик (СТРЕЛОК) ----------
{
  const arm = makeArm({ P: [0.24, -0.32, 0.04], BASE: qmul(quat(Y, -10), quat(X, -8)) });
  fingers(arm, true);
  const WOODS = [0.42, 0.28, 0.16];
  arm.box([0, 0.03, 0.5], [0.04, 0.1, 0.05], WOODS); //                    рукоять
  arm.box([0, 0.09, 0.62], [0.06, 0.06, 0.26], METAL); //                  коробка
  arm.box([-0.016, 0.105, 0.9], [0.028, 0.028, 0.4], METAL_LIGHT); //     два ствола
  arm.box([0.016, 0.105, 0.9], [0.028, 0.028, 0.4], METAL_LIGHT);
  arm.box([0, 0.06, 0.82], [0.06, 0.04, 0.18], WOODS); //                  цевьё
  arm.box([0, 0.13, 0.62], [0.01, 0.012, 0.012], METAL); //                целик
  arm.box([0, 0.128, 1.08], [0.01, 0.012, 0.012], METAL); //               мушка
  arm.bones.push({ name: "sight", parent: "arm", pos: arm.at(0, 0.134, 1.08) });
  arm.bones.push({ name: "sight_rear", parent: "arm", pos: arm.at(0, 0.136, 0.62) });
  const muzzle = arm.at(0, 0.105, 1.12);
  arm.bones.push({ name: "flash", parent: "arm", pos: muzzle, scale: [0, 0, 0] });
  arm.parts.push({ bone: "flash", center: muzzle, size: [0.12, 0.1, 0.06], color: FLASH });
  arm.parts.push({ bone: "flash", center: [muzzle[0], muzzle[1], muzzle[2] + 0.04], size: [0.07, 0.07, 0.08], color: [1, 1, 0.8] });
  const { at, pose } = arm;
  writeGLB(out("fp-shotgun.glb"), buildGLB({
    name: "FirstPersonShotgun", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common,
      Aim: [rotQ("arm", [0], [pose()]), move("arm", [0], [at(0, 0, 0)])],
      // Сильная отдача: ствол вверх, рука назад
      Shoot: [
        move("arm", [0, 0.05, 0.35], [at(0, 0, 0), at(0, 0.03, -0.09), at(0, 0, 0)]),
        rotQ("arm", [0, 0.05, 0.35], [pose(), pose(-20), pose()]),
        scale("flash", [0, 0.01, 0.07, 0.08], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0, 0, 0]]),
      ],
      // Перезарядка (2.4 с): ствол вниз и вбок, патроны по одному, обратно
      Reload: [
        rotQ("arm", [0, 0.25, 0.7, 1.1, 1.5, 1.9, 2.4], [pose(), pose(20, 10, 30), pose(24, 10, 30), pose(20, 10, 30), pose(24, 10, 30), pose(20, 10, 30), pose()]),
        move("arm", [0, 0.25, 2.1, 2.4], [at(0, 0, 0), at(-0.04, -0.07, 0), at(-0.04, -0.07, 0), at(0, 0, 0)]),
      ],
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

// ---------- 5. Магия: посох огня и жезл льда ----------
// У навершия — «искра» (своя кость glow): в покое масштаб 0, при заклинании вспыхивает (как вспышка выстрела)
const WOOD_STAFF = [0.36, 0.24, 0.14];
const WOOD_DARK = [0.24, 0.16, 0.1];
const glowBone = (arm, center, size, color, core) => {
  arm.bones.push({ name: "glow", parent: "arm", pos: center, scale: [0, 0, 0] });
  arm.parts.push({ bone: "glow", center, size, color });
  arm.parts.push({ bone: "glow", center, size: size.map((v) => v * 0.55), color: core });
};
const castGlow = (times) => scale("glow", times, times.map((t, i) => (i === 0 || i === times.length - 1 ? [0, 0, 0] : [1, 1, 1])));
{
  // Посох: длинная палка в кулаке, наклонена вперёд; навершие — красный кристалл в оправе
  const arm = makeArm({ P: [0.32, -0.38, 0.1], BASE: qmul(quat(Y, -14), quat(X, -10)) });
  fingers(arm, true);
  arm.box([0, 0.12, 0.52], [0.035, 0.62, 0.035], WOOD_STAFF); //         древко (вверх от кулака)
  arm.box([0, -0.16, 0.52], [0.04, 0.06, 0.04], WOOD_DARK); //           пятка
  arm.box([0, 0.44, 0.52], [0.08, 0.025, 0.08], [0.55, 0.42, 0.18]); //  оправа
  arm.box([0, 0.5, 0.52], [0.06, 0.09, 0.06], [0.85, 0.2, 0.12]); //     кристалл
  arm.box([0, 0.5, 0.52], [0.03, 0.05, 0.07], [1, 0.55, 0.2]); //        огонёк внутри
  glowBone(arm, arm.at(0, 0.5, 0.56), [0.16, 0.16, 0.16], [1, 0.45, 0.1], [1, 0.9, 0.5]);
  const { at, pose } = arm;
  writeGLB(out("fp-staff.glb"), buildGLB({
    name: "FirstPersonStaff", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common, Attack: arm.swing, Block: arm.guard,
      // Заклинание: посох выбрасывается вперёд навершием к цели, кристалл вспыхивает
      Cast: [
        move("arm", [0, 0.07, 0.16, 0.4], [at(0, 0, 0), at(-0.02, 0.02, 0.07), at(-0.015, 0.015, 0.06), at(0, 0, 0)]),
        rotQ("arm", [0, 0.07, 0.16, 0.4], [pose(), pose(16, -3), pose(14, -3), pose()]),
        castGlow([0, 0.05, 0.16, 0.24]),
      ],
    },
  }));
}
{
  // Жезл: короткая палочка, смотрит вперёд, на конце — голубой кристалл
  const arm = makeArm({ P: [0.24, -0.32, 0.06], BASE: qmul(quat(Y, -10), quat(X, -8)) });
  fingers(arm, true);
  arm.box([0, 0.03, 0.62], [0.025, 0.025, 0.26], [0.85, 0.88, 0.95]); //   палочка (вперёд)
  arm.box([0, 0.03, 0.5], [0.035, 0.035, 0.06], [0.3, 0.32, 0.42]); //    рукоять
  arm.box([0, 0.03, 0.765], [0.05, 0.05, 0.05], [0.45, 0.8, 1]); //        кристалл
  arm.box([0, 0.03, 0.79], [0.025, 0.025, 0.03], [0.85, 0.97, 1]);
  glowBone(arm, arm.at(0, 0.03, 0.8), [0.1, 0.1, 0.1], [0.5, 0.85, 1], [0.95, 1, 1]);
  const { at, pose } = arm;
  writeGLB(out("fp-wand.glb"), buildGLB({
    name: "FirstPersonWand", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common, Attack: arm.swing, Block: arm.guard,
      // Заклинание: короткий взмах кистью вперёд, кристалл вспыхивает
      Cast: [
        move("arm", [0, 0.04, 0.2], [at(0, 0, 0), at(-0.01, 0.01, 0.05), at(0, 0, 0)]),
        rotQ("arm", [0, 0.04, 0.2], [pose(), pose(-8, -3), pose()]),
        castGlow([0, 0.03, 0.09, 0.14]),
      ],
    },
  }));
}

// ---------- 6. Метательный нож ----------
{
  const arm = makeArm({ P: [0.3, -0.36, 0.1], BASE: qmul(quat(Y, -12), quat(X, -14)) });
  fingers(arm, true);
  arm.box([0, 0.02, 0.5], [0.025, 0.03, 0.09], [0.2, 0.16, 0.14]); //       рукоять в кулаке
  arm.box([0, 0.02, 0.6], [0.008, 0.035, 0.13], [0.78, 0.8, 0.85]); //      клинок
  arm.box([0, 0.032, 0.6], [0.01, 0.008, 0.13], [0.95, 0.96, 0.98]); //     кромка
  const { at, pose } = arm;
  writeGLB(out("fp-knife.glb"), buildGLB({
    name: "FirstPersonKnife", generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common, Attack: arm.swing, Block: arm.guard,
      // Бросок: короткий замах назад и резкий хлёст вперёд
      Throw: [
        move("arm", [0, 0.06, 0.13, 0.32], [at(0, 0, 0), at(0.04, 0.08, -0.1), at(-0.04, 0, 0.16), at(0, 0, 0)]),
        rotQ("arm", [0, 0.06, 0.13, 0.32], [pose(), pose(-45, 8), pose(30, -8), pose()]),
      ],
    },
  }));
}

// ---------- 7. Ловушки в руке: капкан и шипы ----------
const trapArm = (name, build) => {
  const arm = makeArm({ P: [0.26, -0.38, 0.1], BASE: qmul(quat(Y, -14), quat(X, -6)) });
  fingers(arm, true);
  build(arm);
  const { at, pose } = arm;
  writeGLB(out(name), buildGLB({
    name, generator: "VOID tools/make-viewmodels.js", bones: arm.bones, parts: arm.parts,
    animations: {
      ...arm.common, Attack: arm.swing, Block: arm.guard,
      // Поставить: рука опускается вниз-вперёд (кладём на землю) и возвращается
      Use: [
        move("arm", [0, 0.12, 0.22, 0.45], [at(0, 0, 0), at(-0.03, -0.16, 0.1), at(-0.03, -0.16, 0.1), at(0, 0, 0)]),
        rotQ("arm", [0, 0.12, 0.22, 0.45], [pose(), pose(30), pose(30), pose()]),
      ],
    },
  }));
};
trapArm("fp-bear-trap.glb", (arm) => {
  const IRON = [0.32, 0.3, 0.28];
  arm.box([0, 0.02, 0.53], [0.11, 0.012, 0.11], IRON); //                  основание
  arm.box([0, 0.035, 0.53], [0.025, 0.03, 0.025], [0.55, 0.5, 0.42]); //   тарелка-нажимка
  for (const s of [-1, 1]) arm.box([0, 0.035, 0.53 + s * 0.05], [0.11, 0.035, 0.012], [0.6, 0.6, 0.62]); // челюсти с зубьями
});
trapArm("fp-spikes.glb", (arm) => {
  arm.box([0, 0.02, 0.53], [0.11, 0.015, 0.11], [0.4, 0.3, 0.2]); //         доска
  for (const x of [-0.035, 0, 0.035]) for (const z of [-0.035, 0, 0.035]) arm.box([x, 0.045, 0.53 + z], [0.01, 0.04, 0.01], [0.72, 0.74, 0.78]); // шипы
});
