// ============================================================
//  Ввод через ДЕЙСТВИЯ. Игра спрашивает не «нажата ли W»,
//  а «нажато ли действие forward». Какая клавиша или кнопка мыши
//  отвечает за действие — хранится в bindings, и это можно менять в настройках.
//
//  Привязка — это строка: "key:W" (клавиша, по названию scancode)
//  или "mouse:LEFT" (кнопка мыши: LEFT, MIDDLE, RIGHT). Строки легко читать в settings.json.
// ============================================================

import sdl from "../platform/sdl.js";

const SC = sdl.keyboard.SCANCODE;

// Коды клавиш (scancode) — для клавиш, которые игра проверяет напрямую, без привязок (например, цифры)
export const KEYS = SC;

const BUTTON = sdl.mouse.BUTTON;
const SC_NAMES = Object.fromEntries(Object.entries(SC).map(([name, code]) => [code, name]));
const BUTTON_NAMES = Object.fromEntries(Object.entries(BUTTON).map(([name, code]) => [code, name]));

// Как показывать клавиши игроку
const DISPLAY = {
  ESCAPE: "ESC", RETURN: "ENTER", SPACE: "SPACE", BACKSPACE: "BACKSPACE",
  LSHIFT: "L-SHIFT", RSHIFT: "R-SHIFT", LCTRL: "L-CTRL", RCTRL: "R-CTRL",
  LALT: "L-ALT", RALT: "R-ALT", LGUI: "L-CMD", RGUI: "R-CMD",
  UP: "UP", DOWN: "DOWN", LEFT: "LEFT", RIGHT: "RIGHT",
};
const MOUSE_DISPLAY = { LEFT: "LMB", MIDDLE: "MMB", RIGHT: "RMB" };

export class Input {
  constructor(window, bindings) {
    this.bindings = bindings; // { forward: "key:W", place: "mouse:LEFT", ... }
    this.keys = new Set(); // зажатые клавиши (scancode)
    this.buttons = new Set(); // зажатые кнопки мыши
    this.pressedKeys = new Set(); // нажатые с прошлого опроса (wasPressed) — короткое нажатие между кадрами не теряется
    this.pressedButtons = new Set(); // то же для кнопок мыши

    window.on("keyDown", (e) => {
      this.keys.add(e.scancode);
      if (!e.repeat) this.pressedKeys.add(e.scancode);
    });
    window.on("keyUp", (e) => this.keys.delete(e.scancode));
    window.on("mouseButtonDown", (e) => {
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    window.on("mouseButtonUp", (e) => this.buttons.delete(e.button));
    window.on("blur", () => this.clear());
  }

  clear() {
    this.keys.clear();
    this.buttons.clear();
    this.pressedKeys.clear();
    this.pressedButtons.clear();
  }

  // Забыть нажатия, которые ещё никто не забрал (wasPressed). Движок зовёт, пока мир клавиш не читает
  // (меню, пауза, окно поверх мира): иначе пробел, нажатый в меню, — прыжок сразу после него
  flushPressed() {
    this.pad?.flushPressed();
    if (this.pressedKeys.size) this.pressedKeys.clear();
    if (this.pressedButtons.size) this.pressedButtons.clear();
  }

  // Нажали ли действие с прошлого вызова (для этого действия) — и «съесть» нажатие. Нажал и отпустил быстрее
  // кадра или тика — всё равно true (isDown бы его пропустил); одно нажатие — ровно один true, сколько бы тиков
  // ни прошло за кадр. Для прыжка, двойного прыжка и т. п. Клавиши и кнопки мыши
  wasPressed(action) {
    if (this.pad?.wasPressed(action)) return true;
    const [type, name] = (this.bindings[action] || ":").split(":");
    const set = type === "key" ? this.pressedKeys : type === "mouse" ? this.pressedButtons : null;
    const code = type === "key" ? SC[name] : BUTTON[name];
    if (!set || !set.has(code)) return false;
    set.delete(code);
    return true;
  }

  // Зажато ли действие прямо сейчас (для ходьбы, бега). Геймпад (this.pad) — тоже
  isDown(action) {
    if (this.pad?.isDown(action)) return true;
    const [type, name] = (this.bindings[action] || ":").split(":");
    if (type === "key") return this.keys.has(SC[name]);
    if (type === "mouse") return this.buttons.has(BUTTON[name]);
    return false;
  }

  // Зажат ли Shift (любой) — модификатор: Shift+Q, Shift+клик...
  get shift() {
    return this.keys.has(SC.LSHIFT) || this.keys.has(SC.RSHIFT);
  }

  // Какие действия запускает это событие. event: { scancode } или { button }
  actionsFor(event) {
    if (event.pad !== undefined) return this.pad ? this.pad.actionsFor(event.pad) : []; // кнопка геймпада
    const binding = Input.bindingFromEvent(event);
    if (!binding) return [];
    return Object.keys(this.bindings).filter((a) => this.bindings[a] === binding);
  }

  // Событие клавиатуры или мыши -> привязка-строка
  static bindingFromEvent(event) {
    if (event.scancode !== undefined) return SC_NAMES[event.scancode] ? "key:" + SC_NAMES[event.scancode] : null;
    if (event.button !== undefined) return BUTTON_NAMES[event.button] ? "mouse:" + BUTTON_NAMES[event.button] : null;
    return null;
  }

  // Название привязки для показа в настройках: "key:LSHIFT" -> "L-SHIFT", "mouse:LEFT" -> "ЛКМ"
  static label(binding) {
    if (!binding) return "-";
    const [type, name] = binding.split(":");
    if (type === "mouse") return MOUSE_DISPLAY[name] || name;
    return DISPLAY[name] || name;
  }
}
