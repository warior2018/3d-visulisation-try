// Дуэль на одном компьютере: лобби в режиме DUEL → арена и комнаты по кругу, подготовка (очки, монеты, свои
// комнаты), стены арены не ломаются, бой (все на арене, враги друг другу), раунд за последним живым,
// вещи на начало раунда возвращаются, до 3 побед (до 5 раундов), итог — в профиль
import os from "node:os";
import path from "node:path";

export default async function (t, g) {
  const { E, C } = g;
  const { LobbyScene } = await import(g.root + "games/builder/lobby.js");
  const server = new E.NetServer({ port: 0, host: "127.0.0.1" });
  await server.listen();
  const client = new E.NetClient();
  await client.connect("127.0.0.1", server.port);
  let hostNet = null, guestNet = null;
  const hostLobby = new LobbyScene({ game: g.game, net: { role: "host", server }, name: "alpha", onStart: (n) => { hostNet = n; } });
  const guestLobby = new LobbyScene({ game: g.game, net: { role: "client", client }, name: "beta", onStart: (n) => { guestNet = n; } });
  hostLobby.engine = guestLobby.engine = g.engine;
  const lobbyTick = async (n) => { for (let i = 0; i < n; i++) { hostLobby.update(1 / 60); guestLobby.update(1 / 60); await new Promise((r) => setImmediate(r)); } };
  await lobbyTick(10);
  hostLobby.onButton("mode:duel");
  await lobbyTick(5);
  t.check("лобби: хост выбрал DUEL — гость видит", guestLobby.mode === "duel");
  hostLobby.toggleReady();
  guestLobby.toggleReady();
  await lobbyTick(C.LOBBY.countdown * 60 + 40);
  t.check("лобби: дуэль началась у обоих", hostNet?.mode === "duel" && guestNet?.mode === "duel");
  if (!hostNet || !guestNet) return;

  const H = g.createPeer(hostNet);
  const G = g.createPeer(guestNet);
  const profFile = path.join(os.tmpdir(), `void-profile-${Date.now()}.json`);
  H.engine.profile = new E.Profile(profFile);
  const host = H.scene, guest = G.scene;
  const both = async (n = 1) => { for (let i = 0; i < n; i++) { H.tick(); G.tick(); await new Promise((r) => setImmediate(r)); } };
  const until = async (cond, max = 400) => { for (let i = 0; i < max && !cond(); i++) await both(); return cond(); };
  t.check("дуэль: гость в мире хоста", await until(() => guest.net?.ready));
  t.check("дуэль: подготовка 1-го раунда у обоих", await until(() => host.duelState?.phase === "prep" && guest.duelRound === 1), `${host.duelState?.phase} / ${guest.duelRound}`);
  t.check("дуэль: мобов нет", !host.entities.list.some((e) => e.kind === "mob"));
  t.check("дуэль: комнаты — по одной на игрока", host.duelRooms.length === 2 && Math.hypot(host.duelRooms[0].x - host.duelRooms[1].x, host.duelRooms[0].z - host.duelRooms[1].z) > 20);
  const inRoom = (s, r) => Math.hypot(s.player.position.x - r.x, s.player.position.z - r.z) < 1;
  t.check("дуэль: каждый в своей комнате", inRoom(host, host.duelRooms[0]) && inRoom(guest, host.duelRooms[1]));
  t.check("дуэль: 1-й раунд — очки и монеты у обоих", host.talents.points >= 5 && guest.talents.points >= 5 && host.itemCount("coin") >= C.DUEL.rounds[0].coins && guest.itemCount("coin") >= C.DUEL.rounds[0].coins, `${host.talents.points}/${guest.talents.points}, ${host.itemCount("coin")}/${guest.itemCount("coin")}`);
  t.check("дуэль: своё дерево талантов (режим duel)", host.talents.tree.mode === "duel" && guest.talents.tree.mode === "duel");
  t.check("дуэль: нет трофеев, маунта, удачи и множителей (IAI и т. п.)", ["trophies", "fighter-trophies", "fortune", "mount-saddle", "katana-iai", "sniper-head"].every((id) => !host.talents.byId.has(id)) && !host.talents.tree.tabs.some((t) => t.id === "mount"));
  t.check("дуэль: здоровье 220", host.player.stats.maxHp >= 220 && guest.player.stats.maxHp >= 220, `${host.player.stats.maxHp}/${guest.player.stats.maxHp}`);
  t.check("дуэль: скорость +25 %", host.player.speedBonuses.duel === 0.25);
  t.check("дуэль: трофеи нельзя", host.talents.check("trophies").reason === "NOT IN THIS MODE" || !host.talents.byId.has("trophies"), host.talents.check("trophies").reason);
  // стены не ломаются (и у гостя — то же правило), укрытия внутри — ломаются
  const wall = [...host.world.blocks.values()].find((b) => b.surface === "arena");
  t.check("дуэль: серая стена не ломается (хост и гость)", !host.world.remove(wall.x, wall.y, wall.z) && !guest.world.remove(wall.x, wall.y, wall.z) && host.world.has(wall.x, wall.y, wall.z));
  const prop = [...host.world.blocks.values()].find((b) => !b.surface && Math.abs(b.x) < 10 && Math.abs(b.z) < 10 && b.y >= 1);
  t.check("дуэль: укрытие внутри ломается", !prop || host.world.remove(prop.x, prop.y, prop.z));

  // бой: все на арене, классы выбраны (кто не успел — за него)
  const coins0 = host.itemCount("coin");
  host.duelState.time = 0.01;
  await both(10);
  const onArena = (s) => Math.abs(s.player.position.x) < C.DUEL.arena.half && Math.abs(s.player.position.z) < C.DUEL.arena.half;
  t.check("бой: оба на арене", host.duelState.phase === "fight" && onArena(host) && onArena(guest), `${host.duelState.phase}`);
  t.check("бой: класс выбран за не успевших", !!host.playerClass && !!guest.playerClass);
  t.check("бой: враги друг другу", host.player.isHostileTo([...host.net.guests.values()][0].hero) && guest.player.isHostileTo([...guest.net.copies.values()].find((e) => e.type === "player")));
  // удар хоста по гостю — у гостя минус здоровье; удар гостя по хосту — у хоста
  const hero = [...host.net.guests.values()][0].hero;
  const gh0 = guest.player.stats.hp;
  hero.receive(new E.Damage({ amount: 20, source: host.player }));
  await both(4);
  t.check("PvP: хост ранил гостя", guest.player.stats.hp < gh0, `${gh0} → ${guest.player.stats.hp}`);
  await both(10);
  t.check("хост видит здоровье гостя (полоска цели)", hero.stats.maxHp === guest.player.stats.maxHp && hero.stats.hp === Math.ceil(guest.player.stats.hp), `${hero.stats.hp}/${hero.stats.maxHp} vs ${guest.player.stats.hp}/${guest.player.stats.maxHp}`);
  // гость присел — у хоста его герой ниже (рост и голова), у гостя копия хоста — как стоит
  const ctrl = E.KEYS[G.engine.input.bindings.crouch.split(":")[1]];
  G.engine.input.keys.add(ctrl);
  await both(10);
  t.check("присед гостя виден у хоста (ниже рост)", guest.crouched && hero.height === C.CROUCH.height && hero.netLow === 2, `${hero.height} ${hero.netLow}`);
  G.engine.input.keys.delete(ctrl);
  await both(10);
  t.check("гость встал — у хоста тоже", hero.height === C.PLAYER.height && !hero.netLow);
  const hostCopy = [...guest.net.copies.values()].find((e) => e.type === "player");
  const hh0 = host.player.stats.hp;
  hostCopy.receive(new E.Damage({ amount: 20, source: guest.player }));
  await both(4);
  t.check("PvP: гость ранил хоста", host.player.stats.hp < hh0, `${hh0} → ${host.player.stats.hp}`);
  // потратил монеты в бою — к следующему раунду вернутся
  host.takeItem("coin", 50);

  // гость пал — раунд за хостом
  guest.player.stats.hp = 0;
  await both(10);
  t.check("раунд: гость выбыл — раунд за хостом", host.duelState.phase === "end" && host.duelState.wins.ALPHA === 1, JSON.stringify(host.duelState));
  host.duelState.time = 0.01;
  await both(10);
  t.check("раунд 2: подготовка, гость снова жив", host.duelState.phase === "prep" && host.duelState.round === 2 && !guest.downed && guest.player.alive);
  t.check("раунд 2: вещи как на начало прошлого раунда + монеты 2-го раунда", host.itemCount("coin") === coins0 + C.DUEL.rounds[1].coins, `${coins0} → ${host.itemCount("coin")}`);
  t.check("раунд 2: 10 очков талантов за 2 раунда (если не тратили)", host.talents.points >= 10);
  t.check("гость видит счёт и фазу", guest.duelRemote?.phase === "prep" && guest.duelRemote.wins.ALPHA === 1, JSON.stringify(guest.duelRemote));

  // раунд 2: хост снова побеждает — 2:0, но до 3 побед: будет 3-й раунд
  host.duelState.time = 0.01;
  await both(10);
  t.check("раунд 2: второе оружие выбрано", !!host.subclass && !!guest.subclass);
  guest.player.stats.hp = 0;
  await both(10);
  host.duelState.time = 0.01;
  await both(15);
  t.check("2:0 — дуэль идёт дальше (до 3 побед), 3-й раунд", !host.matchEnded && host.duelState.phase === "prep" && host.duelState.round === 3, JSON.stringify(host.duelState));
  t.check("раундов в дуэли — 5", C.DUEL.rounds.length === 5 && C.DUEL.wins === 3);
  // раунд 3: хост побеждает — 3:0, дуэль окончена
  host.duelState.time = 0.01;
  await both(10);
  guest.player.stats.hp = 0;
  await both(10);
  host.duelState.time = 0.01;
  await both(15);
  t.check("дуэль окончена у обоих (3:0)", host.matchEnded && guest.matchEnded);
  t.check("профиль: победа записана", H.engine.profile.get("duelWins") === 1);
  await host.net?.close();
}
