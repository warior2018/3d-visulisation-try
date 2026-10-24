// ============================================================
//  Интерфейс во время игры (HUD) — собран из кусочков движка
//  (engine/ui/widgets.js, engine/ui/minimap.js).
// ============================================================

import { widgets, drawMinimap, drawPortrait, Input, critCooldown } from "../../engine/index.js";
import { PALETTE, PORTRAIT, PORTRAIT_PALETTE, KATANA_IAI, CLASSES, TRAPS } from "./config.js";
import { TROPHY, TROPHY_TALENTS, trophyPct } from "./talents.js";
import { itemName } from "./items.js";

const { TEXT, MUTED, drawCrosshair, drawBar, drawAbilityBar, drawVignette, drawBadges, drawStatuses, drawCooldowns } = widgets;
const CD_SIZE = 32; // «часики» перезарядок под хотбаром

// Кружки трофеев урона: цвет и подпись по виду атак
const TROPHY_BADGES = {
  melee: { color: [200, 90, 60], label: "MELEE" },
  ranged: { color: [240, 150, 60], label: "RANGED" },
  magic: { color: [120, 110, 230], label: "MAGIC" },
  summon: { color: [90, 180, 120], label: "SUMMON" },
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
    if (g.headshot) ui.text("HEADSHOT!", cx, cy + 26, 2, color, "center");
  }

  // Камень: замах — полоска силы броска под прицелом
  const power = g.abilities.current?.chargePower;
  if (power != null) {
    ui.text("THROW POWER", cx, cy + 22, 1, MUTED, "center");
    drawBar(ui, cx - 50, cy + 34, 100, 8, Math.round(power * 100), 100);
  }

  // Блок отбил удар — надпись у прицела
  if (g.blockFlash > 0) ui.text("BLOCKED!", cx, cy + 26, 3, [140, 200, 255], "center", Math.round(255 * Math.min(1, g.blockFlash * 2)));

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
  ui.text(`XP ${xp.xp}/${xp.toNext}`, bx, ui.height - 88, 2, [240, 196, 80]);
  // Класс героя (до выбора — подсказка, когда его выберут)
  const cls = CLASSES[g.playerClass];
  ui.text(cls ? cls.name : "CLASS - AT LEVEL 2", bx, ui.height - 110, 2, cls ? [200, 210, 230] : [130, 136, 150]);
  ui.text(`HP ${hp}/${maxHp}`, bx, ui.height - 64, 2, TEXT);
  if (player.regen > 0) ui.text(`+${+player.regen.toFixed(1)}/S`, bx + 200, ui.height - 42, 2, [120, 220, 130]); // регенерация
  drawBar(ui, bx, ui.height - 44, 190, 20, hp, maxHp);
  // Мана — у мага (тонкая синяя полоска под здоровьем)
  if (g.playerClass === "magic" && player.stats.mana !== undefined) {
    drawBar(ui, bx, ui.height - 22, 190, 10, player.stats.mana, player.stats.maxMana, [80, 150, 255]);
    ui.text(`MP ${Math.floor(player.stats.mana)}`, bx + 200, ui.height - 24, 2, [120, 180, 255]);
  }
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
    ui.text(`+${g.talents.points} TALENT PTS: ${Input.label(s.controls.bindings.talents)}`, px, ty, 2, [240, 196, 80]);
  }

  // На кого смотрим — имя и здоровье над прицелом
  const key = Input.label(s.controls.bindings.interact);
  if (player.mount) {
    // Верхом: здоровье скакуна (на него тоже нападают) и как слезть
    const m = player.mount;
    ui.text(`${m.name}  ${m.stats.hp}/${m.stats.maxHp}`, cx, ui.height - 150, 2, [240, 196, 80], "center");
    drawBar(ui, cx - 80, ui.height - 128, 160, 10, m.stats.hp, m.stats.maxHp);
    ui.text(`${key}: DISMOUNT`, cx, cy + 40, 2, MUTED, "center");
  } else if (target?.kind === "npc") {
    // НПС: имя синим; полоска здоровья — если его вообще можно ранить
    ui.text(`${target.name}  ${target.stats.hp}/${target.stats.maxHp}`, cx, cy - 70, 2, [110, 200, 255], "center");
    if (!target.invulnerable) drawBar(ui, cx - 80, cy - 50, 160, 10, target.stats.hp, target.stats.maxHp);
    // Зверя можно приручить костями, а приручённого — оседлать
    const tm = target.taming;
    let hint = null;
    if (tm?.refused) hint = "DOESN'T TRUST YOU: YOU HURT IT";
    else if (tm && !tm.tamed) hint = g.playerClass === "beast" ? `${key}: FEED A ${itemName(tm.food)} (${tm.fed}/${g.mushroomsFor(target)})` : "WILD. ONLY A SUMMONER TAMES";
    else if (target.type === "turret") hint = target.growLeft > 0 ? `GROWING: ${Math.ceil(target.growLeft)} S` : `${key}: MUSHROOMS (${target.inventory.count("mushroom")})`;
    else if (tm?.tamed) hint = tm.owner === player ? `${key}: RIDE` : "NOT YOURS";
    else if (!target.canBeDamagedBy(player)) hint = "FRIENDLY: CAN'T BE HURT";
    if (hint) ui.text(hint, cx, cy - 34, 2, MUTED, "center");
  } else if (target) {
    ui.text(`${target.name}  ${target.stats.hp}/${target.stats.maxHp}`, cx, cy - 70, 2, TEXT, "center");
    drawBar(ui, cx - 80, cy - 50, 160, 14, target.stats.hp, target.stats.maxHp);
  }
  // Предмет на земле под прицелом — подсказка «F: ПОДОБРАТЬ»
  const item = g.lookPickup;
  if (item && !player.mount) {
    const name = itemName(item.item) + (item.count > 1 ? ` X${item.count}` : "");
    ui.text(`${key}: PICK UP ${name}`, cx, cy + 40, 2, TEXT, "center");
  }

  // Панель способностей внизу по центру (3 ячейки: Q — оружие, 2 — средняя, E — оружие); подписи — из настроек.
  // Над ячейкой с ловушками — сколько их стоит (из максимума)
  const slotKeys = ["weaponLeft", "ability2", "weaponRight"];
  const trapCount = (i) => {
    const it = player.hotbar.slots[i]?.item;
    return TRAPS[it]?.max ? `${g.traps.count(player, it)}/${TRAPS[it].max}` : null;
  };
  const bar = drawAbilityBar(ui, g.abilities, {
    ctx: g,
    keyLabel: (i) => Input.label(s.controls.bindings[slotKeys[i]]),
    above: trapCount,
    bottom: 18 + CD_SIZE + 10, // под панелью — ряд перезарядок
  });
  // ВСЕ перезарядки — «часиками» под хотбаром (по часовой заполняется готовая часть, в середине — секунды)
  const cds = g.cooldownList();
  if (cds.length) {
    const w = cds.length * (CD_SIZE + 6) - 6;
    drawCooldowns(ui, cds, { x: Math.round(cx - w / 2), y: ui.height - 14 - CD_SIZE, size: CD_SIZE });
  }
  const nameY = bar.y - 22 - ([0, 1, 2].some(trapCount) ? 20 : 0);
  // ПРИЗЫВАТЕЛЬ: Q / E — навыки (метка для кабанов, саженец турели) — подсказка над панелью
  if (g.playerClass === "beast") {
    const b = s.controls.bindings;
    ui.text(`${Input.label(b.weaponLeft)}: MARK FOR BOARS   ${Input.label(b.weaponRight)}: PLANT TURRET (${g.itemCount("turret-sapling")})`, cx, nameY - 26, 2, MUTED, "center");
  }
  const current = g.abilities.current;
  if (current?.id === "build") {
    // Стройка: сколько блоков в сумке; нет — красным
    const n = g.blockCount();
    ui.text(`${current.name}  BLOCKS: ${n}`, cx, nameY, 2, n > 0 ? TEXT : [255, 90, 80], "center");
  } else if (current) ui.text(current.name, cx, nameY, 2, TEXT, "center");

  // Баффы и дебаффы — значки над хотбаром (над названием оружия): статусы, скорость, крит, разбег, трофеи босcов.
  // Зелёная рамка — бафф, красная — дебафф; под значком — сколько осталось / сила
  const buffs = g.buffList();
  if (buffs.length) {
    const size = 40;
    const w = buffs.length * (size + 8) - 8;
    drawStatuses(ui, buffs, { x: cx - w / 2, y: nameY - (g.playerClass === "beast" ? 92 : 70), size });
  }

  // Обойма: сколько патронов (справа внизу), идёт перезарядка — полоска
  const atk = current?.attack;
  if (atk?.magazine) {
    const rx = ui.width - 24;
    const ry = ui.height - 78;
    const empty = atk.ammo === 0;
    const reserve = atk.reserveCount;
    ui.text(`${atk.ammo}/${atk.magazine}`, rx, ry, 4, empty ? [255, 90, 80] : TEXT, "right");
    if (Number.isFinite(reserve)) ui.text(`CLIPS ${reserve}`, rx, ry - 22, 2, reserve > 0 ? MUTED : [255, 90, 80], "right"); // обоймы этого ствола в сумке
    if (atk.reloading) {
      ui.text("RELOADING", rx, ry + 36, 2, [240, 196, 80], "right"); // сколько осталось — «часики» под хотбаром
    } else if (empty && reserve <= 0) {
      ui.text("NO CLIPS", rx, ry + 36, 2, [255, 90, 80], "right");
    } else {
      ui.text(`${Input.label(s.controls.bindings.reload)}: RELOAD`, rx, ry + 36, 2, MUTED, "right");
    }
  }

  // Оружие ближнего боя: ПКМ — блок (на перезарядке — серым)
  if (current?.blocks) {
    const ready = !(g.blockCooldown > 0);
    ui.text(`${Input.label(s.controls.bindings.secondary)}: BLOCK`, bar.x + bar.width + 14, bar.y - 2, 2, ready ? MUTED : [90, 92, 100]);
  }

  // ИАЙ катаны и CRIT бойца — теперь «часиками» под хотбаром (готовы — значком-баффом над ним)

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
    else ui.text(`${Input.label(s.controls.bindings.palette)}: COLOR`, bar.x + bar.width + 14, bar.y + 21, 2, MUTED); // справа от панели
  }

  // Нашествие — красная надпись вверху и сколько ещё держаться
  if (g.invasion?.active) {
    const t = Math.ceil(g.invasion.timeLeft);
    ui.text(`${g.invasionKind?.name || "INVASION"}! ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, cx, 74, 3, [255, 80, 70], "center"); // ниже всплывающих надписей
  }

  // Босс злится на героя — полоса его здоровья вверху по центру (имя и HP)
  const boss = g.entities.list.find((e) => e.boss && e.alive && e.aggro === g.player);
  if (boss) {
    const w = Math.min(520, ui.width - 80), x = Math.round(cx - w / 2), y = g.invasion?.active ? 132 : 100;
    const k = Math.max(0, boss.stats.hp / boss.stats.maxHp);
    ui.text(boss.name, cx, y - 22, 2, [230, 190, 255], "center"); //                     имя (переводится словарём)
    if (boss.enraged) ui.text("ENRAGED", x, y - 22, 2, [255, 90, 70], "left"); //          ярость (ниже половины HP)
    ui.text(`${Math.ceil(boss.stats.hp)} / ${boss.stats.maxHp}`, x + w - 6, y + 3, 2, [255, 255, 255], "right");
    ui.rect(x - 2, y - 2, w + 4, 24, [20, 14, 26], 220);
    ui.rect(x, y, Math.round(w * k), 20, [170, 70, 230]);
  }

  // Вышла новая версия — напоминание вверху (само уведомление приходит один раз)
  const up = g.engine.updater?.available;
  if (up) ui.text(`UPDATE ${up.version}: GO TO THE MAIN MENU`, cx, g.invasion?.active ? 110 : 70, 2, [240, 196, 80], "center");

  // Миникарта сверху слева или справа
  if (s.general.minimap) {
    const size = 168;
    const x = s.general.minimapSide === "left" ? 18 : ui.width - size - 18;
    drawMinimap(ui, { ...g.mapData(), size, x, y: 18 });
    // Координаты — только на большой карте (M), под миникартой — лишь подсказка
    ui.text(`${Input.label(s.controls.bindings.map)}: MAP`, x + size / 2, 18 + size + 8, 2, MUTED, "center");
  }

  // Белые следы ударов (катана) — прямо по хитбоксу (движок: SlashEffects)
  g.slashes.draw(ui, g.rig.camera);
  g.beams.draw(ui, g.rig.camera, { visible: (p) => g.seenFromCamera(p) }); // лучи, круги-прицелы, искры (движок: BeamEffects) — не сквозь блоки

  // Босс мёртв — над местом, где он появится, таймер (видно, если рядом и не за стеной)
  g.bossSites?.().forEach((site, i) => {
    const t = Math.ceil(g.lairTimers?.[i] || 0);
    if (t <= 0 || g.entities.list.some((e) => e.boss && e.lair === i && e.alive)) return;
    const p = { x: site.x + 0.5, y: site.y + 2.2, z: site.z + 0.5 };
    if (Math.hypot(p.x - player.position.x, p.z - player.position.z) > 45 || !g.seenFromCamera(p)) return;
    const sp = g.rig.camera.toScreen(p, ui.width, ui.height);
    if (!sp) return;
    ui.text("BOSS RETURNS IN", sp.x, sp.y - 22, 2, [200, 160, 255], "center");
    ui.text(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, sp.x, sp.y, 3, [230, 200, 255], "center");
  });

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
  ui.text("COLOR: 1-5", ui.width / 2, y - 22, 2, TEXT, "center");
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
