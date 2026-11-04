// ============================================================
//  Экран настроек с вкладками.
//
//  Вкладки ВИДЕО, АУДИО, УПРАВЛЕНИЕ — движка: эти настройки движок сам и применяет.
//  Игра может добавить свои вкладки (например, ОБЩИЕ с видом камеры):
//
//    new SettingsScene({ tabs: [{
//      id: "general",            // = раздел в settings.json (по нему работает «Сбросить»)
//      label: "ОБЩИЕ",
//      rows: [{ id: "camera", label: "ВИД КАМЕРЫ",
//               value: () => "1-Е ЛИЦО",        // что показать
//               change: (dir) => { ... },        // нажали: dir = -1 / +1
//               arrows: false }],                // true — кнопки < >, false — одна кнопка
//      note: () => "ПОДСКАЗКА ВНИЗУ",
//    }] })
//
//  Особая строка { type: "bindings" } — все привязки клавиш в две колонки.
// ============================================================

import { Scene } from "../core/scene.js";
import { Input } from "../input/input.js";
import { drawBackground, drawDim } from "../ui/widgets.js";
import { drawWindow } from "../ui/window.js";

const LANGUAGE_NAMES = { en: "ENGLISH", ru: "РУССКИЙ" }; // названия — всегда на своём языке
export const RESOLUTIONS = [[960, 600], [1280, 720], [1440, 900], [1600, 900], [1920, 1080]];

export class SettingsScene extends Scene {
  constructor({ tabs = [] } = {}) {
    super();
    this.transparent = true; // открыли из паузы — сквозь затемнение виден мир
    this.showToasts = false; // всплывающие надписи закрыли бы заголовок окна
    this.extraTabs = tabs;
    this.tab = null;
    this.waiting = null; // действие, которое ждёт новую клавишу
  }

  enter() {
    this.tabs = [...this.extraTabs, ...this.engineTabs()];
    this.tab = this.tab || this.tabs[0].id;
  }

  get settings() {
    return this.engine.settings;
  }

  // ---------- Вкладки движка ----------

  engineTabs() {
    const e = this.engine;
    const s = this.settings.data;
    const step = (obj, key, dir, by, min, max) => (obj[key] = Math.max(min, Math.min(max, obj[key] + dir * by)));
    const onOff = (v) => (v ? "ON" : "OFF");
    return [
      {
        id: "video",
        label: "VIDEO",
        rows: [
          {
            id: "res", label: "RESOLUTION", arrows: true,
            value: () => `${s.video.width}X${s.video.height}`,
            change: (dir) => {
              // Только разрешения, которые помещаются на экран
              const m = e.window.display?.usable;
              const fit = RESOLUTIONS.filter(([w, h]) => !m || (w <= m.width && h <= m.height));
              const list = fit.length ? fit : RESOLUTIONS.slice(0, 1);
              const i = list.findIndex(([w, h]) => w === s.video.width && h === s.video.height);
              [s.video.width, s.video.height] = list[(Math.max(i, 0) + dir + list.length) % list.length];
              e.applySettings("resolution");
            },
          },
          { id: "fullscreen", label: "FULLSCREEN", value: () => onOff(s.video.fullscreen),
            change: () => { s.video.fullscreen = !s.video.fullscreen; e.applySettings("fullscreen"); } },
          { id: "bright", label: "BRIGHTNESS", arrows: true, value: () => `${s.video.brightness}%`,
            change: (dir) => { step(s.video, "brightness", dir, 10, 50, 150); e.applySettings("brightness"); } },
          { id: "vsync", label: "VSYNC", value: () => onOff(s.video.vsync),
            change: () => { s.video.vsync = !s.video.vsync; e.applySettings("vsync"); } },
        ],
        note: () => "IN FULLSCREEN, RESOLUTION APPLIES AFTER LEAVING IT",
      },
      {
        id: "interface",
        label: "INTERFACE",
        rows: [
          { id: "language", label: "LANGUAGE", arrows: true, value: () => LANGUAGE_NAMES[s.interface.language] || s.interface.language.toUpperCase(),
            change: (dir) => {
              const list = e.locale.languages;
              const i = Math.max(0, list.indexOf(s.interface.language));
              s.interface.language = list[(i + dir + list.length) % list.length];
              e.applySettings("language");
            } },
          { id: "fps", label: "SHOW FPS", value: () => onOff(s.interface.showFps),
            change: () => { s.interface.showFps = !s.interface.showFps; e.applySettings("fps"); } },
        ],
      },
      {
        id: "audio",
        label: "AUDIO",
        rows: [
          { id: "master", label: "MASTER VOLUME", arrows: true, value: () => `${s.audio.master}%`,
            change: (dir) => { step(s.audio, "master", dir, 10, 0, 100); e.applySettings("audio"); } },
          { id: "effects", label: "EFFECTS", arrows: true, value: () => `${s.audio.effects}%`,
            change: (dir) => { step(s.audio, "effects", dir, 10, 0, 100); e.applySettings("audio"); } },
          { id: "music", label: "MUSIC", arrows: true, value: () => `${s.audio.music ?? 60}%`,
            change: (dir) => { step(s.audio, "music", dir, 10, 0, 100); e.applySettings("audio"); } },
          { id: "muteUnfocused", label: "MUTE WHEN NOT IN FOCUS", value: () => onOff(s.audio.muteUnfocused !== false),
            change: () => { s.audio.muteUnfocused = s.audio.muteUnfocused === false; if (!s.audio.muteUnfocused) e.sound.setFocused?.(true); } },
          { id: "voices", label: "VOICES", arrows: true, value: () => `${s.audio.voices ?? 100}%`,
            change: (dir) => { step(s.audio, "voices", dir, 10, 0, 100); e.applySettings("audio"); } },
        ],
      },
      {
        id: "controls",
        label: "CONTROLS",
        rows: [
          { id: "sens", label: "MOUSE SENSITIVITY", arrows: true, value: () => String(s.controls.sensitivity),
            change: (dir) => { step(s.controls, "sensitivity", dir, 1, 1, 10); e.applySettings("mouse"); } },
          { id: "aimSens", label: "AIM SENSITIVITY", arrows: true, value: () => `${s.controls.aimSensitivity ?? 100}%`,
            change: (dir) => { s.controls.aimSensitivity ??= 100; step(s.controls, "aimSensitivity", dir, 10, 20, 200); } },
          { id: "invert", label: "INVERT MOUSE", value: () => onOff(s.controls.invertY),
            change: () => { s.controls.invertY = !s.controls.invertY; } },
          { id: "padSens", label: "GAMEPAD SENSITIVITY", arrows: true, value: () => String(s.controls.padSensitivity ?? 5),
            change: (dir) => { s.controls.padSensitivity ??= 5; step(s.controls, "padSensitivity", dir, 1, 1, 10); } },
          { type: "bindings" },
        ],
      },
    ];
  }

  // ---------- Рисование ----------
  // Всё — внутри окна (engine/ui/window.js); координаты считаются от области содержимого box

  drawUI(ui) {
    const th = ui.theme;
    if (this.engine.worldVisibleUnder(this)) drawDim(ui, 190);
    else drawBackground(ui);
    const box = drawWindow(ui, { title: "SETTINGS", width: 1000, height: 640, closeId: "back" });

    // Вкладки
    const n = this.tabs.length;
    const tabW = Math.min(220, Math.floor((box.w - (n - 1) * 10) / n));
    this.tabs.forEach((t, i) => ui.button("tab:" + t.id, t.label, box.cx + (i - (n - 1) / 2) * (tabW + 10), box.y + 18, tabW, 40, 3, this.tab === t.id));

    // Строки: подпись слева, переключатель справа. Не влезают в окно — прокрутка колесом (полоска справа);
    // видно только то, что целиком внутри области между вкладками и кнопками внизу
    const tab = this.tabs.find((t) => t.id === this.tab);
    const ctrlX = box.x + box.w - 160;
    const top = box.y + 62, bottomEdge = box.y + box.h - 84; // область строк
    const ROW = 50;
    const bindH = this.bindingsHeight();
    const content = tab.rows.reduce((h, r) => h + (r.type === "bindings" ? bindH : ROW), 0);
    this.view = { top, bottom: bottomEdge, max: Math.max(0, content - (bottomEdge - top)) };
    this.scrollOf ||= {};
    const off = (this.scrollOf[this.tab] = Math.max(0, Math.min(this.view.max, this.scrollOf[this.tab] || 0)));
    const inside = (y0, h) => y0 >= top - 1 && y0 + h <= bottomEdge + 1;
    let y = top - off; // верх текущей строки
    for (const row of tab.rows) {
      if (row.type === "bindings") {
        this.drawBindings(ui, box, y + 16, inside);
        y += bindH;
        continue;
      }
      if (inside(y, ROW)) {
        const cy = y + 20;
        ui.text(row.label, box.x + 10, cy - 10, 3, th.text);
        if (row.arrows) {
          ui.button(`row:${row.id}:-1`, "<", ctrlX - 110, cy, 44, 40);
          ui.text(row.value(), ctrlX, cy - 10, 3, th.text, "center");
          ui.button(`row:${row.id}:1`, ">", ctrlX + 110, cy, 44, 40);
        } else {
          ui.button(`row:${row.id}:1`, row.value(), ctrlX, cy, 264, 40);
        }
      }
      y += ROW;
    }
    // полоска прокрутки: сколько видно и где мы
    if (this.view.max > 0) {
      const h = bottomEdge - top, bx = box.x + box.w + 4;
      const knob = Math.max(30, (h * h) / (h + this.view.max));
      const ky = top + ((h - knob) * off) / this.view.max;
      ui.rect(bx, top, 6, h, th.window.border, 120);
      ui.rect(bx, Math.round(ky), 6, Math.round(knob), th.accent, 255);
      if (off < this.view.max) ui.text("MORE BELOW - SCROLL", box.cx, bottomEdge + 2, 1, th.muted, "center");
    }

    const bottom = box.y + box.h;
    const note = this.waiting ? "PRESS A KEY OR MOUSE BUTTON" : tab.note?.();
    if (note) ui.text(note, box.cx, bottom - 66, 2, this.waiting ? th.warn : th.muted, "center");
    ui.button("reset", "RESET", box.cx - 140, bottom - 22, 250, 44);
    ui.button("back", "BACK", box.cx + 140, bottom - 22, 250, 44);
  }

  // Высота блока привязок (три колонки по 32 точки на строку) — для прокрутки
  bindingsHeight() {
    return Math.ceil(Object.keys(this.engine.actionLabels).length / 3) * 32 + 16;
  }

  // Колесо: прокрутить строки вкладки
  onWheel({ dy }) {
    if (!this.view?.max) return false;
    this.scrollOf ||= {};
    this.scrollOf[this.tab] = Math.max(0, Math.min(this.view.max, (this.scrollOf[this.tab] || 0) - dy * 40));
    return true;
  }

  // Привязки — в три колонки: подпись и кнопка с клавишей. inside(y, h) — видна ли строка (прокрутка)
  drawBindings(ui, box, y, inside = () => true) {
    const labels = this.engine.actionLabels;
    const bindings = this.settings.data.controls.bindings;
    const actions = Object.keys(labels);
    const cols = 3;
    const perCol = Math.ceil(actions.length / cols);
    const colW = Math.floor(box.w / cols);
    const btnW = 116;
    actions.forEach((action, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const yy = y + row * 32;
      if (!inside(yy - 14, 28)) return;
      const lx = box.x + col * colW;
      ui.text(labels[action], lx, yy - 7, 2, ui.theme.text);
      const waiting = this.waiting === action;
      const key = waiting ? "..." : Input.label(bindings[action]);
      ui.button("bind:" + action, key, lx + colW - btnW / 2 - 14, yy, btnW, 28, 2, waiting);
    });
  }

  // ---------- Нажатия ----------

  onButton(id) {
    const [kind, arg, dir] = id.split(":");
    if (kind === "tab") this.tab = arg;
    if (kind === "bind") this.waiting = arg; // следующая клавиша или кнопка мыши станет привязкой
    if (kind === "row") {
      const tab = this.tabs.find((t) => t.id === this.tab);
      tab.rows.find((r) => r.id === arg).change(Number(dir));
      this.settings.save();
    }
    if (kind === "reset") {
      this.settings.reset(this.tab); // вкладка называется как раздел настроек
      this.engine.applySettings("all");
    }
    if (kind === "back") return this.engine.pop();
    this.engine.redraw();
  }

  // Ждём новую привязку — это нажатие наше, дальше его не пускаем
  onRawPress(event) {
    if (!this.waiting) return false;
    const binding = Input.bindingFromEvent(event);
    if (!binding) return true;
    const bindings = this.settings.data.controls.bindings;
    // Клавиша уже занята другим действием — меняем их местами
    const other = Object.keys(bindings).find((a) => a !== this.waiting && bindings[a] === binding);
    if (other) bindings[other] = bindings[this.waiting];
    bindings[this.waiting] = binding;
    this.waiting = null;
    this.settings.save();
    this.engine.sound.play("click");
    this.engine.redraw();
    return true;
  }

  onPress(actions) {
    if (actions.includes("pause")) this.engine.pop();
  }
}
