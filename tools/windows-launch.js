// ============================================================
//  Запуск игры «под присмотром» (для Windows, работает и везде).
//  Запускает games/builder/main.js отдельным процессом, весь его вывод показывает в окне и пишет
//  в games/builder/saves/console.txt.
//
//  Видеокарта: если игра падает сразу после старта (чаще всего — сбой драйвера на D3D12), пробуем
//  другие способы рисования по очереди: как по умолчанию → Vulkan → D3D11 → OpenGL, и у каждого —
//  ещё «безопасный режим» без доп. эффектов (флаг safe: без неба/теней, размытия, блика, 3D-частиц)
//  (переменная VOID_GPU_FLAGS=backend=...,safe — её читает движок). Тот, что заработал, запоминаем
//  в saves/gpu.txt — в следующий раз начинаем с него.
//
//  Если не заработало ничего — окно НЕ закрывается: видны коды ошибок, подсказки и хвосты журналов.
//
//    node tools/windows-launch.js
// ============================================================

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SAVES = path.join(ROOT, "games", "builder", "saves");
const CONSOLE_FILE = path.join(SAVES, "console.txt");
const LOG_FILE = path.join(SAVES, "log.txt");
const GPU_FILE = path.join(SAVES, "gpu.txt");
const QUICK = 15; // упала быстрее, чем за столько секунд, — «не взлетело»
// "" — как решит сама библиотека; ",safe" — то же, но без доп. эффектов
// power=high / power=low — ноутбук с двумя видеокартами (встроенная + NVIDIA/AMD): попросить конкретную
const BACKENDS = ["", "safe", "power=high", "power=low", "backend=vulkan", "backend=vulkan,safe", "backend=d3d11", "backend=d3d11,power=low", "backend=d3d11,safe", "backend=opengl"];

// Частые коды аварийного выхода Windows (NTSTATUS) — что они обычно значат
const HINTS = {
  0xc0000005: "сбой внутри библиотеки окна или видеокарты (нарушение доступа к памяти). Обнови драйвер видеокарты.",
  0xc0000135: "не хватает системной DLL. Установи Microsoft Visual C++ Redistributable x64 (сайт Microsoft) и запусти снова.",
  0xc000007b: "библиотека не той разрядности (32/64 бит). Нужна 64-битная Windows и 64-битный Node.js.",
  0xc000001d: "процессор не поддерживает нужные инструкции.",
  0xc0000409: "аварийная остановка внутри библиотеки (переполнение буфера / fail-fast).",
  0x80000003: "аварийная остановка внутри библиотеки (breakpoint) — часто видеодрайвер.",
};

const hex = (code) => (code == null ? "-" : "0x" + (code >>> 0).toString(16).toUpperCase());
const label = (flags) => {
  const parts = flags.split(",").filter(Boolean);
  const safe = parts.includes("safe");
  const rest = parts.filter((p) => p !== "safe").map((p) => (p === "power=high" ? "мощная видеокарта" : p === "power=low" ? "встроенная видеокарта" : p)).join(", ") || "по умолчанию";
  return safe ? `${rest}, безопасный режим` : rest;
};
const tail = (file, n = 25) => {
  try {
    return fs.readFileSync(file, "utf8").trimEnd().split(/\r?\n/).slice(-n).join("\n");
  } catch {
    return "(файла нет)";
  }
};

fs.mkdirSync(SAVES, { recursive: true });

// Один запуск игры с флагами видеокарты flags. Вернёт { code, signal, secs }
function runGame(flags, out) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(ROOT, "games", "builder", "main.js")], {
      cwd: ROOT,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, VOID_GPU_FLAGS: flags },
    });
    child.stdout.on("data", (d) => { process.stdout.write(d); out.write(d); });
    child.stderr.on("data", (d) => { process.stderr.write(d); out.write(d); });
    // Продержалась QUICK секунд — этот способ рисования рабочий, запоминаем
    const keep = setTimeout(() => fs.writeFileSync(GPU_FILE, flags), QUICK * 1000);
    child.on("exit", (code, signal) => {
      clearTimeout(keep);
      resolve({ code, signal, secs: (Date.now() - started) / 1000 });
    });
  });
}

// Порядок попыток: сначала то, что уже заработало раньше
let saved = null;
try { saved = fs.readFileSync(GPU_FILE, "utf8").trim(); } catch {}
const order = saved !== null ? [saved, ...BACKENDS.filter((b) => b !== saved)] : BACKENDS;

const out = fs.createWriteStream(CONSOLE_FILE);
const tries = [];
let last = null;
for (const flags of order) {
  if (tries.length) console.log(`\nНе запустилась (${label(tries.at(-1).flags)}). Пробую другой способ рисования: ${label(flags)}...\n`);
  out.write(`\n===== запуск: видеокарта ${label(flags)} =====\n`);
  last = await runGame(flags, out);
  tries.push({ flags, ...last, log: tail(LOG_FILE, 6) }); // журнал перезаписывается при каждом старте — сохраняем хвост попытки
  out.write(`--- журнал этой попытки ---\n${tries.at(-1).log}\n`);
  if (last.secs >= QUICK) break; // поиграли — это уже не «не взлетело»
  if (last.code === 0) break; //    сама вышла (например, нажали «Выход») — не перебираем
}
out.end();

if (last.code === 0 && last.secs >= QUICK) process.exit(0); // обычный выход из игры
if (last.code === 0 && tries.length === 1) process.exit(0); // быстро вышли сами — тоже не ошибка

console.log("\n==================== ИГРА ЗАКРЫЛАСЬ ====================");
for (const t of tries) {
  const hint = HINTS[t.code >>> 0];
  console.log(`Видеокарта ${label(t.flags)}: код ${t.code} (${hex(t.code)})${t.signal ? `, сигнал ${t.signal}` : ""}, проработала ${t.secs.toFixed(1)} с${hint ? "\n   похоже на: " + hint : ""}`);
  const lastStep = t.log.split("\n").filter(Boolean).at(-1);
  if (lastStep) console.log(`   последний шаг: ${lastStep}`);
}
console.log(`\n--- последние строки журнала (${LOG_FILE}) ---\n${tail(LOG_FILE)}`);
console.log(`\n--- последние строки вывода (${CONSOLE_FILE}) ---\n${tail(CONSOLE_FILE, 15)}`);
console.log("\nСфотографируй это окно или пришли файлы log.txt и console.txt из папки выше.");
console.log("Нажми Enter, чтобы закрыть.");
process.stdin.resume();
process.stdin.once("data", () => process.exit(last.code || 1));
