// ============================================================
//  Добыча: редкость и удача (как в Diablo / Dota-нейтралах). Что выпадает и сколько стоит — решает игра;
//  здесь — общие правила случайности.
//
//    rollRarity(luck)            // "common" | "rare" | "epic" | "legendary" — удача поднимает шансы редких
//    rarityOf(id)               // { id, name, color, power, sell }: power — прибавка к силе (+10 % урона / брони),
//                                  sell — во сколько раз дороже продаётся
//    chance(base, luck)         // выпало ли (base — шанс без удачи; удача 0.5 — в полтора раза чаще)
//    pickWeighted({ a: 3, b: 1 }) // ключ по весам
//
//  Удача (luck) — доля: 0 — обычная, 0.6 — +60 %. Редким шансам она помогает сильнее, чем обычным:
//  вес редкости i умножается на (1 + luck × i) — легендарке втрое больше, чем редкой.
// ============================================================

export const RARITIES = [
  { id: "common", name: "COMMON", color: [205, 205, 205], weight: 70, power: 0, sell: 1 },
  { id: "rare", name: "RARE", color: [90, 160, 255], weight: 22, power: 0.1, sell: 2 },
  { id: "epic", name: "EPIC", color: [190, 100, 255], weight: 6.5, power: 0.2, sell: 4 },
  { id: "legendary", name: "LEGENDARY", color: [255, 170, 40], weight: 1.5, power: 0.35, sell: 8 },
];
const BY_ID = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

export const rarityOf = (id) => BY_ID[id] || RARITIES[0];

export function rarityWeights(luck = 0) {
  return RARITIES.map((r, i) => r.weight * (1 + Math.max(0, luck) * i));
}

export function rollRarity(luck = 0, random = Math.random) {
  const w = rarityWeights(luck);
  let x = random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return RARITIES[i].id;
  return RARITIES[0].id;
}

export function chance(base, luck = 0, random = Math.random) {
  return random() < Math.min(1, base * (1 + Math.max(0, luck)));
}

export function pickWeighted(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let x = random() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) if ((x -= w) < 0) return k;
  return entries.at(-1)?.[0] ?? null;
}
