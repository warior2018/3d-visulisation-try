// Консоль разработчика и чат: команды работают, ошибки — понятные, «/команда» из чата идёт в консоль
export default async function (t, g) {
  const { scene, engine } = g;
  const con = engine.console;
  const last = () => con.lines.at(-1)?.text || "";
  scene.cheats = true; // мир игрока мог быть без читов (копия его сохранения) — команды проверяем с читами
  await g.frames(5);
  con.exec("help");
  t.check("help — список команд", con.lines.some((l) => /COMMANDS:.*give/.test(l.text)));
  const bones = scene.itemCount("bone");
  con.exec("give bone 7");
  t.check("give bone 7", scene.itemCount("bone") === bones + 7, `${bones} → ${scene.itemCount("bone")}`);
  con.exec("give nosuchthing");
  t.check("неизвестный предмет — понятная ошибка", /no item/.test(last()));
  con.exec("bogus 1 2");
  t.check("неизвестная команда — подсказка", /unknown command/.test(last()));
  const mobs = () => scene.entities.list.filter((e) => e.type === "skeleton" && e.alive).length;
  const m0 = mobs();
  con.exec("spawn skeleton 3");
  t.check("spawn skeleton 3", mobs() === m0 + 3, `${m0} → ${mobs()}`);
  con.exec("killall skeleton");
  await g.frames(2);
  t.check("killall skeleton", mobs() === 0);
  con.exec("tp 10 20 30");
  const p = scene.player.position;
  t.check("tp 10 20 30", Math.abs(p.x - 10) < 1e-6 && Math.abs(p.y - 20) < 1e-6 && Math.abs(p.z - 30) < 1e-6);
  con.exec("god");
  t.check("god — бессмертие включилось", scene.god === true);
  con.exec("god");
  con.exec("timescale 0.5");
  t.check("timescale 0.5", engine.timeScale === 0.5);
  const ticks = engine.fixed.count;
  await g.frames(60);
  t.check("timescale 0.5 — тиков вдвое меньше", Math.abs(engine.fixed.count - ticks - 30) <= 2, `${engine.fixed.count - ticks}`);
  con.exec("timescale 1");
  con.exec("timescale");
  t.check("переменная без значения — показывает текущее", /timescale = 1/.test(last()));
  con.exec("give bone 1; give bone 2");
  t.check("несколько команд через ;", scene.itemCount("bone") === bones + 10);
  // чат: обычное сообщение и /команда
  scene.chat.send("hello world");
  t.check("чат: своё сообщение видно", scene.chat.visible().some((m) => m.text === "hello world"));
  scene.chat.send("/give bone 5");
  t.check("чат: /команда выполнилась", scene.itemCount("bone") === bones + 15);
  t.check("чат: ответ команды — в чате", scene.chat.messages.some((m) => /GIVEN 5 bone/.test(m.text)));
  // гостю читы нельзя
  scene.role = "client";
  con.exec("give bone 1");
  t.check("гость сетевой игры: читы запрещены", scene.itemCount("bone") === bones + 15 && /cheat - not for a guest/.test(last()));
  con.exec("pos");
  t.check("гость: обычные команды можно", /XYZ/.test(last()));
  scene.role = "solo";
}
