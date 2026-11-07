// ============================================================
//  VOID в Electron — здесь работает вся игра (preload: и Node, и окно браузера).
//  Обычный (CommonJS) preload: ESM-preload (.mjs) на Windows у Electron молча не запускался.
//  Модули игры (ESM) грузим через import() — его выполняет загрузчик Node.
//  1. Ждём страницу (canvas#screen).
//  2. Кладём замены окна/ввода/звука/видеокарты в globalThis.VOID_PLATFORM (platform.mjs) —
//     движок берёт их вместо @kmamal/sdl и @kmamal/gpu (engine/platform/*.js).
//  3. Запускаем игру тем же файлом, что и без Electron: games/builder/main.js.
//  Каждый шаг — в saves/electron.txt (через главный процесс): видно, где остановилось.
// ============================================================

const { ipcRenderer } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const say = (text) => ipcRenderer.send("void:log", text);
const url = (rel) => pathToFileURL(path.join(__dirname, rel)).href;

say("preload: запущен");

async function start() {
  try {
    say("preload: страница готова, загружаю замены окна и видеокарты");
    const { createPlatform } = await import(url("platform.mjs"));
    globalThis.VOID_PLATFORM = createPlatform(ipcRenderer);
    say(`preload: WebGPU ${navigator.gpu ? "есть" : "НЕТ"}; запускаю игру`);
    window.addEventListener("error", (e) => say("Ошибка: " + (e.error?.stack || e.message)));
    window.addEventListener("unhandledrejection", (e) => say("Ошибка (promise): " + (e.reason?.stack || e.reason)));
    await import(url("../../games/builder/main.js"));
    say("preload: игра запущена");
  } catch (e) {
    say("Игра не запустилась: " + (e?.stack || e));
    setTimeout(() => ipcRenderer.send("void:quit", 1), 500); // windows-launch.js увидит код 1 и покажет вывод
  }
}

if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start, { once: true });
else start();
