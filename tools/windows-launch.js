// ============================================================
//  Запуск игры «под присмотром» (для Windows, работает и везде).
//  Запускает games/builder/main.js отдельным процессом, весь его вывод показывает в окне и пишет
//  в games/builder/saves/console.txt. Если игра упала (код выхода не 0) или закрылась подозрительно
//  быстро — НЕ закрывает окно: показывает код ошибки, подсказку и хвосты журналов, ждёт Enter.
//  Так «окно мигнуло и пропало» превращается в текст, который можно прислать.
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
const QUICK = 15; // закрылась быстрее, чем за столько секунд, — тоже подозрительно

// Частые коды аварийного выхода Windows (NTSTATUS) — что они обычно значат
const HINTS = {
  0xc0000005: "сбой внутри библиотеки окна или видеокарты (нарушение доступа к памяти). Обнови драйвер видеокарты.",
  0xc0000135: "не хватает системной DLL. Установи Microsoft Visual C++ Redistributable x64 (сайт Microsoft) и запусти снова.",
  0xc000007b: "библиотека не той разрядности (32/64 бит). Нужна 64-битная Windows и 64-битный Node.js.",
  0xc000001d: "процессор не поддерживает нужные инструкции.",
  0xc0000409: "аварийная остановка внутри библиотеки (переполнение буфера / fail-fast).",
  0x80000003: "аварийная остановка внутри библиотеки (breakpoint) — часто видеодрайвер.",
};

fs.mkdirSync(SAVES, { recursive: true });
const out = fs.createWriteStream(CONSOLE_FILE);
const started = Date.now();
const child = spawn(process.execPath, [path.join(ROOT, "games", "builder", "main.js")], {
  cwd: ROOT,
  stdio: ["inherit", "pipe", "pipe"],
});
child.stdout.on("data", (d) => { process.stdout.write(d); out.write(d); });
child.stderr.on("data", (d) => { process.stderr.write(d); out.write(d); });

const tail = (file, n = 25) => {
  try {
    return fs.readFileSync(file, "utf8").trimEnd().split(/\r?\n/).slice(-n).join("\n");
  } catch {
    return "(файла нет)";
  }
};

child.on("exit", (code, signal) => {
  const secs = (Date.now() - started) / 1000;
  out.end();
  if (code === 0 && secs >= QUICK) process.exit(0); // обычный выход из игры
  const unsigned = code == null ? null : code >>> 0;
  const hex = unsigned == null ? "-" : "0x" + unsigned.toString(16).toUpperCase();
  console.log("\n==================== ИГРА ЗАКРЫЛАСЬ ====================");
  console.log(`Код выхода: ${code} (${hex})${signal ? `, сигнал ${signal}` : ""}, проработала ${secs.toFixed(1)} с`);
  if (unsigned != null && HINTS[unsigned]) console.log("Похоже на: " + HINTS[unsigned]);
  else if (code === 0) console.log("Игра сама закрылась сразу после запуска.");
  console.log(`\n--- последние строки журнала (${LOG_FILE}) ---\n${tail(LOG_FILE)}`);
  console.log(`\n--- последние строки вывода (${CONSOLE_FILE}) ---\n${tail(CONSOLE_FILE, 15)}`);
  console.log("\nСфотографируй это окно или пришли файлы log.txt и console.txt из папки выше.");
  console.log("Нажми Enter, чтобы закрыть.");
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(code || 1));
});
