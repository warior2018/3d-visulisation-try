// ============================================================
//  «Стройка» — игра на движке VOID. Запуск: npm start
//
//  Этот файл только СОБИРАЕТ игру из частей:
//   - движок (окно, видеокарта, ввод, звук, настройки, сцены) — из engine/;
//   - правила и содержимое игры — из этой папки.
//
//     главное меню ──ИГРАТЬ──> мир ──Esc──> пауза ──> настройки
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { watchModule, Engine, MenuScene, SettingsScene, ModelLibrary, Input, ChangelogScene, TextInputScene, IntroScene, NetServer, NetClient, localAddresses, DEFAULT_PORT, makeTheme, loadPNG, widgets } from "../../engine/index.js";
import { GAME_DEFAULTS, GAME_ACTION_LABELS, GAMEPAD_ENABLED, CAMERA_MODES, SAVES, SOUNDS, THEME, THEMES, VIEW_DISTANCE, DRAW_DISTANCES } from "./config.js";
import { GameScene } from "./game-scene.js";
import { loadModels } from "./load-models.js";
import { migrateOldSaves, touchWorld, setProfile } from "./save.js";
import { MainMenu } from "./menu.js";
import { installSkins } from "./skins.js";
import { loadMusic } from "./music.js";
import { noSprint } from "./controls.js";
import { ITEMS } from "./items.js";
import { RU } from "./lang/ru.js";

migrateOldSaves(); // до создания движка: он сразу читает settings.json

const engine = await Engine.create({
  title: "VOID",
  settingsFile: path.join(SAVES, "settings.json"),
  defaults: GAME_DEFAULTS,
  actionLabels: GAME_ACTION_LABELS,
  theme: THEME, // вид окон и кнопок — свой у каждой игры
  render: { fadeDist: VIEW_DISTANCE, distances: DRAW_DISTANCES }, // дальность прорисовки (м): ступени — настройка DRAW DISTANCE
  // Записи обновлений: появилась новая версия — уведомление, в главном меню — кнопка «ОБНОВИТЬ»
  changelog: fileURLToPath(new URL("../../CHANGELOG.json", import.meta.url)),
});
// Q / E раньше выбирали оружие (weaponLeft / weaponRight), теперь это скиллы (skill1 / skill2):
// в старом файле настроек скиллы пустые — ставим Q / E, старые действия убираем
{
  const b = engine.settings.data.controls.bindings;
  if (b.weaponLeft !== undefined || b.weaponRight !== undefined) {
    b.skill1 ||= b.weaponLeft || "key:Q";
    b.skill2 ||= b.weaponRight || "key:E";
    delete b.weaponLeft;
    delete b.weaponRight;
    engine.settings.save();
  }
}
// Предметы на клавишах item1 / item2 (1 / 2), ячейки панели движка (ability1…5) больше не нужны:
// в старом файле настроек цифры заняты ими — освобождаем
{
  const b = engine.settings.data.controls.bindings;
  if (b.item1 === undefined || b.ability1) {
    b.item1 ||= "key:1";
    b.item2 ||= "key:2";
    for (const k of ["ability1", "ability2", "ability3", "ability4", "ability5"]) b[k] = "";
    engine.settings.save();
  }
}
engine.sound.defineAll(SOUNDS);
// голоса существ — свой канал громкости (VOICES)
for (const v of ["growl", "mobDeath"]) engine.sound.define(v, SOUNDS[v], { channel: "voices" });
loadMusic(engine.sound); // музыка: мир / бой / нашествие (music.js)
// Языки: надписи в коде — английские, русский — словарём (настройки → INTERFACE → LANGUAGE)
engine.locale.add("ru", RU);
engine.applySettings("language");

// Id игрока — к нему в мире привязан персонаж (позже — аккаунты). Один раз создаём и храним в настройках
{
  const g = engine.settings.data.general;
  if (!g.profileId) {
    g.profileId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    engine.settings.save();
  }
  setProfile(g.profileId);
}

noSprint(engine); // спринта нет: Shift — способность 3 (controls.js)
// Геймпад пока закрыт (движок умеет — в игре выключен, пока не проверим на настоящем)
if (engine.pad) engine.pad.enabled = GAMEPAD_ENABLED;

// Стиль окон и кнопок (настройка UI STYLE): тема из THEMES поверх темы движка
function applyStyle() {
  const t = THEMES[engine.settings.data.general.uiStyle] || THEMES[0];
  engine.ui.theme = makeTheme(t.theme);
  engine.redraw();
}
applyStyle();

// Модели: грузим один раз на всю игру
const models = new ModelLibrary(engine.renderer);
try {
  loadModels(models); // список моделей — load-models.js (его же грузят автотесты)
} catch (e) {
  console.warn("Модель не загружена:", e.message, "(npm run make:skeleton создаст её)");
}
installSkins(models, ITEMS, engine.settings); // скины: перекраска своих моделей и значков (skins.js)

// Своя вкладка настроек — ОБЩИЕ. Вкладки ВИДЕО/АУДИО/УПРАВЛЕНИЕ добавит движок.
// Фоны меню: все PNG из assets/backgrounds (tools/make-backgrounds.js; свои — класть туда же)
const BG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "backgrounds");
const BACKGROUNDS = {};
try {
  for (const f of fs.readdirSync(BG_DIR).filter((x) => /\.png$/i.test(x)).sort()) {
    try { BACKGROUNDS[f.replace(/\.png$/i, "")] = loadPNG(path.join(BG_DIR, f)); } catch {}
  }
} catch {}
const BG_IDS = ["", ...Object.keys(BACKGROUNDS)]; // "" — без картинки (градиент стиля окон)
const bgName = (id, empty = "NONE") => (id ? id.toUpperCase() : empty);
// какая картинка у страницы меню: своя (если не «одна на все») или главная
widgets.setBackgroundSource((page) => {
  const g = engine.settings.data.general;
  const own = g.bgAllPages === false ? (page === "skins" ? g.bgSkins : page === "settings" ? g.bgSettings : "") : "";
  return BACKGROUNDS[own || g.menuBg] || null;
});
// ◀ ▶ по списку фонов
const stepBg = (cur, dir, list = BG_IDS) => list[(Math.max(0, list.indexOf(cur ?? "")) + dir + list.length) % list.length];

function generalTab() {
  const s = engine.settings.data;
  // строки фонов: главный, «один на все страницы», и (если не один) — свои у СКИНОВ и НАСТРОЕК
  const bgRows = () => [
    { id: "menuBg", label: "MENU BACKGROUND", arrows: true, value: () => bgName(s.general.menuBg), change: (dir) => (s.general.menuBg = stepBg(s.general.menuBg, dir)) },
    { id: "bgAll", label: "ONE BACKGROUND FOR ALL PAGES", value: () => (s.general.bgAllPages !== false ? "ON" : "OFF"), change: () => (s.general.bgAllPages = s.general.bgAllPages === false) },
    ...(s.general.bgAllPages === false ? [
      { id: "bgSkins", label: "SKINS PAGE BACKGROUND", arrows: true, value: () => bgName(s.general.bgSkins, "AS MENU"), change: (dir) => (s.general.bgSkins = stepBg(s.general.bgSkins, dir)) },
      { id: "bgSettings", label: "SETTINGS BACKGROUND", arrows: true, value: () => bgName(s.general.bgSettings, "AS MENU"), change: (dir) => (s.general.bgSettings = stepBg(s.general.bgSettings, dir)) },
    ] : []),
  ];
  return {
    id: "general",
    label: "GENERAL",
    get rows() {
      return [...this.baseRows, ...bgRows()];
    },
    baseRows: [
      {
        id: "camera",
        label: "CAMERA VIEW",
        value: () => CAMERA_MODES[s.general.cameraMode] || CAMERA_MODES.first,
        change: () => (s.general.cameraMode = s.general.cameraMode === "third" ? "first" : "third"),
      },
      {
        id: "minimap",
        label: "MINIMAP",
        value: () => (s.general.minimap ? "ON" : "OFF"),
        change: () => (s.general.minimap = !s.general.minimap),
      },
      {
        id: "minimapSide",
        label: "MINIMAP SIDE",
        value: () => (s.general.minimapSide === "left" ? "LEFT" : "RIGHT"),
        change: () => (s.general.minimapSide = s.general.minimapSide === "left" ? "right" : "left"),
      },
      {
        id: "aimMode",
        label: "AIM (RMB)",
        value: () => (s.general.aimMode === "toggle" ? "TOGGLE" : "HOLD"),
        change: () => (s.general.aimMode = s.general.aimMode === "toggle" ? "hold" : "toggle"),
      },
      {
        id: "hints",
        label: "TIPS FOR NEWCOMERS",
        value: () => (s.general.hints !== false ? "ON" : "OFF"),
        change: () => {
          s.general.hints = s.general.hints === false;
          for (const sc of engine.scenes) if (sc.hints) sc.hints.enabled = s.general.hints;
        },
      },
      {
        id: "hintsReset",
        label: "SHOW TIPS AGAIN",
        value: () => (s.general.hintsDone?.length ? `${s.general.hintsDone.length} SEEN` : "-"),
        change: () => {
          s.general.hintsDone = [];
          for (const sc of engine.scenes) sc.hints?.reset();
        },
      },
      {
        id: "damageNumbers",
        label: "DAMAGE NUMBERS",
        value: () => (s.general.damageNumbers !== false ? "ON" : "OFF"),
        change: () => (s.general.damageNumbers = s.general.damageNumbers === false),
      },
      {
        id: "headBob",
        label: "HAND BOB",
        value: () => (s.general.headBob !== false ? "ON" : "OFF"),
        change: () => (s.general.headBob = s.general.headBob === false),
      },
      {
        id: "uiStyle",
        label: "UI STYLE",
        arrows: true, // ◀ название ▶
        value: () => (THEMES[s.general.uiStyle] || THEMES[0]).name,
        change: (dir) => {
          s.general.uiStyle = ((s.general.uiStyle || 0) + dir + THEMES.length) % THEMES.length;
          applyStyle();
        },
      },
      {
        id: "intro",
        label: "INTRO ON START",
        value: () => (s.general.intro !== false ? "ON" : "OFF"),
        change: () => (s.general.intro = s.general.intro === false),
      },
      {
        id: "dayNight",
        label: "DAY / NIGHT",
        value: () => (s.general.dayNight !== false ? "ON" : "OFF"),
        change: () => (s.general.dayNight = s.general.dayNight === false),
      },
      {
        id: "lighting",
        label: "LIGHTING",
        value: () => (engine.settings.data.video.lighting !== false ? "ON" : "OFF"),
        change: () => {
          engine.settings.data.video.lighting = engine.settings.data.video.lighting === false;
          engine.applySettings("lighting");
        },
      },
      {
        id: "screenShake",
        label: "SCREEN SHAKE",
        value: () => (s.general.screenShake !== false ? "ON" : "OFF"),
        change: () => (s.general.screenShake = s.general.screenShake === false),
      },
    ],
    note: () => `${Input.label(s.controls.bindings.autoLoot)} IN GAME - AUTO LOOT ON/OFF`,
  };
}

// Общее для всех сцен игры
const game = {
  models,
  openSettings: () => engine.push(new SettingsScene({ tabs: [generalTab()] })),
  toMenu: () => {
    game.net = null; // сетевая игра кончилась (сцена мира закроет связь при выходе)
    engine.setScene(mainMenu());
  },
  net: null, // сетевая игра: { role: "host", server } или { role: "client", client, name } — scene/net.js
};

// Горячая перезагрузка config.js: поправил цифры, сохранил — игра подхватила (engine/core/hot-reload.js).
// Отдельные числа (export const X = 5) так не меняются — о них подсказка «нужен перезапуск»
const CONFIG = await import("./config.js");
watchModule(new URL("./config.js", import.meta.url), {
  live: CONFIG,
  onReload: ({ updated, skipped, error }) => {
    if (error) {
      engine.log("config.js: ошибка, оставили старое: " + (error.stack || error));
      return engine.toast("CONFIG.JS ERROR - SEE LOG.TXT", 4000);
    }
    engine.log(`config.js перезагружен: значений ${updated}${skipped.length ? ", нужен перезапуск: " + skipped.join(", ") : ""}`);
    for (const sc of engine.scenes) sc.configReloaded?.();
    engine.toast(skipped.length ? `CONFIG RELOADED: ${updated}. RESTART FOR: ${skipped.slice(0, 3).join(", ")}` : `CONFIG RELOADED: ${updated}`, 3000);
  },
});

// Отчёт о падении (engine/scenes/crash-scene.js), кнопка MENU: мир — сохранить (если получится) и в главное меню
engine.onCrashMenu = () => {
  const world = engine.scenes.find((s) => s instanceof GameScene);
  try {
    world?.save(false);
  } catch (e) {
    engine.log("после падения не сохранилось: " + (e.stack || e));
  }
  game.toMenu();
};


// ---------- Сетевая игра ----------
// Хост: свой мир (сохранённый или новый) + сервер; гости подключаются по адресу этого компьютера
async function hostGame() {
  const port = engine.settings.data.net?.port || DEFAULT_PORT;
  const server = new NetServer({ port });
  try {
    await server.listen();
  } catch (e) {
    engine.log(`сеть: не открыть порт ${port}: ${e.message}`);
    return engine.toast(`CANNOT HOST ON PORT ${port}`, 4000);
  }
  game.net = { role: "host", server };
  engine.setScene(new GameScene(game));
  const ips = localAddresses();
  engine.log(`сеть: хост на порту ${server.port}, адреса: ${ips.join(", ") || "нет"}`);
  engine.toast(`HOSTING: ${ips.slice(0, 2).join(" / ") || "?"} PORT ${server.port}`, 10000);
  // Windows: при первом запуске хоста брандмауэр спрашивает про node.exe — надо «Разрешить» (частные сети)
  if (process.platform === "win32") engine.log("сеть (Windows): если брандмауэр спросил про Node.js — разрешить доступ в частных сетях, иначе гости не подключатся");
}

// Гость: адрес хоста (запоминается) -> подключиться -> мир хоста
function joinWindow() {
  return new TextInputScene({
    title: "JOIN GAME",
    hint: "HOST ADDRESS (IP OR IP:PORT)",
    value: engine.settings.data.net?.lastHost || "",
    allowed: /[0-9a-z.:-]/i,
    onCancel: () => engine.pop(),
    onDone: async (addr) => {
      if (!addr) return;
      const [host, port] = addr.split(":");
      const client = new NetClient();
      engine.toast("CONNECTING...", 5000);
      try {
        await client.connect(host, +port || DEFAULT_PORT);
      } catch (e) {
        engine.log(`сеть: не подключиться к ${addr}: ${e.message}`);
        return engine.toast("CANNOT CONNECT", 4000);
      }
      engine.settings.data.net = { ...(engine.settings.data.net || {}), lastHost: addr };
      engine.settings.save();
      engine.log(`сеть: подключились к ${addr}`);
      game.net = { role: "client", client, name: engine.settings.data.net?.name || "GUEST" };
      engine.setScene(new GameScene(game));
    },
  });
}

// Главное меню: вкладки и миры (menu.js)
function mainMenu() {
  const up = engine.updater;
  return new MainMenu({
    game,
    updater: up,
    actions: {
      play: () => engine.setScene(new GameScene(game)), // мир уже выбран (touchWorld)
      news: () => engine.push(new ChangelogScene({ entries: up ? up.entries : [] })),
      settings: () => game.openSettings(),
      quit: () => engine.quit(),
      // ESC в главном меню — как пауза в игре: настройки, новости, выход на рабочий стол
      escape: () => engine.push(new MenuScene({
        title: "MENU", overlay: true,
        items: [{ id: "settings", label: "SETTINGS" }, { id: "news", label: "WHAT'S NEW" }, { id: "quit", label: "QUIT TO DESKTOP" }, { id: "back", label: "BACK" }],
        onBack: () => engine.pop(),
        onSelect: (id) => {
          engine.pop();
          if (id === "settings") game.openSettings();
          if (id === "news") engine.push(new ChangelogScene({ entries: up ? up.entries : [] }));
          if (id === "quit") engine.quit();
        },
      })),
      update: () => up?.restart(engine),
      host: (worldId) => {
        touchWorld(worldId);
        hostGame();
      },
      join: () => engine.push(joinWindow()),
      toast: (text) => engine.toast(text, 2000),
      confirm: (title, onYes) => engine.push(new MenuScene({
        title, overlay: true,
        items: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }],
        onBack: () => engine.pop(),
        onSelect: (id) => {
          engine.pop();
          if (id === "yes") onYes();
        },
      })),
      askName: (title, value, onDone) => engine.push(new TextInputScene({
        title, value, hint: "WORLD NAME", allowed: /[0-9a-z а-яё_-]/i, maxLength: 20,
        onCancel: () => engine.pop(),
        onDone: (text) => {
          engine.pop();
          onDone(text.toUpperCase());
        },
      })),
    },
  });
}


// Заставка (ролик: кадры в assets/intro; пропустить — любая клавиша), потом меню.
// Только что обновились — без заставки, сразу «что нового»
const afterIntro = () => {
  engine.setScene(mainMenu());
  if (engine.updater?.updatedFrom) {
    const fresh = engine.updater.newer(engine.updater.updatedFrom);
    if (fresh.length) engine.push(new ChangelogScene({ entries: fresh, title: "UPDATED: WHAT'S NEW" }));
  }
};
if (engine.updater?.updatedFrom || engine.settings.data.general.intro === false) afterIntro();
else engine.setScene(new IntroScene({ dir: fileURLToPath(new URL("./assets/intro/", import.meta.url)), title: "VOID", subtitle: "STROYKA", onDone: afterIntro }));
engine.run();
