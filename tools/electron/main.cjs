// ============================================================
//  VOID в Electron — главный процесс (окно приложения).
//  Зачем: на некоторых Windows-ноутбуках WebGPU из @kmamal/gpu падает, когда рисует прямо в окно SDL,
//  а WebGPU самого Chromium там работает. Тогда игра идёт так: окно Electron, в нём canvas на всё окно,
//  а сама игра (весь движок, Node) работает в preload.cjs — со своими заменами окна, ввода, звука
//  и показа кадра (platform.mjs). Код игры и рендер — те же, что с SDL.
//
//  Здесь — только то, что умеет лишь главный процесс: полный экран, размер окна, захват мыши
//  (pointer lock просят «как будто по клику»), буфер обмена, выход и перезапуск после обновления.
//  Запуск: node tools/electron/run.mjs (сам скачает Electron) или electron tools/electron/main.cjs
// ============================================================

const { app, BrowserWindow, ipcMain, clipboard } = require("electron");
const path = require("node:path");

// Кадры без ограничения частотой экрана — только если попросили (VOID_UNCAPPED=1)
if (process.env.VOID_UNCAPPED) {
  app.commandLine.appendSwitch("disable-frame-rate-limit");
  app.commandLine.appendSwitch("disable-gpu-vsync");
}
app.commandLine.appendSwitch("enable-unsafe-webgpu"); //        WebGPU и там, где Chromium его ещё «не обещает» (Linux)
app.commandLine.appendSwitch("force_high_performance_gpu"); //  ноутбук с двумя видеокартами — мощная
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");

// Журнал Electron: games/builder/saves/electron.txt (каждый запуск — заново)
const fs = require("node:fs");
const LOG = path.join(__dirname, "..", "..", "games", "builder", "saves", "electron.txt");
try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, `запуск Electron ${process.versions.electron}, Chromium ${process.versions.chrome}\n`); } catch {}
function say(text) {
  console.log(text);
  try { fs.appendFileSync(LOG, new Date().toISOString().slice(11, 23) + "  " + text + "\n"); } catch {}
}

let win = null;
let quitting = false;
let relaunchEnv = null;

function quit(code = 0) {
  quitting = true;
  if (relaunchEnv) {
    Object.assign(process.env, relaunchEnv);
    app.relaunch({ args: process.argv.slice(1) });
  }
  app.exit(code);
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    title: "VOID",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: false, //            игре нужен Node (файлы, сохранения, сеть)
      contextIsolation: true, //    preload (и игра) — в своём «мире», страница его не видит
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required", // звук сразу, без клика
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "index.html"));
  win.webContents.on("did-finish-load", () => say("Electron: страница загружена"));

  // Вывод страницы — в наш stdout (его пишет в console.txt tools/windows-launch.js)
  // и в saves/electron.txt (на Windows вывод программы с окном до консоли доходит не всегда)
  win.webContents.on("console-message", (e) => {
    if (e?.message) say(e.message);
  });
  win.webContents.on("preload-error", (e, file, error) => say(`Electron: preload не загрузился (${file}): ${error?.stack || error}`));
  win.webContents.on("did-fail-load", (e, code, desc) => say(`Electron: страница не загрузилась: ${code} ${desc}`));
  win.webContents.on("render-process-gone", (e, details) => {
    say(`Electron: процесс игры упал (${details?.reason}, код ${details?.exitCode})`);
    quit(1);
  });
  // F12 — инструменты разработчика (консоль Chromium): смотреть ошибки, если что-то не так
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F12") win.webContents.toggleDevTools();
  });

  // Крестик окна: сначала игра сохраняется (engine.quit), потом сама просит выйти. Не ответила за 6 с — выходим
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.webContents.send("void:close");
    setTimeout(() => quit(0), 6000).unref?.();
  });
  // Сторож движка (поток Node) в Electron не работает — зависание видит сам Electron
  win.on("unresponsive", () => say("ЗАВИСАНИЕ: игра не отвечает (Electron)"));
  win.on("enter-full-screen", () => win.webContents.send("void:fullscreen", true));
  win.on("leave-full-screen", () => win.webContents.send("void:fullscreen", false));
});

ipcMain.on("void:fullscreen", (e, on) => win?.setFullScreen(!!on));
ipcMain.on("void:size", (e, w, h) => {
  if (win && !win.isFullScreen() && w > 0 && h > 0) win.setContentSize(Math.round(w), Math.round(h));
});
ipcMain.on("void:title", (e, title) => win?.setTitle(String(title)));
ipcMain.on("void:hide", () => win?.hide());
ipcMain.on("void:clipboard", (e, text) => clipboard.writeText(String(text)));
ipcMain.on("void:relaunch", (e, env) => { relaunchEnv = env || {}; });
ipcMain.on("void:log", (e, text) => say(String(text)));
ipcMain.on("void:quit", (e, code) => quit(code || 0));

// Захват мыши (pointer lock). Браузер разрешает его только «по действию пользователя» —
// executeJavaScript(..., true) из главного процесса считается таким действием
ipcMain.on("void:pointer-lock", (e, on, focus = true) => {
  if (!win) return;
  const code = on
    ? `(async () => { const c = document.getElementById("screen");
         if (document.pointerLockElement === c) return;
         try { await c.requestPointerLock({ unadjustedMovement: true }); }
         catch (e1) {
           try { await c.requestPointerLock(); }
           catch (e2) { console.log("захват мыши не удался: " + e1 + " / " + e2); }
         } })()`
    : "document.exitPointerLock()";
  if (on && focus) win.focus(); // захват мыши — только у окна в фокусе (повторы фокус не отнимают)
  win.webContents.executeJavaScript(code, true).catch((e) => say("захват мыши: " + e.message));
});

app.on("window-all-closed", () => quit(0));
