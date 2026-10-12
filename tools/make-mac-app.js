// ============================================================
//  Ярлык игры для macOS: собирает VOID.app — двойной клик (или клик в Dock) и игра запускается,
//  без терминала и без захода в папку.
//  Запуск: node tools/make-mac-app.js   ->   ../VOID.app (рядом с папкой nodejs_visual)
//
//  Что внутри .app — обычная папка особого вида:
//    VOID.app/Contents/Info.plist        — паспорт программы: имя, значок, что запускать
//    VOID.app/Contents/MacOS/VOID        — сам запуск: скрипт bash, находит node и стартует игру
//    VOID.app/Contents/Resources/VOID.icns — значок (рисуем здесь же, кодом — кубик травы)
//
//  Где node: в программах, открытых из Finder, PATH почти пустой, поэтому скрипт ищет node сам:
//  путь, с которым собирали ярлык (если собирали на Маке), Homebrew, nvm и, наконец, спрашивает zsh.
//  Ошибки игры пишутся в ~/Library/Logs/VOID.log.
// ============================================================

import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))); // nodejs_visual
const APP = path.join(ROOT, "..", "VOID.app");
const GAME = "games/builder/main.js";
// Запасной путь к игре (если ярлык унесут из папки): где лежит nodejs_visual на Маке.
// Собираешь не на том компьютере, где играть, — подскажи: VOID_ROOT=/путь/к/nodejs_visual node tools/make-mac-app.js
const GAME_ROOT = process.env.VOID_ROOT || ROOT;
// node, которым запущен этот скрипт, — если собираем на Маке, его и «зашьём» первым кандидатом
const BUILT_NODE = process.platform === "darwin" ? process.execPath : "";

// ---------- Скрипт запуска ----------
const launcher = `#!/bin/bash
# VOID — запуск игры (собрано tools/make-mac-app.js)
LOG="$HOME/Library/Logs/VOID.log"
alert() { /usr/bin/osascript -e "display alert \\"VOID\\" message \\"$1\\"" >/dev/null 2>&1; }

# Папка с игрой: ярлык лежит рядом с nodejs_visual; если ярлык перенесли — путь, где его собирали
HERE="$(cd "$(dirname "$0")/../../.." && pwd)"
GAME_DIR="$HERE/nodejs_visual"
[ -f "$GAME_DIR/${GAME}" ] || GAME_DIR="${GAME_ROOT}"
if [ ! -f "$GAME_DIR/${GAME}" ]; then
  alert "Не нашёл игру: $GAME_DIR/${GAME}. Положи VOID.app рядом с папкой nodejs_visual."
  exit 1
fi

# Где node: зашитый путь -> Homebrew / системный -> nvm -> спросить zsh (он читает .zprofile/.zshrc)
NODE="${BUILT_NODE}"
[ -x "$NODE" ] || NODE=""
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -n "$NODE" ] || NODE="$(command -v node)"
if [ -z "$NODE" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; NODE="$(command -v node)"; fi
[ -n "$NODE" ] || NODE="$(/bin/zsh -lic 'command -v node' 2>/dev/null | tail -n 1)"
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  alert "Не нашёл Node.js. Установи его или запусти один раз в терминале: node tools/make-mac-app.js"
  exit 1
fi

cd "$GAME_DIR"
echo "=== $(date) — $NODE $GAME_DIR/${GAME}" >> "$LOG"
exec "$NODE" "$GAME_DIR/${GAME}" >> "$LOG" 2>&1
`;

// ---------- Паспорт программы ----------
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>VOID</string>
  <key>CFBundleDisplayName</key><string>VOID</string>
  <key>CFBundleIdentifier</key><string>local.void.builder</string>
  <key>CFBundleExecutable</key><string>VOID</string>
  <key>CFBundleIconFile</key><string>VOID</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;

// ---------- Значок: кубик травы на тёмном скруглённом квадрате ----------
// Рисуем по пикселям: для каждой точки (u, v от 0 до 1) решаем, какого она цвета
const inPoly = (x, y, pts) => {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) {
      if (sign && Math.sign(c) !== sign) return false;
      sign = Math.sign(c);
    }
  }
  return true;
};

function iconPixel(u, v) {
  // Фон — скруглённый квадрат (как у значков macOS), с градиентом сверху вниз
  const m = 0.09, r = 0.2;
  const qx = Math.max(Math.abs(u - 0.5) - (0.5 - m - r), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - m - r), 0);
  const outside = Math.hypot(qx, qy) - r;
  if (outside > 0) return [0, 0, 0, 0];
  const edgeAlpha = Math.min(1, -outside * 300); // сглаженный край
  let col = [18 + 22 * v, 20 + 26 * v, 34 + 40 * v];
  // Изометрический кубик: верх — трава, бока — земля
  const cx = 0.5, cy = 0.53, s = 0.27, w = s * Math.cos(Math.PI / 6);
  const top = [[cx, cy - s], [cx + w, cy - s / 2], [cx, cy], [cx - w, cy - s / 2]];
  const left = [[cx - w, cy - s / 2], [cx, cy], [cx, cy + s], [cx - w, cy + s / 2]];
  const right = [[cx, cy], [cx + w, cy - s / 2], [cx + w, cy + s / 2], [cx, cy + s]];
  const grassLip = (y, yTop) => y < yTop + s * 0.16; // полоска травы по верху боков
  if (inPoly(u, v, top)) col = [104, 176, 78];
  else if (inPoly(u, v, left)) col = grassLip(v, cy - s / 2 + ((u - (cx - w)) / w) * (s / 2)) ? [86, 150, 64] : [140, 100, 64];
  else if (inPoly(u, v, right)) col = grassLip(v, cy - ((u - cx) / w) * (s / 2)) ? [70, 126, 52] : [108, 76, 48];
  else {
    // мягкое свечение вокруг кубика
    const g = Math.max(0, 1 - Math.hypot(u - cx, v - cy) / 0.42) ** 2;
    col = col.map((c, i) => c + g * [60, 70, 110][i]);
  }
  return [...col.map((c) => Math.round(Math.min(255, c))), Math.round(255 * edgeAlpha)];
}

// PNG без библиотек: сигнатура, IHDR, IDAT (сжатые строки пикселей), IEND
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const SS = 2; // сглаживание: 2×2 точки на пиксель
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // фильтр строки: нет
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) {
        const p = iconPixel((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size);
        for (let k = 0; k < 3; k++) acc[k] += p[k] * p[3];
        acc[3] += p[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let k = 0; k < 3; k++) raw[o + k] = acc[3] ? Math.round(acc[k] / acc[3]) : 0;
      raw[o + 3] = Math.round(acc[3] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 бит, RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// .icns: заголовок «icns» + длина, дальше записи «тип + длина + PNG» (ic07 = 128, ic08 = 256, ic09 = 512, ic10 = 1024)
function icns() {
  const parts = [["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]].map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8); head.write(type, 0, "ascii"); head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8); head.write("icns", 0, "ascii"); head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// ---------- Собираем ----------
mkdirSync(path.join(APP, "Contents/MacOS"), { recursive: true });
mkdirSync(path.join(APP, "Contents/Resources"), { recursive: true });
writeFileSync(path.join(APP, "Contents/Info.plist"), plist);
writeFileSync(path.join(APP, "Contents/MacOS/VOID"), launcher);
chmodSync(path.join(APP, "Contents/MacOS/VOID"), 0o755);
writeFileSync(path.join(APP, "Contents/Resources/VOID.icns"), icns());
if (process.argv.includes("--png")) writeFileSync(path.join(APP, "..", "VOID-icon.png"), png(512)); // посмотреть значок
console.log(`Готово: ${APP}\nnode: ${BUILT_NODE || "будет найден при запуске"}`);
