// ============================================================
//  Генератор моделей предметов, лежащих на земле (.glb):
//   stone.glb — камень: несколько серых брусков, сложенных неровно;
//   item.glb  — «узелок» для любого другого предмета: ящичек, верх которого
//               розовый (1, 0, 1) — игра перекрашивает его в цвет предмета (main.js).
//   knife.glb, bear-trap.glb, spikes.glb — нож, капкан и шипы (на земле и поставленные ловушки);
//   fireball.glb — огненный шар посоха (летящий снаряд).
//  Запуск: node tools/make-items.js  ->  games/builder/assets/*.glb
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

// Метательный нож на земле: рукоять и клинок, лежит плашмя
const knife = [
  box([0, 0.02, -0.06], [0.04, 0.035, 0.11], [0.2, 0.16, 0.14]),
  box([0, 0.015, 0.07], [0.05, 0.012, 0.16], [0.78, 0.8, 0.85]),
];
// Болт арбалета в полёте: древко вдоль +Z, наконечник впереди, оперение сзади
const bolt = [
  box([0, 0, 0], [0.014, 0.014, 0.44], [0.55, 0.42, 0.26]),
  box([0, 0, 0.24], [0.022, 0.022, 0.05], [0.72, 0.74, 0.78]),
  box([0, 0, -0.19], [0.05, 0.004, 0.07], [0.85, 0.85, 0.82]),
  box([0, 0, -0.19], [0.004, 0.05, 0.07], [0.85, 0.85, 0.82]),
];
// Капкан: железное основание, тарелка-нажимка посередине, две зубчатые челюсти (раскрыты)
const IRON = [0.32, 0.3, 0.28];
const JAW = [0.62, 0.62, 0.64];
const bearTrap = [
  box([0, 0.015, 0], [0.5, 0.03, 0.5], IRON),
  box([0, 0.045, 0], [0.12, 0.03, 0.12], [0.55, 0.5, 0.42]),
  ...[-1, 1].flatMap((s) => [
    box([0, 0.05, s * 0.23], [0.5, 0.06, 0.03], JAW),
    ...[-0.18, -0.06, 0.06, 0.18].map((x) => box([x, 0.1, s * 0.23], [0.035, 0.05, 0.03], JAW)), // зубья
  ]),
];
// Шипы: доска с рядами острых шипов
const spikes = [
  box([0, 0.02, 0], [0.9, 0.04, 0.9], [0.4, 0.3, 0.2]),
  ...[-0.3, -0.1, 0.1, 0.3].flatMap((x) => [-0.3, -0.1, 0.1, 0.3].map((z) => box([x, 0.12, z], [0.04, 0.16, 0.04], [0.72, 0.74, 0.78]))),
];
// Огненный шар (летит из посоха): яркое ядро в оранжевой оболочке
const fireball = [
  box([0, 0, 0], [0.34, 0.34, 0.34], [1, 0.42, 0.08]),
  box([0, 0, 0], [0.24, 0.42, 0.24], [1, 0.62, 0.15]),
  box([0, 0, 0], [0.2, 0.2, 0.44], [1, 0.62, 0.15]),
  box([0, 0, 0], [0.18, 0.18, 0.18], [1, 0.95, 0.6]),
];

// Турель-гриб (призыватель): ножка, шляпка с пятнами и «дуло» спереди. Игра увеличивает её (entity.scale)
const CAP = [0.35, 0.78, 0.35];
const turret = [
  box([0, 0.15, 0], [0.16, 0.3, 0.16], [0.88, 0.86, 0.78]), //   ножка
  box([0, 0.36, 0], [0.42, 0.14, 0.42], CAP), //                  шляпка
  box([0, 0.45, 0], [0.26, 0.08, 0.26], CAP),
  box([0.12, 0.44, 0.1], [0.07, 0.03, 0.07], [0.9, 0.97, 0.9]), // пятна
  box([-0.1, 0.44, -0.08], [0.06, 0.03, 0.06], [0.9, 0.97, 0.9]),
  box([0, 0.34, 0.26], [0.08, 0.08, 0.14], [0.2, 0.45, 0.2]), //  дуло
];
// Спора (снаряд турели): зелёный комочек
const spore = [box([0, 0, 0], [0.14, 0.14, 0.14], [0.45, 0.9, 0.35]), box([0, 0, 0], [0.08, 0.18, 0.08], [0.8, 1, 0.6])];
// Магма-камень в полёте: раскалённый булыжник
const magma = [
  box([0, 0, 0], [0.24, 0.18, 0.2], [0.6, 0.15, 0.05]),
  box([0.02, 0.06, 0], [0.16, 0.08, 0.14], [1, 0.45, 0.1]),
  box([0, 0, 0], [0.1, 0.22, 0.1], [1, 0.8, 0.3]),
];
// Граната автомата: тёмный цилиндр с кольцом
const grenade = [box([0, 0, 0], [0.1, 0.14, 0.1], [0.25, 0.3, 0.2]), box([0, 0.08, 0], [0.04, 0.04, 0.04], [0.7, 0.7, 0.7])];
// Шкура тролля (трофей босса): плоская серо-зелёная шкура с «лапами» по углам и тёмной полосой по хребту
const HIDE = [0.43, 0.47, 0.35];
const HIDE_DARK = [0.33, 0.37, 0.27];
const hide = [
  box([0, 0.02, 0], [0.5, 0.04, 0.36], HIDE),
  box([0, 0.045, 0], [0.4, 0.02, 0.1], HIDE_DARK),
  ...[[-0.27, -0.2], [0.27, -0.2], [-0.27, 0.2], [0.27, 0.2]].map(([x, z]) => box([x, 0.015, z], [0.1, 0.03, 0.1], HIDE)),
  box([0, 0.02, 0.24], [0.16, 0.04, 0.1], HIDE_DARK), //  голова
];
// Аптечка на земле: белая коробка с красным крестом сверху и с боков
const WHITE = [0.92, 0.92, 0.9], RED_K = [0.85, 0.15, 0.13];
const medkit = [
  box([0, 0.09, 0], [0.36, 0.18, 0.26], WHITE),
  box([0, 0.182, 0], [0.07, 0.006, 0.18], RED_K),
  box([0, 0.182, 0], [0.2, 0.006, 0.07], RED_K),
  box([0, 0.09, 0], [0.37, 0.03, 0.27], RED_K),
  box([0, 0.2, 0], [0.12, 0.03, 0.03], [0.5, 0.5, 0.52]),
];
writeGLB(out("medkit.glb"), buildGLB({ name: "Medkit", generator: "VOID tools/make-items.js", bones: BONES, parts: medkit, animations: ANIMATIONS }));
writeGLB(out("hide.glb"), buildGLB({ name: "TrollHide", generator: "VOID tools/make-items.js", bones: BONES, parts: hide, animations: ANIMATIONS }));
writeGLB(out("turret.glb"), buildGLB({ name: "Turret", generator: "VOID tools/make-items.js", bones: BONES, parts: turret, animations: ANIMATIONS }));
writeGLB(out("spore.glb"), buildGLB({ name: "Spore", generator: "VOID tools/make-items.js", bones: BONES, parts: spore, animations: ANIMATIONS }));
writeGLB(out("magma.glb"), buildGLB({ name: "Magma", generator: "VOID tools/make-items.js", bones: BONES, parts: magma, animations: ANIMATIONS }));
writeGLB(out("grenade.glb"), buildGLB({ name: "Grenade", generator: "VOID tools/make-items.js", bones: BONES, parts: grenade, animations: ANIMATIONS }));
writeGLB(out("bolt.glb"), buildGLB({ name: "Bolt", generator: "VOID tools/make-items.js", bones: BONES, parts: bolt, animations: ANIMATIONS }));
writeGLB(out("knife.glb"), buildGLB({ name: "Knife", generator: "VOID tools/make-items.js", bones: BONES, parts: knife, animations: ANIMATIONS }));
writeGLB(out("bear-trap.glb"), buildGLB({ name: "BearTrap", generator: "VOID tools/make-items.js", bones: BONES, parts: bearTrap, animations: ANIMATIONS }));
writeGLB(out("spikes.glb"), buildGLB({ name: "Spikes", generator: "VOID tools/make-items.js", bones: BONES, parts: spikes, animations: ANIMATIONS }));
writeGLB(out("fireball.glb"), buildGLB({ name: "Fireball", generator: "VOID tools/make-items.js", bones: BONES, parts: fireball, animations: ANIMATIONS }));
writeGLB(out("stone.glb"), buildGLB({ name: "Stone", generator: "VOID tools/make-items.js", bones: BONES, parts: stone, animations: ANIMATIONS }));
writeGLB(out("item.glb"), buildGLB({ name: "Item", generator: "VOID tools/make-items.js", bones: BONES, parts: item, animations: ANIMATIONS }));
