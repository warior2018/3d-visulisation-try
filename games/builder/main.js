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
import { Engine, MenuScene, SettingsScene, ModelLibrary, Input, ChangelogScene, TextInputScene, NetServer, NetClient, localAddresses, DEFAULT_PORT } from "../../engine/index.js";
import { GAME_DEFAULTS, GAME_ACTION_LABELS, CAMERA_MODES, SAVES, SOUNDS, THEME, VIEW_DISTANCE } from "./config.js";
import { GameScene } from "./game-scene.js";
import { loadModels } from "./load-models.js";
import { migrateOldSaves, deleteSave, hasSave } from "./save.js";
import { RU } from "./lang/ru.js";

migrateOldSaves(); // до создания движка: он сразу читает settings.json

const engine = await Engine.create({
  title: "VOID",
  settingsFile: path.join(SAVES, "settings.json"),
  defaults: GAME_DEFAULTS,
  actionLabels: GAME_ACTION_LABELS,
  theme: THEME, // вид окон и кнопок — свой у каждой игры
  render: { fadeDist: VIEW_DISTANCE }, // дальность прорисовки (м)
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
// Языки: надписи в коде — английские, русский — словарём (настройки → INTERFACE → LANGUAGE)
engine.locale.add("ru", RU);
engine.applySettings("language");

// Модели: грузим один раз на всю игру
const models = new ModelLibrary(engine.renderer);
try {
  loadModels(models); // список моделей — load-models.js (его же грузят автотесты)
} catch (e) {
  console.warn("Модель не загружена:", e.message, "(npm run make:skeleton создаст её)");
}

// Своя вкладка настроек — ОБЩИЕ. Вкладки ВИДЕО/АУДИО/УПРАВЛЕНИЕ добавит движок.
function generalTab() {
  const s = engine.settings.data;
  return {
    id: "general",
    label: "GENERAL",
    rows: [
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


// Новая игра поверх сохранения — сначала спросить (старый мир не стирается: уходит в saves/dead/)
function confirmNewGame() {
  return new MenuScene({
    title: "NEW GAME?",
    overlay: true,
    items: [{ id: "yes", label: "YES, START OVER" }, { id: "no", label: "NO" }],
    footer: () => "THE CURRENT WORLD WILL BE ARCHIVED (SAVES/DEAD)",
    onBack: () => engine.pop(),
    onSelect: (id) => {
      if (id === "no") return engine.pop();
      const archived = deleteSave();
      engine.log(`новая игра: старый мир -> ${archived || "не было"}`);
      engine.setScene(new GameScene(game));
    },
  });
}

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

function mainMenu() {
  const up = engine.updater;
  const saved = hasSave();
  return new MenuScene({
    title: "VOID",
    // Есть сохранение — «ПРОДОЛЖИТЬ» сверху, «НОВАЯ ИГРА» ниже; нет — только «НОВАЯ ИГРА»
    items: [
      ...(saved ? [{ id: "play", label: "CONTINUE" }] : []),
      { id: "new", label: "NEW GAME" },
      { id: "host", label: "HOST GAME" },
      { id: "join", label: "JOIN GAME" },
      { id: "settings", label: "SETTINGS" },
      { id: "news", label: "WHAT'S NEW" },
      { id: "quit", label: "QUIT" },
    ],
    enterSelects: saved ? "play" : "new",
    // Справа снизу — кнопка обновления (только когда вышла новая версия), слева снизу — наша версия
    corner: () => (up?.available ? { id: "update", label: `UPDATE TO ${up.available.version}` } : null),
    footer: () => (up ? `VERSION ${up.current}` : null),
    onSelect: (id) => {
      if (id === "play") engine.setScene(new GameScene(game));
      if (id === "new") {
        if (hasSave()) engine.push(confirmNewGame());
        else engine.setScene(new GameScene(game));
      }
      if (id === "host") hostGame();
      if (id === "join") engine.push(joinWindow());
      if (id === "settings") game.openSettings();
      if (id === "news") engine.push(new ChangelogScene({ entries: up ? up.entries : [] }));
      if (id === "update") up.restart(engine); // мир уже сохранён (вышли в меню), настройки сохраняются сразу
      if (id === "quit") engine.quit();
    },
  });
}

engine.setScene(mainMenu());
// Только что обновились — сразу показываем, что нового (с прошлой версии)
if (engine.updater?.updatedFrom) {
  const fresh = engine.updater.newer(engine.updater.updatedFrom);
  if (fresh.length) engine.push(new ChangelogScene({ entries: fresh, title: "UPDATED: WHAT'S NEW" }));
}
engine.run();
