// ============================================================
//  Стихии урона. У каждой: название, цвет (для интерфейса) и, если есть,
//  статус, который она накладывает с шансом statusChance.
//
//  Игра может добавить свои: defineElement("holy", { name: "СВЕТ", color: [...] }).
//  Сопротивления сущности задаются по тем же именам: entity.stats.resist = { fire: 0.5 }.
// ============================================================

import { burn, chill, poison } from "./status.js";

export const ELEMENTS = {
  physical: { name: "ФИЗИЧЕСКИЙ", color: [220, 220, 220] },
  fire: { name: "ОГОНЬ", color: [255, 120, 40], status: burn, statusChance: 0.5 },
  ice: { name: "ЛЁД", color: [120, 200, 255], status: chill, statusChance: 0.6 },
  poison: { name: "ЯД", color: [120, 220, 80], status: poison, statusChance: 0.7 },
  lightning: { name: "МОЛНИЯ", color: [250, 240, 120] },
};

export function defineElement(id, def) {
  ELEMENTS[id] = def;
}
