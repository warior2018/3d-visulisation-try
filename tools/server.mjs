// ============================================================
//  Выделенный сервер «Стройки»: игра без окна (как автотесты: окно, видеокарта и звук — пустышки), в которой
//  хост — без своего героя. Все игроки — гости: подключаются по адресу этого компьютера (JOIN GAME).
//  Лобби → матч → итоги → снова лобби. Мир матча не сохраняется.
//
//    node --import ./tools/sim/register.mjs tools/server.mjs [--mode duel|classic] [--port 27015]
//    (Windows: tools/run-server.cmd; Mac: tools/run-server.command — двойной клик)
// ============================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { any } from "./sim/stubs/any.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const MODE = arg("mode", "classic") === "duel" ? "duel" : "classic";

// Сохранения сервера — своя временная папка (миры матчей не сохраняются)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-server-"));
process.env.VOID_SAVES = dir + path.sep;

const E = await import(path.join(ROOT, "engine", "index.js"));
const C = await import(path.join(ROOT, "games", "builder", "config.js"));
const { GameScene } = await import(path.join(ROOT, "games", "builder", "game-scene.js"));
const { LobbyScene } = await import(path.join(ROOT, "games", "builder", "lobby.js"));
const { loadModels } = await import(path.join(ROOT, "games", "builder", "load-models.js"));
const { SettingsStore, deepMerge } = await import(path.join(ROOT, "engine", "core", "settings.js"));
const { Journal } = await import(path.join(ROOT, "engine", "core", "watchdog.js"));
const PORT = +arg("port", 0) || E.DEFAULT_PORT;
const { Updater } = await import(path.join(ROOT, "engine", "core", "updates.js"));
const { spawn } = await import("node:child_process");

const win = any("window");
Object.assign(win, { width: 1280, height: 720, pixelWidth: 1280, pixelHeight: 720, destroyed: false, x: 0, y: 0 });
const settings = new SettingsStore(path.join(dir, "settings.json"), deepMerge(E.ENGINE_DEFAULTS, C.GAME_DEFAULTS));
const journal = new Journal(path.join(dir, "log.txt"));
const engine = new E.Engine({ window: win, renderer: any("gpu"), settings, actionLabels: C.GAME_ACTION_LABELS, journal, theme: C.THEME });
engine.running = false; // кадры крутим сами (ниже)
engine.renderer.fadeDist = C.VIEW_DISTANCE;
const log = engine.log.bind(engine);
engine.log = (text, ...rest) => {
  if (!/^(кадр \d|сцен)/.test(String(text))) console.log(`[${new Date().toLocaleTimeString()}] ${text}`); // журнал — и в консоль (без покадрового)
  return log(text, ...rest);
};
const models = new E.ModelLibrary(engine.renderer);
loadModels(models);

const server = new E.NetServer({ port: PORT, host: "0.0.0.0" });
await server.listen();
const ips = E.localAddresses();
console.log(`СЕРВЕР «Стройки»: режим ${MODE.toUpperCase()}, порт ${server.port}`);
console.log(`Подключаться (JOIN GAME): ${ips.map((ip) => `${ip}:${server.port}`).join("  ") || "?"}`);
console.log("Остановить — Ctrl+C");

// Обновления: раз в минуту — версия на GitHub; вышла новая — в лобби (не посреди матча) git pull и перезапуск
const updater = new Updater({
  file: path.join(ROOT, "CHANGELOG.json"),
  remote: "https://raw.githubusercontent.com/warior2018/3d-visulisation-try/main/CHANGELOG.json",
  onAvailable: (u) => engine.log(`сервер: вышла версия ${u.available.version} (у нас ${u.current}) — обновлюсь, когда никто не играет`),
});
engine.updater = updater; // лобби сверяет версию гостей с этой
console.log(`Версия: ${updater.current}`);
function updateAndRestart() {
  const r = updater.available?.remote ? updater.pull() : { ok: true };
  if (!r.ok) {
    engine.log(`сервер: обновиться не вышло — ${r.reason}`);
    updater.available = null; // попробуем при следующей новой версии
    return;
  }
  engine.log(`сервер: обновился до ${updater.available.version}, перезапуск`);
  updater.stop();
  clearInterval(loop);
  server.close?.();
  // новый сервер — через пару секунд (порт освободится), этот ждёт его и выходит вместе с ним
  setTimeout(() => spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { cwd: process.cwd(), stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 0)), 2000);
}

const game = { models, net: null, openSettings() {}, toMenu: () => toLobby() };
let match = null; // { scene, endedAt, emptySince }

function toLobby() {
  match = null;
  game.net = null;
  const lobby = new LobbyScene({
    game, net: { role: "host", server, dedicated: true, mode: MODE, version: updater.current }, name: "SERVER",
    onStart: (n) => {
      game.net = { ...n, dedicated: true };
      const scene = new GameScene(game);
      scene.askClass = () => {}; // окна выбора — только у игроков
      scene.askSubclass = () => {};
      engine.setScene(scene);
      match = { scene, endedAt: null, emptySince: null };
      engine.log(`сервер: матч начался (${n.mode}), игроки: ${n.roster.join(", ")}`);
    },
    onLeave: () => {},
  });
  engine.setScene(lobby);
  engine.log("сервер: лобби — ждём игроков");
}
toLobby();

// Кадры: 60 в секунду. Матч окончен (или все ушли) — через несколько секунд снова лобби
const STEP = 1000 / 60;
const loop = setInterval(() => {
  // новая версия и сейчас лобби без игроков — обновляемся
  if (updater.available && !match && !server.peers?.size) return updateAndRestart();
  engine.lastTime = performance.now() - STEP;
  try {
    engine.tick();
  } catch (e) {
    console.error("ошибка кадра:", e);
  }
  if (!match) return;
  const s = match.scene;
  const now = performance.now();
  if (s.matchEnded && !match.endedAt) match.endedAt = now;
  const empty = s.net && s.net.guests && s.net.guests.size === 0;
  if (empty && !match.emptySince) match.emptySince = now;
  if (!empty) match.emptySince = null;
  if ((match.endedAt && now - match.endedAt > 6000) || (match.emptySince && now - match.emptySince > 10000)) {
    engine.log(match.endedAt ? "сервер: матч окончен" : "сервер: все вышли");
    toLobby();
  }
}, STEP);
