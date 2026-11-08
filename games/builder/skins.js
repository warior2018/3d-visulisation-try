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

// оружие: модели в руке (w-) и от 1-го лица (fp-); skin — один скин или список
const weapon = (id, name, skin, models = [`w-${id}`, `fp-${id}`]) => ({ id, category: "weapons", name, models, items: [id], skins: [DEFAULT, ...[skin].flat()] });
const utility = (id, name, skin, models) => ({ id, category: "utility", name, models, items: [id], skins: [DEFAULT, skin] });

export const SKIN_TARGETS = [
  weapon("machete", "MACHETE", [
    { id: "jungle", fx: [200, 120, 60], name: "JUNGLE RUST", text: "A BLADE THAT HAS SEEN TOO MANY RAINS", paint: P.metal([0.22, 0.1, 0.04], [0.8, 0.48, 0.26]) },
    { id: "bloodmoon", fx: [230, 30, 30], name: "BLOOD MOON", text: "RED STEEL FOR A RED NIGHT", paint: P.chain(P.metal([0.2, 0.02, 0.02], [1, 0.35, 0.3]), P.dye([0.75, 0.08, 0.08])) },
  ]),
  weapon("war-hammer", "WAR HAMMER", [
    { id: "molten", fx: [255, 140, 30], name: "MOLTEN", text: "STILL GLOWING FROM THE FURNACE", paint: P.metal([0.35, 0.03, 0.01], [1, 0.72, 0.2]) },
    { id: "glacier", fx: [140, 210, 255], name: "GLACIER", text: "CUT FROM ETERNAL ICE", paint: P.gradientMap([[0.05, 0.15, 0.3], [0.6, 0.85, 1]]) },
  ]),
  weapon("katana", "KATANA", [
    { id: "sakura", fx: [255, 130, 190], name: "SAKURA", text: "PINK STEEL, PETAL WRAP", paint: P.chain(P.metal([0.45, 0.3, 0.38], [1, 0.86, 0.93]), P.dye([0.92, 0.42, 0.62])) },
    { id: "shadow", fx: [220, 20, 30], name: "SHADOW", text: "BLACK BLADE, RED EDGE", paint: P.gradientMap([[0.01, 0.01, 0.02], [0.25, 0.25, 0.3], [0.9, 0.15, 0.15]]) },
  ], ["w-katana", "w-katana-sheathed", "w-katana-saya", "fp-katana"]),
  weapon("spear", "SPEAR", [
    { id: "bone", fx: [235, 225, 200], name: "OSSUARY", text: "CARVED FROM ONE GIANT BONE", paint: P.gradientMap([[0.22, 0.19, 0.15], [0.95, 0.92, 0.82]]) },
    { id: "bronze", fx: [230, 160, 80], name: "BRONZE AGE", text: "AN HEIRLOOM OF OLD WARS", paint: P.metal([0.25, 0.12, 0.04], [0.95, 0.65, 0.35]) },
  ]),
  weapon("pistol", "PISTOL", [
    { id: "gilded", fx: [255, 210, 80], name: "GILDED", text: "SOLID GOLD. PROBABLY", paint: gold },
    { id: "neon", fx: [60, 240, 255], name: "NEON", text: "GLOWS IN THE DARK. SORT OF", paint: P.gradientMap([[0.05, 0.02, 0.1], [0.1, 0.9, 0.95], [1, 0.3, 0.9]]) },
  ]),
  weapon("auto", "ASSAULT RIFLE", [
    { id: "arctic", fx: [220, 240, 255], name: "ARCTIC", text: "WHITE CAMO FOR THE NORTH", paint: P.gradientMap([[0.18, 0.26, 0.36], [0.93, 0.97, 1]]) },
    { id: "urban", fx: [170, 170, 180], name: "URBAN", text: "CONCRETE GREY", paint: P.gradientMap([[0.08, 0.08, 0.09], [0.55, 0.56, 0.6]]) },
  ]),
  weapon("shotgun", "SHOTGUN", [
    { id: "swamp", fx: [120, 170, 50], name: "SWAMP", text: "MOSS ON THE STOCK, MUD ON THE BARREL", paint: P.chain(P.metal([0.06, 0.08, 0.04], [0.45, 0.5, 0.34]), P.dye([0.3, 0.42, 0.14])) },
    { id: "chrome", fx: [235, 240, 255], name: "CHROME", text: "POLISHED TO A MIRROR", paint: P.metal([0.15, 0.16, 0.18], [1, 1, 1]) },
  ]),
  weapon("rifle", "SNIPER RIFLE", [
    { id: "void", fx: [170, 90, 255], name: "VOID", text: "BLACK AS THE ABYSS UNDER THE ISLANDS", paint: P.gradientMap([[0.02, 0.01, 0.05], [0.32, 0.14, 0.58], [0.82, 0.62, 1]]) },
    { id: "jade", fx: [60, 220, 140], name: "JADE", text: "A STONE THAT NEVER MISSES", paint: P.chain(P.metal([0.02, 0.12, 0.08], [0.5, 1, 0.75]), P.dye([0.1, 0.65, 0.45])) },
  ]),
  weapon("crossbow", "CROSSBOW", [
    { id: "elven", fx: [120, 220, 110], name: "ELVEN", text: "GREEN WOOD, GOLDEN FITTINGS", paint: P.chain(gold, P.dye([0.22, 0.55, 0.3])) },
    { id: "nighthunter", fx: [110, 140, 220], name: "NIGHT HUNTER", text: "DARK AS A MOONLESS FOREST", paint: P.gradientMap([[0.02, 0.03, 0.05], [0.2, 0.25, 0.35], [0.55, 0.7, 0.9]]) },
  ]),
  weapon("grenades", "GRENADES", [
    { id: "toxic", fx: [130, 255, 60], name: "TOXIC", text: "DO NOT LICK", paint: P.chain(P.metal([0.05, 0.15, 0.02], [0.6, 1, 0.35]), P.dye([0.45, 0.95, 0.2])) },
    { id: "candy", fx: [255, 120, 200], name: "CANDY", text: "SWEET ON THE OUTSIDE", paint: P.dye([1, 0.45, 0.75]) },
  ], ["w-grenade", "fp-grenade", "item-grenade"]),
  weapon("launcher", "GRENADE LAUNCHER", [
    { id: "sandstorm", fx: [240, 200, 120], name: "SANDSTORM", text: "DESERT PAINT, CHIPPED", paint: P.gradientMap([[0.28, 0.2, 0.1], [0.96, 0.86, 0.6]]) },
    { id: "lava", fx: [255, 90, 20], name: "LAVA", text: "HOT TO THE TOUCH", paint: P.gradientMap([[0.05, 0.01, 0], [0.8, 0.15, 0.02], [1, 0.85, 0.3]]) },
  ]),
  weapon("dynamite", "DYNAMITE", [
    { id: "frostbite", fx: [110, 200, 255], name: "FROSTBITE", text: "COLD ON THE OUTSIDE", paint: P.dye([0.35, 0.72, 1]) },
    { id: "golden", fx: [255, 210, 80], name: "GOLDEN BOOM", text: "GO OUT WITH STYLE", paint: gold },
  ], ["w-dynamite", "fp-dynamite", "item-dynamite-lit"]),
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
// Цвет эффектов выбранного скина оружия (трассер, взрыв, разрез; fx у скина) или null — обычные цвета
export const skinFx = (settings, item) => {
  const t = BY_ID.get(item);
  return t ? skinOf(settings, t).fx || null : null;
};
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
// Рука от 1-го лица — кость (tools/make-viewmodels.js: BONE_COLOR, JOINT): эти цвета кисть пропускает
const ARM_COLORS = [[0.86, 0.84, 0.76], [0.74, 0.71, 0.63]];
const keepArm = (brush) => (r, g, b) => (ARM_COLORS.some((c) => Math.abs(c[0] - r) < 0.02 && Math.abs(c[1] - g) < 0.02 && Math.abs(c[2] - b) < 0.02) ? null : brush(r, g, b));

// Перекрашиваем модели от 1-го лица (они всегда свои) и модели сущностей с флагом skinned (свой герой, меню)
export function installSkins(models, items, settings) {
  models.resolve = (name, owner) => {
    // owner.skinTarget — чей скин (снаряд гранатомёта и граната — одна модель, а скины разные)
    const t = owner?.skinTarget ? BY_ID.get(owner.skinTarget) : BY_MODEL.get(name);
    if (!t || (!owner?.skinned && !name.startsWith("fp-"))) return name;
    const s = skinOf(settings.data, t, owner?.skinOverride);
    // от 1-го лица в модели и рука героя (кости скелета) — её скин оружия не трогает
    return s.paint ? models.variant(name, s.id, name.startsWith("fp-") ? keepArm(s.paint) : s.paint) : name;
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
