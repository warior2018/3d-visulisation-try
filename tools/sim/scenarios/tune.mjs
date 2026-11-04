// Окно баланса (F6): все строки нашлись в config.js и каждую можно записать в файл; [++] меняет число сразу
// (оружие пересобрано); ЗАПИСАТЬ — в копию config.js только нужное число; СБРОС — как было
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export default async function (t, g) {
  const { scene, engine, root, C, E } = g;
  const T = await import(path.join(root, "games", "builder", "tune.js"));
  const all = T.tuneTabs().flatMap((x) => x.rows);
  const want = T.TUNE.flatMap((x) => x.rows).length;
  t.check("все числа из списка нашлись", all.length === want, `${all.length}/${want}`);
  const src = fs.readFileSync(path.join(root, "games", "builder", "config.js"), "utf8");
  const miss = all.filter((r) => E.patchNumber(src, r.path, r.get()) === null).map((r) => r.id);
  t.check("каждое число можно записать в файл", miss.length === 0, miss.join(", "));
  scene.onPress(["tune"]);
  const sc = engine.scene;
  t.check("F6 — окно баланса", sc.label === "баланс");
  const was = C.ATTACKS.pistol.damage;
  sc.onButton("step:ATTACKS.pistol.damage:10");
  t.check("[++] — урон пистолета +10 сразу", C.ATTACKS.pistol.damage === was + 10);
  scene.playerClass = null; scene.chooseClass("ranged");
  t.check("оружие в руках — с новым уроном", scene.abilityCache.get("pistol")?.attack.damage === was + 10);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "void-tune-")), "config.js");
  fs.writeFileSync(tmp, src);
  const res = T.saveTune(sc.changed(), tmp);
  const out = fs.readFileSync(tmp, "utf8");
  t.check("записано в config.js", res.saved === 1 && out.includes(`name: "SHOT", damage: ${was + 10},`));
  t.check("остальной файл не тронут", out.length - src.length === String(was + 10).length - String(was).length);
  sc.onButton("reset");
  t.check("СБРОС — как было", C.ATTACKS.pistol.damage === was);
  sc.onButton("close");
  scene.configReloaded();
}
