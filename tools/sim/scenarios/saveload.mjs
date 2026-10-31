// Сохранение → загрузка: мир (блоки), герой (место, здоровье, вещи), прогресс (уровень, класс) — те же
export default async function (t, g) {
  const { scene, engine, game, GameScene } = g;
  await g.frames(30);
  const p = scene.player;
  // Немного поменяем мир и героя, чтобы было что сравнивать
  const base = { x: Math.floor(p.position.x) + 3, y: 60, z: Math.floor(p.position.z) + 3 };
  for (let i = 0; i < 5; i++) scene.world.place(base.x + i, base.y, base.z, [200, 50, 50]);
  scene.world.place(base.x, base.y + 1, base.z, [175, 225, 245], "slip"); // лёд
  scene.giveResource("medkit", 3);
  p.stats.hp = Math.max(1, Math.floor(p.stats.maxHp / 2));
  const before = {
    blocks: scene.world.blocks.size,
    has: scene.world.has(base.x + 2, base.y, base.z),
    pos: { ...p.position },
    hp: p.stats.hp,
    medkits: scene.itemCount("medkit"),
    level: scene.experience.level,
    cls: scene.playerClass,
  };
  scene.save(false);
  // Новая сцена с того же сохранения (как после перезапуска игры)
  const fresh = new GameScene(game);
  engine.setScene(fresh);
  g.scene = fresh;
  const q = fresh.player;
  t.check("блоков столько же", fresh.world.blocks.size === before.blocks, `${before.blocks} → ${fresh.world.blocks.size}`);
  t.check("поставленный блок на месте", fresh.world.has(base.x + 2, base.y, base.z) === before.has);
  t.check("герой на том же месте", Math.hypot(q.position.x - before.pos.x, q.position.z - before.pos.z) < 0.01, `${before.pos.x.toFixed(2)},${before.pos.z.toFixed(2)} → ${q.position.x.toFixed(2)},${q.position.z.toFixed(2)}`);
  t.check("здоровье то же", q.stats.hp === before.hp, `${before.hp} → ${q.stats.hp}`);
  t.check("аптечки те же", fresh.itemCount("medkit") === before.medkits, `${before.medkits} → ${fresh.itemCount("medkit")}`);
  t.check("уровень и класс те же", fresh.experience.level === before.level && fresh.playerClass === before.cls, `${before.level}/${before.cls} → ${fresh.experience.level}/${fresh.playerClass}`);
  const ice = fresh.world.blocks.get([...fresh.world.blocks.keys()].find((k) => { const b = fresh.world.blocks.get(k); return b.x === base.x && b.y === base.y + 1 && b.z === base.z; }));
  t.check("лёд — со своей поверхностью и цветом", ice?.surface === "slip" && ice.color.join() === "175,225,245");
  await g.frames(30);
  t.check("после загрузки игра идёт", !!fresh.player.alive);

  // Новый формат: папка world/ (meta.json + chunks/), старый world.json отложен
  const fs = await import("node:fs");
  const path = await import("node:path");
  const W = path.join(g.dir, "world");
  t.check("мир — папкой: meta.json + куски", fs.existsSync(path.join(W, "meta.json")) && fs.readdirSync(path.join(W, "chunks")).some((f) => f.endsWith(".bin")));
  t.check("старый world.json больше не мешает (отложен или его не было)", !fs.existsSync(path.join(g.dir, "world.json")));
  // Второе сохранение без изменений — ни одного куска; один блок — один кусок (+ соседи, если на краю)
  const S = await import(path.join(g.root || process.cwd(), "games", "builder", "save.js"));
  fresh.save(false);
  t.check("сохранение без изменений — кусков не пишем", S.store.lastWrite.chunks === 0, `${S.store.lastWrite.chunks}`);
  fresh.world.remove(base.x + 4, base.y, base.z);
  fresh.save(false);
  t.check("сломали блок — переписан 1–2 куска, а не весь мир", S.store.lastWrite.chunks >= 1 && S.store.lastWrite.chunks <= 3, `${S.store.lastWrite.chunks} из ${fresh.world.chunks.size}`);
  // Автосохранение: идёт само, в фоне
  fresh.world.place(base.x + 4, base.y + 3, base.z, [1, 2, 3]);
  const metaAt = fs.statSync(path.join(W, "meta.json")).mtimeMs;
  fresh.autosaveIn = 0.01;
  await g.frames(3);
  await S.store.idle();
  t.check("автосохранение записало мир в фоне", fs.statSync(path.join(W, "meta.json")).mtimeMs > metaAt && S.store.lastWrite.chunks >= 1);
  t.check("копия мира в backups/", fs.existsSync(path.join(g.dir, "backups")) && fs.readdirSync(path.join(g.dir, "backups")).some((f) => f.startsWith("world-")));
  // И снова загрузка: блок от автосохранения на месте, сломанный — нет
  const again = new GameScene(game);
  engine.setScene(again);
  g.scene = again;
  t.check("после автосохранения: новый блок есть, сломанный — нет", again.world.has(base.x + 4, base.y + 3, base.z) && !again.world.has(base.x + 4, base.y, base.z));
  t.check("блоков столько же, сколько было в мире", again.world.blocks.size === fresh.world.blocks.size, `${fresh.world.blocks.size} → ${again.world.blocks.size}`);
}
