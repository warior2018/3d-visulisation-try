// ============================================================
//  Дерево талантов. Описание дерева (какие вкладки и таланты) даёт игра,
//  движок следит за правилами: очки, ранги, ярусы, и собирает модификаторы.
//
//  Дерево:
//    {
//      tierPoints: [0, 2, 4],   // сколько очков нужно вложить во вкладку, чтобы открыть ярус 1, 2, 3
//      tabs: [{
//        id: "melee", name: "БЛИЖНИЙ",
//        kind: "melee",          // таланты вкладки действуют только на атаки этого вида (onlyFor)
//        talents: [{
//          id: "heavy-hand", name: "ТЯЖЁЛАЯ РУКА", tier: 1, maxRank: 3,
//          maxRank: Infinity — можно вкладывать бесконечно (рангов без предела)
//          cost: 1,                // сколько очков стоит ранг (по умолчанию 1; дорогие таланты — больше)
//          describe: (rank) => "+3 урона за ранг",
//          modifiers: (rank) => [flatDamage(3 * rank)],  // модификаторы из engine/combat
//          // или (и) прибавки к характеристикам — как их применить, решает игра:
//          stats: (rank) => ({ maxHp: 10 * rank, regen: rank, resist: { physical: 0.05 * rank } }),
//        }],
//      }],
//    }
// ============================================================

import { onlyFor } from "../combat/modifiers.js";

export class Talents {
  constructor(tree) {
    this.tree = tree;
    this.ranks = {}; // id таланта -> вложенный ранг
    this.points = 0; // свободные очки
    this.byId = new Map();
    for (const tab of tree.tabs) for (const t of tab.talents) this.byId.set(t.id, { talent: t, tab });
  }

  rank(id) {
    return this.ranks[id] || 0;
  }

  // Сколько стоит один ранг таланта
  cost(id) {
    return this.byId.get(id)?.talent.cost ?? 1;
  }

  // Сколько очков вложено во вкладку (дорогие таланты считаются по цене)
  spentIn(tabId) {
    const tab = this.tree.tabs.find((t) => t.id === tabId);
    return tab ? tab.talents.reduce((sum, t) => sum + this.rank(t.id) * (t.cost ?? 1), 0) : 0;
  }

  // Сколько очков во вкладке нужно для яруса
  tierRequirement(tier) {
    return this.tree.tierPoints?.[tier - 1] ?? (tier - 1) * 2;
  }

  // Можно ли вложить очко. Вернёт { ok, reason }
  check(id) {
    const entry = this.byId.get(id);
    if (!entry) return { ok: false, reason: "НЕТ ТАКОГО ТАЛАНТА" };
    const { talent, tab } = entry;
    if (this.rank(id) >= talent.maxRank) return { ok: false, reason: "МАКСИМУМ" };
    const need = this.tierRequirement(talent.tier);
    if (this.spentIn(tab.id) < need) return { ok: false, reason: `НУЖНО ${need} ОЧК. ВО ВКЛАДКЕ` };
    const cost = talent.cost ?? 1;
    if (this.points < cost) return { ok: false, reason: cost > 1 ? `НУЖНО ${cost} СВОБОДНЫХ ОЧК.` : "НЕТ ОЧКОВ" };
    return { ok: true };
  }

  learn(id) {
    const c = this.check(id);
    if (!c.ok) return c;
    this.ranks[id] = this.rank(id) + 1;
    this.points -= this.cost(id);
    return c;
  }

  // Все модификаторы от выученных талантов. Таланты вкладки с kind действуют только на этот вид атак.
  modifiers() {
    const out = [];
    for (const tab of this.tree.tabs) {
      for (const t of tab.talents) {
        const r = this.rank(t.id);
        if (!r || !t.modifiers) continue;
        for (const m of t.modifiers(r)) out.push(tab.kind ? onlyFor(tab.kind, m) : m);
      }
    }
    return out;
  }

  // Сумма прибавок к характеристикам от всех выученных талантов (поле stats у таланта).
  // Числа складываются, вложенные объекты (resist) — по полям: { maxHp: 30, resist: { physical: 0.1 } }
  stats() {
    const out = {};
    const add = (to, from) => {
      for (const [k, v] of Object.entries(from)) {
        if (typeof v === "number") to[k] = (to[k] || 0) + v;
        else if (v && typeof v === "object") add((to[k] ||= {}), v);
      }
    };
    for (const tab of this.tree.tabs) {
      for (const t of tab.talents) {
        const r = this.rank(t.id);
        if (r && t.stats) add(out, t.stats(r));
      }
    }
    return out;
  }

  // Сбросить всё: очки возвращаются
  reset() {
    for (const [id, r] of Object.entries(this.ranks)) this.points += r * this.cost(id);
    this.ranks = {};
  }

  toJSON() {
    return { points: this.points, ranks: { ...this.ranks } };
  }

  loadFrom(data) {
    if (!data) return;
    this.points = Number.isInteger(data.points) && data.points >= 0 ? data.points : 0;
    this.ranks = {};
    for (const [id, r] of Object.entries(data.ranks || {})) {
      const entry = this.byId.get(id);
      if (!entry || !Number.isInteger(r) || r <= 0) continue;
      this.ranks[id] = Math.min(r, entry.talent.maxRank);
      // Игра урезала предел ранга (перебаланс) — лишние вложенные очки возвращаем игроку
      this.points += (r - this.ranks[id]) * (entry.talent.cost ?? 1);
    }
  }
}
