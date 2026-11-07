// ============================================================
//  Геймпад (SDL: Xbox, PlayStation, Switch Pro — названия кнопок по положению: south = A / крест).
//  Подключается сам (первый найденный; вставили позже — подхватит). Кнопки — те же действия игры, что и
//  клавиши: Input.isDown / wasPressed / нажатие спрашивают и геймпад (pad — какая кнопка за каким действием).
//
//    левый стик   — ходьба (forward / back / left / right), нажать — бег (run)
//    правый стик  — взгляд (как мышь; в меню — курсор), south (A) в меню — клик
//    курки        — primary (RT) / secondary (LT); остальное — PAD_DEFAULTS, свои — settings.controls.pad
//
//  rumble(сила, мс) — вибрация (если есть). В автотестах SDL нет — геймпада просто нет.
// ============================================================

import sdl from "../platform/sdl.js";

// Действие → кнопка геймпада. Курки и стики — особые: "rightTrigger", "leftTrigger", "leftStick+" (направление)
export const PAD_DEFAULTS = {
  forward: "leftStickY-", back: "leftStickY+", left: "leftStickX-", right: "leftStickX+",
  primary: "rightTrigger", secondary: "leftTrigger",
  jump: "south", interact: "west", reload: "west", run: "leftStick",
  skill1: "leftShoulder", skill2: "rightShoulder", ultimate: "rightStick",
  item1: "dpadUp", item2: "dpadDown", map: "dpadLeft", mount: "dpadRight",
  pause: "start", talents: "back", inventory: "north", shop: "east",
};
const DEAD = 0.22; // мёртвая зона стиков
const TRIGGER = 0.4; // курок «нажат» дальше этого

export class Gamepad {
  constructor({ bindings = PAD_DEFAULTS, onButton = null } = {}) {
    this.bindings = { ...PAD_DEFAULTS, ...bindings };
    this.onButton = onButton; // (кнопка, нажата?) — движок: нажатие действия / клик в меню
    this.axes = {};
    this.down = new Set(); //      зажатые кнопки и «виртуальные» (курки, направления стиков)
    this.pressed = new Set(); //   нажатые с прошлого опроса (wasPressed)
    this.instance = null;
    this.name = null;
    this.enabled = true; //        игра может закрыть геймпад (pad.enabled = false): кнопки и стики не действуют
    this.lookSpeed = 3.2; //       радиан в секунду при полном отклонении правого стика (× чувствительность)
    if (!sdl.gamepad || typeof sdl.gamepad.on !== "function") return; // нет SDL-геймпадов (тесты, старая SDL)
    try {
      sdl.gamepad.on("deviceAdd", () => this.connect());
      sdl.gamepad.on("deviceRemove", () => this.connect());
      this.connect();
    } catch (e) {
      console.warn("Геймпад недоступен:", e.message);
    }
  }

  get connected() {
    return this.enabled && !!this.instance && !this.instance.closed;
  }

  // Подключиться к первому геймпаду (или отключиться, если его вынули)
  connect() {
    if (this.connected) return;
    this.instance = null;
    const dev = sdl.gamepad.devices?.[0];
    if (!dev) return;
    try {
      const g = sdl.gamepad.openDevice(dev);
      this.instance = g;
      this.name = dev.name || "GAMEPAD";
      g.on("axisMotion", ({ axis, value }) => this.axis(axis, value));
      g.on("buttonDown", ({ button }) => this.button(button, true));
      g.on("buttonUp", ({ button }) => this.button(button, false));
      g.on("close", () => { this.instance = null; this.down.clear(); });
    } catch (e) {
      console.warn("Геймпад не открылся:", e.message);
    }
  }

  button(name, isDown) {
    if (!this.enabled) return;
    if (isDown) {
      if (!this.down.has(name)) this.pressed.add(name);
      this.down.add(name);
    } else this.down.delete(name);
    this.onButton?.(name, isDown);
  }

  // Ось: курки и направления стиков — тоже «кнопки» (нажал дальше порога — нажата)
  axis(name, value) {
    if (!this.enabled) return;
    this.axes[name] = value;
    const virtual = name.endsWith("Trigger") ? [[name, value > TRIGGER]] : [[name + "+", value > 0.5], [name + "-", value < -0.5]];
    for (const [v, on] of virtual) if (on !== this.down.has(v)) this.button(v, on);
  }

  // Стик с мёртвой зоной: { x, y } от -1 до 1 (вниз / вправо — плюс)
  stick(side) {
    const x = this.axes[side + "StickX"] || 0, y = this.axes[side + "StickY"] || 0;
    const len = Math.hypot(x, y);
    if (len < DEAD) return { x: 0, y: 0 };
    const k = (Math.min(1, len) - DEAD) / (1 - DEAD) / len; // за мёртвой зоной — плавно от нуля
    return { x: x * k, y: y * k };
  }

  // Действия, которые запускает кнопка
  actionsFor(button) {
    return Object.keys(this.bindings).filter((a) => this.bindings[a] === button);
  }

  isDown(action) {
    if (!this.enabled) return false;
    const b = this.bindings[action];
    return !!b && this.down.has(b);
  }

  wasPressed(action) {
    if (!this.enabled) return false;
    const b = this.bindings[action];
    if (!b || !this.pressed.has(b)) return false;
    this.pressed.delete(b);
    return true;
  }

  flushPressed() {
    this.pressed.clear();
  }

  // Взгляд правым стиком за dt секунд: { dx, dy } в радианах (квадратичная кривая — точнее у центра)
  look(dt, sensitivity = 1) {
    const s = this.stick("right");
    const curve = (v) => Math.sign(v) * v * v;
    const k = this.lookSpeed * sensitivity * dt;
    return { dx: curve(s.x) * k, dy: curve(s.y) * k };
  }

  rumble(strength = 0.5, ms = 120) {
    try {
      if (this.connected && this.instance.hasRumble) this.instance.rumble(strength * 0.7, strength, Math.round(ms));
    } catch {}
  }
}
