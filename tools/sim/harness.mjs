// ============================================================
//  Игра без окна для автотестов: настоящий движок и «Стройка», только окно, видеокарта и звук — пустышки
//  (stubs/, подменяет register.mjs). Сохранения — во ВРЕМЕННОЙ папке: тесты никогда не трогают настоящие.
//
//    const g = await createGame({ world: "copy" });  // "copy" — копия твоего мира (если есть), "new" — новый мир
//    await g.frames(600);                             // 600 кадров по 1/60 с (между кадрами — как в игре)
//    g.press("F3", { shift: true });                  // нажать клавишу
//    g.cleanup();                                     // убрать временную папку
// ============================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { any } from "./stubs/any.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REAL_SAVES = path.join(ROOT, "games", "builder", "saves");

export async function createGame({ world = "copy", immortal = true } = {}) {
  // Временная папка сохранений — до загрузки игры (config.js читает VOID_SAVES при загрузке)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-sim-"));
  if (world === "copy") {
    for (const f of ["world.json", "settings.json"]) {
      const from = path.join(REAL_SAVES, f);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, f)); // копия, оригинал только читаем
    }
    // мир в новом формате (папка: meta.json + chunks/) — тоже копией
    const worldDir = path.join(REAL_SAVES, "world");
    if (fs.existsSync(path.join(worldDir, "meta.json"))) fs.cpSync(worldDir, path.join(dir, "world"), { recursive: true, filter: (f) => !f.endsWith(".tmp") });
    // слоты миров (saves/worlds/<id>): копия самого свежего (без копий и погибших миров)
    const worlds = path.join(REAL_SAVES, "worlds");
    if (fs.existsSync(worlds)) {
      const ids = fs.readdirSync(worlds).filter((id) => fs.existsSync(path.join(worlds, id, "info.json")));
      const info = (id) => { try { return JSON.parse(fs.readFileSync(path.join(worlds, id, "info.json"), "utf8")); } catch { return {}; } };
      const best = ids.sort((a, b) => (info(b).lastPlayed || 0) - (info(a).lastPlayed || 0))[0];
      if (best) fs.cpSync(path.join(worlds, best), path.join(dir, "worlds", "1"), { recursive: true, filter: (f) => !/[\\/](backups|dead)([\\/]|$)/.test(f) && !f.endsWith(".tmp") });
    }
  }
  process.env.VOID_SAVES = dir + path.sep;

  const E = await import(path.join(ROOT, "engine", "index.js"));
  const C = await import(path.join(ROOT, "games", "builder", "config.js"));
  const { GameScene } = await import(path.join(ROOT, "games", "builder", "game-scene.js"));
  const { loadModels } = await import(path.join(ROOT, "games", "builder", "load-models.js"));
  const { SettingsStore, deepMerge } = await import(path.join(ROOT, "engine", "core", "settings.js"));
  const { Journal } = await import(path.join(ROOT, "engine", "core", "watchdog.js"));

  const win = any("window");
  Object.assign(win, { width: 1512, height: 949, pixelWidth: 3024, pixelHeight: 1898, destroyed: false, x: 0, y: 0 });
  const settings = new SettingsStore(path.join(dir, "settings.json"), deepMerge(E.ENGINE_DEFAULTS, C.GAME_DEFAULTS));
  const journal = new Journal(path.join(dir, "log.txt"));
  const engine = new E.Engine({ window: win, renderer: any("gpu"), settings, actionLabels: C.GAME_ACTION_LABELS, journal, theme: C.THEME });
  engine.running = false; // кадры крутим сами
  engine.renderer.fadeDist = C.VIEW_DISTANCE;
  const models = new E.ModelLibrary(engine.renderer);
  loadModels(models);
  const { installSkins } = await import(path.join(ROOT, "games", "builder", "skins.js"));
  const { ITEMS } = await import(path.join(ROOT, "games", "builder", "items.js"));
  installSkins(models, ITEMS, settings);
  const game = { models, openSettings() {}, toMenu() {} };
  const scene = new GameScene(game);
  // Окна выбора класса и второго оружия (при входе без класса, на 1-м и 10-м уровне) останавливают мир —
  // тесты встали бы. Классы и подклассы проверяет свой сценарий (chooseClass / chooseSubclass напрямую)
  scene.askClass = () => {};
  scene.askSubclass = () => {};
  engine.setScene(scene);
  settings.data.general.autoLoot = false; // автоподбор выключен: случайные подборы не меняют хотбар посреди теста

  const g = {
    E, C, engine, scene, game, dir, GameScene, root: ROOT,
    // Вторая игра в том же процессе (сетевые тесты: гость). net — game.net гостя ({ role, client, name }).
    // Свой движок, своя сцена; модели — общие. tick / frames — как у основной
    createPeer(net) {
      const w2 = any("window");
      Object.assign(w2, { width: 1280, height: 720, pixelWidth: 1280, pixelHeight: 720, destroyed: false, x: 0, y: 0 });
      const e2 = new E.Engine({ window: w2, renderer: any("gpu"), settings, actionLabels: C.GAME_ACTION_LABELS, journal, theme: C.THEME });
      e2.running = false;
      const game2 = { models, net, openSettings() {}, toMenu() { game2.left = true; } };
      const s2 = new GameScene(game2);
      s2.askClass = () => {};
      s2.askSubclass = () => {};
      e2.setScene(s2);
      const peer = {
        engine: e2, scene: s2, game: game2,
        tick(dt = 1 / 60) {
          e2.lastTime = performance.now() - dt * 1000;
          e2.tick();
        },
      };
      return peer;
    },
    // Кадр обеим играм (хост и гость) и время сокетам
    async both(peer, n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        g.tick(dt);
        peer.tick(dt);
        await new Promise((r) => setImmediate(r));
      }
    },
    get player() {
      return g.scene.player;
    },
    // Один кадр игры: dt — как будто с прошлого кадра прошло dt секунд
    tick(dt = 1 / 60) {
      if (immortal && g.scene.player) {
        g.scene.player.stats.hp = g.scene.player.stats.maxHp;
        g.scene.dead = false;
        // за кадр бывает 2 тика: здоровье могло кончиться между ними — не умираем (иначе «YOU DIED» встанет
        // поверх мира, мир замрёт, а сохранение уйдёт в dead/)
        if (!g.scene.immortalPatched) {
          g.scene.immortalPatched = true;
          g.scene.die = () => { g.scene.player.stats.hp = g.scene.player.stats.maxHp; };
        }
      }
      engine.lastTime = performance.now() - dt * 1000;
      engine.tick();
    },
    // n кадров; между кадрами — отдаём управление (как в игре: сюда приходят паузы сборщика и таймеры)
    async frames(n, dt = 1 / 60, each = null) {
      for (let i = 0; i < n; i++) {
        each?.(i);
        g.tick(dt);
        await new Promise((r) => setImmediate(r));
      }
    },
    // Нажать клавишу по имени (как в настройках: "F3", "Q", "SPACE"); shift — с зажатым Shift
    press(key, { shift = false } = {}) {
      const SC = E.KEYS;
      if (shift) engine.input.keys.add(SC.LSHIFT);
      engine.press({ scancode: SC[key] });
      if (shift) engine.input.keys.delete(SC.LSHIFT);
    },
    // Взять оружие (id предмета: "katana", "shotgun"...) в руки — по-честному: в ячейку оружия хотбара, как
    // если бы герой его взял (игра сама сделает способность; подменять её напрямую нельзя — любой подбор
    // предмета пересобирает панель из хотбара). Свежая способность (без старых перезарядок), уже в руках
    equip(itemId) {
      const s2 = g.scene;
      s2.player.hotbar.slots[0] = { item: itemId, count: 1 };
      s2.abilityCache.delete(itemId);
      s2.syncAbilities();
      s2.abilities.select(0, s2);
      s2.abilities.equipLeft = 0;
      return s2.abilities.current;
    },
    mobs() {
      return g.scene.entities.list.filter((e) => e.alive && e.kind === "mob");
    },
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // не удалилось — временная папка, система уберёт сама
      }
    },
  };
  return g;
}
