// Пустышка библиотеки окна (@kmamal/sdl): коды клавиш и кнопок настоящие по смыслу (имена), остальное — пусто
import { any } from "./any.mjs";

const names = [
  "UNKNOWN", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."1234567890", "RETURN", "ESCAPE", "BACKSPACE", "TAB", "SPACE", "MINUS", "EQUALS",
  "LEFTBRACKET", "RIGHTBRACKET", "BACKSLASH", "SEMICOLON", "APOSTROPHE", "GRAVE", "COMMA", "PERIOD", "SLASH", "CAPSLOCK",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "RIGHT", "LEFT", "DOWN", "UP",
  "LCTRL", "LSHIFT", "LALT", "LGUI", "RCTRL", "RSHIFT", "RALT", "RGUI", "DELETE", "HOME", "END", "PAGEUP", "PAGEDOWN", "INSERT",
];
const sdl = any("sdl");
sdl.keyboard = { SCANCODE: Object.fromEntries(names.map((n, i) => [n, i])), getState: () => [] };
sdl.mouse = { BUTTON: { LEFT: 1, MIDDLE: 2, RIGHT: 3 }, setPosition() {}, showCursor() {} };
sdl.audio = { playback: null, openDevice: () => any("audioDevice") };
export default sdl;
