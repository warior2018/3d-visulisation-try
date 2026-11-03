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
import { itemName } from "./items.js";
import { ABILITY_FOR_ITEM } from "./abilities.js";
import { listWorlds, createWorld, deleteWorld, updateWorld, touchWorld, MAX_WORLDS } from "./save.js";

const ICONS_DIR = fileURLToPath(new URL("./assets/world-icons/", import.meta.url));
const TABS = [
  { id: "news", label: "WHAT'S NEW" },
  { id: "settings", label: "SETTINGS" },
  { id: "play", label: "PLAY" },
  // { id: "multiplayer", label: "MULTIPLAYER" }, — сетевая игра пока закрыта (персонажи по id, позже — аккаунты)
  { id: "quit", label: "QUIT" },
];

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
        const e = { position: new Vec3(0, 0, 0), yaw: 0, alive: true, hurtTime: 99, deadTime: 0, scale: 1, roll: 0, tilt: 0 };
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
    if (this.tab !== "play" || !this.hero) return null;
    return { camera: this.camera, world: null, characters: this.game.models.drawList([this.hero.entity]) };
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
    const tw = Math.floor(ui.width / TABS.length);
    TABS.forEach((t, i) => ui.button("tab:" + t.id, t.label, tw * i + tw / 2, 30, tw - 8, 44, 3, this.tab === t.id));
    if (this.tab === "play") this.drawPlay(ui);
    if (this.tab === "multiplayer") this.drawMultiplayer(ui);
    const up = this.updater;
    if (up?.available) {
      const label = `UPDATE TO ${up.available.version}`;
      const w = Math.max(260, label.length * 13 + 40);
      ui.button("update", label, ui.width - 24 - w / 2, ui.height - 24 - 26, w, 52, 2, true);
    }
    if (up) ui.text(`VERSION ${up.current}`, 24, ui.height - 36, 2, th.muted);
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
      ui.button("turn:-1", "<", 40, cy, 56, 80, 4);
      ui.button("turn:1", ">", ui.width - 40, cy, 56, 80, 4);
    }
    const c = this.center;
    const ca = c && this.anim.get(c.id);
    if (c && ca) {
      const below = ca.y + ca.r + (c.saved || c.create ? 52 : 74);
      ui.button("play", c.create ? "CREATE" : c.saved ? "PLAY" : "START", ui.width / 2, below + 20, 260, 52, 3, true);
      if (!c.create) {
        // картинка мира — стрелками; удалить
        ui.button("icon:-1", "<", ui.width / 2 - 170, below + 20, 40, 40, 2);
        ui.button("icon:1", ">", ui.width / 2 + 170, below + 20, 40, 40, 2);
        ui.button("delete", "DELETE", ui.width / 2 + 290, below + 20, 140, 36, 2);
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
      if (arg === "play" || arg === "multiplayer") this.tab = arg;
      else this.actions[arg]?.();
      return;
    }
    if (kind === "turn") return this.turn(Number(arg));
    if (kind === "update") return this.actions.update?.();
    if (kind === "host") return this.worlds[0] ? this.actions.host(this.worlds[0].id) : this.actions.toast?.("CREATE A WORLD FIRST");
    if (kind === "join") return this.actions.join();
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
      onCreate: ({ name, icon, size }) => {
        createWorld({ name: name || `WORLD ${n}`, icon, size, floating: true });
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
    if (this.tab !== "play") return;
    if (e.scancode === KEYS.LEFT) this.turn(1); //   ← — центральный уходит в конец, в центр — тот, что слева
    if (e.scancode === KEYS.RIGHT) this.turn(-1); // → — обратно
    if (e.scancode === KEYS.RETURN) this.onButton("play");
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
    this.onCreate = onCreate;
  }

  get label() {
    return "создание мира";
  }

  drawUI(ui) {
    const th = ui.theme;
    widgets.drawDim(ui, 210);
    const W = 620, H = 470, x = ui.width / 2 - W / 2, y = ui.height / 2 - H / 2;
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
    ui.text("FLOATING ISLANDS: DON'T FALL OFF THE EDGE", ui.width / 2, y + 380, 1, th.muted, "center");
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
    if (kind === "create") {
      this.engine.pop();
      this.onCreate({ name: this.name.trim(), icon: this.icon, size: this.size });
      return;
    }
    this.engine.redraw();
  }
}
