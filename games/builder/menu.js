// ============================================================
//  Главное меню «Стройки»: вкладки сверху (поровну, ИГРАТЬ — посередине), на вкладке ИГРАТЬ — миры.
//
//  Миры — кругляши с пиксель-артом (assets/world-icons/*.png; при создании — случайная картинка, потом
//  стрелками под миром — любая из папки). Порядок — кто играл последним: в центре — последний, слева —
//  предпоследний, справа — третий, дальше — очередь (ещё меньше, за ними). Стрелки ← / → (клавиши или
//  кнопки по бокам) крутят по кругу: ← — центральный уходит в конец очереди, в центр встаёт тот, что был
//  слева, на его место — тот, что справа, и т. д.; → — обратно.
//  Навёл на мир — он и его имя чуть всплывают, внизу — твой герой этого мира лицом к тебе (3D) и
//  статы: уровень, класс, здоровье, оружие, броня, бонусы. Под центральным — ИГРАТЬ.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Scene, Camera, Vec3, loadPNG, rarityOf, translate, widgets, KEYS } from "../../engine/index.js";
import { CLASSES, WORLD_SIZES } from "./config.js";
import { itemName, ITEMS } from "./items.js";
import { SKIN_CATEGORIES, SKIN_TARGETS, skinOf, drawSkinIcon } from "./skins.js";
import { ABILITY_FOR_ITEM } from "./abilities.js";
import { listWorlds, createWorld, deleteWorld, updateWorld, touchWorld, MAX_WORLDS } from "./save.js";

const ICONS_DIR = fileURLToPath(new URL("./assets/world-icons/", import.meta.url));
// Верхняя полоса (как в Overwatch): ИГРАТЬ — крупно по центру; вкладки слева прилипают к левому краю,
// маленькие кнопки-значки — к правому (новости, друзья, настройки). ESC — меню: настройки / новости / выход.
// Сетевая игра пока закрыта (персонажи по id, позже — аккаунты): вкладки MULTIPLAYER нет
const LEFT_TABS = [{ id: "skins", label: "SKINS" }];
const ICON_TABS = [
  { id: "news", label: "WHAT'S NEW", icon: "news" },
  { id: "friends", label: "FRIENDS", icon: "friends", soon: true },
  { id: "settings", label: "SETTINGS", icon: "gear" },
];
const SHIMMER = { every: 10, time: 0.9 }; // кнопка ИГРАТЬ переливается раз в every с

// Картинки миров: все PNG из папки (имя файла без .png — id картинки)
function loadIcons() {
  const out = {};
  try {
    for (const f of fs.readdirSync(ICONS_DIR)) {
      if (!/\.png$/i.test(f)) continue;
      try { out[f.replace(/\.png$/i, "")] = loadPNG(path.join(ICONS_DIR, f)); } catch {}
    }
  } catch {}
  return out;
}

export class MainMenu extends Scene {
  // actions: { play(), news(), settings(), quit(), host(), join(), update(), confirm(title, onYes), askName(title, value, onDone) }
  constructor({ game, actions, updater = null }) {
    super();
    this.game = game;
    this.actions = actions;
    this.updater = updater;
    this.realtime = true; // анимации кругов и герой в 3D — каждый кадр
    this.tab = "play";
    this.icons = loadIcons();
    this.iconIds = Object.keys(this.icons).sort();
    this.rot = 0; //   сколько раз повернули круг
    this.anim = new Map(); // id мира -> { x, y, r } — где кругляш сейчас (плавно к цели)
    this.hover = null; // мир под мышью
    this.camera = new Camera({ position: new Vec3(0, 1.63, 5.9), fovDeg: 40 });
    this.camera.yaw = Math.PI; // смотрим на героя (он у начала координат, лицом к нам)
    this.hero = null; //  { key, entity } — герой показанного мира
    // вкладка SKINS: раздел, выбранная цель (оружие, класс...), скин под мышью (примерка на герое)
    this.skinCat = "weapons";
    this.skinPick = null;
    this.skinHover = null;
    this.skinHero = null; // { key, entity }
    this.reload();
  }

  get label() {
    return "главное меню";
  }

  reload() {
    this.worlds = listWorlds();
    this.ring = [...this.worlds];
    if (this.worlds.length < MAX_WORLDS) this.ring.push({ id: "new", create: true, name: "NEW WORLD" });
    this.rot = 0;
  }

  // Порядок в круге после поворотов: 0 — центр, 1 — слева, 2 — справа, дальше — очередь
  order() {
    const n = this.ring.length;
    return this.ring.map((_, i) => this.ring[(((i + this.rot) % n) + n) % n]);
  }

  get center() {
    return this.order()[0] || null;
  }

  turn(dir) {
    if (this.ring.length > 1) this.rot += dir;
  }

  // Где кругляш позиции k: центр крупно, слева / справа поменьше, очередь — ещё меньше и дальше по бокам
  slot(ui, k) {
    const cx = ui.width / 2, y = ui.height * 0.27;
    const R = Math.min(110, ui.height * 0.12);
    if (k === 0) return { x: cx, y, r: R, a: 1 };
    if (k === 1) return { x: cx - R * 2.6, y: y + 10, r: R * 0.68, a: 0.9 };
    if (k === 2) return { x: cx + R * 2.6, y: y + 10, r: R * 0.68, a: 0.9 };
    const q = k - 3; // очередь: дальше — меньше и тусклее, попеременно слева и справа
    const side = q % 2 === 0 ? -1 : 1, depth = Math.floor(q / 2);
    return { x: cx + side * (R * 4.1 + depth * R * 0.7), y: y + 22, r: Math.max(10, R * (0.4 - depth * 0.08)), a: Math.max(0.25, 0.6 - depth * 0.15) };
  }

  update(dt) {
    // плавно к целям (поворот круга)
    const ui = this.engine.ui;
    this.clock = (this.clock || 0) + dt; // блик на кнопке ИГРАТЬ
    const k = Math.min(1, dt * 12);
    this.order().forEach((w, i) => {
      const t = this.slot(ui, i);
      const lift = this.hover === w.id ? 12 : 0;
      const a = this.anim.get(w.id) || { ...t };
      a.x += (t.x - a.x) * k;
      a.y += (t.y - lift - a.y) * k;
      a.r += (t.r - a.r) * k;
      a.a = t.a;
      this.anim.set(w.id, a);
    });
    this.updateHero(dt);
    this.updateSkinHero(dt);
    this.engine.redraw();
  }

  // Герой показанного мира (наведённого или центрального): модель по классу, оружие в руке
  shown() {
    return this.ring.find((w) => w.id === this.hover) || this.center;
  }

  updateHero(dt) {
    const w = this.shown();
    const key = w && !w.create && w.saved && w.cls ? `${w.id}:${w.cls}:${w.weapon?.item}` : null; // героя без класса ещё нет
    const models = this.game.models;
    if (this.hero?.key !== key) {
      if (this.hero) models.detach(this.hero.entity);
      this.hero = null;
      if (key) {
        const e = { position: new Vec3(0, 0, 0), yaw: 0, alive: true, hurtTime: 99, deadTime: 0, scale: 1, roll: 0, tilt: 0, skinned: true };
        try {
          models.attach(e, CLASSES[w.cls]?.outfit || "hero");
          const held = w.weapon && ABILITY_FOR_ITEM[w.weapon.item]?.()?.held;
          if (held) {
            models.hold(e, held.model, held);
            e.view?.animator.setOverlay(held.pose ?? null);
          }
          e.view?.animator.setBase("Idle", 1);
          this.hero = { key, entity: e };
        } catch (err) {
          this.engine.log("меню: герой не показался: " + err.message);
        }
      }
    }
    if (this.hero) models.update([this.hero.entity], dt);
  }

  view() {
    const h = this.tab === "play" ? this.hero : this.tab === "skins" ? this.skinHero : null;
    if (!h) return null;
    return { camera: this.camera, world: null, characters: this.game.models.drawList([h.entity]) };
  }

  // Примерка на вкладке SKINS: герой в скине (класс) или герой с предметом в руке в скине; медленно вертится
  updateSkinHero(dt) {
    const models = this.game.models;
    const t = this.tab === "skins" && SKIN_TARGETS.find((x) => x.id === this.skinPick);
    const skin = t && (this.skinHover || skinOf(this.engine.settings.data, t).id);
    const key = t && t.category !== "armor" ? `${t.id}:${skin}` : null;
    if (this.skinHero?.key !== key) {
      const yaw = this.skinHero?.entity.yaw || 0;
      if (this.skinHero) models.detach(this.skinHero.entity);
      this.skinHero = null;
      if (key) {
        const e = { position: new Vec3(0, 0, 0), yaw, alive: true, hurtTime: 99, deadTime: 0, scale: 1, roll: 0, tilt: 0, skinned: true, skinOverride: { [t.id]: skin } };
        try {
          models.attach(e, t.category === "character" ? t.models[0] : "hero");
          const held = t.items[0] && ABILITY_FOR_ITEM[t.items[0]]?.()?.held;
          if (held) {
            models.hold(e, held.model, held);
            e.view?.animator.setOverlay(held.pose ?? null);
          }
          e.view?.animator.setBase("Idle", 1);
          this.skinHero = { key, entity: e };
        } catch (err) {
          this.engine.log("меню: примерка скина не показалась: " + err.message);
        }
      }
    }
    if (this.skinHero) {
      this.skinHero.entity.yaw += dt * 0.7;
      models.update([this.skinHero.entity], dt);
    }
  }

  // Главные цвета модели цели (самые частые, до 5) — полоски-образец скина, если у цели нет значка (герои)
  palette(t) {
    this.palettes ||= new Map();
    if (this.palettes.has(t.id)) return this.palettes.get(t.id);
    const c = this.game.models.models.get(t.models[0])?.model.colors;
    const count = new Map();
    for (let i = 0; c && i < c.length; i += 3) {
      const k = `${c[i].toFixed(2)},${c[i + 1].toFixed(2)},${c[i + 2].toFixed(2)}`;
      count.set(k, (count.get(k) || 0) + 1);
    }
    const out = [...count].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k.split(",").map(Number));
    this.palettes.set(t.id, out);
    return out;
  }

  drawSwatch(ui, t, skin, x, y, w, h) {
    const cols = this.palette(t);
    if (!cols.length) return;
    const sw = w / cols.length;
    cols.forEach((c, i) => {
      const p = (skin.paint && skin.paint(...c)) || c;
      ui.rect(Math.round(x + i * sw), y, Math.ceil(sw), h, p.map((v) => Math.round(v * 255)), 255);
    });
  }

  // Вкладка SKINS: разделы → предметы раздела → скины выбранного (клик — надеть; под мышью — примерка)
  drawSkins(ui) {
    const th = ui.theme;
    const S = this.engine.settings.data;
    const cw = Math.min(220, Math.floor((ui.width - 80) / SKIN_CATEGORIES.length) - 10);
    SKIN_CATEGORIES.forEach((c, i) => ui.button("scat:" + c.id, c.name, ui.width / 2 + (i - (SKIN_CATEGORIES.length - 1) / 2) * (cw + 10), 92, cw, 38, 2, this.skinCat === c.id));
    const list = SKIN_TARGETS.filter((t) => t.category === this.skinCat);
    if (!list.some((t) => t.id === this.skinPick)) this.skinPick = list[0]?.id ?? null;
    const box = this.heroBox(ui);
    // слева — предметы раздела (значок — в надетом скине)
    const left = 24, top = 140, cell = 104, cols = Math.max(1, Math.floor((box.x - left - 24) / (cell + 8)));
    list.forEach((t, i) => {
      const x = left + (i % cols) * (cell + 8), y = top + Math.floor(i / cols) * (cell + 30);
      const on = t.id === this.skinPick;
      ui.rect(x, y, cell, cell, th.window.fill, 235);
      ui.frame(x, y, cell, cell, on ? th.accent : th.window.border, on ? 3 : 2);
      const s = skinOf(S, t);
      if (!drawSkinIcon(ui, ITEMS, t, s, x + cell * 0.22, y + cell * 0.18, cell * 0.56)) this.drawSwatch(ui, t, s, x + 14, y + 18, cell - 28, cell - 44);
      if (s.id !== "default") ui.text(s.name, x + cell / 2, y + cell - 16, 1, th.accent, "center");
      ui.text(t.name, x + cell / 2, y + cell + 6, 1, on ? th.text : th.muted, "center");
      ui.buttons.push({ id: "spick:" + t.id, x, y, w: cell, h: cell + 22 });
    });
    // в центре — примерка (3D: окошко прозрачное); у брони пока только значок
    const t = SKIN_TARGETS.find((x) => x.id === this.skinPick);
    if (!t) return;
    ui.text(t.name, box.x + box.w / 2, box.y - 34, 3, th.accent, "center");
    ui.frame(box.x - 3, box.y - 3, box.w + 6, box.h + 6, th.window.border, 3);
    if (t.category === "armor") {
      const s = t.skins.find((x) => x.id === this.skinHover) || skinOf(S, t);
      ui.rect(box.x, box.y, box.w, box.h, th.window.fill, 235);
      drawSkinIcon(ui, ITEMS, t, s, box.x + box.w * 0.2, box.y + box.h * 0.25, box.w * 0.6);
      ui.text("ARMOR ON THE HERO - LATER", box.x + box.w / 2, box.y + box.h - 30, 1, th.muted, "center");
    } else ui.rect(box.x, box.y, box.w, box.h, [0, 0, 0], 0);
    // справа — скины (все открыты)
    const rx = box.x + box.w + 30, rw = Math.min(420, ui.width - rx - 24), ch = 84;
    const mx = ui.mouseX, my = ui.mouseY;
    this.skinHover = null;
    t.skins.forEach((s, i) => {
      const y = box.y + i * (ch + 10);
      const worn = skinOf(S, t).id === s.id;
      const over = mx >= rx && mx < rx + rw && my >= y && my < y + ch;
      if (over) this.skinHover = s.id;
      ui.rect(rx, y, rw, ch, th.window.fill, 240);
      ui.frame(rx, y, rw, ch, worn ? th.accent : over ? th.text : th.window.border, worn ? 3 : 2);
      if (!drawSkinIcon(ui, ITEMS, t, s, rx + 12, y + 12, ch - 24)) this.drawSwatch(ui, t, s, rx + 12, y + 12, ch - 24, ch - 24);
      ui.text(s.name, rx + ch + 4, y + 14, 2, worn ? th.accent : th.text);
      ui.text(s.text || "", rx + ch + 4, y + 40, 1, th.muted);
      if (worn) ui.text("EQUIPPED", rx + rw - 12, y + 14, 1, th.accent, "right");
      ui.buttons.push({ id: "sskin:" + s.id, x: rx, y, w: rw, h: ch });
    });
    ui.text("ALL SKINS ARE UNLOCKED FOR NOW", rx, box.y + t.skins.length * (ch + 10) + 8, 1, th.muted);
  }

  // окошко героя (там UI прозрачный — видно 3D) — внизу по центру
  heroBox(ui) {
    const w = Math.round(ui.width * 0.24), h = Math.round(ui.height * 0.5);
    return { x: Math.round(ui.width / 2 - w / 2), y: Math.round(ui.height * 0.44), w, h };
  }

  drawUI(ui) {
    const th = ui.theme;
    widgets.drawBackground(ui);
    // вкладки сверху — поровну
    this.drawTopBar(ui);
    if (this.tab === "play") this.drawPlay(ui);
    if (this.tab === "multiplayer") this.drawMultiplayer(ui);
    if (this.tab === "skins") this.drawSkins(ui);
    const up = this.updater;
    if (up?.available) {
      const label = `UPDATE TO ${up.available.version}`;
      const w = Math.max(260, label.length * 13 + 40);
      ui.button("update", label, ui.width - 24 - w / 2, ui.height - 24 - 26, w, 52, 2, true);
    }
    if (up) ui.text(`VERSION ${up.current}`, 24, ui.height - 36, 2, th.muted);
  }

  // Верхняя полоса: ИГРАТЬ по центру (крупно, раз в 10 с по ней пробегает блик), слева вкладки, справа значки
  drawTopBar(ui) {
    const th = ui.theme;
    // одна сплошная полоса во всю ширину; ИГРАТЬ — выше и шире, выступает вниз из полосы
    const barH = 48, pw = Math.min(340, ui.width * 0.26), ph = 66, cy = ph / 2;
    ui.rect(0, 0, ui.width, barH, th.window.titleBar, 250);
    ui.rect(0, barH, ui.width, 2, th.window.border, 255);
    ui.button("tab:play", "PLAY", ui.width / 2, cy, pw, ph, 4, this.tab === "play");
    // блик: светлая полоса наискось слева направо
    const t = (this.clock || 0) % SHIMMER.every;
    if (t < SHIMMER.time) {
      const k = t / SHIMMER.time, x0 = ui.width / 2 - pw / 2, y0 = cy - ph / 2;
      const bx = x0 - 40 + k * (pw + 80);
      // интерфейс пишет пиксели поверх (без смешивания) — осветляем то, что уже нарисовано, сами
      const px = ui.fb.pixels, W = ui.fb.width, fade = Math.sin(k * Math.PI);
      for (let i = 2; i < ph - 2; i++) {
        const sx = Math.round(bx - i * 0.5);
        for (let qx = Math.max(Math.ceil(x0 + 2), sx); qx < Math.min(x0 + pw - 2, sx + 26); qx++) {
          const j = Math.round(y0 + i) * W + qx, v = px[j];
          const d = 1 - Math.abs(qx - sx - 13) / 13; // ярче в середине полосы
          const a = 0.45 * fade * d;
          const r = (v & 255) + (255 - (v & 255)) * a, g = ((v >>> 8) & 255) + (255 - ((v >>> 8) & 255)) * a, b = ((v >>> 16) & 255) + (235 - ((v >>> 16) & 255)) * a;
          px[j] = ((v & 0xff000000) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
        }
      }
      ui.dirty = true;
    }
    // вкладки слева — встык друг к другу и к левому краю, по высоте полосы
    const sw = 150, sh = barH, by = barH / 2;
    LEFT_TABS.forEach((tb, i) => ui.button("tab:" + tb.id, tb.label, sw / 2 + i * sw, by, sw + 1, sh, 2, this.tab === tb.id));
    // значки справа — встык к правому краю
    const iw = 56;
    ICON_TABS.forEach((tb, i) => {
      const x = ui.width - iw / 2 - (ICON_TABS.length - 1 - i) * iw;
      ui.button("tab:" + tb.id, "", x, by, iw + 1, sh, 2, false);
      drawTabIcon(ui, tb.icon, x, by, tb.soon ? th.muted : th.text);
      if (tb.icon === "friends") ui.text("0", x + 12, by + 5, 1, th.muted);
      if (ui.isInside(ui.mouseX, ui.mouseY, x - iw / 2, 0, iw, sh)) {
        ui.text(tb.label, Math.min(ui.width - 10, x + iw / 2), barH + 10, 1, th.muted, "right");
        if (tb.soon) ui.text("SOON", Math.min(ui.width - 10, x + iw / 2), barH + 22, 1, th.warn, "right");
      }
    });
  }

  drawPlay(ui) {
    const th = ui.theme;
    const order = this.order();
    // по дальности: сначала очередь, потом бока, центр — сверху всех
    const mx = ui.mouseX, my = ui.mouseY;
    this.hover = null;
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i], a = this.anim.get(w.id);
      if (!a) continue;
      if (i < 3 && (mx - a.x) ** 2 + (my - a.y) ** 2 <= a.r * a.r) this.hover = w.id;
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i], a = this.anim.get(w.id);
      if (!a) continue;
      const lit = i === 0 || this.hover === w.id;
      ui.circle(a.x, a.y, a.r + 5, lit ? th.accent : th.window.border, 255);
      if (w.create) {
        ui.circle(a.x, a.y, a.r, [24, 24, 30], 255);
        ui.text("+", a.x, a.y - a.r * 0.35, Math.max(2, Math.round(a.r / 9)), th.accent, "center");
      } else {
        const img = this.icons[w.icon] || this.icons[this.iconIds[0]];
        if (img) ui.image(img, a.x - a.r, a.y - a.r, a.r * 2, a.r * 2, { circle: true, dim: i === 0 || lit ? 0 : 0.35 * (1 - a.a) + 0.15 });
        else ui.circle(a.x, a.y, a.r, [60, 60, 70], 255);
      }
      if (i < 3) {
        const name = w.create ? "NEW WORLD" : w.name;
        ui.text(name, a.x, a.y + a.r + 14, i === 0 ? 3 : 2, lit ? th.text : th.muted, "center");
        if (!w.create && !w.saved && i === 0) ui.text("NEW RUN", a.x, a.y + a.r + 44, 2, th.warn, "center");
      }
    }
    // стрелки по бокам
    const cy = ui.height * 0.27;
    if (this.ring.length > 1) {
      ui.button("turn:1", "<", 40, cy, 56, 80, 4); // ← — в центр мир слева (как клавиша ←)
      ui.button("turn:-1", ">", ui.width - 40, cy, 56, 80, 4);
    }
    const c = this.center;
    const ca = c && this.anim.get(c.id);
    if (c && ca) {
      const below = ca.y + ca.r + (c.saved || c.create ? 52 : 74);
      ui.button("play", c.create ? "CREATE" : c.saved ? "PLAY" : "START", ui.width / 2, below + 20, 260, 52, 3, true);
      if (!c.create) {
        // сменить картинку и удалить — подписанными кнопками (стрелки рядом с ИГРАТЬ путали: ждёшь смену мира)
        ui.button("icon:1", "PICTURE", ui.width / 2 - 250, below + 20, 140, 36, 2);
        ui.button("delete", "DELETE", ui.width / 2 + 250, below + 20, 140, 36, 2);
      }
    }
    // герой (3D: окошко прозрачное) и статы показанного мира
    const w = this.shown();
    if (w && !w.create) {
      const b = this.heroBox(ui);
      if (w.saved && !w.old && w.cls && !w.noCharacter) {
        ui.frame(b.x - 3, b.y - 3, b.w + 6, b.h + 6, th.window.border, 3);
        ui.rect(b.x, b.y, b.w, b.h, [0, 0, 0], 0); // «дырка» в интерфейсе — там виден герой
        this.drawStats(ui, w, b.x + b.w + 24, b.y);
      } else {
        const why = w.old ? "OLD SAVE: PLAY ONCE TO SEE THE HERO"
          : !w.saved ? "NO HERO YET - START A RUN"
            : "NO HERO YET - CHOOSE A CLASS WHEN YOU ENTER";
        ui.text(why, ui.width / 2, b.y + 40, 2, th.muted, "center");
      }
    }
  }

  drawStats(ui, w, x, y) {
    const th = ui.theme;
    const line = (text, color = th.text, scale = 2) => {
      ui.text(text, x, y, scale, color);
      y += scale * 10 + 6;
    };
    line(w.name, th.accent, 3);
    const cls = w.cls ? CLASSES[w.cls]?.name || w.cls : "NO CLASS";
    line(`LEVEL ${w.level}  ${cls}`);
    line(`HP ${w.hp}`, [230, 110, 100]);
    if (w.weapon) {
      const r = rarityOf(w.weapon.rarity);
      line(`${w.weapon.rarity ? translate(r.name) + " " : ""}${translate(itemName(w.weapon.item))}`, w.weapon.rarity ? r.color : th.text);
    } else line("NO WEAPON", th.muted);
    if (w.armor?.length) line(`ARMOR: ${w.armor.length}/4`, th.muted);
    if (w.hides) line(`TROLL HIDES: ${w.hides}`, th.muted);
    if (w.crowns) line(`BONE CROWNS: ${w.crowns}`, th.muted);
    if (w.cheats !== false) line("CONSOLE CHEATS: ON", th.warn);
    const talents = Object.values(w.talents || {}).reduce((a, b) => a + b, 0);
    if (talents) line(`TALENT RANKS: ${talents}`, th.muted);
  }

  drawMultiplayer(ui) {
    const th = ui.theme;
    const c = this.worlds[0];
    ui.text("MULTIPLAYER", ui.width / 2, ui.height * 0.2, 5, th.text, "center");
    ui.button("host", "HOST GAME", ui.width / 2, ui.height * 0.38, 420, 60, 3);
    ui.text(c ? `WORLD: ${c.name} (LAST PLAYED)` : "NO WORLD YET: CREATE ONE ON THE PLAY TAB", ui.width / 2, ui.height * 0.38 + 44, 2, th.muted, "center");
    ui.button("join", "JOIN GAME", ui.width / 2, ui.height * 0.55, 420, 60, 3);
    ui.text("FRIEND'S ADDRESS: IP OR IP:PORT", ui.width / 2, ui.height * 0.55 + 44, 2, th.muted, "center");
  }

  onButton(id) {
    const [kind, arg] = id.split(":");
    if (kind === "tab") {
      if (arg === "friends") return this.actions.toast?.("FRIENDS - SOON");
      if (arg === "play" || arg === "multiplayer" || arg === "skins") this.tab = arg;
      else this.actions[arg]?.();
      return;
    }
    if (kind === "turn") return this.turn(Number(arg));
    if (kind === "update") return this.actions.update?.();
    if (kind === "host") return this.worlds[0] ? this.actions.host(this.worlds[0].id) : this.actions.toast?.("CREATE A WORLD FIRST");
    if (kind === "join") return this.actions.join();
    if (kind === "scat") return void (this.skinCat = arg);
    if (kind === "spick") return void (this.skinPick = arg);
    if (kind === "sskin" && this.skinPick) {
      this.engine.settings.data.skins[this.skinPick] = arg;
      this.engine.settings.save();
      this.engine.sound?.play?.("learn");
      if (this.hero) this.game.models.detach(this.hero.entity); // герой мира — переодеть (новый скин)
      this.hero = null;
      return;
    }
    const c = this.center;
    if (!c) return;
    if (kind === "play") {
      if (c.create) return this.newWorld();
      touchWorld(c.id);
      return this.actions.play(c.id);
    }
    if (kind === "icon" && !c.create && this.iconIds.length) {
      const i = Math.max(0, this.iconIds.indexOf(c.icon));
      const icon = this.iconIds[(i + Number(arg) + this.iconIds.length) % this.iconIds.length];
      updateWorld(c.id, { icon });
      c.icon = icon;
    }
    if (kind === "delete" && !c.create) {
      this.actions.confirm(`DELETE ${c.name}?`, () => {
        deleteWorld(c.id);
        this.reload();
      });
    }
  }

  newWorld() {
    const n = this.worlds.length + 1;
    this.engine.push(new CreateWorldScene({
      icons: this.icons, iconIds: this.iconIds, name: `WORLD ${n}`,
      onCreate: ({ name, icon, size, cheats }) => {
        createWorld({ name: name || `WORLD ${n}`, icon, size, floating: true, cheats });
        this.reload(); // новый — играли «только что»: он в центре
      },
    }));
  }

  // клик по кругляшу: боковой — повернуть к нему
  onMouseDown({ x, y }) {
    if (this.tab !== "play") return false;
    const order = this.order();
    for (let i = 1; i < Math.min(3, order.length); i++) {
      const a = this.anim.get(order[i].id);
      if (a && (x - a.x) ** 2 + (y - a.y) ** 2 <= a.r * a.r) {
        this.turn(i); // слева — на 1 шаг, справа — на 2 (он третий в очереди)
        return true;
      }
    }
    return false;
  }

  onKey(e) {
    if (e.scancode === KEYS.ESCAPE) return this.actions.escape?.(); // меню: настройки / новости / выход
    if (this.tab !== "play") return;
    if (e.scancode === KEYS.LEFT) this.turn(1); //   ← — центральный уходит в конец, в центр — тот, что слева
    if (e.scancode === KEYS.RIGHT) this.turn(-1); // → — обратно
    if (e.scancode === KEYS.RETURN) this.onButton("play");
  }

  enter() {
    this.engine.sound.environment = null; // в меню — без стен и эха
    this.engine.sound.music("calm");
  }

  exit() {
    if (this.hero) this.game.models.detach(this.hero.entity);
    this.hero = null;
  }
}


// Окно создания мира: имя (печатать), картинка (стрелки), размер 1 / 2 / 3; СОЗДАТЬ / ОТМЕНА
export class CreateWorldScene extends Scene {
  constructor({ icons, iconIds, name, onCreate }) {
    super();
    this.transparent = true;
    this.icons = icons;
    this.iconIds = iconIds;
    this.name = name;
    this.icon = iconIds[Math.floor(Math.random() * iconIds.length)] || "island";
    this.size = 2;
    this.cheats = false; // читы консоли в этом мире (выдать, призвать, бессмертие...) — только с галочкой
    this.onCreate = onCreate;
  }

  get label() {
    return "создание мира";
  }

  drawUI(ui) {
    const th = ui.theme;
    widgets.drawDim(ui, 210);
    const W = 620, H = 520, x = ui.width / 2 - W / 2, y = ui.height / 2 - H / 2;
    ui.rect(x, y, W, H, th.window.fill, 245);
    ui.frame(x, y, W, H, th.window.border, 3);
    ui.text("NEW WORLD", ui.width / 2, y + 18, 3, th.accent, "center");
    // имя
    ui.text("NAME", x + 30, y + 70, 2, th.muted);
    ui.rect(x + 30, y + 90, W - 60, 46, [0, 0, 0], 170);
    ui.text(this.name + "_", x + 44, y + 104, 3, th.text);
    // картинка
    ui.text("PICTURE", x + 30, y + 160, 2, th.muted);
    const img = this.icons[this.icon];
    const cx = ui.width / 2, cy = y + 230, r = 52;
    ui.circle(cx, cy, r + 4, th.accent, 255);
    if (img) ui.image(img, cx - r, cy - r, r * 2, r * 2, { circle: true });
    ui.button("icon:-1", "<", cx - 110, cy, 50, 50, 3);
    ui.button("icon:1", ">", cx + 110, cy, 50, 50, 3);
    // размер
    ui.text("SIZE", x + 30, y + 305, 2, th.muted);
    for (const k of [1, 2, 3]) ui.button("size:" + k, `${k} ${WORLD_SIZES[k].name}`, x + 30 + (k - 1) * 190 + 90, y + 345, 180, 44, 2, this.size === k);
    ui.text("FLOATING ISLANDS: DON'T FALL OFF THE EDGE", ui.width / 2, y + 378, 1, th.muted, "center");
    ui.button("cheats", this.cheats ? "[X] CONSOLE CHEATS" : "[ ] CONSOLE CHEATS", ui.width / 2, y + 404, 300, 34, 2, this.cheats);
    ui.button("create", "CREATE", ui.width / 2 - 110, y + H - 40, 200, 48, 3, true);
    ui.button("cancel", "CANCEL", ui.width / 2 + 110, y + H - 40, 200, 48, 3);
  }

  onKey(e) {
    if (e.scancode === KEYS.BACKSPACE) this.name = this.name.slice(0, -1);
    else if (e.scancode === KEYS.RETURN) return this.onButton("create");
    else if (e.scancode === KEYS.ESCAPE) return this.engine.pop();
    else if (typeof e.key === "string" && e.key.length === 1 && /[0-9a-zа-яё _-]/i.test(e.key) && this.name.length < 20) this.name += e.key.toUpperCase();
    else return;
    this.engine.redraw();
  }

  onButton(id) {
    const [kind, arg] = id.split(":");
    if (kind === "cancel") return this.engine.pop();
    if (kind === "icon" && this.iconIds.length) {
      const i = Math.max(0, this.iconIds.indexOf(this.icon));
      this.icon = this.iconIds[(i + Number(arg) + this.iconIds.length) % this.iconIds.length];
    }
    if (kind === "size") this.size = Number(arg);
    if (kind === "cheats") this.cheats = !this.cheats;
    if (kind === "create") {
      this.engine.pop();
      this.onCreate({ name: this.name.trim(), icon: this.icon, size: this.size, cheats: this.cheats });
      return;
    }
    this.engine.redraw();
  }
}

// Значки верхней полосы — пиксельные, 20×20 вокруг (cx, cy)
function drawTabIcon(ui, icon, cx, cy, color) {
  const x = Math.round(cx - 10), y = Math.round(cy - 10);
  const dark = [30, 30, 36];
  if (icon === "news") { // газета: лист, заголовок, строки, колонка-картинка
    ui.rect(x + 1, y + 2, 18, 16, color, 255);
    ui.rect(x + 3, y + 4, 14, 3, dark, 255);
    ui.rect(x + 3, y + 9, 6, 6, dark, 255);
    for (const ly of [9, 12, 15]) ui.rect(x + 11, y + ly, 6, 1, dark, 255);
  } else if (icon === "friends") { // голова и плечи
    ui.circle(x + 8, y + 6, 4, color, 255);
    ui.rect(x + 2, y + 13, 12, 6, color, 255);
    ui.rect(x + 3, y + 12, 10, 1, color, 255);
  } else if (icon === "gear") { // шестерёнка: зубцы, кольцо, дырка
    const c = 10;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ui.rect(Math.round(x + c + Math.cos(a) * 7.5 - 2), Math.round(y + c + Math.sin(a) * 7.5 - 2), 4, 4, color, 255);
    }
    ui.circle(x + c, y + c, 7, color, 255);
    ui.circle(x + c, y + c, 3, dark, 255);
  }
}
