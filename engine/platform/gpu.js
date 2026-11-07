// ============================================================
//  Видеокарта (WebGPU). Обычно — @kmamal/gpu (Google Dawn для Node, рисует в окно SDL).
//  В Electron (tools/electron) — WebGPU самого Chromium (navigator.gpu) и canvas на всё окно:
//  замену кладёт preload в globalThis.VOID_PLATFORM.
// ============================================================
const gpu = globalThis.VOID_PLATFORM?.gpu ?? (await import("@kmamal/gpu")).default;
export default gpu;
