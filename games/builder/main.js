// ============================================================
//  «Стройка» — игра на движке VOID. Запуск: npm start
//
//  Этот файл только СОБИРАЕТ игру из частей:
//   - движок (окно, видеокарта, ввод, звук, настройки, сцены) — из engine/;
//   - правила и содержимое игры — из этой папки.
//
//     главное меню ──ИГРАТЬ──> мир ──Esc──> пауза ──> настройки
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine, MenuScene, SettingsScene, ModelLibrary, Input, ChangelogScene } from "../../engine/index.js";
import { GAME_DEFAULTS, GAME_ACTION_LABELS, CAMERA_MODES, SAVES, ASSETS, SOUNDS, PALETTE, THEME } from "./config.js";
import { GameScene } from "./game-scene.js";
import { migrateOldSaves } from "./save.js";
import { ITEMS } from "./items.js";

migrateOldSaves(); // до создания движка: он сразу читает settings.json

const engine = await Engine.create({
  title: "VOID",
  settingsFile: path.join(SAVES, "settings.json"),
  defaults: GAME_DEFAULTS,
  actionLabels: GAME_ACTION_LABELS,
  theme: THEME, // вид окон и кнопок — свой у каждой игры
  // Записи обновлений: появилась новая версия — уведомление, в главном меню — кнопка «ОБНОВИТЬ»
  changelog: fileURLToPath(new URL("../../CHANGELOG.json", import.meta.url)),
});
engine.sound.defineAll(SOUNDS);

// Модели: грузим один раз на всю игру
const models = new ModelLibrary(engine.renderer);
try {
  // mirrorX: в файле скелета правая рука лежит на -X, а у нас «вправо» — это +X
  models.load("skeleton", path.join(ASSETS, "skeleton.glb"), { mirrorX: true });
  models.load("zombie", path.join(ASSETS, "zombie.glb"), { mirrorX: true });
  models.load("boar", path.join(ASSETS, "boar.glb"), { mirrorX: true });
  models.load("boar-saddle", path.join(ASSETS, "boar-saddle.glb"), { mirrorX: true });
  // НПС — тот же скелет, но кости синеватые (цвет кости из tools/make-skeleton.js)
  models.load("npc", path.join(ASSETS, "skeleton.glb"), { mirrorX: true, recolor: [{ from: [0.86, 0.84, 0.76], to: [0.55, 0.7, 0.9] }] });
  // Модели «для экрана» (от 1-го лица) — у каждой способности своя, со своими анимациями
  models.load("fp-arm", path.join(ASSETS, "fp-arm.glb"));
  models.load("fp-pistol", path.join(ASSETS, "fp-pistol.glb"));
  models.load("fp-rifle", path.join(ASSETS, "fp-rifle.glb"));
  models.load("fp-machete", path.join(ASSETS, "fp-machete.glb"));
  models.load("fp-katana", path.join(ASSETS, "fp-katana.glb"));
  models.load("fp-auto", path.join(ASSETS, "fp-auto.glb"));
  models.load("fp-stone", path.join(ASSETS, "fp-stone.glb"));
  models.load("fp-hammer", path.join(ASSETS, "fp-hammer.glb"));
  // Оружие «для мира» — в руке героя от 3-го лица (tools/make-weapons.js)
  for (const w of ["pistol", "rifle", "auto", "machete", "katana", "katana-sheathed", "builder", "stone", "hammer"]) models.load(`w-${w}`, path.join(ASSETS, `w-${w}.glb`));
  // Блок в руке — по модели на каждый цвет палитры: розовую «метку» перекрашиваем в цвет
  PALETTE.forEach((color, i) => {
    models.load(`fp-block-${i}`, path.join(ASSETS, "fp-block.glb"), { recolor: [{ from: [1, 0, 1], to: color.map((c) => c / 255) }] });
  });
  // Предметы на земле: камень — своя модель, остальное — ящичек с крышкой цвета предмета
  for (const [id, info] of Object.entries(ITEMS)) {
    if (id === "stone") models.load("item-stone", path.join(ASSETS, "stone.glb"));
    else models.load(`item-${id}`, path.join(ASSETS, "item.glb"), { recolor: [{ from: [1, 0, 1], to: (info.color || [150, 156, 168]).map((c) => c / 255) }] });
  }
} catch (e) {
  console.warn("Модель не загружена:", e.message, "(npm run make:skeleton создаст её)");
}

// Своя вкладка настроек — ОБЩИЕ. Вкладки ВИДЕО/АУДИО/УПРАВЛЕНИЕ добавит движок.
function generalTab() {
  const s = engine.settings.data;
  return {
    id: "general",
    label: "ОБЩИЕ",
    rows: [
      {
        id: "camera",
        label: "ВИД КАМЕРЫ",
        value: () => CAMERA_MODES[s.general.cameraMode] || CAMERA_MODES.first,
        change: () => (s.general.cameraMode = s.general.cameraMode === "third" ? "first" : "third"),
      },
      {
        id: "minimap",
        label: "МИНИКАРТА",
        value: () => (s.general.minimap ? "ВКЛ" : "ВЫКЛ"),
        change: () => (s.general.minimap = !s.general.minimap),
      },
      {
        id: "minimapSide",
        label: "МИНИКАРТА: ГДЕ",
        value: () => (s.general.minimapSide === "left" ? "СЛЕВА" : "СПРАВА"),
        change: () => (s.general.minimapSide = s.general.minimapSide === "left" ? "right" : "left"),
      },
      {
        id: "leanMode",
        label: "НАКЛОН Q/E",
        value: () => (s.general.leanMode === "toggle" ? "ПЕРЕКЛЮЧАТЬ" : "УДЕРЖИВАТЬ"),
        change: () => (s.general.leanMode = s.general.leanMode === "toggle" ? "hold" : "toggle"),
      },
      {
        id: "aimMode",
        label: "ПРИЦЕЛ (ПКМ)",
        value: () => (s.general.aimMode === "toggle" ? "ПЕРЕКЛЮЧАТЬ" : "УДЕРЖИВАТЬ"),
        change: () => (s.general.aimMode = s.general.aimMode === "toggle" ? "hold" : "toggle"),
      },
      {
        id: "damageNumbers",
        label: "ЦИФРЫ УРОНА",
        value: () => (s.general.damageNumbers !== false ? "ВКЛ" : "ВЫКЛ"),
        change: () => (s.general.damageNumbers = s.general.damageNumbers === false),
      },
    ],
    note: () => "ВИД МОЖНО МЕНЯТЬ И В ИГРЕ: " + Input.label(s.controls.bindings.camera),
  };
}

// Общее для всех сцен игры
const game = {
  models,
  openSettings: () => engine.push(new SettingsScene({ tabs: [generalTab()] })),
  toMenu: () => engine.setScene(mainMenu()),
};

function mainMenu() {
  const up = engine.updater;
  return new MenuScene({
    title: "VOID",
    items: [
      { id: "play", label: "ИГРАТЬ" },
      { id: "settings", label: "НАСТРОЙКИ" },
      { id: "news", label: "ЧТО НОВОГО" },
      { id: "quit", label: "ВЫХОД" },
    ],
    enterSelects: "play",
    // Справа снизу — кнопка обновления (только когда вышла новая версия), слева снизу — наша версия
    corner: () => (up?.available ? { id: "update", label: `ОБНОВИТЬ ДО ${up.available.version}` } : null),
    footer: () => (up ? `ВЕРСИЯ ${up.current}` : null),
    onSelect: (id) => {
      if (id === "play") engine.setScene(new GameScene(game));
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
  if (fresh.length) engine.push(new ChangelogScene({ entries: fresh, title: "ОБНОВЛЕНО: ЧТО НОВОГО" }));
}
engine.run();
