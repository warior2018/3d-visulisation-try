// ============================================================
//  Библиотека окна, ввода и звука. Обычно — @kmamal/sdl (SDL, Node).
//  В Electron (tools/electron) её место занимает своя замена на окне браузера:
//  preload кладёт её в globalThis.VOID_PLATFORM до загрузки игры. Остальной движок не знает разницы.
// ============================================================
const sdl = globalThis.VOID_PLATFORM?.sdl ?? (await import("@kmamal/sdl")).default;
export default sdl;
