// Повтор записи из игры (F7 → saves/replays/<время>): тот же мир, тот же ввод, та же случайность.
//   node --import ./tools/sim/register.mjs tools/sim/replay.mjs <папка повтора> [--json]
// Печатает: сколько кадров прошло, ошибки (со стеком), где герой в конце. Ошибка — код выхода 1.
import fs from "node:fs";
import path from "node:path";
import { createGame } from "./harness.mjs";

export async function playReplay(dir, { onFrame = null } = {}) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, "replay.json"), "utf8"));
  const g = await createGame({ world: { replay: dir }, immortal: false });
  const { ReplayPlayer } = g.E;
  const errors = [];
  g.engine.crash = (e) => errors.push(e); // окно отчёта не нужно — собираем ошибки
  const player = new ReplayPlayer(data);
  player.start();
  let frames = 0;
  try {
    while (!player.done) {
      const dt = player.apply(g.engine);
      try {
        g.tick(dt);
      } catch (e) {
        errors.push(e);
        if (errors.length > 20) break;
      }
      frames++;
      onFrame?.(g, frames);
      if (frames % 300 === 0) await new Promise((r) => setImmediate(r));
    }
  } finally {
    player.stop();
  }
  const p = g.scene.player;
  const result = {
    frames, total: data.frames.length, errors: errors.map((e) => String(e?.stack || e).split("\n").slice(0, 6).join("\n")),
    player: { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2), hp: p.stats.hp, alive: p.alive },
    level: g.scene.experience.level, dead: !!g.scene.dead,
  };
  g.cleanup();
  return result;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("replay.mjs")) {
  const dir = process.argv[2];
  if (!dir) {
    console.log("укажи папку повтора: tools/sim/replay.mjs games/builder/saves/replays/<время>");
    process.exit(2);
  }
  const r = await playReplay(path.resolve(dir));
  if (process.argv.includes("--json")) console.log(JSON.stringify(r));
  else {
    console.log(`повтор: кадров ${r.frames}/${r.total}, уровень ${r.level}, герой (${r.player.x}, ${r.player.y}, ${r.player.z}) HP ${r.player.hp}${r.dead ? ", ПОГИБ" : ""}`);
    if (r.errors.length) console.log(`ОШИБКИ (${r.errors.length}):\n` + r.errors.join("\n---\n"));
    else console.log("ошибок нет");
  }
  process.exit(r.errors.length ? 1 : 0);
}
