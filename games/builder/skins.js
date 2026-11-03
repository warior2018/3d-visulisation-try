// ============================================================
//  Скины «Стройки» (как в Overwatch: выбор в главном меню, вкладка SKINS).
//  Скелет и анимации у всех одни — скин только перекрашивает модель (движок: ModelLibrary.variant + кисти
//  engine/graphics/paint.js) и значок предмета (ui.paintRegion). Пока все скины открыты.
//
//  SKIN_TARGETS — что можно перекрасить: id, раздел (weapons / character / armor / utility), модели,
//  предметы (значки), скины. Первый скин — DEFAULT (без кисти). Выбор хранится в настройках: settings.skins.
//  Скин видят на своём герое, своих моделях от 1-го лица и в меню (у других игроков сети — позже).
// ============================================================

import { paint as P } from "../../engine/index.js";

export const SKIN_CATEGORIES = [
  { id: "weapons", name: "WEAPONS" },
  { id: "character", name: "CHARACTER" },
  { id: "armor", name: "ARMOR" },
  { id: "utility", name: "UTILITY" },
];

const DEFAULT = { id: "default", name: "DEFAULT", text: "THE ORIGINAL LOOK" };
const gold = P.metal([0.3, 0.17, 0.04], [1, 0.86, 0.4]);

// оружие: модели в руке (w-) и от 1-го лица (fp-)
const weapon = (id, name, skin, models = [`w-${id}`, `fp-${id}`]) => ({ id, category: "weapons", name, models, items: [id], skins: [DEFAULT, skin] });
const utility = (id, name, skin, models) => ({ id, category: "utility", name, models, items: [id], skins: [DEFAULT, skin] });

export const SKIN_TARGETS = [
  weapon("machete", "MACHETE", { id: "jungle", name: "JUNGLE RUST", text: "A BLADE THAT HAS SEEN TOO MANY RAINS", paint: P.metal([0.22, 0.1, 0.04], [0.8, 0.48, 0.26]) }),
  weapon("war-hammer", "WAR HAMMER", { id: "molten", name: "MOLTEN", text: "STILL GLOWING FROM THE FURNACE", paint: P.metal([0.35, 0.03, 0.01], [1, 0.72, 0.2]) }),
  weapon("katana", "KATANA", { id: "sakura", name: "SAKURA", text: "PINK STEEL, PETAL WRAP", paint: P.chain(P.metal([0.45, 0.3, 0.38], [1, 0.86, 0.93]), P.dye([0.92, 0.42, 0.62])) }, ["w-katana", "w-katana-sheathed", "w-katana-saya", "fp-katana"]),
  weapon("spear", "SPEAR", { id: "bone", name: "OSSUARY", text: "CARVED FROM ONE GIANT BONE", paint: P.gradientMap([[0.22, 0.19, 0.15], [0.95, 0.92, 0.82]]) }),
  weapon("pistol", "PISTOL", { id: "gilded", name: "GILDED", text: "SOLID GOLD. PROBABLY", paint: gold }),
  weapon("auto", "ASSAULT RIFLE", { id: "arctic", name: "ARCTIC", text: "WHITE CAMO FOR THE NORTH", paint: P.gradientMap([[0.18, 0.26, 0.36], [0.93, 0.97, 1]]) }),
  weapon("shotgun", "SHOTGUN", { id: "swamp", name: "SWAMP", text: "MOSS ON THE STOCK, MUD ON THE BARREL", paint: P.chain(P.metal([0.06, 0.08, 0.04], [0.45, 0.5, 0.34]), P.dye([0.3, 0.42, 0.14])) }),
  weapon("rifle", "SNIPER RIFLE", { id: "void", name: "VOID", text: "BLACK AS THE ABYSS UNDER THE ISLANDS", paint: P.gradientMap([[0.02, 0.01, 0.05], [0.32, 0.14, 0.58], [0.82, 0.62, 1]]) }),
  weapon("crossbow", "CROSSBOW", { id: "elven", name: "ELVEN", text: "GREEN WOOD, GOLDEN FITTINGS", paint: P.chain(gold, P.dye([0.22, 0.55, 0.3])) }),
  weapon("grenades", "GRENADES", { id: "toxic", name: "TOXIC", text: "DO NOT LICK", paint: P.chain(P.metal([0.05, 0.15, 0.02], [0.6, 1, 0.35]), P.dye([0.45, 0.95, 0.2])) }, ["w-grenade", "fp-grenade", "item-grenade"]),
  weapon("launcher", "GRENADE LAUNCHER", { id: "sandstorm", name: "SANDSTORM", text: "DESERT PAINT, CHIPPED", paint: P.gradientMap([[0.28, 0.2, 0.1], [0.96, 0.86, 0.6]]) }),
  weapon("dynamite", "DYNAMITE", { id: "frostbite", name: "FROSTBITE", text: "COLD ON THE OUTSIDE", paint: P.dye([0.35, 0.72, 1]) }, ["w-dynamite", "fp-dynamite", "item-dynamite-lit"]),
  // герой — одна модель на класс (одежда), скелет один
  { id: "fighter", category: "character", name: "FIGHTER", models: ["hero"], items: [], skins: [DEFAULT, { id: "ronin", name: "RONIN", text: "BLACK YUKATA OF A MASTERLESS SWORDSMAN", paint: P.dye([0.14, 0.14, 0.17]) }] },
  { id: "ranger", category: "character", name: "RANGER", models: ["hero-ranged"], items: [], skins: [DEFAULT, { id: "outlaw", name: "OUTLAW", text: "A CRIMSON COAT FROM THE WANTED POSTER", paint: P.dye([0.62, 0.14, 0.1]) }] },
  { id: "demolitionist", category: "character", name: "DEMOLITIONIST", models: ["hero-demo"], items: [], skins: [DEFAULT, { id: "hazmat", name: "HAZMAT", text: "BRIGHT YELLOW: EVERYONE SEES YOU COMING", paint: P.dye([0.98, 0.82, 0.1]) }] },
  // броня — пока значки (на модели героя броню не рисуем)
  { id: "leather", category: "armor", name: "LEATHER SET", models: [], items: ["leather-"], skins: [DEFAULT, { id: "scorched", name: "SCORCHED", text: "SOOT-BLACK LEATHER", paint: P.gradientMap([[0.05, 0.03, 0.02], [0.5, 0.32, 0.2]]) }] },
  { id: "bone", category: "armor", name: "BONE SET", models: [], items: ["bone-"], skins: [DEFAULT, { id: "cursed", name: "CURSED", text: "THE LICH'S OWN WARDROBE", paint: P.gradientMap([[0.12, 0.05, 0.2], [0.78, 0.66, 0.95]]) }] },
  { id: "iron", category: "armor", name: "IRON SET", models: [], items: ["iron-"], skins: [DEFAULT, { id: "royal", name: "ROYAL", text: "GOLD PLATE FIT FOR A KING", paint: gold }] },
  utility("bear-trap", "BEAR TRAP", { id: "rusted", name: "RUSTED", text: "OLD, BUT THE JAWS STILL BITE", paint: P.metal([0.2, 0.08, 0.03], [0.75, 0.42, 0.22]) }, ["w-bear-trap", "fp-bear-trap"]),
  utility("spikes", "SPIKES", { id: "obsidian", name: "OBSIDIAN", text: "VOLCANIC GLASS", paint: P.gradientMap([[0.02, 0.02, 0.04], [0.3, 0.2, 0.42]]) }, ["w-spikes", "fp-spikes"]),
  utility("medkit", "MEDKIT", { id: "navy", name: "NAVY", text: "FLEET-ISSUE FIRST AID", paint: P.dye([0.18, 0.35, 0.85]) }, ["w-medkit", "fp-medkit"]),
  utility("builder", "BUILDER'S HAMMER", { id: "golden", name: "GOLDEN", text: "BUILDS THE SAME, LOOKS RICHER", paint: gold }, ["w-builder", "w-hammer", "fp-hammer"]),
];

export const SKIN_DEFAULTS = Object.fromEntries(SKIN_TARGETS.map((t) => [t.id, "default"]));
const BY_ID = new Map(SKIN_TARGETS.map((t) => [t.id, t]));
const BY_MODEL = new Map(SKIN_TARGETS.flatMap((t) => t.models.map((m) => [m, t])));

export const skinTarget = (id) => BY_ID.get(id) || null;
// Броня — по приставке набора ("iron-" → iron-helmet, iron-boots...): только предметы брони (slot у ITEMS —
// ячейка брони), не «bone-crown» и прочие с той же приставкой
const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];
const isArmorItem = (info) => info && (ARMOR_SLOTS.includes(info.slot) || info.armor !== undefined);
const matches = (x, id, info) => (x.endsWith("-") ? id.startsWith(x) && isArmorItem(info) : id === x);
// предмет → что его перекрашивает
export const targetOfItem = (item, info) => SKIN_TARGETS.find((t) => t.items.some((x) => matches(x, item, info))) || null;

// Выбранный скин цели: overrides (примерка в меню) → настройки → DEFAULT
export function skinOf(settings, target, overrides = null) {
  const t = typeof target === "string" ? BY_ID.get(target) : target;
  if (!t) return DEFAULT;
  const id = overrides?.[t.id] ?? settings?.skins?.[t.id];
  return t.skins.find((s) => s.id === id) || DEFAULT;
}

// Подключить скины: модели (ModelLibrary.resolve) и значки предметов (ITEMS[id].drawIcon).
// Перекрашиваем модели от 1-го лица (они всегда свои) и модели сущностей с флагом skinned (свой герой, меню)
export function installSkins(models, items, settings) {
  models.resolve = (name, owner) => {
    const t = BY_MODEL.get(name);
    if (!t || (!owner?.skinned && !name.startsWith("fp-"))) return name;
    const s = skinOf(settings.data, t, owner?.skinOverride);
    return s.paint ? models.variant(name, s.id, s.paint) : name;
  };
  for (const [id, info] of Object.entries(items)) {
    const t = targetOfItem(id, info);
    if (!t || !info.drawIcon || info.skinIcon) continue;
    const base = info.drawIcon;
    info.skinIcon = true;
    info.skinBase = base; // без скина — для примерки в окне скинов
    info.drawIcon = (ui, x, y, s, ...rest) => {
      const brush = skinOf(settings.data, t).paint;
      if (!brush) return base(ui, x, y, s, ...rest);
      ui.paintRegion(x - s * 0.25, y - s * 0.25, s * 1.5, s * 1.5, () => base(ui, x, y, s, ...rest), brush);
    };
  }
}

// Значок цели со скином skin (окно скинов): первый предмет цели; у героев значка нет — null
export function drawSkinIcon(ui, items, target, skin, x, y, s) {
  const item = Object.keys(items).find((k) => target.items[0] && matches(target.items[0], k, items[k]));
  const info = item && items[item];
  if (!info?.drawIcon) return false;
  const draw = () => (info.skinBase || info.drawIcon)(ui, x, y, s);
  if (skin.paint) ui.paintRegion(x - s * 0.25, y - s * 0.25, s * 1.5, s * 1.5, draw, skin.paint);
  else draw();
  return true;
}
