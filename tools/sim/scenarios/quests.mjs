// Задания стража: окно стража (задание + торговля), взял «убей» — убийства считаются, сдал — монеты и опыт;
// «принеси» — забирает предметы; отказ — новое не сразу; задание сохраняется
export default async function (t, g) {
  const { scene, engine, E } = g;
  const p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  scene.loadQuests(null);
  const warden = scene.entities.list.find((e) => e.type === "warden") || scene.spawn("warden", { x: p.position.x + 2, y: p.position.y, z: p.position.z });
  scene.openWarden(warden);
  t.check("у стража — окно с заданием", engine.scene.label?.startsWith("диалог") && !!scene.questOffer);
  scene.questOffer = { id: "kill-skeleton", count: 2, progress: 0, coins: 50, xp: 75 };
  engine.scene.onButton("accept");
  t.check("взял задание", scene.quest?.id === "kill-skeleton" && !scene.questOffer);
  engine.scene.onButton("close");
  for (let i = 0; i < 2; i++) {
    const m = scene.spawn("skeleton", { x: p.position.x, y: p.position.y, z: p.position.z + 2 + i });
    m.receive(new E.Damage({ amount: 99999, source: p }));
  }
  await g.frames(40);
  t.check("убийства посчитаны — готово", scene.questReady(), `${scene.questProgress()}/${scene.quest?.count}`);
  const coins0 = scene.itemCount("coin"), xp0 = scene.experience.total ?? scene.experience.xp;
  t.check("сдал", scene.turnInQuest() && !scene.quest);
  t.check("монеты пришли", scene.itemCount("coin") >= coins0 + 50 || scene.pickups.list.some((x) => x.item === "coin"));
  t.check("следующее предложение готово", !!scene.questOffer);
  // принеси
  scene.quest = { id: "bring-bone", count: 3, progress: 0, coins: 10, xp: 15 };
  scene.giveResource("bone", 3);
  t.check("кости в сумке — готово", scene.questReady());
  const bones = scene.itemCount("bone");
  scene.turnInQuest();
  t.check("кости забрали", scene.itemCount("bone") === bones - 3);
  // отказ
  scene.quest = { id: "kill-any", count: 30, progress: 1, coins: 10, xp: 15 };
  scene.abandonQuest();
  t.check("отказался — пока без нового", !scene.quest && !scene.questOffer && scene.questWait > 0);
  // сохранение
  scene.quest = { id: "kill-zombie", count: 5, progress: 3, coins: 40, xp: 60 };
  scene.loadQuests(JSON.parse(JSON.stringify(scene.questsJSON())));
  t.check("задание сохраняется", scene.quest?.progress === 3 && scene.questsDone === 2);
}
