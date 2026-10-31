// ============================================================
//  Сцена «мир»: общее для game-scene.js и его частей (scene/*.js) — константы, системы профайлера,
//  мелкие помощники и mixParts (подмешать части в класс сцены).
// ============================================================

import { KEYS, profiler } from "../../../engine/index.js";

// Пока открыта панель цветов, цифры выбирают цвет (а не способность)
export const DIGIT_KEYS = [KEYS["1"], KEYS["2"], KEYS["3"], KEYS["4"], KEYS["5"]];
export const INTERACT_REACH = 3; // как далеко дотягиваемся до зверя (метры)
export const NO_INPUT = { isDown: () => false }; // «никаких клавиш» — для героя под живым окном
export const CORPSE_TIME = 1.2; //  секунд павший лежит, прежде чем исчезнуть

// Доля со знаком в процентах: 0.05 → "+5", −0.08 → "-8" (скорость от брони)
export const signedPct = (v) => (v > 0 ? "+" : "") + Math.round(v * 1000) / 10;

// Системы профайлера (F3) — части обновления мира (внутри UPDATE движка). CREATURES — весь проход по
// существам; внутри него AI («мозги», в нём — поиск пути движка) и PHYSICS (стены, ступеньки, падение)
export const PROF = {
  player: profiler.register("PLAYER", "UPDATE"), //       ввод, оружие в руках, камера-прицел, разбег, рука на экране
  spawn: profiler.register("SPAWN", "UPDATE"), //         появление мобов, кабанов, нашествие
  items: profiler.register("ITEMS", "UPDATE"), //         предметы на земле, автоподбор
  projectiles: profiler.register("PROJECTILES", "UPDATE"),
  traps: profiler.register("TRAPS", "UPDATE"),
  world: profiler.register("WORLD EVENTS", "UPDATE"), //  эффекты, динамит, логова, ульта, туман войны
  creatures: profiler.register("CREATURES", "UPDATE"),
  ai: profiler.register("AI", "CREATURES"),
  physics: profiler.register("PHYSICS", "CREATURES"),
  animation: profiler.register("ANIMATION", "UPDATE"),
  camera: profiler.register("CAMERA", "UPDATE"), //       камера, призрак блока, что под прицелом
  hudCheck: profiler.register("HUD CHECK", "UPDATE"), //  что в HUD изменилось (перерисовать ли)
  hudDraw: profiler.register("HUD DRAW", "UI"),
  save: profiler.register("SAVE", "UPDATE"),
};

// Случайный ключ по долям: { skeleton: 7, zombie: 3 } → «skeleton» в 70 % случаев
export function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if ((r -= w) < 0) return key;
  return entries[0][0];
}

// Как существо выглядит на карте: НПС — точки (сторож синий, кабан бурый, приручённый — золотой),
// мобы — черепки (скелет белый, зомби зелёный, злые — красные)
export function markerFor(e) {
  if (e.kind === "npc") {
    if (e.type === "boar") return { icon: "dot", color: [170, 110, 70] };
    return { icon: "dot", color: [110, 200, 255] };
  }
  if (e.boss) return { icon: "skull", color: [190, 90, 255] }; // босс логова — фиолетовый
  if (e.type === "bloater") return { icon: "skull", color: [170, 220, 90] }; // раздутый — ядовито-зелёный
  if (e.aggro) return { icon: "skull", color: [240, 80, 70] };
  if (e.ranged) return { icon: "skull", color: [240, 170, 60] }; // метатель — оранжевый
  return { icon: "skull", color: e.type === "zombie" ? [130, 200, 100] : [235, 230, 210] };
}

// Подмешать части (классы с методами) в класс сцены: методы частей становятся методами GameScene.
// Одно имя в двух местах — ошибка сразу при запуске (иначе один метод молча затёр бы другой)
export function mixParts(target, parts) {
  for (const P of parts) {
    for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(P.prototype))) {
      if (name === "constructor") continue;
      if (Object.hasOwn(target.prototype, name)) throw new Error(`${P.name}.${name}: такой метод у сцены уже есть`);
      Object.defineProperty(target.prototype, name, d);
    }
  }
}
