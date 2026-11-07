// ============================================================
//  VOID в Electron — замены библиотек окна (@kmamal/sdl) и видеокарты (@kmamal/gpu) на окне браузера.
//  Движку отдаём ровно то, чем он пользуется у SDL:
//    sdl.video.createWindow() — окно: размеры, полный экран, события keyDown / keyUp / mouseMove /
//      mouseButtonDown / mouseButtonUp / mouseWheel / blur / focus / resize / close, захват мыши;
//    sdl.keyboard.SCANCODE, sdl.mouse.BUTTON — коды клавиш и кнопок (по именам, как у SDL);
//    sdl.audio.openDevice() — звук: очередь чисел float32 (стерео, 48 кГц) → Web Audio (AudioWorklet);
//    sdl.clipboard.setText().
//  gpu: WebGPU самого Chromium (navigator.gpu); «вывод в окно» — canvas#screen на всё окно.
// ============================================================

import { EventEmitter } from "node:events";

// ---------- Клавиши: имена как у SDL (KEYS.W, KEYS.RETURN...). Числа — свои, но постоянные ----------
const CODES = {
  Enter: "RETURN", Escape: "ESCAPE", Backspace: "BACKSPACE", Tab: "TAB", Space: "SPACE", Minus: "MINUS", Equal: "EQUALS",
  BracketLeft: "LEFTBRACKET", BracketRight: "RIGHTBRACKET", Backslash: "BACKSLASH", Semicolon: "SEMICOLON",
  Quote: "APOSTROPHE", Backquote: "GRAVE", Comma: "COMMA", Period: "PERIOD", Slash: "SLASH", CapsLock: "CAPSLOCK",
  ArrowRight: "RIGHT", ArrowLeft: "LEFT", ArrowDown: "DOWN", ArrowUp: "UP",
  ControlLeft: "LCTRL", ShiftLeft: "LSHIFT", AltLeft: "LALT", MetaLeft: "LGUI",
  ControlRight: "RCTRL", ShiftRight: "RSHIFT", AltRight: "RALT", MetaRight: "RGUI",
  Delete: "DELETE", Home: "HOME", End: "END", PageUp: "PAGEUP", PageDown: "PAGEDOWN", Insert: "INSERT",
  PrintScreen: "PRINTSCREEN", ScrollLock: "SCROLLLOCK", Pause: "PAUSE", NumLock: "NUMLOCKCLEAR", IntlBackslash: "NONUSBACKSLASH",
  NumpadEnter: "KP_ENTER", NumpadAdd: "KP_PLUS", NumpadSubtract: "KP_MINUS", NumpadMultiply: "KP_MULTIPLY",
  NumpadDivide: "KP_DIVIDE", NumpadDecimal: "KP_PERIOD", ContextMenu: "APPLICATION",
};
for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") CODES["Key" + c] = c;
for (let i = 0; i <= 9; i++) { CODES["Digit" + i] = String(i); CODES["Numpad" + i] = "KP_" + i; }
for (let i = 1; i <= 12; i++) CODES["F" + i] = "F" + i;
const SCANCODE = { UNKNOWN: 0 };
for (const name of Object.values(CODES)) SCANCODE[name] ??= Object.keys(SCANCODE).length;
const scancodeOf = (e) => SCANCODE[CODES[e.code]] ?? SCANCODE.UNKNOWN;
// Эти клавиши браузер обрабатывает сам (Tab — фокус, F5 — перезагрузка, Alt — меню...): у игры — свои
const KEEP_DEFAULT = new Set([]);

const BUTTON = { LEFT: 1, MIDDLE: 2, RIGHT: 3, X1: 4, X2: 5 };

export function createPlatform(ipc) {
  const canvas = document.getElementById("screen");
  let audioCtx = null;
  const resumeAudio = () => { if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {}); };

  // ---------- Окно ----------
  class ElectronWindow extends EventEmitter {
    constructor({ title = "VOID", width, height, fullscreen = false } = {}) {
      super();
      this.destroyed = false;
      this._fullscreen = false;
      this._relative = false;
      ipc.send("void:title", title);
      document.title = title;
      if (width && height) ipc.send("void:size", width, height);
      if (fullscreen) this.setFullscreen(true);
      this.fitCanvas();
      this.listen();
    }

    get width() { return window.innerWidth; }
    get height() { return window.innerHeight; }
    get pixelWidth() { return Math.max(1, Math.round(window.innerWidth * window.devicePixelRatio)); }
    get pixelHeight() { return Math.max(1, Math.round(window.innerHeight * window.devicePixelRatio)); }
    get x() { return window.screenX; }
    get y() { return window.screenY; }
    get fullscreen() { return this._fullscreen; }

    fitCanvas() {
      if (canvas.width !== this.pixelWidth) canvas.width = this.pixelWidth;
      if (canvas.height !== this.pixelHeight) canvas.height = this.pixelHeight;
    }

    setFullscreen(on) {
      this._fullscreen = !!on;
      ipc.send("void:fullscreen", !!on);
    }
    setSize(w, h) { ipc.send("void:size", w, h); }
    setTitle(t) { document.title = t; ipc.send("void:title", t); }
    hide() { ipc.send("void:hide"); }
    destroy() { this.destroyed = true; }

    // Захват мыши: курсор скрыт и стоит, mouseMove даёт сдвиг (dx, dy) — как относительный режим SDL
    setRelativeMouseMode(on) {
      this._relative = !!on;
      canvas.style.cursor = on ? "none" : ""; // курсор прячем сразу, даже если захват ещё не дали
      clearTimeout(this._retry);
      this._tries = 0;
      if (on) this.relock(); // обычно это внутри клика (кнопка «продолжить»): так захват дают сразу
      ipc.send("void:pointer-lock", !!on, true);
    }

    // Захват слетел, а игра его ждёт: «нажимаем» Esc за игрока — она откроет паузу и отпустит мышь
    // (курсор виден). Клик «продолжить» — настоящее действие пользователя, по нему захват дают всегда.
    // Если Esc игрок нажал сам — второй раз не нажимаем (иначе пауза откроется и тут же закроется)
    escapeToPause() {
      if (!this._relative || performance.now() - (this._lastEsc || 0) < 500) return;
      console.log("захват мыши потерян — открываю паузу (клик по «продолжить» вернёт захват)");
      const sc = SCANCODE.ESCAPE;
      this.emit("keyDown", { scancode: sc, key: "Escape", repeat: false });
      this.emit("keyUp", { scancode: sc, key: "Escape", repeat: false });
    }

    // Захват слетел или его не дали (например, Chromium после выхода по Esc какое-то время не даёт
    // захватить снова), а игре он нужен: без захвата курсор упирается в край экрана и камера дальше
    // не крутится. Просим снова, пока не дадут (только пока окно в фокусе, не отнимая фокус у других окон)
    retryLock() {
      clearTimeout(this._retry);
      this._retry = setTimeout(() => {
        if (!this._relative || document.pointerLockElement === canvas) return;
        if (!document.hasFocus()) return this.retryLock(); // окно не в фокусе — ждём, фокус не отнимаем
        if (++this._tries > 2) return this.escapeToPause(); // ~1.5 с не дают — пауза (см. выше)
        ipc.send("void:pointer-lock", true, false);
        this.retryLock();
      }, 500);
    }

    // Захват не дали (или сняли): следующий клик по окну — настоящее действие пользователя, просим снова
    relock() {
      if (!this._relative || document.pointerLockElement === canvas) return;
      try {
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        p?.catch?.(() => canvas.requestPointerLock()?.catch?.(() => {}));
      } catch {
        try { canvas.requestPointerLock(); } catch {}
      }
    }

    listen() {
      const pos = (e) => ({ x: e.clientX, y: e.clientY });
      window.addEventListener("keydown", (e) => {
        resumeAudio();
        if (e.code === "Escape") this._lastEsc = performance.now();
        if (!KEEP_DEFAULT.has(e.code)) e.preventDefault();
        this.emit("keyDown", { scancode: scancodeOf(e), key: e.key, repeat: e.repeat });
      });
      window.addEventListener("keyup", (e) => {
        if (!KEEP_DEFAULT.has(e.code)) e.preventDefault();
        this.emit("keyUp", { scancode: scancodeOf(e), key: e.key, repeat: false });
      });
      window.addEventListener("mousemove", (e) => {
        this.emit("mouseMove", { ...pos(e), dx: e.movementX || 0, dy: e.movementY || 0 });
      });
      window.addEventListener("mousedown", (e) => {
        resumeAudio();
        e.preventDefault();
        canvas.focus();
        this.relock();
        this.emit("mouseButtonDown", { ...pos(e), button: e.button + 1 }); // браузер: 0 1 2 → SDL: 1 2 3
      });
      window.addEventListener("mouseup", (e) => {
        e.preventDefault();
        this.emit("mouseButtonUp", { ...pos(e), button: e.button + 1 });
      });
      window.addEventListener("contextmenu", (e) => e.preventDefault());
      window.addEventListener("wheel", (e) => {
        e.preventDefault();
        const dy = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0; // SDL: вверх — плюс
        if (dy) this.emit("mouseWheel", { ...pos(e), dx: 0, dy, flipped: false });
      }, { passive: false });
      window.addEventListener("blur", () => this.emit("blur"));
      window.addEventListener("focus", () => this.emit("focus"));
      window.addEventListener("resize", () => {
        this.fitCanvas();
        this.emit("resize", { width: this.width, height: this.height, pixelWidth: this.pixelWidth, pixelHeight: this.pixelHeight });
      });
      document.addEventListener("pointerlockchange", () => {
        const locked = document.pointerLockElement === canvas;
        console.log("захват мыши: " + (locked ? "да" : "нет"));
        if (locked) { this._tries = 0; return; }
        if (!this._relative) return;
        // Сняли не мы: чаще всего — Esc (Chromium сам отпускает мышь по Esc). Дадим настоящему Esc дойти,
        // потом: игра всё ещё ждёт захват — просим снова, не дают — пауза
        setTimeout(() => this.retryLock(), 150);
      });
      document.addEventListener("pointerlockerror", () => {
        console.log("захват мыши: не дали (pointerlockerror), пробую снова");
        if (this._relative) this.retryLock();
      });
      ipc.on("void:fullscreen", (e, on) => { this._fullscreen = !!on; });
      ipc.on("void:close", () => this.emit("close"));
    }
  }

  // ---------- Звук: SDL-подобная очередь → AudioWorklet ----------
  // Движок кладёт куски (Buffer float32, стерео вперемешку) и спрашивает, сколько байт ещё не прозвучало (queued)
  const WORKLET = `
    class VoidPcm extends AudioWorkletProcessor {
      constructor() {
        super();
        this.q = []; this.off = 0; this.used = 0; this.n = 0;
        this.port.onmessage = (e) => {
          if (e.data === "clear") { this.q = []; this.off = 0; return; }
          this.q.push(e.data);
        };
      }
      process(inputs, outputs) {
        const out = outputs[0], L = out[0], R = out[1] || out[0];
        for (let i = 0; i < L.length; i++) {
          while (this.q.length && this.off >= this.q[0].length) { this.q.shift(); this.off = 0; }
          if (!this.q.length) { L[i] = 0; R[i] = 0; continue; }
          const c = this.q[0];
          L[i] = c[this.off]; R[i] = c[this.off + 1];
          this.off += 2; this.used++;
        }
        if (++this.n >= 4) { if (this.used) this.port.postMessage(this.used); this.used = 0; this.n = 0; }
        return true;
      }
    }
    registerProcessor("void-pcm", VoidPcm);`;

  function openAudio({ frequency = 48000 } = {}) {
    audioCtx = new AudioContext({ sampleRate: frequency, latencyHint: "interactive" });
    let node = null;
    let pending = [];
    const dev = { queued: 0, closed: false };
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    audioCtx.audioWorklet.addModule(url).then(() => {
      node = new AudioWorkletNode(audioCtx, "void-pcm", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => { dev.queued = Math.max(0, dev.queued - e.data * 8); };
      node.connect(audioCtx.destination);
      for (const chunk of pending) node.port.postMessage(chunk, [chunk.buffer]);
      pending = [];
    }).catch((e) => console.error("Звук (AudioWorklet) не запустился:", e?.message || e));
    dev.play = () => resumeAudio();
    dev.clearQueue = () => {
      dev.queued = 0;
      pending = [];
      node?.port.postMessage("clear");
    };
    dev.enqueue = (buf) => {
      const chunk = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      dev.queued += chunk.byteLength;
      if (node) node.port.postMessage(chunk, [chunk.buffer]);
      else pending.push(chunk);
    };
    dev.close = () => { dev.closed = true; audioCtx?.close().catch(() => {}); };
    return dev;
  }

  const sdl = {
    video: { createWindow: (opts) => new ElectronWindow(opts) },
    keyboard: { SCANCODE, getState: () => [] },
    mouse: {
      BUTTON,
      setPosition() {}, // в Electron мышь захватывается pointer lock (setRelativeMouseMode)
      showCursor(on) { canvas.style.cursor = on ? "" : "none"; },
    },
    audio: { playback: null, openDevice: (dev, options) => openAudio(options) },
    clipboard: { setText: (t) => ipc.send("void:clipboard", String(t)) },
    gamepad: null, // геймпады в Electron — позже (navigator.getGamepads)
  };

  // ---------- Видеокарта: WebGPU Chromium ----------
  const gpu = {
    create: () => ({
      requestAdapter: (options) => navigator.gpu.requestAdapter({ powerPreference: "high-performance", ...(options || {}) }),
    }),
    destroy() {},
    renderGPUDeviceToWindow({ device, window: win }) {
      const ctx = canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: "opaque" });
      return {
        getPreferredFormat: () => format,
        getCurrentTextureView: () => {
          win?.fitCanvas?.(); // canvas — ровно в пиксели окна (сменился масштаб экрана — тоже)
          return ctx.getCurrentTexture().createView();
        },
        resize() { win?.fitCanvas?.(); }, // текстура кадра берёт размер canvas сама
        swap() {}, //    кадр покажет сам браузер, когда JS отдаст управление
      };
    },
    GPUBufferUsage: globalThis.GPUBufferUsage,
    GPUTextureUsage: globalThis.GPUTextureUsage,
    GPUShaderStage: globalThis.GPUShaderStage,
    GPUMapMode: globalThis.GPUMapMode,
    GPUColorWrite: globalThis.GPUColorWrite,
  };

  return {
    electron: true,
    sdl,
    gpu,
    // Следующий кадр: по кадру экрана; окно скрыто (свернули) — rAF стоит, тогда по таймеру
    raf: (cb) => (document.hidden ? setTimeout(cb, 16) : requestAnimationFrame(cb)),
    quit: (code) => ipc.send("void:quit", code),
    relaunch: (env) => ipc.send("void:relaunch", env),
  };
}
