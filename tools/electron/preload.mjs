// ============================================================
//  VOID в Electron — здесь работает вся игра (preload: и Node, и окно браузера).
//  1. Ждём страницу (canvas#screen).
//  2. Кладём замены окна/ввода/звука/видеокарты в globalThis.VOID_PLATFORM (platform.mjs) —
//     движок берёт их вместо @kmamal/sdl и @kmamal/gpu (engine/platform/*.js).
//  3. Запускаем игру тем же файлом, что и без Electron: games/builder/main.js.
// ============================================================

import { ipcRenderer } from "electron";
import { createPlatform } from "./platform.mjs";

if (document.readyState === "loading") await new Promise((r) => window.addEventListener("DOMContentLoaded", r, { once: true }));

globalThis.VOID_PLATFORM = createPlatform(ipcRenderer);
window.addEventListener("error", (e) => console.error("Ошибка:", e.error?.stack || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("Ошибка (promise):", e.reason?.stack || e.reason));

try {
  await import("../../games/builder/main.js");
} catch (e) {
  console.error("Игра не запустилась:", e?.stack || e);
  setTimeout(() => ipcRenderer.send("void:quit", 1), 500); // windows-launch.js увидит код 1 и покажет вывод
}
