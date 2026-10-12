// ============================================================
//  Генератор моделей предметов, лежащих на земле (.glb):
//   stone.glb — камень: несколько серых брусков, сложенных неровно;
//   item.glb  — «узелок» для любого другого предмета: ящичек, верх которого
//               розовый (1, 0, 1) — игра перекрашивает его в цвет предмета (main.js).
//  Запуск: node tools/make-items.js  ->  games/builder/assets/stone.glb, item.glb
//
//  Низ модели — на y = 0, центр — на x = z = 0. Размер ~0.35 м.
// ============================================================

import { fileURLToPath } from "node:url";
import { buildGLB, writeGLB, rot, Y } from "./glb-builder.js";

const out = (name) => fileURLToPath(new URL(`../games/builder/assets/${name}`, import.meta.url));
const BONES = [{ name: "root", parent: null, pos: [0, 0, 0] }];
// Анимация-пустышка: модели без анимаций аниматору не нужны, но клип Idle должен быть
const ANIMATIONS = { Idle: [rot("root", Y, [0, 1], [0, 0])] };

const box = (center, size, color) => ({ bone: "root", center, size, color });

// Камень: тёмно- и светло-серые бруски, чуть смещённые — выглядит как булыжник
const GRAY = [0.5, 0.5, 0.53];
const GRAY_DARK = [0.38, 0.38, 0.41];
const GRAY_LIGHT = [0.64, 0.64, 0.67];
const stone = [
  box([0, 0.09, 0], [0.34, 0.18, 0.28], GRAY),
  box([0.03, 0.2, -0.02], [0.24, 0.08, 0.2], GRAY_LIGHT),
  box([-0.12, 0.07, 0.08], [0.12, 0.14, 0.14], GRAY_DARK),
  box([0.13, 0.06, -0.09], [0.1, 0.12, 0.12], GRAY_DARK),
];

// Узелок: деревянный ящичек с цветной крышкой (цвет — предмета)
const WOOD = [0.45, 0.32, 0.2];
const WOOD_DARK = [0.32, 0.22, 0.14];
const MARK = [1, 0, 1];
const item = [
  box([0, 0.1, 0], [0.3, 0.2, 0.3], WOOD),
  box([0, 0.215, 0], [0.32, 0.05, 0.32], MARK),
  box([0, 0.1, 0.152], [0.06, 0.2, 0.01], WOOD_DARK), // планки
  box([0, 0.1, -0.152], [0.06, 0.2, 0.01], WOOD_DARK),
];

writeGLB(out("stone.glb"), buildGLB({ name: "Stone", generator: "VOID tools/make-items.js", bones: BONES, parts: stone, animations: ANIMATIONS }));
writeGLB(out("item.glb"), buildGLB({ name: "Item", generator: "VOID tools/make-items.js", bones: BONES, parts: item, animations: ANIMATIONS }));
