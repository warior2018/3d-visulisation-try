// Запись и повтор: F7 — запись (мир сохранён в папку повтора), идём вперёд и крутим мышью, F7 — стоп;
// tools/sim/replay.mjs в отдельном процессе повторяет — герой приходит туда же, без ошибок
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
export default async function (t, g) {
  const { scene, engine, E, root } = g;
  const p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  scene.spawner.interval = 1e9;
  await g.frames(30);
  scene.toggleReplay();
  t.check("F7 — запись идёт", !!engine.replay?.recording);
  const W = E.KEYS.W;
  engine.mouse.captured = true;
  await g.frames(150, 1 / 60, (i) => {
    if (i === 10) engine.input.keys.add(W);
    if (i === 100) engine.input.keys.delete(W);
    if (i > 40 && i < 70) engine.mouse.dx = 6;
  });
  const end = { x: p.position.x, z: p.position.z };
  scene.toggleReplay();
  const dir = engine.replayDir;
  t.check("F7 ещё раз — записан replay.json и мир", fs.existsSync(path.join(dir, "replay.json")) && fs.existsSync(path.join(dir, "world", "info.json")));
  const data = JSON.parse(fs.readFileSync(path.join(dir, "replay.json"), "utf8"));
  t.check("в записи — кадры и клавиша W", data.frames.length >= 150 && data.frames.some((f) => f.k?.includes(W)), data.frames.length);
  const out = execFileSync(process.execPath, ["--import", path.join(root, "tools", "sim", "register.mjs"), path.join(root, "tools", "sim", "replay.mjs"), dir, "--json"], { encoding: "utf8" });
  const r = JSON.parse(out.trim().split("\n").pop());
  t.check("повтор без ошибок", r.errors.length === 0, r.errors[0]);
  const d = Math.hypot(r.player.x - end.x, r.player.z - end.z);
  t.check("герой пришёл туда же (до 0.5 м)", d < 0.5, `${d.toFixed(2)} м: (${r.player.x}, ${r.player.z}) vs (${end.x.toFixed(2)}, ${end.z.toFixed(2)})`);
}
