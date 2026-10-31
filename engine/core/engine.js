// ============================================================
//  Engine — то, с чего начинается любая игра на движке.
//
//  Создаёт и держит: окно, видеокарту (рендерер), интерфейс, ввод, мышь, звук, настройки.
//  Крутит игровой цикл и стопку сцен (engine/core/scene.js).
//  Применяет настройки движка: окно, полный экран, яркость, vsync, громкость, мышь.
//
//    const engine = await Engine.create({ title: "МОЯ ИГРА", settingsFile, defaults, actionLabels });
//    render: { fadeDist: 66 } — необязательно: настройки рендерера (дальность прорисовки и т. п.)
//    engine.setScene(new MyMenu());
//    engine.run();
// ============================================================

import { Updater } from "./updates.js";
import "./env.js"; // первым: подсказки для SDL до её загрузки
import sdl from "@kmamal/sdl";
import { profiler } from "./profiler.js";
import { FixedStep } from "./fixed-step.js";
import { DevConsole, num } from "./console.js";
import { ConsoleScene } from "../scenes/console-scene.js";
import { drawPerfPanel } from "../ui/perf-panel.js";

const BACKGROUND = { background: true }; // опции шага мира под «живым» окном (один объект — без мусора)

// Системы профайлера уровня движка (верхний уровень кадра): обновление сцены (внутри — системы игры),
// интерфейс, сборка того, что рисовать, отправка на видеокарту и показ кадра
const PROF = {
  update: profiler.register("UPDATE"),
  tick: null, // ниже: тики логики внутри UPDATE (calls — тиков за кадр)
  ui: profiler.register("UI"),
  view: profiler.register("VIEW"),
  render: profiler.register("RENDER"),
  present: profiler.register("PRESENT"),
};
PROF.tick = profiler.register("TICK", PROF.update);
import path from "node:path";
import { Journal, Watchdog } from "./watchdog.js";
import { SettingsStore, deepMerge } from "./settings.js";
import { GPURenderer } from "../graphics/gpu-renderer.js";
import { locale } from "../ui/i18n.js";
import { UI } from "../ui/ui.js";
import { makeTheme } from "../ui/theme.js";
import { drawToast, drawTechPanel } from "../ui/widgets.js";
import { Input } from "../input/input.js";
import { MouseLook } from "../input/mouse.js";
import { Sound } from "../audio/sound.js";

// Настройки, которые есть у любой игры на движке. Игра добавляет свои (deepMerge).
export const ENGINE_DEFAULTS = {
  version: 1,
  video: { width: 1280, height: 720, fullscreen: false, brightness: 100, vsync: true },
  interface: { language: "en", showFps: false }, // язык надписей (engine/ui/i18n.js), счётчик FPS слева сверху
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
      techPanel: "key:F3", //      тех. панель поверх игры (как F3 в Minecraft): кадры, память, сцена — techLines()
      skill1: "key:Q", //          навыки оружия в руках (Ability.skills): у оружия дальнего боя — наклоны,
      skill2: "key:E", //          у других — свои приёмы
      shop: "key:B", //            магазин (engine/economy/shop.js)
      reload: "key:R", //          перезарядка оружия с обоймой (RangedAttack magazine)
      drop: "key:Q", //            в инвентаре: выбросить предмет из ячейки под мышью
      ultimate: "key:X", //        ультимейт (engine/combat/ultimate.js)
      help: "key:F1", //           держать — что умеют атаки и скиллы (widgets.drawHelpOverlay)
      console: "key:GRAVE", //     консоль разработчика (` / ~), как в Dota 2 / Deadlock / Minecraft
    },
  },
};

// Как действия движка называются в настройках
export const ENGINE_ACTION_LABELS = {
  forward: "FORWARD",
  back: "BACK",
  left: "LEFT",
  right: "RIGHT",
  run: "RUN",
  jump: "JUMP",
  primary: "ACTION",
  secondary: "ALT ACTION",
  ability1: "ABILITY 1",
  ability2: "ABILITY 2",
  ability3: "ABILITY 3",
  ability4: "ABILITY 4",
  ability5: "ABILITY 5",
  pause: "PAUSE",
  fullscreen: "FULLSCREEN",
  techPanel: "TECH PANEL",
  skill1: "WEAPON SKILL 1",
  skill2: "WEAPON SKILL 2",
  reload: "RELOAD",
  shop: "SHOP",
  drop: "DROP",
  ultimate: "ULTIMATE",
  help: "ABILITIES INFO",
  console: "CONSOLE",
};

export class Engine {
  // Видеокарту «открываем» асинхронно, поэтому create(), а не new
  // logFile — журнал (по умолчанию log.txt рядом с настройками). Его стоит прислать, если игра зависла.
  // theme — своя тема интерфейса: только то, что меняешь (engine/ui/theme.js)
  // changelog — файл записей обновлений (CHANGELOG.json): движок следит за ним и сообщает о новой версии
  static async create({ title = "VOID", settingsFile, defaults = {}, actionLabels = {}, logFile, theme = {}, changelog = null, render = {} }) {
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
    const renderer = await GPURenderer.create(window, { ...render, vsync: v.vsync, brightness: v.brightness / 100 }); // render — свои настройки игры (fadeDist — дальность прорисовки)
    journal.write(`окно ${window.width}x${window.height} (пикселей ${window.pixelWidth}x${window.pixelHeight}), видеокарта готова: ${renderer.adapterName}${renderer.gpuFlags.length ? ` [${renderer.gpuFlags.join(", ")}]` : ""}`);
    const engine = new Engine({ window, renderer, settings, actionLabels, journal, theme });
    if (changelog) {
      // Новая версия на диске: сообщаем (на любой сцене) и перерисовываем — меню покажет кнопку
      engine.updater = new Updater({
        file: changelog,
        onAvailable: (u) => {
          engine.log(`доступно обновление ${u.available.version}`);
          engine.toast(`UPDATE ${u.available.version}: INSTALL FROM THE MAIN MENU`, 6000);
          engine.redraw();
        },
      });
      journal.write(`версия ${engine.updater.current}${engine.updater.updatedFrom ? " (обновились с " + engine.updater.updatedFrom + ")" : ""}`);
    }
    return engine;
  }

  // tickRate — тиков логики в секунду (сцены с fixedUpdate; см. FixedStep). Можно поднять (128) для сложной игры
  constructor({ window, renderer, settings, actionLabels, journal, theme = {}, tickRate = 60 }) {
    this.fixed = new FixedStep({ rate: tickRate });
    this.timeScale = 1; // скорость времени мира (консоль: timescale 0.25 — замедление, 2 — ускорение)
    this.console = new DevConsole({ log: (t) => this.log(t) });
    this.registerConsole();
    this.tickScene = null; // кому идут тики этого кадра (и с какими опциями) — одна функция на всё время, без мусора
    this.tickOpts = undefined;
    this.runTick = (dt) => {
      profiler.begin(PROF.tick);
      this.tickScene.fixedUpdate(dt, this.tickOpts);
      profiler.end(PROF.tick);
    };
    this.journal = journal;
    this.watchdog = null; // запускается в run()
    this.profiler = profiler; // сколько времени за кадр у каждой системы (F3); общий, выключен, пока не нужен
    profiler.statsEvery = 500; //  цифры на странице F3 — дважды в секунду
    profiler.onDump = (lines) => this.dumpProfile(lines); // много рывков — срез в журнал сам
    this.profiler.hitchContext = () => this.scene?.hitchContext?.() ?? this.liveBelow()?.hitchContext?.() ?? null; // что было в игре в момент рывка
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
    this.locale = locale; // языки интерфейса: engine.locale.add("ru", словарь) — engine/ui/i18n.js
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

  // Мир под «живыми» окнами (scene.live): первая сцена с realtime под ними, иначе null
  liveBelow() {
    for (let i = this.scenes.length - 2; i >= 0; i--) {
      const s = this.scenes[i];
      if (s.realtime) return s;
      if (!s.live) return null;
    }
    return null;
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
    // Счётчик кадров слева сверху (настройки → INTERFACE → SHOW FPS) — только в живой сцене
    if (this.settings.data.interface?.showFps && this.scene?.realtime && this.fps) {
      this.ui.rect(6, 6, 96, 22, [10, 12, 18], 170);
      this.ui.text(`FPS ${this.fps}`, 12, 10, 2, this.fps >= 50 ? [120, 220, 130] : this.fps >= 30 ? [240, 196, 80] : [255, 90, 80]);
    }
    if (this.techPanel) this.drawTechPanel();
    if (this.toastState && this.scene?.showToasts !== false) drawToast(this.ui, this.toastState.text);
  }

  // Тех. панель (F3) — поверх всего, слева сверху, как в Minecraft: движок — кадры, время кадра, память,
  // видеокарта; сцена добавляет своё — techLines() (берём у верхней сцены, у которой он есть: мир под окнами)
  drawTechPanel() {
    const y0 = this.settings.data.interface?.showFps ? 32 : 6;
    if (this.techPanel === 2) return drawPerfPanel(this.ui, profiler, { x: 6, y: y0, fps: this.fps });
    const m = this.memory || process.memoryUsage();
    const mb = (b) => (b / 1048576).toFixed(0);
    const lines = [
      `VOID ENGINE  FPS ${this.fps ?? "-"}`,
      `FRAME ${(this.cpuAvg ?? 0).toFixed(2)} MS AVG, ${(this.cpuMax ?? 0).toFixed(1)} MS MAX`,
      `TICK ${this.fixed.rate} HZ, ${this.fixed.count} TICKS, ${this.fixed.dropped} DROPPED`, // тикрейт; dropped — тики, выброшенные из-за заминок
      `RAM ${mb(m.rss)} MB  HEAP ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB  EXT ${mb(m.external)} MB`,
      `WINDOW ${this.ui.width}x${this.ui.height}  PIXEL RATIO ${(this.pixelRatio || 1).toFixed(2)}`,
      `GPU ${this.renderer?.adapterName || "?"}`,
    ];
    const owner = [...this.scenes].reverse().find((s) => s.techLines);
    if (owner) lines.push("", ...owner.techLines());
    const y = this.settings.data.interface?.showFps ? 32 : 6;
    drawTechPanel(this.ui, lines, { x: 6, y });
  }

  // Срез профайлера — в журнал, каждая строка с пометкой (легко найти и скопировать)
  dumpProfile(lines) {
    for (const l of lines) this.log("[PROFILER] " + l);
    this.journal.flush?.(); // сразу на диск: срез нужен, даже если игра потом упадёт
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
    if (all || what === "language") locale.set(s.interface?.language);
    if (what === "language" || what === "fps") this.redraw();
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
          scene.onButton(id, { right: e.button === sdl.mouse.BUTTON.RIGHT }); // right — правой кнопкой (инвентарь: по одной штуке)
        } else if (scene.onMouseDown({ x: e.x, y: e.y, button: e.button === sdl.mouse.BUTTON.RIGHT ? "right" : e.button === sdl.mouse.BUTTON.LEFT ? "left" : "middle" })) this.redraw();
      }
      this.phase(0);
    });

    w.on("mouseButtonUp", (e) => {
      const scene = this.scene;
      if (!scene || scene.captureMouse) return;
      if (scene.onMouseUp({ x: e.x, y: e.y, button: e.button === sdl.mouse.BUTTON.RIGHT ? "right" : e.button === sdl.mouse.BUTTON.LEFT ? "left" : "middle" })) this.redraw();
    });

    w.on("mouseWheel", (e) => {
      const scene = this.scene;
      if (!scene || scene.captureMouse) return;
      const dy = e.flipped ? -e.dy : e.dy;
      if (scene.onWheel({ x: e.x, y: e.y, dy })) this.redraw();
    });

    w.on("mouseMove", (e) => {
      // Подсветка кнопки под курсором (когда курсор свободен)
      if (this.mouse.captured) return;
      this.ensureUI();
      // trackMouse — сцене нужен каждый сдвиг (например, предмет «в руке» едет за курсором)
      const moved = this.scene?.onMouseMove({ x: e.x, y: e.y }); // сцене (перетаскивание карты и т. п.)
      if (this.ui.setMouse(e.x, e.y) || this.scene?.trackMouse || moved) this.redraw();
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
    if (actions.includes("console") && !(scene instanceof ConsoleScene)) return this.push(new ConsoleScene(this.console));
    if (actions.includes("techPanel") && this.input.shift) {
      // Shift+F3 — срез профайлера в журнал (короткий текст: можно вставить в чат)
      if (!profiler.enabled) this.toast("OPEN THE PROFILER PAGE FIRST: F3 TWICE", 2500);
      else {
        this.dumpProfile(profiler.report("Shift+F3"));
        this.toast("PROFILE SAVED TO LOG.TXT", 1500);
      }
    } else if (actions.includes("techPanel")) {
      // F3 по кругу: выкл → тех. панель (кадры, память, мир) → ПРОИЗВОДИТЕЛЬНОСТЬ (профайлер) → выкл.
      // Профайлер работает только пока открыта его страница — иначе он ничего не стоит
      this.techPanel = ((this.techPanel || 0) + 1) % 3;
      profiler.enabled = this.techPanel === 2;
      this.log(`тех. панель: ${["выкл", "сведения", "производительность"][this.techPanel]}`);
      this.redraw();
    }
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

  // Сглаженное время кадра. Цикл меряет время от начала прошлого кадра, а экран показывает кадры
  // в своём ровном такте: соседние кадры получают «10 мс, 23 мс, 12 мс...», и всё, что движется
  // относительно камеры (а при ходьбе — весь мир), дёргается взад-вперёд. Среднее за последние 8 кадров
  // убирает эту дрожь; настоящая заминка (кадр втрое дольше среднего) проходит как есть.
  smoothDt(raw) {
    const h = (this.dtHistory ||= []);
    const avg = h.length ? h.reduce((a, b) => a + b, 0) / h.length : raw;
    h.push(raw);
    if (h.length > 8) h.shift();
    if (raw > avg * 3 || raw < 0.0005) return raw; // заминка или первый кадр — без сглаживания
    return h.reduce((a, b) => a + b, 0) / h.length;
  }

  // Вернёт true — нужен следующий кадр сразу (мир живёт), "soon" — скоро, false — можно отдыхать
  tick() {
    const start = performance.now();
    const raw = Math.min((start - this.lastTime) / 1000, 0.1); // секунд с прошлого кадра (не больше 0.1)
    this.lastTime = start;
    const dt = this.smoothDt(raw);
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
    // Окно поверх мира, которое время НЕ останавливает (scene.live: карта, таланты, магазин, инвентарь):
    // мир под ним живёт дальше — его update(dt, { background: true }) (игра не читает клавиши героя)
    const live = !scene.realtime && scene.live ? this.liveBelow() : null;
    if (!scene.realtime && !live) {
      this.prevLiveEnd = 0; // меню / пауза: следующий живой кадр — без промежутка (не рывок)
      this.fixed.reset(); //   время стояло — тиков догонять не нужно
      this.mouse.consume(); // выбрасываем случайные движения мыши
      this.input.flushPressed(); // и нажатия (пробел в меню — не прыжок после него)
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
    profiler.begin(PROF.update);
    this.updateScene(live || scene, live ? BACKGROUND : undefined, raw, dt);
    profiler.end(PROF.update);
    this.render();
    const work = performance.now() - start;
    // Профайлер (F3): время систем этого кадра — в статистику. Промежуток — от конца прошлого кадра до конца
    // этого (простой между кадрами + работа): столько глаз ждал новую картинку. Только если и прошлый кадр
    // был живым (из меню / паузы промежуток длинный по делу — это не рывок). От конца, а не от начала:
    // иначе один тяжёлый кадр давал бы два рывка — сам и следующий за ним
    const end = start + work;
    this.profiler.endFrame(work, this.prevLiveEnd ? end - this.prevLiveEnd : 0);
    this.prevLiveEnd = end;
    if (this.techPanel === 2) this.redraw(); // страница профайлера: график кадров обновляется каждый кадр
    this.workTime += work;
    this.workMax = Math.max(this.workMax || 0, work); // самый долгий кадр за секунду — тех. панель

    // Раз в секунду — статистика
    this.frames++;
    const now = performance.now();
    if (now - this.statsTimer >= 1000) {
      const fps = Math.round((this.frames * 1000) / (now - this.statsTimer));
      if (this.fps !== fps && this.settings.data.interface?.showFps) this.redraw(); // счётчик на экране обновить
      this.fps = fps; // для счётчика на экране
      this.cpuAvg = this.workTime / this.frames; // для тех. панели (F3)
      this.cpuMax = this.workMax || 0;
      this.workMax = 0;
      if (this.techPanel) {
        this.memory = process.memoryUsage(); // раз в секунду — дёшево
        this.redraw();
      }
      this.onStats?.({ fps, cpu: this.workTime / this.frames });
      this.frames = 0;
      this.workTime = 0;
      this.statsTimer = now;
    }
    return true;
  }

  // Шаг сцены за кадр. Сцена с fixedUpdate живёт тиками (ровно tickRate раз в секунду, dt тика постоянный),
  // перед ними beforeTicks(dt) (мышь, взгляд), после — frameUpdate(dt, alpha) — то, что идёт с кадром (камера, интерфейс, плавность: alpha — доля пути
  // между прошлым и следующим тиком). Сцена без fixedUpdate — по-старому: update(dt) раз в кадр.
  // seconds — настоящее время кадра (для тиков: оно и копится), dt — сглаженное (для того, что на экране)
  updateScene(target, opts, seconds, dt) {
    if (!target.fixedUpdate) {
      target.update(dt, opts);
      return;
    }
    this.tickScene = target;
    this.tickOpts = opts;
    // Мир под «живым» окном (инвентарь, карта...) клавиш героя не читает — нажатия не копим до закрытия окна
    if (opts?.background) this.input.flushPressed();
    target.beforeTicks?.(dt, opts); // раз в кадр до тиков: то, что тики должны знать уже свежим (взгляд мышью)
    // первый живой кадр после меню / паузы: не больше одного тика (время в меню не в счёт)
    const k = this.timeScale;
    this.fixed.advance((this.prevLiveEnd ? seconds : Math.min(seconds, this.fixed.dt)) * k, this.runTick);
    target.frameUpdate?.(dt * k, this.fixed.alpha, opts);
  }

  // Общие команды консоли (игра добавляет свои: engine.console.command / cvar)
  registerConsole() {
    const c = this.console;
    c.cvar("timescale", { help: "timescale <0.05..4> - world speed (1 - normal)", cheat: true, get: () => this.timeScale, set: (v) => { this.timeScale = Math.max(0.05, Math.min(4, num(v))); } });
    c.cvar("tickrate", { help: "tickrate <20..240> - world ticks per second (default 60)", cheat: true, get: () => this.fixed.rate, set: (v) => this.fixed.setRate(Math.round(Math.max(20, Math.min(240, num(v))))) });
    c.cvar("fps_show", { help: "fps_show 0/1 - FPS counter", get: () => (this.settings.data.interface.showFps ? 1 : 0), set: (v) => { this.settings.data.interface.showFps = v !== "0"; this.settings.save(); this.redraw(); } });
    c.cvar("brightness", { help: "brightness <30..200> - picture brightness, %", get: () => this.settings.data.video.brightness, set: (v) => { this.settings.data.video.brightness = Math.round(Math.max(30, Math.min(200, num(v)))); this.settings.save(); this.applySettings("brightness"); } });
    c.command("stats", { help: "stats - fps, frame time, ticks", run: () => `FPS ${this.fps ?? "-"}, FRAME ${(this.cpuAvg ?? 0).toFixed(2)} MS, TICK ${this.fixed.rate} HZ, TICKS ${this.fixed.count}, DROPPED ${this.fixed.dropped}, TIMESCALE ${this.timeScale}` });
    c.command("profile", { help: "profile - write a profiler report to log.txt (opens the profiler page)", run: () => {
      this.techPanel = 2;
      profiler.enabled = true;
      return "PROFILER ON (F3 PAGE). RUN profile_dump IN A FEW SECONDS";
    } });
    c.command("profile_dump", { help: "profile_dump - profiler report to log.txt", run: () => {
      if (!profiler.enabled) return "PROFILER IS OFF: RUN profile FIRST";
      const lines = profiler.report("console");
      this.dumpProfile(lines);
      return lines.slice(0, 12);
    } });
    c.command("quit", { help: "quit - close the game", run: () => this.quit() });
  }

  render() {
    // Первые кадры — по шагам в журнал: если игра падает сразу (сбой драйвера), видно, на каком шаге
    const n = (this.rendered = (this.rendered || 0) + 1);
    const trace = n <= 3 ? (step) => this.log(`кадр ${n}: ${step}`) : null;
    trace?.("интерфейс");
    profiler.begin(PROF.ui);
    this.ensureUI(); // интерфейс, который просили перерисовать за этот кадр, — рисуем сейчас
    profiler.end(PROF.ui);
    profiler.begin(PROF.view);
    const v = this.findView() || {};
    profiler.end(PROF.view);
    trace?.("рисование");
    this.phase(2);
    profiler.begin(PROF.render);
    this.renderer.render({
      camera: v.camera || null,
      world: v.world || null,
      ghost: v.ghost || null,
      characters: v.characters || [],
      blur: v.blur || null, // размытие вокруг круга (оптика) — см. GPURenderer.render
      viewModels: v.viewModels || [],
      ui: this.ui,
    });
    profiler.end(PROF.render);
    this.phase(3);
    trace?.("показ кадра");
    profiler.begin(PROF.present);
    this.renderer.present();
    profiler.end(PROF.present);
    trace?.("готово");
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
