// ============================================================
//  «Пакет урона» — всё, что известно об одном попадании.
//
//  Атака создаёт пакет → модификаторы его меняют (сильнее, огонь, крит, яд...) →
//  цель применяет к нему свои сопротивления и получает статусы (горение, замедление...).
//  Так любую механику можно добавить, не трогая остальные: это просто ещё один шаг.
//
//  Кто участвует в попадании:
//    attacker — кто ударил (сущность; null — урон «мира»: ловушка, падение). То же, что source.
//    victim   — кого ударили (ставится, когда цель получает пакет: entity.receive).
//    credit   — кому засчитать урон (счётчик урона, добыча): хозяин питомца / турели, иначе сам attacker.
//               Хозяин берётся из entity.master (игра ставит сама) или из приручения (taming.owner).
// ============================================================

// Кому засчитать урон, нанесённый сущностью e (питомец → хозяин; хозяин хозяина — тоже, до 4 шагов)
export function creditOf(e) {
  let who = e ?? null;
  for (let i = 0; i < 4 && who; i++) {
    const up = who.master ?? (who.taming?.tamed ? who.taming.owner : null);
    if (!up || up === who) break;
    who = up;
  }
  return who;
}

import { typeOf } from "./elements.js";

export class Damage {
  // kind — вид атаки, от которой урон (melee / ranged / ...). По умолчанию — attack.kind;
  //        у урона от статуса (горение) — вид атаки, которая этот статус наложила
  constructor({ amount, element = "physical", type = null, source = null, attack = null, tags = [], kind = null }) {
    this.amount = amount; //   сколько урона (до сопротивлений цели)
    this.base = amount; //     сколько было до модификаторов (счётчик: «сколько добавили таланты»)
    this.element = element; // стихия: "physical", "fire", "ice", "poison", "lightning", ...
    // вид: "physical" / "magical" / "pure" (elements.js: DAMAGE_TYPES) — по стихии или явно (атака: damageType)
    this.type = type || attack?.damageType || typeOf(element);
    this.source = source; //   кто нанёс (сущность или null — например, ловушка мира)
    this.victim = null; //     кого ударили (ставит entity.receive)
    this.attack = attack; //   какой атакой (Attack) — чтобы знать, мечом или магией
    this.kind = kind ?? attack?.kind ?? null;
    this.tags = new Set(tags); // ярлыки: "melee", "ranged", "magic", "dot" (урон от статуса), "crit"...
    this.crit = false; //      критическое попадание
    this.statuses = []; //     статусы, которые цель получит вместе с уроном (StatusEffect)
    this.shot = null; //       выстрел: { hitscan: true } или { projectile: {...} } — пуля / снаряд (блок может отразить)
    this.applied = []; //      какие модификаторы сработали и на сколько поменяли урон: { id, delta }
  }

  get attacker() {
    return this.source;
  }

  // Кому засчитать (см. шапку)
  get credit() {
    return creditOf(this.source);
  }
}
