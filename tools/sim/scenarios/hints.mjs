// Подсказки новичку: по очереди, со своими началом и концом; выполненные — в настройках (второй раз нет);
// итоги забега: убийства, урон по оружию, кто добил, рекорды мира; окно итогов после гибели
export const immortal = false;
export default async function (t, g) {
  const { scene, engine, E } = g;
  const p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  scene.settings.general.hintsDone = [];
  scene.hints.reset();
  scene.hints.enabled = true;
  scene.playerClass = null;
  await g.frames(2);
  t.check("первая подсказка — управление", scene.hints.current?.id === "move");
  await g.frames(11 * 60);
  t.check("через 10 с — выполнена", scene.settings.general.hintsDone.includes("move"));
  await g.frames(90);
  t.check("следующая — про опыт и класс", scene.hints.current?.id === "xp");
  scene.chooseClass("ranged");
  await g.frames(90);
  t.check("выбрал класс — выполнена", scene.settings.general.hintsDone.includes("xp"));
  // таланты: очки есть — подсказка; открыл окно — выполнена
  scene.talents.points = 1;
  await g.frames(3);
  t.check("есть очки — подсказка про таланты", scene.hints.current?.id === "talents");
  scene.hints.event("talents");
  await g.frames(3);
  t.check("открыл таланты — выполнена", scene.settings.general.hintsDone.includes("talents"));
  const saved = [...scene.settings.general.hintsDone];
  scene.hints = new E.Hints({ list: scene.hints.list, done: saved });
  await g.frames(2);
  t.check("второй раз выполненные не показываются", !["move", "xp", "talents"].includes(scene.hints.current?.id));
  // итоги забега
  scene.loadRunStats(null);
  const mob = scene.spawn("skeleton", { x: p.position.x, y: p.position.y, z: p.position.z + 2 });
  mob.receive(new E.Damage({ amount: 9999, source: p }));
  await g.frames(40);
  t.check("убийство посчитано", scene.run.kills === 1, scene.run.kills);
  t.check("урон записан на оружие в руках", Object.values(scene.run.by).some((v) => v > 0));
  const biter = scene.spawn("skeleton", { x: p.position.x + 2, y: p.position.y, z: p.position.z });
  p.receive(new E.Damage({ amount: 1, source: biter }));
  t.check("кто бил — запомнен", scene.run.killedBy === biter.name);
  const json = JSON.parse(JSON.stringify(scene.runStatsJSON()));
  scene.loadRunStats(json);
  t.check("итоги сохраняются", scene.run.kills === 1);
  scene.die();
  const sc = engine.scene;
  t.check("гибель — окно итогов", sc.label?.startsWith("итоги"), sc.label);
  t.check("в итогах — убийства и рекорды", sc.rows.some((r) => r.label === "KILLS" && r.value === 1) && sc.records.some((r) => r.label === "RUNS"));
  t.check("кнопка заблокирована 1.5 с", sc.lock > 0);
}
