// ============================================================
//  Engine — то, с чего начинается любая игра на движке.
//
//  Создаёт и держит: окно, видеокарту (рендерер), интерфейс, ввод, мышь, звук, настройки.
//  Крутит игровой цикл и стопку сцен (engine/core/scene.js).
//  Применяет настройки движка: окно, полный экран, яркость, vsync, громкость, мышь.
//
//    const engine = await Engine.create({ title: "МОЯ ИГРА", settingsFile, defaults, actionLabels });
//    engine.setScene(new MyMenu());
//    engine.run();
// ============================================================

import { Updater } from "./updates.js";
import "./env.js"; // первым: подсказки для SDL до её загрузки
import sdl from "@kmamal/sdl";
import path from "node:path";
import { Journal, Watchdog } from "./watchdog.js";
import { SettingsStore, deepMerge } from "./settings.js";
import { GPURenderer } from "../graphics/gpu-renderer.js";
import { UI } from "../ui/ui.js";
import { makeTheme } from "../ui/theme.js";
import { drawToast } from "../ui/widgets.js";
import { Input } from "../input/input.js";
import { MouseLook } from "../input/mouse.js";
import { Sound } from "../audio/sound.js";

// Настройки, которые есть у любой игры на движке. Игра добавляет свои (deepMerge).
export const ENGINE_DEFAULTS = {
  version: 1,
  video: { width: 1280, height: 720, fullscreen: false, brightness: 100, vsync: true },
  audio: { master: 80, effects: 100 },
  controls: {
    sensitivity: 5, // 1–10
    aimSensitivity: 100, // в прицеле, % от того, что задаёт оружие (engine/input/aim.js)
    invertY: false,
    bindings: {
      forward: "key:W",
      back: "key:S",
      left: "key:A",
      right: "key:D",
      run: "key:LSHIFT",
      jump: "key:SPACE",
      primary: "mouse:LEFT", //    основное действие способности (ударить, выстрелить, поставить)
      secondary: "mouse:RIGHT", // дополнительное (убрать блок...)
      ability1: "key:1", //        ячейки панели способностей (engine/world/abilities.js)
      ability2: "key:2",
      ability3: "key:3",
      ability4: "key:4",
      ability5: "key:5",
      pause: "key:ESCAPE",
      fullscreen: "key:F11",
      skill1: "key:Q", //          навыки оружия в руках (Ability.skills): у оружия дальнего боя — наклоны,
      skill2: "key:E", //          у других — свои приёмы
      shop: "key:B", //            магазин (engine/economy/shop.js)
      reload: "key:R", //          перезарядка оружия с обоймой (RangedAttack magazine)
      drop: "key:Q", //            в инвентаре: выбросить предмет из ячейки под мышью
    },
  },
};

// Как действия движка называются в настройках
export const ENGINE_ACTION_LABELS = {
  forward: "ВПЕРЁД",
  back: "НАЗАД",
  left: "ВЛЕВО",
  right: "ВПРАВО",
  run: "БЕГ",
  jump: "ПРЫЖОК",
  primary: "ДЕЙСТВИЕ",
  secondary: "ДОП. ДЕЙСТВИЕ",
  ability1: "СПОСОБНОСТЬ 1",
  ability2: "СПОСОБНОСТЬ 2",
  ability3: "СПОСОБНОСТЬ 3",
  ability4: "СПОСОБНОСТЬ 4",
  ability5: "СПОСОБНОСТЬ 5",
  pause: "ПАУЗА",
  fullscreen: "ПОЛНЫЙ ЭКРАН",
  skill1: "НАВЫК ОРУЖИЯ 1",
  skill2: "НАВЫК ОРУЖИЯ 2",
  reload: "ПЕРЕЗАРЯДКА",
  shop: "МАГАЗИН",
  drop: "ВЫБРОСИТЬ",
};

export class Engine {
  // Видеокарту «открываем» асинхронно, поэтому create(), а не new
  // logFile — журнал (по умолчанию log.txt рядом с настройками). Его стоит прислать, если игра зависла.
  // theme — своя тема интерфейса: только то, что меняешь (engine/ui/theme.js)
  // changelog — файл записей обновлений (CHANGELOG.json): движок следит за ним и сообщает о новой версии
  static async create({ title = "VOID", settingsFile, defaults = {}, actionLabels = {}, logFile, theme = {}, changelog = null }) {
    const journal = new Journal(logFile || path.join(path.dirname(settingsFile), "log.txt"));
    const settings = new SettingsStore(settingsFile, deepMerge(ENGINE_DEFAULTS, defaults));
    const v = settings.data.video;
    const window = sdl.video.createWindow({
      title,
      width: v.width,
      height: v.height,
      fullscreen: v.fullscreen,
      resizable: true,
      webgpu: true,
    });
    const renderer = await GPURenderer.create(window, { vsync: v.vsync, brightness: v.brightness / 100 });
    journal.write(`окно ${window.width}x${window.height} (пикселей ${window.pixelWidth}x${window.pixelHeight}), видеокарта готова`);
    const engine = new Engine({ window, renderer, settings, actionLabels, journal, theme });
    if (changelog) {
      // Новая версия на диске: сообщаем (на любой сцене) и перерисовываем — меню покажет кнопку
      engine.updater = new Updater({
        file: changelog,
        onAvailable: (u) => {
          engine.log(`доступно обновление ${u.available.version}`);
          engine.toast(`ОБНОВЛЕНИЕ ${u.available.version}: ОБНОВИТЬ МОЖНО В ГЛАВНОМ МЕНЮ`, 6000);
          engine.redraw();
        },
      });
      journal.write(`версия ${engine.updater.current}${engine.updater.updatedFrom ? " (обновились с " + engine.updater.updatedFrom + ")" : ""}`);
    }
    return engine;
  }

  constructor({ window, renderer, settings, actionLabels, journal, theme = {} }) {
    this.journal = journal;
    this.watchdog = null; // запускается в run()
    this.window = window;
    this.renderer = renderer;
    this.settings = settings;
    this.actionLabels = { ...ENGINE_ACTION_LABELS, ...actionLabels };
    this.ui = new UI(window.width, window.height);
    this.ui.theme = makeTheme(theme);
    this.input = new Input(window, settings.data.controls.bindings);
    this.mouse = new MouseLook(window);
    this.sound = new Sound();

    this.scenes = []; // стопка сцен: последняя — сверху
    this.toastState = null; // всплывающая надпись: { text, until }
    this.running = false;
    this.closed = false;
    this.onStats = null; // игра может показывать FPS: engine.onStats = ({ fps, cpu }) => ...

    // Масштаб экрана: пикселей в одной точке (на Retina — 2). См. realSize()
    this.pixelRatio = window.pixelWidth / window.width;

    this.applySettings("audio");
    this.applySettings("mouse");
    this.listen();

    // Любая непойманная ошибка — сначала в журнал, потом как обычно (с текстом в терминале)
    process.on("uncaughtException", (e) => {
      this.log("ОШИБКА: " + (e.stack || e));
      console.error(e);
      process.exit(1);
    });
  }

  // Записать строчку в журнал (log.txt). Игры тоже могут: engine.log("сохранено")
  log(text) {
    this.journal.write(text);
  }

  // Этап кадра — для сторожа: если зависнем, он напишет, на каком этапе
  phase(n) {
    this.watchdog?.phase(n);
  }

  // ---------- Сцены ----------

  get scene() {
    return this.scenes[this.scenes.length - 1] || null;
  }

  // Положить сцену сверху (пауза поверх мира)
  push(scene) {
    this.log("сцена + " + scene.label);
    scene.engine = this;
    this.scenes.push(scene);
    scene.enter();
    this.sceneChanged();
  }

  // Убрать верхнюю сцену (закрыли паузу — вернулись в мир)
  pop() {
    const scene = this.scenes.pop();
    if (scene) this.log("сцена - " + scene.label);
    scene?.exit();
    this.sceneChanged();
    return scene;
  }

  // Убрать все сцены и начать с этой (из игры — в главное меню)
  setScene(scene) {
    this.phase(5);
    this.log("сцены: всё убрать");
    while (this.scenes.length) {
      const old = this.scenes.pop();
      this.log("сцена - " + old.label);
      old.exit();
    }
    this.push(scene);
    this.phase(0);
  }

  sceneChanged() {
    this.input.clear(); // зажатые клавиши не «протекают» в новую сцену
    if (this.scene?.captureMouse) this.mouse.capture();
    else this.mouse.release();
    this.redraw();
  }

  // Что показывать в 3D: ищем сверху вниз, пока сцены прозрачные
  findView(from = this.scenes.length - 1) {
    for (let i = from; i >= 0; i--) {
      const view = this.scenes[i].view();
      if (view) return view;
      if (!this.scenes[i].transparent) return null;
    }
    return null;
  }

  // Виден ли мир под этой сцены (чтобы решить: затемнение или свой фон)
  worldVisibleUnder(scene) {
    const i = this.scenes.indexOf(scene);
    return i > 0 && this.findView(i - 1) !== null;
  }

  // ---------- Интерфейс ----------

  // «Интерфейс поменялся — перерисуй». Сам рисунок делается не здесь, а один раз в начале
  // ближайшего кадра (drawUI): если мышь за миг пересекла пять кнопок, рисуем один раз,
  // а не пять, и картинка интерфейса не меняется посреди отправки на видеокарту.
  redraw() {
    this.needsRedraw = true;
    this.wake();
  }

  // Нарисовать интерфейс верхней сцены прямо сейчас
  drawUI() {
    this.needsRedraw = false;
    this.ui.begin();
    this.scene?.drawUI(this.ui);
    if (this.toastState && this.scene?.showToasts !== false) drawToast(this.ui, this.toastState.text);
  }

  // Кнопки интерфейса должны быть свежими, прежде чем проверять, куда попала мышь
  ensureUI() {
    if (this.needsRedraw) this.drawUI();
  }

  toast(text, ms = 1500) {
    this.toastState = { text, until: performance.now() + ms };
    this.redraw();
  }

  // ---------- Настройки движка ----------

  // what — что поменялось: "resolution", "fullscreen", "brightness", "vsync", "audio", "mouse" или "all"
  applySettings(what = "all") {
    this.log("настройки: применить " + what);
    const s = this.settings.data;
    const all = what === "all";
    if (all || what === "fullscreen") this.applyFullscreen();
    if ((all || what === "resolution") && !this.window.fullscreen) this.applyWindowSize();
    if (all || what === "brightness") this.renderer.brightness = s.video.brightness / 100;
    if ((all || what === "vsync") && this.renderer.vsync !== s.video.vsync) this.renderer.setVsync(s.video.vsync);
    if (all || what === "audio") this.sound.setVolume((s.audio.master / 100) * (s.audio.effects / 100));
    if (all || what === "mouse") this.mouse.sensitivity = 0.0005 * s.controls.sensitivity;
    this.input.bindings = s.controls.bindings; // после «Сбросить» это новый объект
  }

  toggleFullscreen() {
    this.settings.data.video.fullscreen = !this.window.fullscreen; // от того, что на экране на самом деле
    this.settings.save();
    this.applySettings("fullscreen");
    this.redraw();
  }

  applyFullscreen() {
    const want = this.settings.data.video.fullscreen;
    if (want === this.window.fullscreen) return;
    this.window.setFullscreen(want);
    if (!want) this.applyWindowSize(); // вышли — возвращаем размер из настроек
    this.syncSize();
  }

  // Обычное окно, но не больше рабочей области экрана (иначе система его ужмёт)
  applyWindowSize() {
    const s = this.settings.data.video;
    const u = this.window.display?.usable;
    this.window.setSize(u ? Math.min(s.width, u.width) : s.width, u ? Math.min(s.height, u.height) : s.height);
    this.syncSize();
  }

  // Ловушка: после setSize библиотека пишет в window.width ЗАПРОШЕННЫЙ размер, даже если
  // система его не дала. window.pixelWidth честный — его спрашивают у системы.
  // Поэтому настоящий размер в точках = пиксели / масштаб экрана.
  realSize() {
    const w = this.window;
    return { width: Math.round(w.pixelWidth / this.pixelRatio), height: Math.round(w.pixelHeight / this.pixelRatio) };
  }

  // Интерфейс того же размера, что окно на самом деле, — иначе мышь «промахивается» по кнопкам
  syncSize() {
    const { width, height } = this.realSize();
    if (this.ui.width !== width || this.ui.height !== height) {
      this.ui.resize(width, height);
      this.redraw();
    }
  }

  // ---------- Ввод ----------

  listen() {
    const w = this.window;

    w.on("keyDown", (e) => {
      if (e.repeat) return; // автоповтор при удержании не считаем
      this.phase(4);
      this.press({ scancode: e.scancode });
      this.scene?.onKey(e);
      this.phase(0);
    });

    w.on("mouseButtonDown", (e) => {
      const scene = this.scene;
      if (!scene) return;
      this.phase(4);
      if (scene.captureMouse) {
        if (this.mouse.captured) this.press({ button: e.button });
      } else if (!scene.onRawPress({ button: e.button })) { // onRawPress — например, ждём привязку
        this.ensureUI();
        const id = this.ui.hitTest(e.x, e.y); // курсор свободен — это нажатие на кнопку интерфейса
        if (id) {
          this.log(`кнопка «${id}» (${scene.label})`);
          this.sound.play("click");
          scene.onButton(id);
        }
      }
      this.phase(0);
    });

    w.on("mouseMove", (e) => {
      // Подсветка кнопки под курсором (когда курсор свободен)
      if (this.mouse.captured) return;
      this.ensureUI();
      // trackMouse — сцене нужен каждый сдвиг (например, предмет «в руке» едет за курсором)
      if (this.ui.setMouse(e.x, e.y) || this.scene?.trackMouse) this.redraw();
    });

    w.on("blur", () => {
      this.log("окно потеряло фокус");
      this.scene?.onBlur();
    });
    w.on("focus", () => this.log("окно в фокусе"));

    w.on("resize", (e) => {
      this.log(`размер окна ${e.width}x${e.height} (пикселей ${e.pixelWidth}x${e.pixelHeight})`);
      this.pixelRatio = e.pixelWidth / e.width; // в событии размеры честные
      this.renderer.resize();
      this.syncSize();
      this.redraw();
    });

    w.on("close", () => {
      this.log("окно закрывают");
      this.quit(false);
    });
  }

  // Нажатие клавиши или кнопки мыши -> действия по привязкам -> верхней сцене
  press(event) {
    const scene = this.scene;
    if (!scene || scene.onRawPress(event)) return;
    const actions = this.input.actionsFor(event);
    if (actions.length) this.log(`действия: ${actions.join(", ")} (${scene.label})`);
    if (actions.includes("fullscreen")) this.toggleFullscreen();
    scene.onPress(actions, event);
  }

  // ---------- Цикл ----------

  run() {
    this.watchdog = new Watchdog({ logFile: this.journal.file });
    this.log("цикл запущен, сторож следит");
    this.running = true;
    this.lastTime = performance.now();
    this.frames = 0;
    this.workTime = 0;
    this.statsTimer = this.lastTime;
    this.settle = 0; //   сколько ещё кадров нарисовать после изменения (см. tick)
    this.timer = null; //  запланированный следующий кадр
    this.timerDelay = 0;
    this.redraw();
    this.frame();
  }

  // Запланировать следующий кадр: 0 — сразу, иначе через delay мс
  schedule(delay) {
    this.timerDelay = delay;
    this.timer = delay === 0 ? setImmediate(() => this.frame()) : setTimeout(() => this.frame(), delay);
  }

  // Что-то поменялось, а цикл «спит» (меню, 50 мс) — разбудить, чтобы показать сразу
  wake() {
    if (!this.running || !this.timer || this.timerDelay < 50) return;
    clearTimeout(this.timer);
    this.schedule(0);
  }

  // Один шаг цикла. Ошибку в кадре пишем в терминал и идём дальше:
  // иначе цикл молча остановится, картинка «замёрзнет», а окно начнёт показывать мусор.
  frame() {
    this.timer = null;
    if (!this.running || this.window.destroyed) return;
    let busy = false;
    this.watchdog.beat(); // «я жив»
    try {
      busy = this.tick();
    } catch (e) {
      console.error("Ошибка в кадре:", e);
      this.log("ошибка в кадре: " + (e.stack || e));
    }
    this.phase(0);
    // Мир живёт — следующий кадр сразу; только что что-то поменялось — через 16 мс;
    // меню и пауза без изменений — проверяем раз в 50 мс (компьютер почти отдыхает)
    this.schedule(busy === true ? 0 : busy === "soon" ? 16 : 50);
  }

  // Вернёт true — нужен следующий кадр сразу (мир живёт), "soon" — скоро, false — можно отдыхать
  tick() {
    const start = performance.now();
    const dt = Math.min((start - this.lastTime) / 1000, 0.1); // секунд с прошлого кадра (не больше 0.1)
    this.lastTime = start;
    this.syncSize();

    if (this.toastState && start > this.toastState.until) {
      this.toastState = null;
      this.redraw();
    }

    const scene = this.scene;
    if (!scene) return false;

    // Меню, пауза, настройки: ничего не движется — рисуем, только если интерфейс поменялся.
    // После изменения рисуем ещё пару кадров подряд: у окна несколько буферов картинки
    // (пока один на экране, в другой рисуем), и свежая картинка должна попасть в каждый —
    // иначе на экран может вылезти старый буфер (меню «телепортируется» или пропадает).
    if (!scene.realtime) {
      this.mouse.consume(); // выбрасываем случайные движения мыши
      this.ensureUI();
      if (this.ui.dirty) this.settle = 3;
      if (this.settle > 0) {
        this.render();
        this.settle--;
      }
      this.frames = 0;
      this.workTime = 0;
      this.statsTimer = start;
      return this.settle > 0 ? "soon" : false;
    }

    this.phase(1);
    scene.update(dt);
    this.render();
    this.workTime += performance.now() - start;

    // Раз в секунду — статистика
    this.frames++;
    const now = performance.now();
    if (now - this.statsTimer >= 1000) {
      const fps = Math.round((this.frames * 1000) / (now - this.statsTimer));
      this.onStats?.({ fps, cpu: this.workTime / this.frames });
      this.frames = 0;
      this.workTime = 0;
      this.statsTimer = now;
    }
    return true;
  }

  render() {
    this.ensureUI(); // интерфейс, который просили перерисовать за этот кадр, — рисуем сейчас
    const v = this.findView() || {};
    this.phase(2);
    this.renderer.render({
      camera: v.camera || null,
      world: v.world || null,
      ghost: v.ghost || null,
      characters: v.characters || [],
      blur: v.blur || null, // размытие вокруг круга (оптика) — см. GPURenderer.render
      viewModels: v.viewModels || [],
      ui: this.ui,
    });
    this.phase(3);
    this.renderer.present();
  }

  // Закрыть всё. Сцены получают onQuit — шанс сохраниться.
  quit(exit = true) {
    if (this.closed) return;
    this.closed = true;
    this.log("выход");
    this.watchdog?.stop(); // закрываемся сами — сторож больше не нужен
    this.updater?.stop();
    for (let i = this.scenes.length - 1; i >= 0; i--) this.scenes[i].onQuit();
    this.running = false;
    this.sound.close();
    this.renderer.destroy();
    if (exit) process.exit(0);
  }
}
