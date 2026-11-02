// ============================================================
//  Стихии урона. У каждой: название, цвет (для интерфейса) и, если есть,
//  статус, который она накладывает с шансом statusChance.
//
//  Игра может добавить свои: defineElement("holy", { name: "СВЕТ", color: [...] }).
//  Сопротивления сущности задаются по тем же именам: entity.stats.resist = { fire: 0.5 }.
// ============================================================

import { burn, chill, poison } from "./status.js";

// type — вид урона, как в Dota 2: "physical" (режет броня — resist.physical), "magical" (режет сопротивление
// магии — resist.magical, и ещё своё сопротивление стихии), "pure" — чистый: не режет ничего.
// Стихия задаёт вид по умолчанию; урон может переопределить: new Damage({ ..., type: "pure" })
export const DAMAGE_TYPES = {
  physical: { name: "PHYSICAL", color: [235, 235, 235] },
  magical: { name: "MAGICAL", color: [130, 180, 255] },
  pure: { name: "PURE", color: [255, 215, 90] },
};

export const ELEMENTS = {
  physical: { name: "PHYSICAL", color: [220, 220, 220], type: "physical" },
  fire: { name: "FIRE", color: [255, 120, 40], status: burn, statusChance: 0.5, type: "magical" },
  ice: { name: "ICE", color: [120, 200, 255], status: chill, statusChance: 0.6, type: "magical" },
  poison: { name: "POISON", color: [120, 220, 80], status: poison, statusChance: 0.7, type: "magical" },
  lightning: { name: "LIGHTNING", color: [250, 240, 120], type: "magical" },
  pure: { name: "PURE", color: [255, 215, 90], type: "pure" }, // стихия «чистый урон» (например, у ловушек)
};

// Вид урона стихии (неизвестная стихия — магический)
export const typeOf = (element) => ELEMENTS[element]?.type || (element === "physical" ? "physical" : "magical");

export function defineElement(id, def) {
  ELEMENTS[id] = def;
}
