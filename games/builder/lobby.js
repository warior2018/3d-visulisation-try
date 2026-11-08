// ============================================================
//  Лобби сетевой игры (как в Fortnite): перед матчем все стоят моделями в ряд, у каждого — имя и READY.
//  Все нажали READY — через LOBBY.countdown секунд у всех стартует матч: новый мир на один раз
//  (не сохраняется), класс выбирают все сразу, опыт общий. В начатый матч не заходят.
//  Режим выбирает хост: CLASSIC — вместе против мобов; DUEL — каждый сам за себя на арене (scene/duel.js),
//  нужно 2+ игрока.
//
//  Хост (role "host"): сервер уже слушает; гости присылают lobbyHello / ready, хост рассылает состав.
//  Гость (role "client"): подключился → lobbyHello { name } → ждёт состав и start.
//  Сообщения: гость → хост: lobbyHello { name }, ready { on }
//             хост → гость: lobby { players: [{ id, name, ready, host }], you, countdown }, start { matchId }, bye { reason }
// ============================================================

import { Scene, Camera, Vec3, localAddresses } from "../../engine/index.js";
import { LOBBY } from "./config.js";

const HERO_GAP = 1.5; // метров между героями в ряду

export class LobbyScene extends Scene {
  // net: { role: "host", server } | { role: "client", client }; name — своё имя; onStart(net) — матч начался;
  // onLeave(reason) — вышли из лобби (в главное меню)
  constructor({ game, net, name, onStart, onLeave }) {
    super();
    this.game = game;
    this.net = net;
    this.role = net.role;
    this.myName = String(name || (this.role === "host" ? "HOST" : "GUEST")).slice(0, 16).toUpperCase();
    this.onStart = onStart;
    this.onLeave = onLeave;
    this.realtime = true; // модели героев шевелятся
    this.players = []; //   [{ id, name, ready, host }]
    this.me = 0; //         свой id в составе (у хоста — 0)
    this.countdown = null; // секунд до старта (все готовы) или null
    this.heroes = new Map(); // id -> сущность-модель
    this.inbox = [];
    this.camera = new Camera({ position: new Vec3(0, 1.45, 6.2), fovDeg: 40 });
    this.camera.yaw = Math.PI;
    this.started = false;
    this.mode = "classic"; // режим матча (выбирает хост): "classic" | "duel"
    if (this.role === "host") {
      this.players = [{ id: 0, name: this.myName, ready: false, host: true }];
      const s = net.server;
      s.onMessage = (peer, msg) => this.inbox.push([peer, msg]);
      s.onDisconnect = (peer) => this.inbox.push([peer, { t: "gone" }]);
      this.ips = localAddresses();
    } else {
      const c = net.client;
      c.onMessage = (msg) => this.inbox.push([null, msg]);
      c.onClose = (reason) => this.inbox.push([null, { t: "closed", reason }]);
      c.send({ t: "lobbyHello", name: this.myName });
    }
  }

  get label() {
    return "лобби";
  }

  // ---------- Сеть ----------

  // Хост: состав — всем (каждому — его id)
  broadcast() {
    const s = this.net.server;
    for (const peer of s.peers.values()) s.send(peer, { t: "lobby", players: this.players, you: peer.id, countdown: this.countdown, mode: this.mode });
  }

  handle(peer, msg) {
    if (this.role === "host") {
      const p = this.players.find((x) => x.id === peer.id);
      if (msg.t === "lobbyHello" && !p) {
        if (this.players.length >= LOBBY.maxPlayers) return this.net.server.send(peer, { t: "bye", reason: "lobby is full" });
        let name = String(msg.name || "GUEST").slice(0, 16).toUpperCase();
        while (this.players.some((x) => x.name === name)) name = name.slice(0, 13) + " " + (this.players.length + 1);
        this.players.push({ id: peer.id, name, ready: false, host: false });
        this.engine.log(`лобби: вошёл ${name} (${peer.address})`);
        this.unready();
      } else if (msg.t === "ready" && p) {
        p.ready = !!msg.on;
        if (!p.ready) this.countdown = null;
      } else if (msg.t === "gone" && p) {
        this.players = this.players.filter((x) => x !== p);
        this.engine.log(`лобби: вышел ${p.name}`);
        this.countdown = null;
      } else return;
      this.broadcast();
      return;
    }
    // гость
    if (msg.t === "lobby") {
      this.players = Array.isArray(msg.players) ? msg.players : [];
      this.me = msg.you;
      this.countdown = msg.countdown ?? null;
      this.mode = msg.mode === "duel" ? "duel" : "classic";
    } else if (msg.t === "start") {
      this.mode = msg.mode === "duel" ? "duel" : "classic";
      this.begin(msg.matchId);
    } else if (msg.t === "bye" || msg.t === "closed") {
      this.leave(msg.reason || "host left");
    }
  }

  // Новый игрок — всем снова «не готов» (чтобы никто не стартовал без него)
  unready() {
    this.countdown = null;
  }

  toggleReady() {
    const mine = this.players.find((x) => x.id === this.me);
    if (!mine) return;
    mine.ready = !mine.ready;
    if (this.role === "host") {
      if (!mine.ready) this.countdown = null;
      this.broadcast();
    } else this.net.client.send({ t: "ready", on: mine.ready });
    this.engine.sound.play("click");
  }

  begin(matchId) {
    if (this.started) return;
    this.started = true;
    this.engine.log(`лобби: матч ${matchId} начался, игроков ${this.players.length}`);
    this.onStart({ ...this.net, match: true, mode: this.mode, matchId, roster: this.players.map((x) => x.name), name: this.players.find((x) => x.id === this.me)?.name || this.myName });
  }

  leave(reason = "") {
    if (this.started) return;
    this.started = true;
    if (this.role === "host") this.net.server.close();
    else this.net.client.close("вышли из лобби");
    this.onLeave?.(reason);
  }

  // ---------- Кадр ----------

  update(dt) {
    for (const [peer, msg] of this.inbox.splice(0)) this.handle(peer, msg);
    if (this.started) return;
    // хост: все готовы — отсчёт, дошёл до нуля — старт у всех
    if (this.role === "host") {
      const enough = this.mode !== "duel" || this.players.length >= 2; // дуэль — хотя бы двое
      const all = enough && this.players.length > 0 && this.players.every((x) => x.ready);
      if (!all && this.countdown !== null) { this.countdown = null; this.broadcast(); }
      if (all && this.countdown === null) {
        this.countdown = LOBBY.countdown;
        this.broadcast();
      }
      if (this.countdown !== null) {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        if (Math.ceil(this.countdown) !== before) this.broadcast();
        if (this.countdown <= 0) {
          const matchId = Date.now().toString(36);
          this.net.server.broadcast({ t: "start", matchId, mode: this.mode });
          this.begin(matchId);
          return;
        }
      }
    } else if (this.countdown !== null) this.countdown = Math.max(0, this.countdown - dt);
    this.updateHeroes(dt);
    this.engine.redraw();
  }

  // Модели героев: по одной на игрока, в ряд лицом к камере
  updateHeroes(dt) {
    const models = this.game.models;
    const ids = new Set(this.players.map((x) => x.id));
    for (const [id, e] of this.heroes) if (!ids.has(id)) { models.detach(e); this.heroes.delete(id); }
    const n = this.players.length;
    this.players.forEach((pl, i) => {
      let e = this.heroes.get(pl.id);
      if (!e) {
        e = { position: new Vec3(0, 0, 0), yaw: 0, alive: true, hurtTime: 99, deadTime: 0, scale: 1, roll: 0, tilt: 0, skinned: pl.id === this.me };
        try {
          models.attach(e, "hero");
          e.view?.animator.setBase("Idle", 1);
        } catch (err) {
          this.engine.log("лобби: модель героя не показалась: " + err.message);
        }
        this.heroes.set(pl.id, e);
      }
      e.position.x = (i - (n - 1) / 2) * HERO_GAP;
      e.yaw = 0;
    });
    models.update([...this.heroes.values()], dt);
  }

  view() {
    if (!this.heroes.size) return null;
    return { camera: this.camera, world: null, characters: this.game.models.drawList([...this.heroes.values()]) };
  }

  // Точка мира (x, y на плоскости z = 0) -> экран
  toScreen(ui, x, y) {
    const c = this.camera, t = Math.tan(c.fov / 2), d = c.position.z, aspect = ui.width / ui.height;
    return { x: ui.width / 2 + (x / (d * t * aspect)) * (ui.width / 2), y: ui.height / 2 - ((y - c.position.y) / (d * t)) * (ui.height / 2) };
  }

  drawUI(ui) {
    const th = ui.theme;
    ui.text("LOBBY", ui.width / 2, 40, 5, th.text, "center");
    if (this.role === "host") {
      const addr = (this.ips || []).slice(0, 3).join("  /  ") || "?";
      ui.text(`FRIENDS JOIN AT: ${addr}`, ui.width / 2, 92, 2, th.muted, "center", 255, ui.width - 40);
    } else ui.text("WAITING FOR EVERYONE TO BE READY", ui.width / 2, 92, 2, th.muted, "center");
    const n = this.players.length;
    this.players.forEach((pl, i) => {
      const s = this.toScreen(ui, (i - (n - 1) / 2) * HERO_GAP, 2.15);
      const me = pl.id === this.me;
      ui.text(pl.name + (pl.host ? " (HOST)" : ""), s.x, s.y - 34, 2, me ? th.accent : th.text, "center", 255, HERO_GAP * 120);
      ui.text(pl.ready ? "READY" : "NOT READY", s.x, s.y - 12, 2, pl.ready ? [110, 220, 110] : th.muted, "center");
    });
    const mine = this.players.find((x) => x.id === this.me);
    const by = ui.height - 70;
    ui.button("ready", mine?.ready ? "NOT READY" : "READY", ui.width / 2 + 110, by, 200, 52, 3, !!mine?.ready);
    ui.button("leave", "LEAVE", ui.width / 2 - 110, by, 200, 52, 3);
    // режим: хост переключает, гости видят
    const my = by - 120;
    if (this.role === "host") {
      ui.button("mode:classic", "CLASSIC", ui.width / 2 - 110, my, 200, 44, 2, this.mode === "classic");
      ui.button("mode:duel", "DUEL", ui.width / 2 + 110, my, 200, 44, 2, this.mode === "duel");
    } else ui.text(`MODE: ${this.mode === "duel" ? "DUEL" : "CLASSIC"}`, ui.width / 2, my - 8, 3, th.text, "center");
    ui.text(this.mode === "duel" ? "EVERYONE FOR THEMSELVES, BEST OF 3 ROUNDS" : "TOGETHER AGAINST THE MOBS", ui.width / 2, my + 30, 1, th.muted, "center");
    // своя статистика (профиль движка: engine.profile)
    const pr = this.engine.profile;
    if (pr) ui.text(`YOUR DUELS: ${pr.get("duelWins")} WON / ${pr.get("duelLosses")} LOST   MATCHES: ${pr.get("matches")}`, 20, ui.height - 30, 1, th.muted);
    if (this.mode === "duel" && n < 2) ui.text("DUEL NEEDS 2+ PLAYERS", ui.width / 2, by - 64, 2, th.warn || th.accent, "center");
    else if (this.countdown !== null) ui.text(`STARTING IN ${Math.max(0, Math.ceil(this.countdown))}`, ui.width / 2, by - 64, 3, th.accent, "center");
    else ui.text(`${this.players.filter((x) => x.ready).length} / ${n} READY`, ui.width / 2, by - 64, 2, th.muted, "center");
  }

  onButton(id) {
    if (id.startsWith("mode:") && this.role === "host") {
      this.mode = id.slice(5) === "duel" ? "duel" : "classic";
      this.countdown = null;
      this.broadcast();
    }
    if (id === "ready") this.toggleReady();
    if (id === "leave") this.leave();
  }

  onPress(actions) {
    if (actions.includes("pause")) this.leave();
  }

  exit() {
    for (const e of this.heroes.values()) this.game.models.detach(e);
    this.heroes.clear();
  }
}
