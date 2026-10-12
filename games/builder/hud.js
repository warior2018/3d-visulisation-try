// ============================================================
//  Интерфейс во время игры (HUD) — собран из кусочков движка
//  (engine/ui/widgets.js, engine/ui/minimap.js).
// ============================================================

import { widgets, drawMinimap, drawPortrait, Input, critCooldown } from "../../engine/index.js";
import { PALETTE, PORTRAIT, PORTRAIT_PALETTE, KATANA_IAI } from "./config.js";
import { TROPHY, TROPHY_TALENTS, trophyPct } from "./talents.js";
import { itemName } from "./items.js";

const { TEXT, MUTED, drawCrosshair, drawBar, drawAbilityBar, drawVignette, drawBadges, drawStatuses } = widgets;

// Кружки трофеев урона: цвет и подпись по виду атак
const TROPHY_BADGES = {
  melee: { color: [200, 90, 60], label: "БЛИЖН." },
  ranged: { color: [240, 150, 60], label: "ДАЛЬН." },
  magic: { color: [120, 110, 230], label: "МАГИЯ" },
  item: { color: [90, 180, 120], label: "ПРЕДМ." },
  trap: { color: [150, 140, 120], label: "ЛОВУШ." },
};

export function drawHud(ui, g) {
  const { player, lookTarget: target } = g;
  const s = g.settings;
  const cx = Math.round(ui.width / 2);
  const cy = Math.round(ui.height / 2);
  if (g.scoped) drawScope(ui); //                                                       оптика винтовки
  else if (!(g.aimT > 0.5 && g.settings.general.cameraMode !== "third")) drawCrosshair(ui); // в прицеле от 1-го лица прицел — сама мушка


  // Попадание — «уголки» вокруг прицела на долю секунды
  if (g.hitMarker > 0) {
    // Хедшот — крупнее, красная и с надписью
    const color = g.headshot ? [255, 70, 60] : [255, 230, 120];
    const len = g.headshot ? 9 : 5;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let t = 0; t < len; t++) ui.rect(cx + dx * (8 + t) - 1, cy + dy * (8 + t) - 1, 3, 3, color);
    }
    if (g.headshot) ui.text("ХЕДШОТ!", cx, cy + 26, 2, color, "center");
  }

  // Камень: замах — полоска силы броска под прицелом
  const power = g.abilities.current?.chargePower;
  if (power != null) {
    ui.text("СИЛА БРОСКА", cx, cy + 22, 1, MUTED, "center");
    drawBar(ui, cx - 50, cy + 34, 100, 8, Math.round(power * 100), 100);
  }

  // Блок отбил удар — надпись у прицела
  if (g.blockFlash > 0) ui.text("БЛОК!", cx, cy + 26, 3, [140, 200, 255], "center", Math.round(255 * Math.min(1, g.blockFlash * 2)));

  // Получили урон — красная рамка по краям, гаснет за полсекунды
  drawVignette(ui, Math.max(0, 1 - player.hurtTime / 0.5));
  // Новый уровень — золотая рамка
  drawVignette(ui, g.levelFlash, [240, 196, 80]);

  // Слева внизу: портрет героя (кольцо вокруг — опыт, кружок — уровень), справа от него — здоровье
  const xp = g.experience;
  const R = 44;
  const px = 18;
  const py = ui.height - 18 - R * 2;
  drawPortrait(ui, { x: px, y: py, radius: R, sprite: PORTRAIT, palette: PORTRAIT_PALETTE, ring: xp.progress, level: xp.level });
  const bx = px + R * 2 + 10;
  const { hp, maxHp } = player.stats;
  ui.text(`ОПЫТ ${xp.xp}/${xp.toNext}`, bx, ui.height - 88, 2, [240, 196, 80]);
  ui.text(`HP ${hp}/${maxHp}`, bx, ui.height - 64, 2, TEXT);
  if (player.regen > 0) ui.text(`+${+player.regen.toFixed(1)}/С`, bx + 200, ui.height - 42, 2, [120, 220, 130]); // регенерация
  drawBar(ui, bx, ui.height - 44, 190, 20, hp, maxHp);
  // Накопленные навсегда бонусы (трофеи) — кружки с числами над опытом и HP
  const badges = [];
  if (g.talents.rank("trophies") > 0) badges.push({ value: `+${Math.floor(TROPHY.hp)}`, color: [230, 70, 70], label: "HP" });
  // Трофеи урона — свой кружок у каждого вида атак, чей талант выучен
  for (const [kind, id] of Object.entries(TROPHY_TALENTS)) {
    if (g.talents.rank(id) > 0) badges.push({ value: `+${trophyPct(kind)}%`, ...TROPHY_BADGES[kind] });
  }
  drawBadges(ui, badges, { x: bx, y: ui.height - 130, r: 26 });

  // Есть свободные очки талантов — напоминание над портретом
  if (g.talents.points > 0) {
    const ty = badges.length ? ui.height - 130 - 26 - 30 : py - 22; // есть кружки бонусов — над ними
    ui.text(`+${g.talents.points} ОЧК. ТАЛАНТОВ: ${Input.label(s.controls.bindings.talents)}`, px, ty, 2, [240, 196, 80]);
  }

  // На кого смотрим — имя и здоровье над прицелом
  const key = Input.label(s.controls.bindings.interact);
  if (player.mount) {
    // Верхом: здоровье скакуна (на него тоже нападают) и как слезть
    const m = player.mount;
    ui.text(`${m.name}  ${m.stats.hp}/${m.stats.maxHp}`, cx, ui.height - 150, 2, [240, 196, 80], "center");
    drawBar(ui, cx - 80, ui.height - 128, 160, 10, m.stats.hp, m.stats.maxHp);
    ui.text(`${key}: СЛЕЗТЬ`, cx, cy + 40, 2, MUTED, "center");
  } else if (target?.kind === "npc") {
    // НПС: имя синим; полоска здоровья — если его вообще можно ранить
    ui.text(`${target.name}  ${target.stats.hp}/${target.stats.maxHp}`, cx, cy - 70, 2, [110, 200, 255], "center");
    if (!target.invulnerable) drawBar(ui, cx - 80, cy - 50, 160, 10, target.stats.hp, target.stats.maxHp);
    // Зверя можно приручить костями, а приручённого — оседлать
    const tm = target.taming;
    let hint = null;
    if (tm?.refused) hint = "НЕ ДОВЕРЯЕТ: ТЫ ЕГО РАНИЛ";
    else if (tm && !tm.tamed) hint = `${key}: ДАТЬ КОСТЬ ИЗ ЯЧЕЙКИ ${player.hotbar.size} (${tm.fed}/${tm.need})`;
    else if (tm?.tamed) hint = tm.owner === player ? `${key}: СЕСТЬ` : "ЧУЖОЙ";
    else if (!target.canBeDamagedBy(player)) hint = "СВОЙ: ЕГО НЕ РАНИТЬ";
    if (hint) ui.text(hint, cx, cy - 34, 2, MUTED, "center");
    // Свой зверь: его трофеи (копит сам)
    if (tm?.tamed && tm.owner === player && (target.trophyHp || target.trophyPct)) {
      ui.text(`ТРОФЕИ ЗВЕРЯ: +${Math.floor(target.trophyHp || 0)} HP, +${target.trophyPct || 0}% УРОНА`, cx, cy - 14, 1, [240, 196, 80], "center");
    }
  } else if (target) {
    ui.text(`${target.name}  ${target.stats.hp}/${target.stats.maxHp}`, cx, cy - 70, 2, TEXT, "center");
    drawBar(ui, cx - 80, cy - 50, 160, 14, target.stats.hp, target.stats.maxHp);
  }
  // Предмет на земле под прицелом — подсказка «F: ПОДОБРАТЬ»
  const item = g.lookPickup;
  if (item && !player.mount) {
    const name = itemName(item.item) + (item.count > 1 ? ` X${item.count}` : "");
    ui.text(`${key}: ПОДОБРАТЬ ${name}`, cx, cy + 40, 2, TEXT, "center");
  }

  // Панель способностей внизу по центру; подписи клавиш — из настроек
  const bar = drawAbilityBar(ui, g.abilities, {
    ctx: g,
    keyLabel: (i) => Input.label(s.controls.bindings["ability" + (i + 1)]),
  });
  const current = g.abilities.current;
  if (current?.id === "build") {
    // Стройка: сколько камней (1 камень — 1 блок); нет камней — красным
    const n = g.stoneCount();
    ui.text(`${current.name}  КАМНИ: ${n}`, cx, bar.y - 22, 2, n > 0 ? TEXT : [255, 90, 80], "center");
  } else if (current) ui.text(current.name, cx, bar.y - 22, 2, TEXT, "center");

  // Баффы и дебаффы героя (движок: статусы) — значки над названием оружия
  const statuses = player.statuses.filter((st) => st.icon || st.positive);
  if (statuses.length) {
    const size = 40;
    const w = statuses.length * (size + 8) - 8;
    drawStatuses(ui, statuses, { x: cx - w / 2, y: bar.y - 92, size });
  }

  // Обойма: сколько патронов (справа внизу), идёт перезарядка — полоска
  const atk = current?.attack;
  if (atk?.magazine) {
    const rx = ui.width - 24;
    const ry = ui.height - 78;
    const empty = atk.ammo === 0;
    ui.text(`${atk.ammo}/${atk.magazine}`, rx, ry, 4, empty ? [255, 90, 80] : TEXT, "right");
    if (atk.reloading) {
      ui.text("ПЕРЕЗАРЯДКА", rx, ry + 36, 2, [240, 196, 80], "right");
      drawBar(ui, rx - 150, ry + 58, 150, 8, atk.reloadProgress * 100, 100);
    } else {
      ui.text(`${Input.label(s.controls.bindings.reload)}: ПЕРЕЗАРЯДКА`, rx, ry + 36, 2, MUTED, "right");
    }
  }

  // Оружие ближнего боя: ПКМ — блок (на перезарядке — серым)
  if (current?.blocks) {
    const ready = !(g.blockCooldown > 0);
    ui.text(`${Input.label(s.controls.bindings.secondary)}: БЛОК`, bar.x + bar.width + 14, bar.y - 2, 2, ready ? MUTED : [90, 92, 100]);
  }

  // Катана: копится ИАЙ (в ножнах 7 с) — подсказка, сколько осталось
  if (current?.iaiProgress !== undefined && !player.hasStatus("iai")) {
    const left = Math.ceil(KATANA_IAI.sheathTime * (1 - current.iaiProgress));
    ui.text(`ИАЙ ЧЕРЕЗ ${left}С`, bar.x + bar.width + 14, bar.y + 21, 2, MUTED);
  }

  // СМЕРТЕЛЬНЫЙ РАЗРЕЗ (талант): гарантированный крит X3 — готов (золотым) или через сколько секунд
  if (current?.blocks && g.talents.rank("death-cut") > 0) {
    const left = Math.ceil(critCooldown(player));
    ui.text(left > 0 ? `КРИТ X3 ЧЕРЕЗ ${left}С` : "КРИТ X3 ГОТОВ", bar.x + bar.width + 14, bar.y + 44, 2, left > 0 ? MUTED : [255, 210, 80]);
  }

  // Навыки оружия (Q/E...) — подсказка справа от панели: «Q/E: НАКЛОН»
  const skills = current ? Object.entries(current.skills) : [];
  if (skills.length) {
    const groups = new Map(); // одинаковые подписи — вместе: Q/E: НАКЛОН
    for (const [action, sk] of skills) {
      const label = sk.short || sk.name;
      groups.set(label, [...(groups.get(label) || []), Input.label(s.controls.bindings[action])]);
    }
    let y = bar.y + 21 - (groups.size - 1) * 11;
    for (const [label, keys] of groups) {
      ui.text(`${keys.join("/")}: ${label}`, bar.x + bar.width + 14, y, 2, MUTED);
      y += 22;
    }
  }

  // Стройка: панель цветов чуть выше способностей (открывается на G)
  if (current?.id === "build") {
    if (g.paletteOpen) drawPalette(ui, g.colorIndex, bar.y - 30);
    else ui.text(`${Input.label(s.controls.bindings.palette)}: ЦВЕТ`, bar.x + bar.width + 14, bar.y + 21, 2, MUTED); // справа от панели
  }

  // Нашествие — красная надпись вверху и сколько ещё держаться
  if (g.invasion?.active) {
    const t = Math.ceil(g.invasion.timeLeft);
    ui.text(`НАШЕСТВИЕ! ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, cx, 74, 3, [255, 80, 70], "center"); // ниже всплывающих надписей
  }

  // Вышла новая версия — напоминание вверху (само уведомление приходит один раз)
  const up = g.engine.updater?.available;
  if (up) ui.text(`ОБНОВЛЕНИЕ ${up.version}: ВЫЙДИ В ГЛАВНОЕ МЕНЮ`, cx, g.invasion?.active ? 110 : 70, 2, [240, 196, 80], "center");

  // Миникарта сверху слева или справа
  if (s.general.minimap) {
    const size = 168;
    const x = s.general.minimapSide === "left" ? 18 : ui.width - size - 18;
    drawMinimap(ui, { ...g.mapData(), size, x, y: 18 });
    ui.text(g.coordsText(), x + size / 2, 18 + size + 8, 2, TEXT, "center"); //                  где мы
    ui.text(`${Input.label(s.controls.bindings.map)}: КАРТА`, x + size / 2, 18 + size + 30, 2, MUTED, "center");
  }

  // Белые следы ударов (катана) — прямо по хитбоксу (движок: SlashEffects)
  g.slashes.draw(ui, g.rig.camera);

  // Цифры урона — поверх всего остального (движок: DamageNumbers)
  if (s.general.damageNumbers !== false) g.damageNumbers.draw(ui, g.rig.camera);
}

// Цвета 1–5 в ряд; выбранный приподнят и в белой рамке
function drawPalette(ui, colorIndex, bottomY) {
  const size = 40;
  const gap = 8;
  let x = ui.width / 2 - (PALETTE.length * size + (PALETTE.length - 1) * gap) / 2;
  const y = bottomY - size - 26;
  ui.rect(x - 10, y - 30, PALETTE.length * (size + gap) + 12, size + 44, [10, 14, 22], 190);
  ui.text("ЦВЕТ: 1-5", ui.width / 2, y - 22, 2, TEXT, "center");
  PALETTE.forEach((color, i) => {
    const active = i === colorIndex;
    const lift = active ? 4 : 0;
    ui.rect(x, y - lift, size, size, color, 245);
    ui.frame(x, y - lift, size, size, active ? [255, 255, 255] : [20, 24, 32], active ? 3 : 2);
    ui.text(String(i + 1), x + 4, y - lift + size - 17, 2, [255, 255, 255]);
    x += size + gap;
  });
}

// Оптика снайперки: толстая окружность и перекрестие; всё вне круга размывает рендерер (game-scene.js → blur)
// size — радиус круга (доля меньшей стороны экрана), ring — толщина ободка в пикселях,
// blurInset — на сколько внутрь ободка начинается размытие (чтобы шов прятался под ободком)
export const SCOPE = { size: 0.42, ring: 30, blurInset: 0.02 };

function drawScope(ui) {
  const cx = Math.round(ui.width / 2);
  const cy = Math.round(ui.height / 2);
  const r = Math.round(Math.min(ui.width, ui.height) * SCOPE.size);
  const ink = [10, 12, 16];
  ui.ring(cx, cy, r - SCOPE.ring, r, ink, 245); //   толстый ободок
  ui.rect(cx - r, cy, r * 2, 1, ink, 220); //        тонкое перекрестие
  ui.rect(cx, cy - r, 1, r * 2, ink, 220);
  ui.rect(cx - r, cy - 1, r * 0.6, 3, ink, 230); //  толстые концы нитей у края
  ui.rect(cx + r * 0.4, cy - 1, r * 0.6, 3, ink, 230);
  ui.rect(cx - 1, cy + r * 0.4, 3, r * 0.6, ink, 230);
  ui.rect(cx - 1, cy - r, 3, r * 0.6, ink, 230);
  for (const k of [0.1, 0.2, 0.3]) ui.rect(cx - 5, cy + Math.round(r * k), 11, 1, ink, 220); // метки дальности
}
