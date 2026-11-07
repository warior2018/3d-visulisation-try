// ============================================================
//  Запуск VOID в Electron.
//    node tools/electron/run.mjs
//  Electron (≈100 МБ) скачивается один раз — не в node_modules игры, а в свою папку:
//  %LOCALAPPDATA%\VOID\electron (Windows, через лаунчер — VOID_ROOT) или ~/.void-electron.
//  Так он переживает обновления игры, а тем, кому Electron не нужен (Мак, SDL), не качается вовсе.
// ============================================================

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ELECTRON_VERSION = "35"; // Chromium 134 (WebGPU), Node 22
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MAIN = path.join(HERE, "main.cjs");

export function electronDir() {
  return process.env.VOID_ROOT ? path.join(process.env.VOID_ROOT, "electron") : path.join(os.homedir(), ".void-electron");
}

// Путь к программе Electron; нет — скачиваем (npm). Не вышло — null
export function ensureElectron(log = console.log) {
  const dir = electronDir();
  const find = () => {
    try {
      return createRequire(path.join(dir, "index.js"))("electron"); // пакет electron отдаёт путь к программе
    } catch {
      return null;
    }
  };
  let exe = find();
  if (exe && fs.existsSync(exe)) return exe;
  log(`Скачиваю Electron (один раз, ~100 МБ) в ${dir}...`);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, "package.json"))) fs.writeFileSync(path.join(dir, "package.json"), '{ "name": "void-electron", "private": true }\n');
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", `electron@${ELECTRON_VERSION}`], {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32", // npm на Windows — npm.cmd
  });
  if (r.status !== 0) {
    log("Electron не скачался (нет интернета?)");
    return null;
  }
  exe = find();
  return exe && fs.existsSync(exe) ? exe : null;
}

// Запустить игру в Electron: вернёт процесс (stdout/stderr — как попросили)
export function spawnElectron(exe, { stdio = "inherit", env = process.env } = {}) {
  const e = { ...env, ELECTRON_ENABLE_LOGGING: "1" };
  delete e.ELECTRON_RUN_AS_NODE; // иначе Electron притворится обычным node
  return spawn(exe, [MAIN], { stdio, env: e });
}

// Запуск напрямую: node tools/electron/run.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exe = ensureElectron();
  if (!exe) process.exit(1);
  const child = spawnElectron(exe);
  child.on("exit", (code) => process.exit(code ?? 0));
}
