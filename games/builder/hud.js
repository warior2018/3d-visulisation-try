// ============================================================
//  Интерфейс во время игры (HUD) — из ЧАСТЕЙ (движок: engine/ui/hud-parts.js).
//  У каждой части: watch(g) — данные, которые она показывает (изменились — HUD перерисуется),
//  и draw(ui, g, d, L) — нарисовать из этих данных. L — общая раскладка кадра: панель хотбара
//  записывает туда, где стоит (L.bar, L.nameY), части после неё — располагаются от неё.
//  Порядок в списке = порядок рисования (ниже — поверх).
//  Новая надпись — новая часть (или поле в watch существующей): тогда она точно будет обновляться.
//  Кусочки рисования — из движка (engine/ui/widgets.js, engine/ui/minimap.js).
// ============================================================

import { widgets, drawMinimap, drawPortrait, Input, HudParts } from "../../engine/index.js";
import { PALETTE, PORTRAIT, PORTRAIT_PALETTE, CLASSES, TRAPS } from "./config.js";
import { TROPHY, TROPHY_TALENTS, trophyPct } from "./talents.js";
import { itemName } from "./items.js";

const { TEXT, MUTED, drawCrosshair, drawBar, drawVignette, drawBadges, drawStatuses, drawCooldowns, drawSlot } = widgets;
const CD_SIZE = 32; //      «часики» перезарядок под хотбаром
const MINIMAP_FPS = 10; //  сколько раз в секунду обновлять миникарту
const RED = [255, 90, 80];
const GOLD = [240, 196, 80];

// Кружки трофеев урона: цвет и подпись по виду атак
const TROPHY_BADGES = {
  melee: { color: [200, 90, 60], label: "MELEE" },
  ranged: { color: [240, 150, 60], label: "RANGED" },
  blast: { color: [150, 180, 80], label: "BLAST" },
};

const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const key = (g, action) => Input.label(g.settings.controls.bindings[action]);
const center = (ui) => ({ cx: Math.round(ui.width / 2), cy: Math.round(ui.height / 2) });
// Что-то движется каждый кадр (анимация, эффекты) — данные «время», чтобы HUD перерисовывался
const animating = (on) => (on ? performance.now() : 0);

// Над ячейкой хотбара с ловушками — сколько их стоит из максимума
const trapCount = (g, i) => {
  const it = g.player.hotbar.slots[i]?.item;
  return TRAPS[it]?.max ? `${g.traps.count(g.player, it)}/${TRAPS[it].max}` : null;
};

export const HUD_PARTS = [
  // ---------- У прицела ----------
  {
    // оптика винтовки — свой круг; в прицеле от 1-го лица прицел — сама мушка; оружие ближнего боя (мачете,
    // молот, катана, копьё) бьёт сектором перед собой — прицел ему не нужен (у кулака остаётся: им подбирают)
    id: "crosshair",
    watch: (g) => {
      const a = g.abilities.current;
      const melee = !!a && a !== g.hand && a.attack?.kind === "melee";
      return [g.scoped, g.aimT > 0.5 && g.settings.general.cameraMode !== "third", melee];
    },
    draw: (ui, g, [scoped, aimed, melee]) => (scoped ? drawScope(ui) : !aimed && !melee && drawCrosshair(ui)),
  },
  {
    // Применение предмета (аптечка): круг вокруг прицела заполняется «часиками», как в PEAK
    id: "use",
    watch: (g) => {
      const a = g.abilities.current;
      return a?.using ? Math.round(a.progress * 60) / 60 : null;
    },
    draw: (ui, g, k) => {
      if (k === null) return;
      const { cx, cy } = center(ui);
      ui.ring(cx, cy, 15, 21, [20, 24, 30], 150);
      ui.ring(cx, cy, 15, 21, [120, 230, 140], 235, k);
    },
  },
  {
    id: "hit", // попадание — «уголки» вокруг прицела; хедшот — крупнее, красные и с надписью
    watch: (g) => (g.hitMarker > 0 ? { head: !!g.headshot } : null),
    draw: (ui, g, d) => {
      if (!d) return;
      const { cx, cy } = center(ui);
      const color = d.head ? [255, 70, 60] : [255, 230, 120];
      const len = d.head ? 9 : 5;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        for (let t = 0; t < len; t++) ui.rect(cx + dx * (8 + t) - 1, cy + dy * (8 + t) - 1, 3, 3, color);
      }
      if (d.head) ui.text("HEADSHOT!", cx, cy + 26, 2, color, "center");
    },
  },
  {
    id: "throw", // замах броском — полоска силы под прицелом
    watch: (g) => (g.abilities.current?.chargePower != null ? Math.round(g.abilities.current.chargePower * 100) : null),
    draw: (ui, g, power) => {
      if (power == null) return;
      const { cx, cy } = center(ui);
      ui.text("THROW POWER", cx, cy + 22, 1, MUTED, "center");
      drawBar(ui, cx - 50, cy + 34, 100, 8, power, 100);
    },
  },
  {
    id: "blocked", // блок отбил удар — надпись у прицела, гаснет
    watch: (g) => Math.ceil(Math.max(0, g.blockFlash) * 20),
    draw: (ui, g, k) => {
      if (k <= 0) return;
      const { cx, cy } = center(ui);
      ui.text("BLOCKED!", cx, cy + 26, 3, [140, 200, 255], "center", Math.round(255 * Math.min(1, k / 10)));
    },
  },
  {
    id: "flash", // получили урон — красная рамка по краям; новый уровень — золотая
    watch: (g) => [Math.ceil(Math.max(0, 1 - g.player.hurtTime / 0.5) * 20), Math.ceil(g.levelFlash * 20)],
    draw: (ui, g, [hurt, level]) => {
      drawVignette(ui, hurt / 20);
      drawVignette(ui, level / 20, GOLD);
    },
  },

  // ---------- Слева внизу: герой ----------
  {
    id: "hero", // портрет (кольцо — опыт, кружок — уровень), класс, опыт, здоровье, регенерация, мана
    watch: (g) => {
      const p = g.player, xp = g.experience;
      return {
        level: xp.level, xp: xp.xp, next: xp.toNext, ring: Math.round(xp.progress * 100),
        hp: p.stats.hp, max: p.stats.maxHp, regen: +p.regen.toFixed(1), cls: g.playerClass,
      };
    },
    draw: (ui, g, d, L) => {
      const R = 44, px = 18, py = ui.height - 18 - R * 2, bx = px + R * 2 + 10;
      Object.assign(L, { heroX: px, heroY: py, statsX: bx });
      drawPortrait(ui, { x: px, y: py, radius: R, sprite: PORTRAIT, palette: PORTRAIT_PALETTE, ring: d.ring / 100, level: d.level });
      ui.text(`XP ${d.xp}/${d.next}`, bx, ui.height - 88, 2, GOLD);
      const cls = CLASSES[d.cls]; // класс (до выбора — подсказка, когда выберут)
      ui.text(cls ? cls.name : "CLASS - AT LEVEL 2", bx, ui.height - 110, 2, cls ? [200, 210, 230] : [130, 136, 150]);
      ui.text(`HP ${d.hp}/${d.max}`, bx, ui.height - 64, 2, TEXT);
      if (d.regen > 0) ui.text(`+${d.regen}/S`, bx + 200, ui.height - 42, 2, [120, 220, 130]);
      drawBar(ui, bx, ui.height - 44, 190, 20, d.hp, d.max);
    },
  },
  {
    id: "trophies", // навсегда набранные бонусы (трофеи) — кружки над опытом; свободные очки талантов — над ними
    watch: (g) => {
      const badges = [];
      if (g.talents.rank("trophies") > 0) badges.push({ value: `+${Math.floor(TROPHY.hp)}`, color: [230, 70, 70], label: "HP" });
      for (const [kind, id] of Object.entries(TROPHY_TALENTS)) {
        if (g.talents.rank(id) > 0) badges.push({ value: `+${trophyPct(kind)}%`, ...TROPHY_BADGES[kind] });
      }
      // Вечные мелкие баффы (шкуры, короны, броня, скорость от талантов) — значками рядом с трофеями
      const perm = g.permanentBuffs().map((b) => ({ icon: b.icon, name: b.name, positive: true, color: b.color, label: b.label }));
      return { badges, perm, points: g.talents.points };
    },
    draw: (ui, g, d, L) => {
      const bw = drawBadges(ui, d.badges, { x: L.statsX, y: ui.height - 130, r: 26 });
      if (d.perm.length) drawStatuses(ui, d.perm, { x: L.statsX + bw + (bw ? 14 : 0), y: ui.height - 130 - 17, size: 34, gap: 6 });
      if (d.points > 0) {
        const ty = d.badges.length ? ui.height - 130 - 26 - 30 : L.heroY - 22;
        ui.text(`+${d.points} TALENT PTS: ${key(g, "talents")}`, L.heroX, ty, 2, GOLD);
      }
    },
  },

  // ---------- На кого / на что смотрим ----------
  {
    id: "target", // НПС и звери — имя синим и подсказка; враг — имя и полоска
    watch: (g) => {
      const p = g.player, t = g.lookTarget;
      if (!t) return null;
      if (t.boss && t.aggro === p) return null; // у босса уже есть своя полоса вверху (boss-bar) — вторую не рисуем
      const d = { name: t.name, hp: t.stats.hp, max: t.stats.maxHp, npc: t.kind === "npc" };
      if (!d.npc) return d;
      d.hurtable = !t.invulnerable;
      if (!t.canBeDamagedBy(p)) d.hint = "FRIENDLY: CAN'T BE HURT";
      return d;
    },
    draw: (ui, g, d) => {
      if (!d) return;
      const { cx, cy } = center(ui);
      if (d.npc) {
        ui.text(`${d.name}  ${d.hp}/${d.max}`, cx, cy - 70, 2, [110, 200, 255], "center");
        if (d.hurtable) drawBar(ui, cx - 80, cy - 50, 160, 10, d.hp, d.max);
        if (d.hint) ui.text(d.hint, cx, cy - 34, 2, MUTED, "center");
      } else {
        ui.text(`${d.name}  ${d.hp}/${d.max}`, cx, cy - 70, 2, TEXT, "center");
        drawBar(ui, cx - 80, cy - 50, 160, 14, d.hp, d.max);
      }
    },
  },
  {
    id: "pickup", // предмет на земле под прицелом — «F: ПОДОБРАТЬ»
    watch: (g) => (g.lookPickup ? itemName(g.lookPickup.item) + (g.lookPickup.count > 1 ? ` X${g.lookPickup.count}` : "") : null),
    draw: (ui, g, name) => {
      if (!name) return;
      const { cx, cy } = center(ui);
      ui.text(`${key(g, "interact")}: PICK UP ${name}`, cx, cy + 40, 2, TEXT, "center");
    },
  },

  // ---------- Внизу по центру: хотбар и всё вокруг него ----------
  {
    // Панель внизу: оружие — вплотную к здоровью героя слева (его скилл — на нём: клавиша в углу, перезарядка
    // часиками поверх значка); ульта — одна, крупная, по центру; ячейки других скиллов (пока пустые) и два
    // предмета — до упора справа. Ячейки наклонные (движок: widgets.drawSlot, skew). Над ловушками — сколько стоит
    id: "hotbar",
    watch: (g) => ({
      index: g.abilities.index,
      slots: g.player.hotbar.slots.map((s) => (s ? `${s.item}:${s.count}` : "")),
      traps: [0, 1, 2].map((i) => trapCount(g, i)),
      skills: g.skillSlots().map((k) => (k ? `${k.name}:${k.cooldown ? Math.ceil(k.cooldown.left * 10) : 0}` : "")),
      weapon: g.hudWeaponKey(), //               то, что ячейка рисует на значке (патроны, заряд)
      blocks: g.building ? g.blockCount() : null,
      keys: ["skill1", "skill2", "item1", "item2"].map((a) => key(g, a)),
    }),
    draw: (ui, g, d, L) => {
      const S = 56, SW = 64, gap = 10, skew = 10, R = 46; // ячейка, ячейка оружия, промежуток, наклон, круг ульты
      const base = ui.height - 18; //                          низ панели — по низу портрета героя
      const bar = g.abilities;
      const clock = (c) => (c && c.left > 0 ? { left: c.left, progress: 1 - c.left / c.total } : null);
      const slot = (i, x, size, k, cooldown = null) => {
        const a = bar.slots[i];
        drawSlot(ui, {
          x, y: base - size, size, skew, key: k, top: d.traps[i], active: i === bar.index, empty: !a || a.empty, cooldown,
          drawIcon: a && !a.empty ? (u, sx, sy, sz) => a.drawIcon(u, sx, sy, sz, g) : null,
        });
      };
      const skills = g.skillSlots();
      // Слева, вплотную к здоровью героя — оружие (своей клавиши нет). Его скилл — на нём же: клавиша скилла
      // в углу, перезарядка часиками поверх значка
      const wx = (L.statsX ?? 116) + 190 + 90; // полоса здоровья 190 + место под «+реген/С»
      slot(0, wx, SW, skills[0] ? d.keys[0] : "", clock(skills[0]?.cooldown));
      L.weapon = { x: wx, y: base - SW, width: SW + skew, height: SW };
      // Справа, до упора — ячейки других скиллов (не оружия; пока пустые — добавим позже), потом предметы
      const right = ui.width - 24;
      const total = 4 * S + 3 * gap + 8 + skew; // 4 ячейки, промежутки, зазор скиллы | предметы, наклон
      let x = right - total;
      const gx = x;
      for (let j = 0; j < 2; j++) {
        drawSlot(ui, { x, y: base - S, size: S, skew, empty: true });
        x += S + gap;
      }
      x += 8; // предметы чуть отдельно от скиллов
      slot(1, x, S, d.keys[2]);
      x += S + gap;
      slot(2, x, S, d.keys[3]);
      L.bar = { x: gx, y: base - S, width: total, height: S }; // правая группа (над ней — палитра стройки)
      // По центру — ульта, одна и крупная; над ней — перезарядки, ещё выше — имя оружия и баффы
      L.ult = { x: Math.round(ui.width / 2), y: base - R, r: R };
      L.cdY = base - 2 * R - 12 - CD_SIZE;
      L.nameY = L.cdY - 24;
    },
  },
  {
    id: "cooldowns", // ВСЕ перезарядки — «часиками» под хотбаром (по часовой — готовая часть, в середине — секунды)
    watch: (g) => g.cooldownList().map((c) => ({ ...c, progress: Math.round(c.progress * 60) / 60, left: Math.ceil(c.left * 10) / 10 })),
    draw: (ui, g, cds, L) => {
      if (!cds.length) return;
      const w = cds.length * (CD_SIZE + 6) - 6;
      // рисунок значка (draw) — у самой способности: из данных он не сериализуется, берём из свежего списка
      const fresh = g.cooldownList();
      const list = cds.map((c, i) => ({ ...c, draw: fresh[i]?.icon === c.icon ? fresh[i].draw : null }));
      drawCooldowns(ui, list, { x: Math.round(ui.width / 2 - w / 2), y: L.cdY ?? ui.height - 14 - CD_SIZE, size: CD_SIZE });
    },
  },
  {
    id: "weapon-name", // название оружия над панелью (стройка — и сколько блоков)
    watch: (g) => ({
      name: g.abilities.current?.name ?? null,
      blocks: g.abilities.current?.id === "build" ? g.blockCount() : null,
    }),
    draw: (ui, g, d, L) => {
      const cx = Math.round(ui.width / 2);
      if (d.blocks != null) ui.text(`${d.name}  BLOCKS: ${d.blocks}`, cx, L.nameY, 2, d.blocks > 0 ? TEXT : RED, "center");
      else if (d.name) ui.text(d.name, cx, L.nameY, 2, TEXT, "center");
    },
  },
  {
    id: "buffs", // баффы и дебаффы — значки над хотбаром (зелёная рамка — бафф, красная — дебафф)
    watch: (g) => g.buffList().filter((b) => !b.permanent).map((b) => ({ // вечные — над здоровьем (trophies)
      icon: b.icon, name: b.name, positive: b.positive, color: b.color, label: b.label,
      left: Number.isFinite(b.left) ? Math.ceil(b.left) : undefined, charges: b.charges,
    })),
    draw: (ui, g, buffs, L) => {
      if (!buffs.length) return;
      const size = 40;
      const w = buffs.length * (size + 8) - 8;
      drawStatuses(ui, buffs, { x: ui.width / 2 - w / 2, y: L.nameY - 70, size });
    },
  },
  {
    id: "ammo", // справа внизу: патроны в магазине, обоймы в сумке, перезарядка / подсказка R
    watch: (g) => {
      const atk = g.abilities.current?.attack;
      if (!atk?.magazine) return null;
      return { ammo: atk.ammo, mag: atk.magazine, reserve: Number.isFinite(atk.reserveCount) ? atk.reserveCount : null, reloading: atk.reloading };
    },
    draw: (ui, g, d) => {
      if (!d) return;
      const rx = ui.width - 24, ry = ui.height - 170; // над ячейками справа
      const empty = d.ammo === 0;
      ui.text(`${d.ammo}/${d.mag}`, rx, ry, 4, empty ? RED : TEXT, "right");
      if (d.reserve != null) ui.text(`CLIPS ${d.reserve}`, rx, ry - 22, 2, d.reserve > 0 ? MUTED : RED, "right");
      if (d.reloading) ui.text("RELOADING", rx, ry + 36, 2, GOLD, "right"); // сколько осталось — «часики» под хотбаром
      else if (empty && !(d.reserve > 0)) ui.text("NO CLIPS", rx, ry + 36, 2, RED, "right");
      else ui.text(`${key(g, "reload")}: RELOAD`, rx, ry + 36, 2, MUTED, "right");
    },
  },
  {
    id: "weapon-hints", // справа от панели: ПКМ — блок; у молотка-стройки — цвет / палитра (скиллы — свои ячейки)
    watch: (g) => {
      const cur = g.abilities.current;
      return {
        block: cur?.blocks ? !(g.blockCooldown > 0) : null,
        build: cur?.id === "build" ? (g.paletteOpen ? g.colorIndex : -1) : null,
      };
    },
    draw: (ui, g, d, L) => {
      const x = L.weapon.x + L.weapon.width + 12; // справа от ячейки оружия
      if (d.block !== null) ui.text(`${key(g, "secondary")}: BLOCK`, x, L.weapon.y + L.weapon.height - 16, 2, d.block ? MUTED : [90, 92, 100]);
      if (d.build !== null) {
        if (d.build >= 0) drawPalette(ui, d.build, L.bar.y - 30); //  панель цветов над способностями (G)
        else ui.text(`${key(g, "palette")}: COLOR`, x, L.weapon.y + L.weapon.height - 16, 2, MUTED);
      }
    },
  },

  // ---------- Вверху ----------
  {
    id: "invasion", // нашествие — красная надпись и сколько ещё держаться
    watch: (g) => (g.invasion?.active ? { name: g.invasionKind?.name || "INVASION", t: Math.ceil(g.invasion.timeLeft) } : null),
    draw: (ui, g, d) => {
      if (d) ui.text(`${d.name}! ${mmss(d.t)}`, ui.width / 2, 74, 3, [255, 80, 70], "center"); // ниже всплывающих надписей
    },
  },
  {
    id: "boss-bar", // босс злится на героя — полоса его здоровья вверху по центру
    watch: (g) => {
      const b = g.entities.list.find((e) => e.boss && e.alive && e.aggro === g.player);
      return b ? { name: b.name, hp: Math.ceil(b.stats.hp), max: b.stats.maxHp, enraged: !!b.enraged, low: !!g.invasion?.active } : null;
    },
    draw: (ui, g, d) => {
      if (!d) return;
      const cx = Math.round(ui.width / 2);
      const w = Math.min(520, ui.width - 80), x = Math.round(cx - w / 2), y = d.low ? 132 : 100;
      ui.text(d.name, cx, y - 22, 2, [230, 190, 255], "center");
      if (d.enraged) ui.text("ENRAGED", x, y - 22, 2, RED, "left");
      ui.rect(x - 2, y - 2, w + 4, 24, [20, 14, 26], 220);
      ui.rect(x, y, Math.round(w * Math.max(0, d.hp / d.max)), 20, [170, 70, 230]);
      ui.text(`${d.hp} / ${d.max}`, x + w - 6, y + 3, 2, [255, 255, 255], "right");
    },
  },
  {
    id: "update", // вышла новая версия — напоминание вверху
    watch: (g) => (g.engine.updater?.available ? [g.engine.updater.available.version, !!g.invasion?.active] : null),
    draw: (ui, g, d) => {
      if (d) ui.text(`UPDATE ${d[0]}: GO TO THE MAIN MENU`, ui.width / 2, d[1] ? 110 : 70, 2, GOLD, "center");
    },
  },
  {
    id: "minimap", // миникарта сверху слева или справа — обновляется MINIMAP_FPS раз в секунду
    watch: (g) => (g.settings.general.minimap ? [Math.floor(performance.now() / (1000 / MINIMAP_FPS)), g.settings.general.minimapSide] : null),
    draw: (ui, g, d) => {
      if (!d) return;
      const size = 168;
      const x = d[1] === "left" ? 18 : ui.width - size - 18;
      // HUD перерисовывается целиком, когда меняется любая его часть (в бою — почти каждый кадр), а карта
      // меняется MINIMAP_FPS раз в секунду: в остальные перерисовки — вернуть готовую картинку (ui.paste)
      const stamp = JSON.stringify(d);
      if (!(g.minimapImage?.stamp === stamp && ui.paste(g.minimapImage))) {
        drawMinimap(ui, { ...g.mapData(), size, x, y: 18 });
        g.minimapImage = Object.assign(ui.grab(x - 3, 15, size + 6, size + 6), { stamp });
      }
      ui.text(`${key(g, "map")}: MAP`, x + size / 2, 18 + size + 8, 2, MUTED, "center"); // координаты — только на большой карте
    },
  },

  // ---------- Поверх мира (точки мира → экран) ----------
  {
    id: "effects", // следы ударов (катана) и лучи / круги / искры — не сквозь блоки
    watch: (g) => animating(g.slashes.active || g.beams.active || g.crescents.active),
    draw: (ui, g) => {
      // эффекты — по камере с тряской (той же, что рисует мир): трясутся вместе с картинкой
      g.slashes.draw(ui, g.viewCamera);
      g.crescents.draw(ui, g.viewCamera); // разрез ИАЙ — пиксельный серп вдоль пореза
      g.beams.draw(ui, g.viewCamera, { visible: (p) => g.seenFromCamera(p) });
    },
  },
  {
    id: "boss-timers", // босс мёртв — над местом, где он появится, таймер (рядом и не за стеной)
    watch: (g) => {
      const timers = g.bossSites().map((site, i) => {
        const t = Math.ceil(g.lairTimers[i] || 0);
        return t > 0 && !g.entities.list.some((e) => e.boss && e.lair === i && e.alive) ? { i, t } : null;
      }).filter(Boolean);
      // надпись привязана к месту в мире — пока таймеры идут, перерисовываем и при повороте камеры
      return timers.length ? { timers, cam: animating(true) } : null;
    },
    draw: (ui, g, d) => {
      if (!d) return;
      const sites = g.bossSites();
      for (const { i, t } of d.timers) {
        const site = sites[i];
        const p = { x: site.x + 0.5, y: site.y + 2.2, z: site.z + 0.5 };
        if (Math.hypot(p.x - g.player.position.x, p.z - g.player.position.z) > 45 || !g.seenFromCamera(p)) continue;
        const sp = g.viewCamera.toScreen(p, ui.width, ui.height);
        if (!sp) continue;
        ui.text("BOSS RETURNS IN", sp.x, sp.y - 22, 2, [200, 160, 255], "center");
        ui.text(mmss(t), sp.x, sp.y, 3, [230, 200, 255], "center");
      }
    },
  },
  {
    // выносливость — тонкая полупрозрачная шкала под прицелом (без рамки): белая — сколько есть, серая — сколько
    // можно набрать; полная — не видно; не хватило — мигает красным
    id: "stamina",
    watch: (g) => {
      const s = g.stamina;
      if (!s) return null;
      const flash = (g.staminaFlash || 0) > 0;
      if (s.value >= s.max && !flash) return null;
      return { v: Math.round(s.ratio * 200) / 200, ex: s.exhausted, flash: flash ? Math.floor(g.staminaFlash * 10) % 2 : -1 };
    },
    draw: (ui, g, d) => {
      if (!d) return;
      const { cx, cy } = center(ui);
      const w = 120, h = 3, x = Math.round(cx - w / 2), y = cy + 18; // над надписями «ХЕДШОТ» / «ОТБИТО»
      const red = d.flash === 1;
      ui.rect(x, y, w, h, red ? [200, 70, 60] : [150, 155, 165], 70);
      ui.rect(x, y, Math.round(w * d.v), h, d.ex ? [200, 200, 205] : [255, 255, 255], d.ex ? 110 : 160);
    },
  },
  {
    id: "ultimate", // ультимейт — круг в середине панели, в нём проценты; полный — клавиша (движок: drawUltimate)
    watch: (g) => ({ pct: g.ultimate.percent, key: key(g, "ultimate") }),
    draw: (ui, g, d, L) => {
      if (!L.ult) return;
      widgets.drawUltimate(ui, { x: L.ult.x, y: L.ult.y, r: L.ult.r, percent: d.pct, key: d.key });
    },
  },
  {
    id: "damage-numbers", // цифры урона — поверх всего (движок: DamageNumbers)
    watch: (g) => (g.settings.general.damageNumbers !== false ? animating(g.damageNumbers.active) : null),
    draw: (ui, g, d) => {
      if (d !== null) g.damageNumbers.draw(ui, g.viewCamera);
    },
  },
  {
    id: "help", // держишь F1 — справка поверх всего: что умеют оружие, скиллы и ульта (движок: drawHelpOverlay)
    watch: (g) => (g.engine.input.isDown("help") && !g.background ? { cols: g.helpColumns() } : null),
    draw: (ui, g, d) => {
      if (!d) return;
      widgets.drawHelpOverlay(ui, { title: "ABILITIES", columns: d.cols, footer: `HOLD ${key(g, "help")} TO SEE THIS` });
    },
  },
];

// HUD игры — набор частей (движок: HudParts). Сцена: hud.update(this) каждый кадр, hud.draw(ui, this) в drawUI
export const createHud = () => new HudParts(HUD_PARTS);

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
