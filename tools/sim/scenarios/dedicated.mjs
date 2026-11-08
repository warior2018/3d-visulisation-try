// Выделенный сервер (tools/server.mjs): хост без своего героя. Лобби — только гости, дуэль — между гостями,
// своего героя хоста нет ни в снимках, ни в таблице, ни в дуэли
export default async function (t, g) {
  const { E, C } = g;
  const { LobbyScene } = await import(g.root + "games/builder/lobby.js");
  const server = new E.NetServer({ port: 0, host: "127.0.0.1" });
  await server.listen();
  const ca = new E.NetClient(), cb = new E.NetClient();
  await ca.connect("127.0.0.1", server.port);
  await cb.connect("127.0.0.1", server.port);
  let hostNet = null, aNet = null, bNet = null;
  const L0 = new LobbyScene({ game: g.game, net: { role: "host", server, dedicated: true, mode: "duel" }, name: "SERVER", onStart: (n) => { hostNet = n; } });
  const LA = new LobbyScene({ game: g.game, net: { role: "client", client: ca }, name: "anna", onStart: (n) => { aNet = n; } });
  const LB = new LobbyScene({ game: g.game, net: { role: "client", client: cb }, name: "boris", onStart: (n) => { bNet = n; } });
  for (const l of [L0, LA, LB]) l.engine = g.engine;
  const lt = async (n) => { for (let i = 0; i < n; i++) { for (const l of [L0, LA, LB]) l.update(1 / 60); await new Promise((r) => setImmediate(r)); } };
  await lt(15);
  t.check("лобби сервера: в составе только гости", L0.players.length === 2 && !L0.players.some((p) => p.host), JSON.stringify(L0.players));
  t.check("лобби: режим — с сервера (дуэль)", LA.mode === "duel");
  LA.toggleReady(); LB.toggleReady();
  await lt(C.LOBBY.countdown * 60 + 40);
  t.check("матч начался у всех, в составе — двое", hostNet && aNet && bNet && hostNet.roster.length === 2 && !hostNet.roster.includes("SERVER"));
  if (!hostNet) return;
  const H = g.createPeer({ ...hostNet, dedicated: true });
  H.scene.askClass = H.scene.askSubclass = () => {};
  const A = g.createPeer(aNet), B = g.createPeer(bNet);
  const all = async (n = 1) => { for (let i = 0; i < n; i++) { H.tick(); A.tick(); B.tick(); await new Promise((r) => setImmediate(r)); } };
  const until = async (c, max = 400) => { for (let i = 0; i < max && !c(); i++) await all(); return c(); };
  const host = H.scene, a = A.scene, b = B.scene;
  t.check("сервер: подготовка 1-го раунда", await until(() => host.duelState?.phase === "prep" && a.duelRound === 1 && b.duelRound === 1), `${host.duelState?.phase}`);
  t.check("сервер: в дуэли — только гости", host.duelHeroes().length === 2 && !host.duelHeroes().includes(host.player));
  t.check("сервер: счёт — у двоих гостей", Object.keys(host.duelState.wins).sort().join() === "ANNA,BORIS");
  await all(70);
  t.check("гость не видит героя сервера (только другого гостя)", [...a.net.copies.values()].filter((e) => e.type === "player").length === 1);
  t.check("таблица: двое, без сервера", host.scoreRows().length === 2);
  host.duelState.time = 0.01;
  await all(10);
  t.check("бой: гости на арене", host.duelState.phase === "fight");
  b.player.stats.hp = 0;
  await all(10);
  t.check("гость выбыл — раунд за другим (сервер не считается)", host.duelState.phase === "end" && host.duelState.wins.ANNA === 1, JSON.stringify(host.duelState));
  t.check("герой сервера цел и в стороне", host.player.alive && host.player.position.y > 300);
  await host.net?.close();
}
