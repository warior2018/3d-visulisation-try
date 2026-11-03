// Сетевая игра на одном компьютере (127.0.0.1): хост и гость. Гость получает мир хоста, видят друг друга,
// мобы хоста у гостя двигаются, блоки синхронизируются в обе стороны, удар гостя ранит моба на хосте,
// удар моба по гостю (на хосте) снимает здоровье у гостя, отключение убирает гостя у хоста
export default async function (t, g) {
  const { E, scene: host } = g;
  const server = new E.NetServer({ port: 0, host: "127.0.0.1" });
  await server.listen();
  const { HostNet } = await import(g.root + "games/builder/scene/net.js");
  host.role = "host";
  host.net = new HostNet(host, server);
  const client = new E.NetClient();
  await client.connect("127.0.0.1", server.port);
  const peer = g.createPeer({ role: "client", client, name: "tester" });
  const guest = peer.scene;
  const until = async (cond, max = 300) => { for (let i = 0; i < max && !cond(); i++) await g.both(peer); return cond(); };

  t.check("гость вошёл в мир хоста", await until(() => guest.net?.ready), `${guest.net?.ready}`);
  t.check("блоков у гостя — как у хоста", guest.world.blocks.size === host.world.blocks.size, `${host.world.blocks.size} → ${guest.world.blocks.size}`);
  const hero = host.entities.list.find((e) => e.remote);
  t.check("у хоста появился герой гостя", hero?.name === "TESTER");
  await g.both(peer, 10);
  const visible = host.entities.list.filter((e) => e.view && e !== hero).length;
  t.check("гость видит существ хоста и самого хоста", guest.net.copies.size === visible, `${guest.net.copies.size} из ${visible}`);
  t.check("хост у гостя — герой", [...guest.net.copies.values()].some((e) => e.type === "player"));

  // гость отошёл — хост видит его на новом месте
  guest.player.position.x += 3;
  await g.both(peer, 10);
  t.check("гость отошёл — у хоста он там же", Math.hypot(hero.position.x - guest.player.position.x, hero.position.z - guest.player.position.z) < 0.6, `${hero.position.x.toFixed(2)} / ${guest.player.position.x.toFixed(2)}`);

  // моб хоста подвинулся — копия у гостя следом
  const mob = host.entities.list.find((e) => e.kind === "mob" && e.alive && !e.boss);
  if (mob) {
    mob.position.x += 2;
    await g.both(peer, 12);
    const copy = guest.net.copies.get(mob.netId);
    t.check("моб хоста подвинулся — копия у гостя следом", copy && Math.hypot(copy.position.x - mob.position.x, copy.position.z - mob.position.z) < 0.6, copy ? `${(copy.position.x - mob.position.x).toFixed(2)}` : "нет копии");
    // удар гостя по копии — урон мобу на хосте
    const hp0 = mob.stats.hp;
    copy.receive(new E.Damage({ amount: 7, source: guest.player }));
    await g.both(peer, 4);
    t.check("гость ударил копию — моб на хосте ранен", mob.stats.hp < hp0 || !mob.alive, `${hp0} → ${mob.stats.hp}`);
  } else t.check("в мире есть моб для проверки", false);

  // блоки: гость ставит — у хоста есть; хост ломает — у гостя нет
  const p = guest.player.position;
  const b = { x: Math.floor(p.x) + 2, y: 70, z: Math.floor(p.z) + 2 };
  guest.world.place(b.x, b.y, b.z, [10, 200, 10]);
  await g.both(peer, 6);
  t.check("гость поставил блок — он есть у хоста", host.world.has(b.x, b.y, b.z));
  host.world.place(b.x, b.y + 1, b.z, [200, 10, 10], "slip");
  host.world.remove(b.x, b.y, b.z);
  await g.both(peer, 6);
  const ice = [...(guest.world.chunkAt(b.x, b.z)?.blocks || [])].find((q) => q.y === b.y + 1 && q.x === b.x && q.z === b.z);
  t.check("хост сломал блок — у гостя его нет; поставил лёд — у гостя лёд", !guest.world.has(b.x, b.y, b.z) && ice?.surface === "slip");

  // моб на хосте бьёт героя гостя — здоровье снимается у гостя
  guest.player.stats.hp = guest.player.stats.maxHp;
  const before = guest.player.stats.hp;
  hero.receive(new E.Damage({ amount: 12, source: mob || null }));
  await g.both(peer, 4);
  t.check("моба удар по гостю (на хосте) — у гостя минус здоровье", guest.player.stats.hp < before, `${before} → ${guest.player.stats.hp}`);
  t.check("у хоста герой гостя не умирает (здоровье — у гостя)", hero.alive && hero.stats.hp === hero.stats.maxHp);

  // эффекты и звуки: удар гостя (след) — у хоста виден; выстрел хоста (луч и звук) — у гостя
  const sl0 = host.slashes.list.length;
  guest.slashes.add({ origin: guest.player.position, yaw: 0, pitch: 0, arc: 90, reach: 2 });
  await g.both(peer, 5);
  t.check("след удара гостя виден у хоста", host.slashes.list.length > sl0);
  const bm0 = guest.beams.list?.length ?? 0;
  let heard = 0;
  const play = guest.engine.sound.play;
  guest.net.fx.sound = (args) => { if (args[0] === "shot") heard++; };
  host.beams.add({ from: host.player.position, to: { x: host.player.position.x + 5, y: host.player.position.y, z: host.player.position.z }, life: 1 });
  host.engine.sound.play("shot");
  await g.both(peer, 5);
  t.check("луч выстрела хоста виден у гостя", (guest.beams.list?.length ?? 1) > bm0);
  t.check("звук выстрела хоста слышен у гостя (из точки, где хост)", heard === 1, `${heard}`);
  t.check("свои эффекты гостю не возвращаются (без эха)", guest.slashes.list.length === 1, `${guest.slashes.list.length}`);
  void play;
  // замах моба на хосте — у гостя копия замахивается
  if (mob) {
    const copy = guest.net.copies.get(mob.netId);
    let swung = false;
    if (copy?.view?.animator) { const po = copy.view.animator.playOnce.bind(copy.view.animator); copy.view.animator.playOnce = (n) => { if (n === "Attack") swung = true; return po(n); }; }
    mob.netAttack = true;
    await g.both(peer, 5);
    t.check("моб замахнулся на хосте — копия у гостя тоже", swung || !copy?.view);
  }
  // в руках у хоста оружие — у гостя на копии хоста видно
  await g.both(peer, 15);
  const hostCopy = guest.net.copies.get(host.player.netId);
  t.check("что в руках у хоста — известно гостю", hostCopy && hostCopy.netHeld === (host.abilities.current?.held ? JSON.stringify(host.abilities.current.held) : ""));
  // нашествие хоста — у гостя тоже
  host.invasion.start(30);
  await g.both(peer, 15);
  t.check("нашествие хоста — у гостя тоже идёт", guest.invasion.active === true && guest.invasion.timeLeft > 0);

  // сохранение у гостя: мир — хоста, не пишем; прогресс — в своё сохранение
  const fs = await import("node:fs");
  const S = await import(g.root + "games/builder/save.js");
  const metaFile = S.SAVE_FILE;
  const chunksDir = S.SAVE_DIR + "/chunks";
  const chunksBefore = fs.existsSync(chunksDir) ? fs.readdirSync(chunksDir).length : 0;
  guest.save(false);
  const chunksAfter = fs.existsSync(chunksDir) ? fs.readdirSync(chunksDir).length : 0;
  t.check("гость не пишет мир хоста в своё сохранение", chunksAfter === chunksBefore);
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    t.check("прогресс и вещи гостя — в его сохранении", JSON.stringify(meta.progression.experience) === JSON.stringify(guest.experience.toJSON()) && JSON.stringify(meta.player.inventory) === JSON.stringify(guest.player.inventory.toJSON()));
  }

  // предметы на земле: хост уронил — гость видит; гость подобрал — у хоста пропал, у гостя в сумке
  host.settings.general.autoLoot = false;
  const gp = guest.player.position;
  const coin = host.pickups.add("bone", 3, { x: gp.x + 6, y: gp.y + 0.3, z: gp.z });
  await g.both(peer, 15);
  const copyItem = [...guest.net.items.values()].find((x) => x.netId === coin.netId);
  t.check("хост уронил предмет — гость его видит", !!copyItem);
  const bones0 = guest.itemCount("bone");
  if (copyItem) guest.pickUp(copyItem);
  await g.both(peer, 6);
  t.check("гость подобрал — у хоста предмета больше нет", !host.pickups.list.includes(coin));
  t.check("гость подобрал — кости у гостя в сумке", guest.itemCount("bone") === bones0 + 3, `${bones0} → ${guest.itemCount("bone")}`);
  // опыт общий: хост убил моба — опыт и гостю
  // (в копии мира герой может быть на последнем уровне — тогда опыт не копится: проверяем, что дошло)
  let xpGot = 0;
  const gain = guest.gainXp.bind(guest);
  guest.gainXp = (n) => { xpGot += n; gain(n); };
  host.net.shareXp(25);
  await g.both(peer, 3);
  t.check("опыт за убитого — и гостю", xpGot === 25, `${xpGot}`);

  // чат: гость пишет — у хоста видно с именем; хост пишет — у гостя
  guest.chat.send("hi host");
  await g.both(peer, 4);
  t.check("чат: сообщение гостя у хоста", host.chat.messages.some((m) => m.from === "TESTER" && m.text === "hi host"));
  host.chat.send("hi guest");
  await g.both(peer, 4);
  t.check("чат: сообщение хоста у гостя", guest.chat.messages.some((m) => m.text === "hi guest" && m.from));
  t.check("чат: о подключении гостя — системное сообщение", host.chat.messages.some((m) => /TESTER JOINED/.test(m.text)));
  // ping
  await g.both(peer, 70);
  t.check("ping измеряется", guest.net.ping !== null && guest.net.ping >= 0, `${guest.net.ping} мс`);

  // гость отключился — у хоста его нет
  client.close("тест");
  await g.both(peer, 6);
  t.check("гость отключился — у хоста его героя нет", !host.entities.list.some((e) => e.remote));
  t.check("у гостя — выход в меню", peer.game.left === true);
  await host.net.close();
}
