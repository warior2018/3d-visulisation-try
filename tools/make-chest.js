// ============================================================
//  Генератор модели сундука сокровищ (.glb): деревянный, с золотыми оковками и замком, крышка на петлях.
//  Размер — на 2 × 1 клетки (1.8 × 0.9 м), низ — на y = 0, смотрит вдоль +Z (замок спереди).
//  Анимации: Closed — закрыт, Open — крышка откидывается назад (0.5 с), Opened — открыт.
//  Внутри — золото (видно, когда крышка открыта).
//  Запуск: node tools/make-chest.js  ->  games/builder/assets/chest.glb (+ chest-wood / chest-steel / chest-gold)
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, X } from "./glb-builder.js";

const OUT = fileURLToPath(new URL("../games/builder/assets/chest.glb", import.meta.url));

const W = 1.8, D = 0.9, H = 0.62; // ширина, глубина, высота короба
const LID = 0.3; //                 высота крышки
const BONES = [
  { name: "root", parent: null, pos: [0, 0, 0] },
  { name: "lid", parent: "root", pos: [0, H, -D / 2] }, // петли — сзади сверху короба
];

const WOOD = [0.45, 0.28, 0.14], WOOD_DARK = [0.32, 0.19, 0.09], GOLD = [0.95, 0.76, 0.26], GOLD_DARK = [0.72, 0.54, 0.16];
const COINS = [1, 0.84, 0.32], LOCK = [0.3, 0.3, 0.33];

const parts = [];
const box = (bone, center, size, color) => parts.push({ bone, center, size, color });

// Короб: стенки досками, дно, золото внутри
box("root", [0, 0.04, 0], [W, 0.08, D], WOOD_DARK); //                дно
box("root", [0, H / 2, D / 2 - 0.04], [W, H, 0.08], WOOD); //        перед
box("root", [0, H / 2, -D / 2 + 0.04], [W, H, 0.08], WOOD); //       зад
box("root", [W / 2 - 0.04, H / 2, 0], [0.08, H, D - 0.16], WOOD); // бока
box("root", [-W / 2 + 0.04, H / 2, 0], [0.08, H, D - 0.16], WOOD);
box("root", [0, H * 0.45, D / 2 + 0.002], [W, 0.03, 0.01], WOOD_DARK); // щель между досками
box("root", [0, H - 0.12, 0], [W - 0.16, 0.1, D - 0.16], COINS); //     золото внутри
box("root", [0.3, H - 0.04, 0.1], [0.3, 0.08, 0.3], COINS); //          горка монет
// Оковки: углы и полосы
for (const sx of [-1, 1]) {
  box("root", [sx * (W / 2 - 0.02), H / 2, D / 2 - 0.02], [0.06, H + 0.02, 0.06], GOLD_DARK);
  box("root", [sx * (W / 2 - 0.02), H / 2, -D / 2 + 0.02], [0.06, H + 0.02, 0.06], GOLD_DARK);
  box("root", [sx * W * 0.28, H / 2, D / 2 + 0.01], [0.08, H, 0.02], GOLD); //   вертикальные полосы спереди
}
box("root", [0, 0.06, D / 2 + 0.01], [W, 0.06, 0.02], GOLD); //          нижний обод

// Крышка (кость lid: петли сзади; бруски — в координатах модели)
const lz = 0; // центр крышки по глубине
box("lid", [0, H + LID * 0.35, lz], [W + 0.04, LID * 0.7, D + 0.04], WOOD); //       нижняя часть крышки
box("lid", [0, H + LID * 0.82, lz], [W + 0.04, LID * 0.3, D * 0.7], WOOD); //        скругление сверху
box("lid", [0, H + LID * 0.97, lz], [W + 0.04, LID * 0.08, D * 0.4], WOOD_DARK);
for (const sx of [-0.28, 0.28]) box("lid", [sx * W, H + LID * 0.6, lz], [0.08, LID * 1.25, D + 0.06], GOLD); // полосы через крышку
box("lid", [0, H + 0.02, D / 2 + 0.03], [W + 0.06, 0.05, 0.03], GOLD); //           обод спереди
// Замок спереди (на крышке — открылась, и замок поднялся с ней)
box("lid", [0, H - 0.02, D / 2 + 0.05], [0.16, 0.18, 0.04], GOLD);
box("lid", [0, H - 0.05, D / 2 + 0.075], [0.05, 0.07, 0.02], LOCK);

const ANIMATIONS = {
  Closed: [rot("lid", X, [0, 1], [0, 0])],
  Open: [rot("lid", X, [0, 0.15, 0.4, 0.5], [0, -20, -110, -100])], // рывок, откинулась с запасом и чуть назад
  Opened: [rot("lid", X, [0, 1], [-100, -100])],
};

writeGLB(OUT, buildGLB({ name: "Chest", generator: "VOID tools/make-chest.js", bones: BONES, parts, animations: ANIMATIONS }));

// Сундуки по виду (CHEST_TIERS): та же форма, свои цвета — chest-wood / chest-steel / chest-gold
const IRON = [0.24, 0.24, 0.26], IRON_D = [0.16, 0.16, 0.18];
const VARIANTS = {
  wood: new Map([[GOLD, IRON], [GOLD_DARK, IRON_D]]), //                                        дерево, железные оковки
  steel: new Map([[WOOD, [0.56, 0.58, 0.62]], [WOOD_DARK, [0.4, 0.42, 0.46]], [GOLD, [0.3, 0.31, 0.34]], [GOLD_DARK, [0.22, 0.22, 0.25]]]), // сталь
  gold: new Map([[WOOD, [0.92, 0.74, 0.26]], [WOOD_DARK, [0.7, 0.52, 0.16]], [GOLD, [1, 0.92, 0.6]], [GOLD_DARK, [0.85, 0.7, 0.3]]]), //       золото
};
for (const [id, map] of Object.entries(VARIANTS)) {
  const out = fileURLToPath(new URL(`../games/builder/assets/chest-${id}.glb`, import.meta.url));
  writeGLB(out, buildGLB({ name: "Chest-" + id, generator: "VOID tools/make-chest.js", bones: BONES, parts: parts.map((p) => ({ ...p, color: map.get(p.color) || p.color })), animations: ANIMATIONS }));
}
