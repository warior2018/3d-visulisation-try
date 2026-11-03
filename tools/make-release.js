// ============================================================
//  Сборка игры «в одну программу» — без установки Node.js у игрока.
//  Собирает папку (и архив) для ЭТОЙ системы: внутри свой node (тот, которым запущен скрипт), игра и
//  библиотеки окна и видеокарты под эту систему. Собирать надо на той системе, для которой сборка:
//    на Маке  →  ../release/VOID-mac-<arch>.zip   (внутри VOID.app — двойной клик)
//    на Windows → ../release/VOID-windows-<arch>.zip (внутри папка VOID: «Играть в VOID.cmd»)
//    на Linux →  ../release/VOID-linux-<arch>.tar.gz (VOID.sh)
//
//    node tools/make-release.js            (npm run release)
//
//  Сохранения — не внутри программы (её заменит новая версия), а в папке пользователя:
//    Мак — ~/Library/Application Support/VOID, Windows — %APPDATA%\VOID, Linux — ~/.local/share/VOID
//  (VOID_SAVES — её читает config.js → SAVES).
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const OUT = path.join(ROOT, "..", "release");
const plat = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux";
const name = `VOID-${plat}-${process.arch}`;
const version = JSON.parse(fs.readFileSync(path.join(ROOT, "CHANGELOG.json"), "utf8"))?.[0]?.version || "dev";

// Что берём из игры: движок, игра (без сохранений), запуск под присмотром, библиотеки
const COPY = ["package.json", "CHANGELOG.json", "engine", "games", "tools/windows-launch.js", "node_modules/@kmamal", "node_modules/modern-tar"];
const SKIP = (rel) => /[\\/]saves([\\/]|$)/.test(rel) || /[\\/]\.git([\\/]|$)/.test(rel) || rel.endsWith(".tmp");

function copyInto(dest) {
  for (const rel of COPY) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dest, rel), { recursive: true, filter: (f) => !SKIP(path.relative(ROOT, f)) });
  }
}

function size(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? size(p) : fs.statSync(p).size;
  }
  return n;
}

fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const node = process.execPath;
let top, archive;

if (plat === "mac") {
  const app = path.join(OUT, name, "VOID.app");
  const res = path.join(app, "Contents", "Resources");
  fs.mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
  copyInto(path.join(res, "game"));
  fs.mkdirSync(path.join(res, "runtime"), { recursive: true });
  fs.copyFileSync(node, path.join(res, "runtime", "node"));
  fs.chmodSync(path.join(res, "runtime", "node"), 0o755);
  const run = `#!/bin/bash
# VOID ${version} — своя копия node внутри, ставить ничего не надо (собрано tools/make-release.js)
HERE="$(cd "$(dirname "$0")/../Resources" && pwd)"
DATA="$HOME/Library/Application Support/VOID"
mkdir -p "$DATA/saves"
export VOID_SAVES="$DATA/saves/"
cd "$HERE/game"
exec "$HERE/runtime/node" "$HERE/game/games/builder/main.js" >> "$DATA/log-run.txt" 2>&1
`;
  fs.writeFileSync(path.join(app, "Contents", "MacOS", "VOID"), run);
  fs.chmodSync(path.join(app, "Contents", "MacOS", "VOID"), 0o755);
  fs.writeFileSync(path.join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>VOID</string>
  <key>CFBundleIdentifier</key><string>local.void.builder</string>
  <key>CFBundleExecutable</key><string>VOID</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
  // значок — тот же, что рисует make-mac-app.js (если он уже собирал VOID.app рядом)
  const icon = path.join(ROOT, "..", "VOID.app", "Contents", "Resources", "VOID.icns");
  if (fs.existsSync(icon)) {
    fs.copyFileSync(icon, path.join(res, "VOID.icns"));
    const plist = path.join(app, "Contents", "Info.plist");
    fs.writeFileSync(plist, fs.readFileSync(plist, "utf8").replace("<key>CFBundleExecutable</key>", "<key>CFBundleIconFile</key><string>VOID</string>\n  <key>CFBundleExecutable</key>"));
  }
  top = path.join(OUT, name);
  archive = path.join(OUT, `${name}.zip`);
  fs.rmSync(archive, { force: true });
  try { execFileSync("ditto", ["-c", "-k", "--keepParent", app, archive]); } catch { archive = null; }
} else if (plat === "windows") {
  const dir = path.join(OUT, name, "VOID");
  copyInto(path.join(dir, "game"));
  fs.mkdirSync(path.join(dir, "runtime"), { recursive: true });
  fs.copyFileSync(node, path.join(dir, "runtime", "node.exe"));
  fs.writeFileSync(path.join(dir, "Play VOID.cmd"), `@echo off\r
chcp 65001 >nul\r
rem VOID ${version} — свой node внутри, ставить ничего не надо (tools/make-release.js)\r
set "VOID_SAVES=%APPDATA%\\VOID\\saves\\"\r
if not exist "%APPDATA%\\VOID\\saves" mkdir "%APPDATA%\\VOID\\saves"\r
cd /d "%~dp0game"\r
"%~dp0runtime\\node.exe" tools\\windows-launch.js\r
`);
  top = path.join(OUT, name);
  archive = path.join(OUT, `${name}.zip`);
  fs.rmSync(archive, { force: true });
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${dir}' -DestinationPath '${archive}'`]);
  } catch { archive = null; }
} else {
  const dir = path.join(OUT, name, "VOID");
  copyInto(path.join(dir, "game"));
  fs.mkdirSync(path.join(dir, "runtime"), { recursive: true });
  fs.copyFileSync(node, path.join(dir, "runtime", "node"));
  fs.chmodSync(path.join(dir, "runtime", "node"), 0o755);
  fs.writeFileSync(path.join(dir, "VOID.sh"), `#!/bin/sh
# VOID ${version} — свой node внутри (tools/make-release.js)
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="\${XDG_DATA_HOME:-$HOME/.local/share}/VOID"
mkdir -p "$DATA/saves"
export VOID_SAVES="$DATA/saves/"
cd "$HERE/game" && exec "$HERE/runtime/node" games/builder/main.js
`);
  fs.chmodSync(path.join(dir, "VOID.sh"), 0o755);
  top = path.join(OUT, name);
  archive = path.join(OUT, `${name}.tar.gz`);
  try { execFileSync("tar", ["-czf", archive, "-C", top, "VOID"]); } catch { archive = null; }
}

console.log(`Готово: ${top} (${(size(top) / 1e6).toFixed(0)} МБ, node ${process.version})`);
if (archive) console.log(`Архив: ${archive} (${(fs.statSync(archive).size / 1e6).toFixed(0)} МБ)`);
console.log("Собрано для этой системы. Для другой — запусти node tools/make-release.js на ней.");
