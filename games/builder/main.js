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
import { Engine, MenuScene, SettingsScene, ModelLibrary, Input, ChangelogScene } from "../../engine/index.js";
import { GAME_DEFAULTS, GAME_ACTION_LABELS, CAMERA_MODES, SAVES, ASSETS, SOUNDS, PALETTE, THEME, VIEW_DISTANCE } from "./config.js";
import { GameScene } from "./game-scene.js";
import { migrateOldSaves, deleteSave, SAVE_FILE } from "./save.js";
import { ITEMS } from "./items.js";
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
engine.sound.defineAll(SOUNDS);
// Языки: надписи в коде — английские, русский — словарём (настройки → INTERFACE → LANGUAGE)
engine.locale.add("ru", RU);
engine.applySettings("language");

// Модели: грузим один раз на всю игру
const models = new ModelLibrary(engine.renderer);
try {
  // mirrorX: в файле скелета правая рука лежит на -X, а у нас «вправо» — это +X
  models.load("skeleton", path.join(ASSETS, "skeleton.glb"), { mirrorX: true });
  models.load("zombie", path.join(ASSETS, "zombie.glb"), { mirrorX: true });
  models.load("boar", path.join(ASSETS, "boar.glb"), { mirrorX: true });
  models.load("troll", path.join(ASSETS, "troll.glb"), { mirrorX: true }); // босс логова (tools/make-troll.js)
  // Лич (второй босс) — скелет, перекрашенный в бледно-фиолетовый (крупнее — scale у существа);
  // раздутый — зомби с багрово-зелёной кожей
  models.load("lich", path.join(ASSETS, "skeleton.glb"), { mirrorX: true, recolor: [{ from: [0.86, 0.84, 0.76], to: [0.68, 0.58, 0.86] }] });
  models.load("bloater", path.join(ASSETS, "zombie.glb"), { mirrorX: true, recolor: [{ from: [0.42, 0.58, 0.32], to: [0.62, 0.66, 0.3] }, { from: [0.32, 0.45, 0.24], to: [0.55, 0.3, 0.28] }, { from: [0.32, 0.4, 0.55], to: [0.45, 0.3, 0.32] }] });
  // Целебный гриб — турель-гриб с розовой шляпкой; сгусток лича — спора, перекрашенная в фиолетовый
  models.load("item-healer", path.join(ASSETS, "turret.glb"), { recolor: [{ from: [0.35, 0.78, 0.35], to: [0.92, 0.5, 0.78] }] });
  models.load("item-lichbolt", path.join(ASSETS, "spore.glb"), { recolor: [{ from: [0.45, 0.9, 0.35], to: [0.62, 0.32, 0.95] }, { from: [0.8, 1, 0.6], to: [0.92, 0.8, 1] }] });
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
  models.load("fp-hammer", path.join(ASSETS, "fp-hammer.glb"));
  for (const fp of ["staff", "wand", "bear-trap", "spikes", "war-hammer", "shotgun", "spear"]) models.load(`fp-${fp}`, path.join(ASSETS, `fp-${fp}.glb`));
  // Магма-камень в руке — тот же камень, только раскалённый (серое → оранжевое)
  const HOT = [{ from: [0.5, 0.5, 0.53], to: [0.85, 0.25, 0.06] }, { from: [0.64, 0.64, 0.67], to: [1, 0.6, 0.15] }];
  models.load("fp-magma", path.join(ASSETS, "fp-stone.glb"), { recolor: HOT });
  models.load("w-magma", path.join(ASSETS, "w-stone.glb"), { recolor: HOT });
  // Летящее и стоящее (снаряды, турель): камень мобов-метателей, магма, спора, граната
  models.load("item-stone", path.join(ASSETS, "stone.glb"));
  for (const m of ["magma", "spore", "grenade", "turret"]) models.load(`item-${m}`, path.join(ASSETS, `${m}.glb`));
  // Оружие «для мира» — в руке героя от 3-го лица (tools/make-weapons.js)
  for (const w of ["pistol", "rifle", "auto", "shotgun", "machete", "war-hammer", "spear", "katana", "katana-sheathed", "builder", "hammer", "fire-staff", "frost-wand", "bear-trap", "spikes", "bone", "stone", "knife"]) models.load(`w-${w}`, path.join(ASSETS, `w-${w}.glb`));
  models.load("item-knife", path.join(ASSETS, "knife.glb")); // нож, брошенный мобом-стрелком (снаряд)
  // Блок в руке — по модели на каждый цвет палитры: розовую «метку» перекрашиваем в цвет
  PALETTE.forEach((color, i) => {
    models.load(`fp-block-${i}`, path.join(ASSETS, "fp-block.glb"), { recolor: [{ from: [1, 0, 1], to: color.map((c) => c / 255) }] });
  });
  // Предметы на земле: своя модель (капкан, шипы) или ящичек с крышкой цвета предмета
  for (const [id, info] of Object.entries(ITEMS)) {
    if (info.model) models.load(`item-${id}`, path.join(ASSETS, `${info.model}.glb`)); // своя модель (нож, капкан...)
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
    ],
    note: () => `${Input.label(s.controls.bindings.autoLoot)} IN GAME - AUTO LOOT ON/OFF`,
  };
}

// Общее для всех сцен игры
const game = {
  models,
  openSettings: () => engine.push(new SettingsScene({ tabs: [generalTab()] })),
  toMenu: () => engine.setScene(mainMenu()),
};

// Есть ли сохранённый мир (тогда в меню — «ПРОДОЛЖИТЬ»)
const hasSave = () => fs.existsSync(SAVE_FILE);

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

function mainMenu() {
  const up = engine.updater;
  const saved = hasSave();
  return new MenuScene({
    title: "VOID",
    // Есть сохранение — «ПРОДОЛЖИТЬ» сверху, «НОВАЯ ИГРА» ниже; нет — только «НОВАЯ ИГРА»
    items: [
      ...(saved ? [{ id: "play", label: "CONTINUE" }] : []),
      { id: "new", label: "NEW GAME" },
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
