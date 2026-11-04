// Инструменты разработки: отчёт о падении (окно один раз на ошибку, файл в crashes/) и перезагрузка config.js
// (сцена мира пересобирает оружие из новых ATTACKS)
import fs from "node:fs";
export default async function (t, g) {
  const { engine, scene, C } = g;
  let err;
  try { null.foo(); } catch (e) { err = e; }
  engine.crash(err);
  const sc = engine.scene;
  t.check("ошибка — окно отчёта", sc.label === "отчёт о падении");
  engine.crash(err);
  t.check("та же ошибка — окно одно", engine.scenes.filter((s) => s.label === "отчёт о падении").length === 1);
  t.check("отчёт — в файле, с концом журнала", fs.existsSync(sc.file) && fs.readFileSync(sc.file, "utf8").includes("--- log tail ---"));
  sc.onButton("continue");
  t.check("CONTINUE — назад в игру", engine.scene === scene);
  // перезагрузка: поменяли урон пистолета — оружие в руках пересобрано
  scene.playerClass = null; scene.chooseClass("ranged");
  const was = C.ATTACKS.pistol.damage;
  C.ATTACKS.pistol.damage = 77;
  scene.configReloaded();
  t.check("новый урон пистолета — в оружии", scene.abilityCache.get("pistol")?.attack.damage === 77, scene.abilityCache.get("pistol")?.attack.damage);
  C.ATTACKS.pistol.damage = was;
  scene.configReloaded();
  await g.frames(2);
}
