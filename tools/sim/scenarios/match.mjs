// Матч из лобби на одном компьютере (127.0.0.1): лобби (READY у обоих → старт у всех), новый мир без
// сохранения, мобов больше, опыт общий ×0.5, гибель → урна и призрак, оживление F 5 с (урон сбивает),
// таблица игроков (TAB), в начатый матч не войти, погибли все — матч окончен
export default async function (t, g) {
  const { E, C } = g;
  const { LobbyScene } = await import(g.root + "games/builder/lobby.js");
  const server = new E.NetServer({ port: 0, host: "127.0.0.1" });
  await server.listen();
  const client = new E.NetClient();
  await client.connect("127.0.0.1", server.port);

  // ---------- Лобби ----------
  let hostNet = null, guestNet = null;
  const hostLobby = new LobbyScene({ game: g.game, net: { role: "host", server }, name: "hoster", onStart: (n) => { hostNet = n; } });
  const guestLobby = new LobbyScene({ game: g.game, net: { role: "client", client }, name: "guesty", onStart: (n) => { guestNet = n; } });
  hostLobby.engine = g.engine;
  guestLobby.engine = g.engine;
  const lobbyTick = async (n) => {
    for (let i = 0; i < n; i++) {
      hostLobby.update(1 / 60);
      guestLobby.update(1 / 60);
      await new Promise((r) => setImmediate(r));
    }
  };
  await lobbyTick(20);
  t.check("лобби: гость видит двоих", guestLobby.players.length === 2, `${guestLobby.players.length}`);
  hostLobby.toggleReady();
  await lobbyTick(20);
  t.check("лобби: готов один из двоих — отсчёта нет", hostLobby.countdown === null);
  guestLobby.toggleReady();
  await lobbyTick(10);
  t.check("лобби: все готовы — отсчёт", hostLobby.countdown !== null);
  await lobbyTick(C.LOBBY.countdown * 60 + 30);
  t.check("лобби: матч начался у обоих, один и тот же", !!hostNet && !!guestNet && hostNet.matchId === guestNet.matchId, `${hostNet?.matchId} / ${guestNet?.matchId}`);
  t.check("лобби: в составе оба", hostNet?.roster.length === 2 && hostNet.roster.includes("GUESTY"));
  if (!hostNet || !guestNet) return;

  // ---------- Матч ----------
  const H = g.createPeer(hostNet);
  const G = g.createPeer(guestNet);
  const host = H.scene, guest = G.scene;
  const both = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      H.tick();
      G.tick();
      await new Promise((r) => setImmediate(r));
    }
  };
  const until = async (cond, max = 300) => { for (let i = 0; i < max && !cond(); i++) await both(); return cond(); };
  t.check("матч: гость в мире хоста", await until(() => guest.net?.ready), `${guest.net?.ready}`);
  t.check("матч: у обоих режим матча", host.match && guest.match);
  t.check("матч: мир не грузится из сохранения — новый", host.world.blocks.size > 0);
  t.check("матч: мобы появляются в 1.3 раза чаще", Math.abs(host.spawner.interval - C.SPAWN.interval / 1.3) < 1e-6, `${host.spawner.interval}`);
  t.check("матч: сохранений нет", host.saveNow() === undefined && host.match);

  // пауза выбора: пока не все выбрали класс — мир стоит у всех
  await both(10);
  t.check("пауза: пока класс не выбран — мир стоит у обоих", host.teamPaused && guest.teamPaused);
  const mob0 = host.entities.list.find((e) => e.kind === "mob" && e.alive);
  const spot = mob0 && { x: mob0.position.x, z: mob0.position.z };
  host.chooseClass("ranged");
  await both(20);
  t.check("пауза: хост выбрал, гость ещё нет — всё ещё стоит", host.teamPaused && guest.teamPaused);
  t.check("пауза: мобы не двигаются", !mob0 || (mob0.position.x === spot.x && mob0.position.z === spot.z));
  guest.chooseClass("melee");
  await both(20);
  t.check("пауза: оба выбрали — мир идёт", !host.teamPaused && !guest.teamPaused);
  // опыт: общий, ×0.5
  const xp0 = host.experience.toJSON();
  host.gainXp(100);
  await both(5);
  const want = Math.round(100 * (C.PROGRESSION.xpMultiplier ?? 1) * 0.5);
  t.check("опыт: хост получил ×0.5", host.experience.xp - xp0.xp === want || host.experience.level > xp0.level, `${xp0.xp} → ${host.experience.xp}`);
  t.check("опыт: у гостя столько же (общий)", JSON.stringify(guest.experience.toJSON()) === JSON.stringify(host.experience.toJSON()), `${JSON.stringify(guest.experience.toJSON())} / ${JSON.stringify(host.experience.toJSON())}`);
  guest.gainXp(40); // задание у гостя — в общий опыт через хоста
  await both(8);
  t.check("опыт: опыт гостя (задание) — тоже общий", JSON.stringify(guest.experience.toJSON()) === JSON.stringify(host.experience.toJSON()), `${JSON.stringify(guest.experience.toJSON())} / ${JSON.stringify(host.experience.toJSON())}`);

  // 10 уровень (опыт общий) — второе оружие: снова пауза, пока оба не выберут
  while (host.experience.level < C.SUBCLASS.level) host.gainXp(5000);
  await both(20);
  t.check("пауза: 10 уровень у обоих — мир стоит, пока не выбрали второе оружие", host.teamPaused && guest.teamPaused && guest.experience.level >= C.SUBCLASS.level, `${host.experience.level}/${guest.experience.level}`);
  host.chooseSubclass(C.subclassOptions("ranged")[0]);
  guest.chooseSubclass(C.subclassOptions("melee")[0]);
  await both(20);
  t.check("пауза: оба выбрали второе оружие — мир идёт", !host.teamPaused && !guest.teamPaused);
  // TAB: таблица
  await both(65);
  t.check("TAB: у хоста двое в таблице", host.scoreRows().length === 2);
  t.check("TAB: у гостя таблица пришла, с пингом", guest.scoreRows().length === 2 && guest.scoreRows().some((r) => r.name === "GUESTY" && r.me), JSON.stringify(guest.scoreRows()));

  // союзник — силуэтом сквозь стены
  const hero = [...host.net.guests.values()][0].hero;
  t.check("силуэт: у хоста герой гостя — союзник", hero.silhouette === "ally");
  const hostCopy = [...guest.net.copies.values()].find((e) => e.type === "player");
  t.check("силуэт: у гостя копия хоста — союзник", hostCopy?.silhouette === "ally");

  // гибель гостя: урна, призрак
  guest.player.stats.hp = 0;
  await both(10);
  t.check("гибель: гость — урна, мир не кончился", guest.downed && !guest.dead && guest.urnList().length === 1);
  t.check("гибель: у хоста герой гостя пал, урна, призрак", hero.downed && host.urnList().length === 1 && hero.silhouette === "ghost");
  t.check("гибель: мобы павшего не трогают (не жив)", !hero.alive);

  // оживление: хост держит F у урны; удар сбивает
  const SC = g.E.KEYS;
  host.player.position.x = hero.position.x + 1;
  host.player.position.z = hero.position.z;
  host.player.position.y = hero.position.y;
  // без мобов: иначе они бьют хоста и сбивают оживление (это проверяем отдельно — ударом)
  const calm = () => { for (const e of [...host.entities.list]) if (e.kind === "mob") host.removeEntity(e); host.spawner.interval = 1e9; host.invasion.timer = 1e9; };
  calm();
  H.engine.input.keys.add(SC.F);
  await both(60);
  t.check("оживление: идёт шкала", host.reviving && host.reviving.t > 0.5, `${host.reviving?.t}`);
  host.player.stats.hp -= 5; // попали — сбилось
  await both(2);
  t.check("оживление: удар сбивает", !host.reviving || host.reviving.t < 0.2);
  calm();
  await both(C.MULTIPLAYER.revive.time * 60 + 30);
  H.engine.input.keys.delete(SC.F);
  await both(10);
  t.check("оживление: гость встал с частью здоровья", !guest.downed && guest.player.alive && guest.player.stats.hp <= Math.ceil(guest.player.stats.maxHp * 0.5) + 1, `${guest.player.stats.hp}/${guest.player.stats.maxHp}`);
  t.check("оживление: у хоста урна гостя исчезла", !hero.downed && host.urnList().length === 0);

  // в начатый матч не войти
  const late = new E.NetClient();
  let bye = null;
  await late.connect("127.0.0.1", server.port);
  late.onMessage = (m) => { if (m.t === "bye") bye = m.reason; };
  late.send({ t: "lobbyHello", name: "LATE" });
  await both(20);
  t.check("в начатый матч не заходят", bye === "match already started", `${bye}`);
  late.close("тест");

  // погибли все — матч окончен у обоих
  guest.player.stats.hp = 0;
  await both(5);
  host.player.stats.hp = 0;
  await both(20);
  t.check("погибли все — матч окончен у хоста и гостя", host.matchEnded && guest.matchEnded);
  await host.net?.close();
}
