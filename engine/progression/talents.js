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
//
//  Дерево-схема (вместо ярусов): requires: ["a", "b"] — сначала вложи хотя бы 1 ранг в каждый из них
//  (стрелки на схеме); col / row — где узел стоит на экране (столбец и ряд), у вкладки sections:
//  [{ name, col }] — подписи разделов над столбцами. cost — число или (ранг) => сколько стоит ЭТОТ ранг
//  (например, (r) => (r >= 3 ? 2 : 1): первые два по 1 очку, дальше по 2).
//
//  Доступные вкладки (классы): talents.allow(["melee", "survival"]) — остальные вкладки не видны
//  (visibleTabs) и в них нельзя вкладывать; allow(null) — снова все. refundTab(id) — вернуть очки вкладки.
// ============================================================

import { onlyFor } from "../combat/modifiers.js";

export class Talents {
  constructor(tree) {
    this.tree = tree;
    this.ranks = {}; // id таланта -> вложенный ранг
    this.points = 0; // свободные очки
    this.byId = new Map();
    for (const tab of tree.tabs) for (const t of tab.talents) this.byId.set(t.id, { talent: t, tab });
    this.allowed = null; // null — все вкладки; иначе Set id доступных
  }

  // Какие вкладки доступны (ids или null — все)
  allow(ids) {
    this.allowed = ids ? new Set(ids) : null;
  }

  isAllowed(tabId) {
    return !this.allowed || this.allowed.has(tabId);
  }

  // Вкладки, которые видно (в окне талантов)
  visibleTabs() {
    return this.tree.tabs.filter((t) => this.isAllowed(t.id));
  }

  // Сбросить вкладку: ранги её талантов — в ноль, вложенные очки — обратно. Вернёт, сколько вернули
  refundTab(tabId) {
    const tab = this.tree.tabs.find((t) => t.id === tabId);
    if (!tab) return 0;
    let back = 0;
    for (const t of tab.talents) {
      back += this.spentOn(t);
      delete this.ranks[t.id];
    }
    this.points += back;
    return back;
  }

  rank(id) {
    return this.ranks[id] || 0;
  }

  // Сколько рангов действует: выученные + bonus (подарок со стороны, например таланты на оружии в руках),
  // не больше максимума. bonus — { id: ранги }, задаёт игра; очков не тратит, сбросом не возвращается
  effectiveRank(id) {
    const r = this.rank(id) + (this.bonus?.[id] || 0);
    const max = this.byId.get(id)?.talent.maxRank ?? r;
    return Math.min(r, max);
  }

  // Сколько стоит ранг rank таланта (по умолчанию — следующий)
  cost(id, rank = this.rank(id) + 1) {
    return rankCost(this.byId.get(id)?.talent, rank);
  }

  // Сколько очков вложено в талант всего (сумма цен его рангов)
  spentOn(talent, ranks = this.rank(talent.id)) {
    let sum = 0;
    for (let r = 1; r <= ranks; r++) sum += rankCost(talent, r);
    return sum;
  }

  // Сколько очков вложено во вкладку (дорогие таланты считаются по цене)
  spentIn(tabId) {
    const tab = this.tree.tabs.find((t) => t.id === tabId);
    return tab ? tab.talents.reduce((sum, t) => sum + this.spentOn(t), 0) : 0;
  }

  // Каких талантов не хватает, чтобы открыть этот (requires): список id без единого ранга
  missing(talent) {
    return (talent.requires || []).filter((id) => this.rank(id) <= 0);
  }

  // Сколько очков во вкладке нужно для яруса
  tierRequirement(tier) {
    return this.tree.tierPoints?.[tier - 1] ?? (tier - 1) * 2;
  }

  // Можно ли вложить очко. Вернёт { ok, reason }
  check(id) {
    const entry = this.byId.get(id);
    if (!entry) return { ok: false, reason: "NO SUCH TALENT" };
    const { talent, tab } = entry;
    if (!this.isAllowed(tab.id)) return { ok: false, reason: "NOT FOR YOUR CLASS" };
    if (this.banned?.has(id)) return { ok: false, reason: "NOT IN THIS MODE" }; // режим запретил (дуэль: трофеи)
    if (this.rank(id) >= talent.maxRank) return { ok: false, reason: "MAXED" };
    if (talent.tier) {
      const need = this.tierRequirement(talent.tier);
      if (this.spentIn(tab.id) < need) return { ok: false, reason: `NEED ${need} PTS IN TAB` };
    }
    const miss = this.missing(talent);
    if (miss.length) return { ok: false, reason: `NEED: ${miss.map((id) => this.byId.get(id)?.talent.name || id).join(" + ")}` };
    const cost = this.cost(id);
    if (this.points < cost) return { ok: false, reason: cost > 1 ? `NEED ${cost} FREE PTS` : "NO POINTS" };
    return { ok: true };
  }

  learn(id) {
    const c = this.check(id);
    if (!c.ok) return c;
    this.points -= this.cost(id); // цена этого (следующего) ранга — до того, как он вложен
    this.ranks[id] = this.rank(id) + 1;
    return c;
  }

  // Все модификаторы от выученных талантов. Таланты вкладки с kind действуют только на этот вид атак.
  modifiers() {
    const out = [];
    for (const tab of this.tree.tabs) {
      for (const t of tab.talents) {
        const r = this.effectiveRank(t.id);
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
        if (typeof v === "number") to[k] = (to[k] || 0) + v; //            числа складываются
        else if (typeof v === "boolean") to[k] = !!to[k] || v; //         флаги: хоть один талант дал — включено
        else if (v && typeof v === "object") add((to[k] ||= {}), v);
      }
    };
    for (const tab of this.tree.tabs) {
      for (const t of tab.talents) {
        const r = this.effectiveRank(t.id);
        if (r && t.stats) add(out, t.stats(r));
      }
    }
    return out;
  }

  // Сбросить всё: очки возвращаются
  reset() {
    for (const [id, r] of Object.entries(this.ranks)) {
      const t = this.byId.get(id)?.talent;
      this.points += t ? this.spentOn(t, r) : r;
    }
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
      if (!Number.isInteger(r) || r <= 0) continue;
      // Такого таланта больше нет (игра его убрала / переименовала) — очки возвращаем (цена неизвестна — по 1 за ранг)
      if (!entry) {
        this.points += r;
        continue;
      }
      this.ranks[id] = Math.min(r, entry.talent.maxRank);
      // Игра урезала предел ранга (перебаланс) — лишние вложенные очки возвращаем игроку
      this.points += this.spentOn(entry.talent, r) - this.spentOn(entry.talent, this.ranks[id]);
    }
  }
}

// Цена ранга rank: число (одинаковая) или функция ранга
function rankCost(talent, rank) {
  const c = talent?.cost ?? 1;
  return typeof c === "function" ? c(rank) : c;
}
