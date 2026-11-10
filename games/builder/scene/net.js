// ============================================================
//  Сетевая игра «Стройки»: хост и гость. Транспорт — движок (engine/net/net.js), здесь — что пересылаем.
//
//  Хост (HostNet) — обычная игра, мир считает он: мобы, бой, блоки. Каждый гость у него — ещё один герой
//  (remote: двигает его сеть, а не физика). 20 раз в секунду хост рассылает снимок: где кто, здоровье,
//  идёт ли; и изменения блоков.
//  Гость (ClientNet) — свой герой со своими вещами и талантами (из своего сохранения), а мир — хоста:
//  при входе получает все куски мира, дальше — снимки. Мир у себя не считает (tickWorld не зовётся):
//  мобы — «копии», плавно едут от снимка к снимку. Своё шлёт хосту: где стоит (20 раз в секунду),
//  поставил / сломал блок, попал по мобу (сколько урона).
//
//  Сообщения ({ t: тип, ... }):
//   гость → хост: hello { name }, state { x, y, z, yaw, w, hp, mh }, place { x, y, z, c, s }, remove { x, y, z },
//                 hit { id, n }, take { id } (подобрать с земли), drop { item, count, data, x, y, z },
//                 chat { text }, ping { ts, ms }
//   хост → гость: welcome { id, surfaces, chunks, spawn }, snap { e, b, p }, hurt { n, from }, give { item, count, data },
//                 xp { n } (опыт — общий: за любого убитого моба всем), chat { from, text }, pong { ts }, bye { reason }
//   Связь: гость раз в секунду — ping (хост отвечает pong: так меряем задержку); 10 с тишины — связь потеряна
//   снимок e — строки [id, тип, x, y, z, yaw, hp, maxHp, флаги: 1 — жив, 2 — идёт, 4 — замахнулся]; b — блоки
//   [x, y, z, r, g, b, поверхность] (поставили) или [x, y, z] (сломали); p — предметы на земле [id, item, count, x, y, z]
//   (раз в 4 снимка); h — что в руках у героев [[id, held]]; inv — нашествие [идёт, осталось с, название];
//   fx — эффекты и звуки [[откуда (0 — хост, иначе номер гостя), вид, аргументы]] (гость шлёт свои: fx { list })
// ============================================================

import { encodeChunk, decodeChunk, Damage, Vec3 } from "../../../engine/index.js";
import { isWeapon, isArmor } from "../items.js";
import { PICKUP_AUTO_RADIUS, SUBCLASS } from "../config.js";
import { lowerBody } from "./pets.js";
import { skinUnlocked } from "../skins.js";

const SNAP_EVERY = 3; //   снимок раз в 3 тика (20 в секунду при 60 тиках)
const TIMEOUT = 10000; // мс без единого сообщения — связь потеряна
// Копии у гостя рисуются с отставанием DELAY тиков (100 мс), между двумя снимками, которые обрамляют это время
// (буфер интерполяции, как cl_interp в Source / Overwatch): снимок пришёл неровно или один потерялся — движение
// всё равно ровное. Часы гостя (viewTick) идут сами и мягко подтягиваются к часам хоста
const DELAY = 6;
const r2 = (v) => Math.round(v * 100) / 100;

// Звуки без места (в голове у того, кто играет), которые другим слышно из точки, где стоит игрок:
// удары, выстрелы, взрывы. Остальные (подбор, уровень, интерфейс) — личные, не пересылаем
const SHARED_SOUNDS = new Set(["swing", "slash", "shot", "shotAuto", "boltOpen", "boltClose", "reload", "cast", "boom", "zap", "place", "remove", "parry", "guard", "trapSet", "spike", "snap", "death"]);

// Эффекты и звуки — перехват: всё, что сцена рисует / играет, попадает в очередь (её шлём по сети);
// чужие эффекты играем с replaying = true — они в очередь не попадают (не отправляем обратно)
class FxRelay {
  constructor(g) {
    this.g = g;
    this.queue = [];
    this.replaying = false;
    this.undo = [];
    const wrap = (obj, method, kind, prep = (a) => a) => {
      const orig = obj[method];
      obj[method] = (...args) => {
        if (!this.replaying) {
          const a = prep(args);
          if (a) this.queue.push([kind, a]);
        }
        return orig.apply(obj, args);
      };
      this.undo.push(() => { obj[method] = orig; });
      this[kind] = (args) => orig.apply(obj, args);
    };
    const pt = (p) => (p ? { x: r2(p.x), y: r2(p.y), z: r2(p.z) } : p);
    wrap(g.slashes, "add", "slash", ([o]) => [{ ...o, origin: pt(o.origin) }]);
    // anchor — функция (едет за героем): по сети — точка, где он сейчас
    wrap(g.crescents, "add", "crescent", ([o]) => [{ ...o, anchor: pt(typeof o.anchor === "function" ? o.anchor() : o.anchor) }]);
    wrap(g.beams, "add", "beam", ([o]) => [{ ...o, from: pt(o.from), to: pt(o.to) }]);
    wrap(g.beams, "ring", "ring", ([c, r, o]) => [pt(c), r, o]);
    wrap(g.beams, "mark", "mark", ([p, o]) => [pt(p), o]);
    const sound = g.engine.sound;
    wrap(sound, "play", "sound", ([name, o]) => {
      if (o?.at) return [name, { at: pt(o.at), volume: o.volume }];
      if (SHARED_SOUNDS.has(name)) return [name, { at: pt(g.player.position), volume: o?.volume }];
      return null;
    });
  }

  take() {
    return this.queue.length ? this.queue.splice(0) : null;
  }

  play(list, skipFrom = -1) {
    if (!list) return;
    this.replaying = true;
    try {
      for (const [from, kind, args] of list) if (from !== skipFrom && this[kind]) this[kind](args);
    } catch (e) {
      this.g.engine.log("сеть: эффект не сыгрался: " + e.message);
    }
    this.replaying = false;
  }

  close() {
    for (const u of this.undo) u();
  }
}

// Что в руках у героя (для чужих экранов): модель и поза — как у самой игры (ability.held)
const heldOf = (g) => {
  const h = g.abilities.current?.held;
  return h ? JSON.stringify(h) : "";
};
const showHeld = (g, e, json) => {
  const h = json ? JSON.parse(json) : null;
  g.game.models.hold(e, h?.model ?? null, h || {});
  e.view?.animator.setOverlay(h?.pose ?? null);
};

// ---------- Скины по сети ----------
// Каждый видит чужие скины: гость шлёт свои в hello (sk), хост рассылает всем { t: "skins", list: [[netId, скины]] }
// (при входе гостя и раз в несколько секунд). Чужой герой в скинах: skinned + skinOverride (skins.js → resolve),
// модель надевается заново, предмет в руке — тоже
// только открытые (ачивки): закрытый скин из настроек другим не показываем
const mySkins = (g) => Object.fromEntries(Object.entries(g.settings?.skins || {}).filter(([t, s]) => skinUnlocked(t, s)));
const cleanSkins = (sk) => Object.fromEntries(Object.entries(sk && typeof sk === "object" ? sk : {}).filter(([k, v]) => typeof k === "string" && typeof v === "string").slice(0, 64));
export function setSkins(g, e, sk) {
  const map = cleanSkins(sk);
  if (e.skinKey === JSON.stringify(map)) return;
  e.skinKey = JSON.stringify(map);
  e.skinned = true;
  e.skinOverride = map;
  const name = e.view?.name;
  if (!name) return;
  g.game.models.detach(e);
  g.game.models.attach(e, name);
  const held = e.netHeld ?? e.heldJson;
  if (held) try { showHeld(g, e, held); } catch {}
}

// Дуэль: где мы (фаза, раунд, секунд осталось, победитель раунда, счёт) — гостям в каждом снимке
const duelSnap = (g) => {
  const S = g.duel && g.duelState;
  return S ? [S.phase, S.round, Math.max(0, Math.ceil(S.time)), S.winner || "", Object.entries(S.wins)] : undefined;
};

// Номер сущности в сети (один на всю игру хоста)
let nextNetId = 1;
const netId = (e) => (e.netId ||= nextNetId++);

// Ниже ростом (pets.js → lowerBody): 0 стоя, 1 стойка катаны, 2 присед — свой герой; во флагах снимка 16 / 32
const myLow = (g) => (g.crouched ? 2 : g.lowStance ? 1 : 0);
const lowFlags = (low) => (low === 2 ? 32 : low === 1 ? 16 : 0);
// Клип тела чужого героя: в приседе / стойке — клипы стойки (колени согнуты)
export const baseClip = (walk, low) => (low ? (walk ? "StanceWalk" : "StanceIdle") : walk ? "Walk" : "Idle");

// ---------- Ловушки по сети ----------
// Ловушка срабатывает и бьёт только у своего хозяина (там её урон и считается: удар по копии врага уходит ему).
// Остальным — её вид: { t: "trap", a: 1 — поставлена / 0 — убрана, k — ключ, ty, x, y, z, yaw, tilt, o — хозяин }.
// Вражеская (дуэль) — почти прозрачная (silhouette "faint"), союзника — как есть
let trapSeq = 0;
const trapMsg = (net, t, add) => {
  t.netKey ||= `${net.myName}:${++trapSeq}`;
  return add
    ? { t: "trap", a: 1, k: t.netKey, ty: t.type, x: r2(t.position.x), y: r2(t.position.y), z: r2(t.position.z), yaw: r2(t.yaw || 0), tilt: r2(t.tilt || 0), o: net.myName }
    : { t: "trap", a: 0, k: t.netKey, o: net.myName };
};
function applyTrap(g, msg) {
  const map = (g.netTraps ||= new Map());
  const old = map.get(msg.k);
  if (old) {
    g.game.models.detach(old);
    map.delete(msg.k);
  }
  if (!msg.a || typeof msg.ty !== "string") return;
  const t = {
    type: msg.ty, owner: msg.o, alive: true, roll: 0, hurtTime: Infinity, deadTime: 0, view: null,
    position: new Vec3(+msg.x || 0, +msg.y || 0, +msg.z || 0), yaw: +msg.yaw || 0, tilt: +msg.tilt || 0,
    silhouette: g.duel ? "faint" : null, // дуэль: все — враги
  };
  try { g.game.models.attach(t, "item-" + msg.ty); } catch { return; }
  map.set(msg.k, t);
}

// Урон своему герою, пришедший с другого компьютера: n — урон ДО брони (там он посчитан с талантами бьющего).
// Здесь — как обычный удар (receive): своя броня, шлем (голова — part), блок (срежет долю и отразит выстрел:
// combat.js → reflectShot)
function hurtLocal(g, n, source, kind, shot, part = null) {
  const d = new Damage({ amount: n, source, kind: kind || null });
  d.shot = shot || null;
  d.part = part;
  g.player.receive(d);
}

export class HostNet {
  // Своя ловушка поставлена / убрана — всем гостям (game-scene.js → Traps onAdd / onRemove)
  trapAdded(t) {
    this.server.broadcast(trapMsg(this, t, true));
  }
  trapRemoved(t) {
    this.server.broadcast(trapMsg(this, t, false));
  }

  constructor(scene, server) {
    this.g = scene;
    this.server = server;
    this.role = "host";
    this.inbox = []; //    сообщения приходят между кадрами — разбираем в тике
    this.guests = new Map(); // peer.id -> { peer, hero, name }
    this.blocks = []; //   изменения блоков с прошлого снимка
    this.ticks = 0;
    this.myName = String(scene.game.net?.name || scene.settings.net?.name || "HOST").toUpperCase();
    server.onMessage = (peer, msg) => {
      peer.data.seen = Date.now();
      this.inbox.push([peer, msg]);
    };
    server.onDisconnect = (peer, reason) => this.inbox.push([peer, { t: "leave", reason }]);
    scene.world.onChange = (x, y, z, b) => this.blocks.push(b ? [x, y, z, b.color[0], b.color[1], b.color[2], b.surface || 0] : [x, y, z]);
    this.fx = new FxRelay(scene);
    this.fxOut = []; // эффекты этого снимка: [откуда, вид, аргументы]
  }

  get count() {
    return this.guests.size;
  }

  tick() {
    const g = this.g;
    for (const [peer, msg] of this.inbox.splice(0)) this.handle(peer, msg);
    // гость замолчал (завис, пропала сеть) — отключаем, его герой исчезнет
    if (this.ticks % 60 === 0) {
      const now = Date.now();
      for (const q of this.guests.values()) if (now - (q.peer.data.seen || now) > TIMEOUT) this.server.kick(q.peer, "timeout");
    }
    this.smoothGuests();
    if (g.match && !g.duel) g.teamPaused = !this.teamReady(); // матч: кто-то ещё выбирает класс / второе оружие — мир стоит
    const mine = this.fx.take();
    if (mine) for (const [kind, args] of mine) this.fxOut.push([0, kind, args]);
    if (++this.ticks % SNAP_EVERY) return;
    if (!this.guests.size) {
      this.blocks.length = 0;
      this.fxOut.length = 0;
      return;
    }
    const e = [];
    for (const x of g.entities.list) {
      if (!x.view && !x.remote) continue;
      if (x === g.player && g.dedicated) continue; // сервер: своего героя не показываем
      const walking = x === g.player ? !!g.move?.moving : !!x.netWalk;
      e.push([netId(x), x.type, r2(x.position.x), r2(x.position.y), r2(x.position.z), r2(x === g.player ? g.look.yaw : x.yaw), Math.round(x.stats.hp), Math.round(x.stats.maxHp), (x.alive ? 1 : 0) | (walking ? 2 : 0) | (x.netAttack ? 4 : 0) | (x.downed ? 8 : 0) | lowFlags(x === g.player ? myLow(g) : x.netLow)]);
      x.netAttack = false;
    }
    let p, h, inv;
    if (this.ticks % (SNAP_EVERY * 4) === 0) {
      // 7-е поле — кто выбросил (номер героя): у него автоподбор не берёт, пока не отойдёт
      p = g.pickups.list.map((x) => [netId(x), x.item, x.count, r2(x.position.x), r2(x.position.y), r2(x.position.z), x.ignore?.netId || 0]);
      h = [...(g.dedicated ? [] : [[netId(g.player), heldOf(g)]]), ...[...this.guests.values()].map((q) => [netId(q.hero), q.held || ""])];
      // скины: свои и гостей — всем, раз в ~4 снимка ×4 (новые копии подхватят; дёшево — пара строк)
      if (this.ticks % (SNAP_EVERY * 16) === 0 || this.skinsDirty) {
        this.skinsDirty = false;
        this.server.broadcast({ t: "skins", list: [...(g.dedicated ? [] : [[netId(g.player), mySkins(g)]]), ...[...this.guests.values()].map((q) => [netId(q.hero), q.hero.skinOverride || {}])] });
      }
      inv = [g.invasion.active ? 1 : 0, Math.ceil(g.invasion.timeLeft || 0), g.invasionKind?.name || "INVASION"];
    }
    const fx = this.fxOut.length ? this.fxOut.splice(0) : undefined;
    // таблица игроков (TAB) — раз в секунду: [имя, пинг, класс, погиб, хост]
    const tab = this.ticks % 60 === 0 ? g.scoreRows().map((r) => [r.name, r.ping, r.cls || "", r.down ? 1 : 0, r.host ? 1 : 0]) : undefined;
    this.server.broadcast({ t: "snap", k: this.ticks, e, b: this.blocks.length ? this.blocks.splice(0) : undefined, p, h, inv, fx, tab, pz: g.teamPaused ? 1 : 0, du: duelSnap(g) });
  }

  sendChat(text) {
    this.server.broadcast({ t: "chat", from: this.myName, text });
  }

  // Матч: все из лобби зашли, у всех есть класс, а с SUBCLASS.level уровня (опыт общий) — и второе оружие.
  // Нет — мир стоит у всех (выбирают)
  teamReady() {
    const g = this.g;
    const roster = g.game.net?.roster;
    if (roster && this.guests.size < roster.length - (g.dedicated ? 0 : 1)) return false; // ещё не все зашли
    const needSub = g.experience.level >= SUBCLASS.level;
    const chose = (cls, sub) => !!cls && (!needSub || !!sub);
    if (!g.dedicated && !chose(g.playerClass, g.subclass)) return false; // сервер сам не выбирает
    for (const q of this.guests.values()) if (!chose(q.cls, q.sub)) return false;
    return true;
  }

  // Оживить: свой герой — встаём; герой гостя — ему «встань» (здоровье и урна — у него, он пришлёт state)
  revive(target) {
    if (target === this.g.player) return this.g.standUp();
    for (const q of this.guests.values()) if (q.hero === target) this.server.send(q.peer, { t: "revive" });
  }

  // Герои гостей — к последнему присланному месту, плавно (за ~0.1 с); далеко (телепорт, возрождение) — сразу
  smoothGuests() {
    for (const q of this.guests.values()) {
      const t = q.target, h = q.hero;
      if (!t) continue;
      const p = h.position;
      const far = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) > 6;
      const k = far ? 1 : 0.3;
      p.x += (t.x - p.x) * k;
      p.y += (t.y - p.y) * k;
      p.z += (t.z - p.z) * k;
      let d = (t.yaw - (h.yaw || 0)) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      h.yaw = (h.yaw || 0) + d * (far ? 1 : 0.35);
    }
  }

  // Опыт за убитого — и гостям (общий, как в кооперативе)
  shareXp(n) {
    if (n > 0 && this.guests.size) this.server.broadcast({ t: "xp", n });
  }

  handle(peer, msg) {
    const g = this.g;
    const guest = this.guests.get(peer.id);
    switch (msg.t) {
      case "lobbyHello":
        // лобби уже позади: в начатый матч не заходят
        this.server.send(peer, { t: "bye", reason: "match already started" });
        setTimeout(() => this.server.kick?.(peer, "match started"), 200);
        return;
      case "hello": {
        if (guest) return;
        const roster = g.game.net?.roster;
        if (roster && !roster.includes(String(msg.name || "").toUpperCase())) {
          this.server.send(peer, { t: "bye", reason: "match already started" });
          setTimeout(() => this.server.kick?.(peer, "not in the lobby"), 200);
          return;
        }
        const p = g.player.position;
        const spawn = { x: p.x + 1.5, y: p.y + 0.5, z: p.z + 1.5 };
        const hero = g.spawn("player", spawn);
        hero.remote = true; // двигает сеть: физика и мозги его не трогают
        hero.name = String(msg.name || "GUEST").slice(0, 16).toUpperCase();
        setSkins(g, hero, msg.sk); // скины гостя — на его герое у хоста
        this.skinsDirty = true; //    и всем — с ближайшим снимком
        // по гостю попали (мобы на хосте) — урон уходит гостю; здесь он не умирает (здоровье — у гостя)
        hero.onDamage = (d, dealt) => {
          // k, s — вид атаки и выстрел (пуля / снаряд), si — кто бил: у гостя блок отобьёт и отразит (shotDamage)
          // a — урон до брони (броню, шлем и блок считает гость — у себя), p — часть тела (голова)
          this.server.send(peer, { t: "hurt", n: dealt, a: d.amount, p: d.part || null, from: d.source?.name || "", k: d.kind || null, s: d.shot || null, si: d.source ? netId(d.source) : 0 });
          hero.stats.hp = Math.max(1, this.guests.get(peer.id)?.hp ?? hero.stats.maxHp); // как у гостя (state)
        };
        this.guests.set(peer.id, { peer, hero, name: hero.name });
        const surfaces = [];
        const chunks = [];
        for (const c of g.world.chunks.values()) if (c.blocks.size) chunks.push([c.cx, c.cz, encodeChunk(c, surfaces).toString("base64")]);
        this.server.send(peer, { t: "welcome", id: netId(hero), you: peer.id, surfaces, chunks, spawn });
        g.engine.log(`сеть: подключился ${hero.name} (${peer.address}), отправлено кусков мира ${chunks.length}`);
        g.engine.toast(`${hero.name} JOINED`, 3000);
        g.chat?.system(`${hero.name} JOINED`);
        this.server.broadcast({ t: "chat", from: "", text: `${hero.name} JOINED` }, peer);
        return;
      }
      case "leave": {
        if (!guest) return;
        g.removeEntity(guest.hero);
        this.guests.delete(peer.id);
        g.engine.log(`сеть: ${guest.name} отключился (${msg.reason || ""})`);
        g.engine.toast(`${guest.name} LEFT`, 3000);
        g.chat?.system(`${guest.name} LEFT`);
        this.server.broadcast({ t: "chat", from: "", text: `${guest.name} LEFT` });
        return;
      }
    }
    if (!guest) return; // остальное — только после hello
    const h = guest.hero;
    switch (msg.t) {
      case "state":
        // куда встать — цель; сам герой гостя доезжает до неё плавно (smoothGuests): состояние приходит
        // 20 раз в секунду и неровно, а кадров — 60+; без этого гость у хоста двигался рывками
        guest.target = { x: +msg.x || 0, y: +msg.y || 0, z: +msg.z || 0, yaw: +msg.yaw || 0 };
        h.netWalk = !!msg.w;
        // присед / стойка гостя: рост и голова (хитбокс) ниже, клип стойки (game-scene.js)
        if ((+msg.cr || 0) !== (h.netLow || 0)) lowerBody(h, +msg.cr || 0);
        if (typeof msg.c === "string") guest.cls = msg.c || null;
        if (typeof msg.s === "string") guest.sub = msg.s || null; // второе оружие (матч: пауза, пока не выбрали)
        // здоровье гостя (настоящее — у него): показать у его героя — полоска над целью, таблица, другим гостям
        if (Number.isFinite(+msg.mh) && +msg.mh > 0) h.stats.maxHp = +msg.mh;
        if (Number.isFinite(+msg.hp)) {
          guest.hp = Math.max(0, +msg.hp);
          if (!h.downed) h.stats.hp = Math.max(1, Math.min(h.stats.maxHp, guest.hp));
        }
        // погиб в матче (урна): мобы его не трогают; ожил — снова полное здоровье (настоящее — у гостя)
        if (!!msg.d !== !!h.downed) {
          h.downed = !!msg.d;
          h.stats.hp = h.downed ? 0 : h.stats.maxHp;
          g.chat?.system(`${guest.name} ${h.downed ? "IS DOWN" : "IS BACK"}`);
        }
        if (typeof msg.h === "string" && msg.h !== guest.held) {
          guest.held = msg.h; // что в руках у гостя — показать у его героя и разослать другим
          h.heldJson = msg.h;
          try { showHeld(g, h, msg.h); } catch {}
        }
        break;
      case "trap":
        // ловушка гостя: показать у себя и разослать остальным (сам гость свою пропустит — o)
        applyTrap(g, { ...msg, o: guest.name });
        this.server.broadcast({ ...msg, o: guest.name });
        break;
      case "fx":
        // эффекты гостя: сыграть у себя и разослать (сам гость их пропустит — свои)
        if (Array.isArray(msg.list)) {
          const list = msg.list.slice(0, 200).map(([kind, args]) => [peer.id, kind, args]);
          this.fx.play(list);
          this.fxOut.push(...list);
        }
        break;
      case "place":
        if (Array.isArray(msg.c)) g.world.place(msg.x | 0, msg.y | 0, msg.z | 0, msg.c.slice(0, 3), typeof msg.s === "string" ? msg.s : null);
        break;
      case "remove":
        g.world.remove(msg.x | 0, msg.y | 0, msg.z | 0);
        break;
      case "chat": {
        const text = String(msg.text || "").slice(0, 120);
        if (!text) break;
        g.chat?.add(guest.name, text);
        this.server.broadcast({ t: "chat", from: guest.name, text }, peer);
        break;
      }
      case "reviveReq": {
        // гость дооживлял кого-то: хоста — встаём сами; другого гостя — ему «встань»
        const target = msg.id === netId(g.player) ? g.player : g.entities.list.find((e) => e.netId === msg.id);
        if (target) this.revive(target);
        break;
      }
      case "xpReq":
        // опыт гостя (задание) — в общий: хост добавит себе и разошлёт всем
        g.gainXp(Math.max(0, Math.min(100000, +msg.n || 0)));
        break;
      case "ping":
        guest.ping = Math.round(+msg.ms || 0);
        this.server.send(peer, { t: "pong", ts: msg.ts });
        break;
      case "take": {
        // подобрать: кто первый попросил — того и предмет
        const it = g.pickups.list.find((x) => x.netId === msg.id);
        if (!it) return;
        g.pickups.remove(it);
        this.server.send(peer, { t: "give", item: it.item, count: it.count, data: it.data || null });
        break;
      }
      case "drop": {
        // гость выбросил (или не влезло) — на землю у хоста: видят все, подобрать может любой
        if (typeof msg.item !== "string" || !(msg.count > 0)) break;
        const opts = { ignore: h };
        if (msg.data) opts.data = msg.data;
        if (Array.isArray(msg.v)) opts.velocity = { x: +msg.v[0] || 0, y: +msg.v[1] || 0, z: +msg.v[2] || 0 };
        const at = { x: +msg.x || 0, y: (+msg.y || 0) + (msg.exact ? 0 : 0.5), z: +msg.z || 0 };
        netId(h);
        g.pickups.add(msg.item, msg.count | 0, at, opts);
        break;
      }
      case "hit": {
        const target = g.entities.list.find((e) => e.netId === msg.id);
        const n = Math.max(0, Math.min(100000, +msg.n || 0));
        if (g.duel && target?.alive && target.type === "player") {
          // дуэль: гость попал по герою — по хосту: урон хосту; по другому гостю: «ранен» ему (здоровье — у него)
          if (target === g.player) {
            g.player.attackedBy = h;
            hurtLocal(g, Math.max(0, Math.min(100000, +msg.a || n)), h, msg.k, msg.s, msg.p);
            g.player.lastDamageFrom = h.position;
          } else for (const q of this.guests.values()) if (q.hero === target) this.server.send(q.peer, { t: "hurt", n, from: guest.name });
        } else if (target?.alive && !target.remote && target !== g.player) {
          target.attackedBy = h; // злится на того, кто бил
          target.damage(n);
        }
        break;
      }
    }
  }

  close() {
    this.g.world.onChange = null;
    this.fx.close();
    return this.server.close();
  }
}

export class ClientNet {
  // Своя ловушка поставлена / убрана — хосту (он покажет у себя и разошлёт остальным)
  trapAdded(t) {
    this.client.send(trapMsg(this, t, true));
  }
  trapRemoved(t) {
    this.client.send(trapMsg(this, t, false));
  }

  constructor(scene, client, name = "GUEST") {
    this.g = scene;
    this.client = client;
    this.name = name;
    this.role = "client";
    this.inbox = [];
    this.copies = new Map(); // netId хоста -> наша копия существа
    this.items = new Map(); //  netId хоста -> копия предмета на земле
    this.taken = new Map(); //  netId -> до какого тика не показывать (уже попросили подобрать)
    this.ready = false; //       мир хоста получен
    this.ticks = 0;
    this.myName = String(name || "GUEST").slice(0, 16).toUpperCase();
    this.ping = null;
    this.lastHeard = Date.now();
    client.onMessage = (msg) => {
      this.lastHeard = Date.now();
      this.inbox.push(msg);
    };
    client.onClose = (reason) => this.inbox.push({ t: "closed", reason });
    // свои изменения блоков — хосту (чужие применяем тихо: world.quiet)
    scene.world.onChange = (x, y, z, b) => {
      if (b) this.client.send({ t: "place", x, y, z, c: b.color, s: b.surface || null });
      else this.client.send({ t: "remove", x, y, z });
    };
    this.fx = new FxRelay(scene);
    // Свои выброшенные предметы (выбросил, не влезло, выпало из сундука) — не на свою землю, а хосту:
    // мир у него, иначе их видим только мы и никто, кроме нас, их не подберёт
    const pickups = scene.pickups;
    const addLocal = pickups.add;
    this.copyAdd = (...a) => addLocal.apply(pickups, a);
    pickups.add = (item, count, at, opts = {}) => {
      if (!this.ready) return addLocal.call(pickups, item, count, at, opts);
      const v = opts.velocity;
      this.client.send({ t: "drop", item, count, data: opts.data || null, x: r2(at.x), y: r2(at.y), z: r2(at.z), exact: 1, v: v ? [r2(v.x), r2(v.y), r2(v.z)] : undefined });
      return null;
    };
    this.undoPickups = () => { pickups.add = addLocal; };
  }

  start() {
    this.client.send({ t: "hello", name: this.name, sk: mySkins(this.g) }); // и свои скины
  }

  tick(dt) {
    const g = this.g;
    for (const msg of this.inbox.splice(0)) this.handle(msg);
    // раз в секунду — ping; хост молчит дольше TIMEOUT — связь потеряна
    if (this.ticks % 60 === 0) {
      this.client.send({ t: "ping", ts: Date.now(), ms: this.ping ?? 0 });
      if (Date.now() - this.lastHeard > TIMEOUT) return this.handle({ t: "closed", reason: "host not responding" });
    }
    if (!this.ready) {
      this.ticks++;
      return;
    }
    // часы показа: тик за тиком, мягко к «последний тик хоста − DELAY» (большой разрыв — сразу)
    if (this.hostTick !== undefined) {
      const target = this.hostTick - DELAY;
      if (this.viewTick === undefined || Math.abs(target - this.viewTick) > 30) this.viewTick = target;
      else this.viewTick += 1 + (target - this.viewTick) * 0.05;
    }
    const vt = this.viewTick ?? 0;
    for (const e of this.copies.values()) {
      const S = e.net.samples;
      // два снимка вокруг vt (или последний, если новее ещё нет — стоим на нём, не угадываем)
      let a = S[S.length - 1], b = a;
      for (let i = S.length - 1; i > 0; i--) {
        if (S[i - 1].k <= vt) {
          a = S[i - 1];
          b = S[i];
          break;
        }
        a = b = S[i - 1];
      }
      const t = b.k > a.k ? Math.max(0, Math.min(1, (vt - a.k) / (b.k - a.k))) : 1;
      e.position.x = a.x + (b.x - a.x) * t;
      e.position.y = a.y + (b.y - a.y) * t;
      e.position.z = a.z + (b.z - a.z) * t;
      let d = (b.yaw - a.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      e.yaw = a.yaw + d * t;
      e.view?.animator.setBase(baseClip(e.net.walk, e.netLow), 1);
    }
    g.entities.update(dt); // часы: вспышка от удара, падение павших
    // автоподбор: попросить хоста (предмет — тому, кто первый)
    if (g.settings.general.autoLoot !== false && g.player.alive) g.pickups.autoCollect(g.player, PICKUP_AUTO_RADIUS, (p) => this.take(p));
    g.fog.reveal(g.player.position);
    if (++this.ticks % SNAP_EVERY === 0) {
      const p = g.player.position;
      const st = { t: "state", x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(g.look.yaw), w: g.move?.moving ? 1 : 0, d: g.downed ? 1 : 0, cr: myLow(g), c: g.playerClass || "", s: g.subclass || "", hp: Math.ceil(g.player.stats.hp), mh: g.player.stats.maxHp };
      if (this.ticks % (SNAP_EVERY * 4) === 0) st.h = heldOf(g);
      this.client.send(st);
      const list = this.fx.take();
      if (list) this.client.send({ t: "fx", list });
    }
  }

  handle(msg) {
    const g = this.g;
    switch (msg.t) {
      case "welcome": {
        // мир — хоста: свои блоки, существа, предметы и ловушки убираем
        const w = g.world;
        w.quiet = true;
        w.clear();
        const surfaces = Array.isArray(msg.surfaces) ? msg.surfaces : [];
        for (const [cx, cz, data] of msg.chunks || []) decodeChunk(Buffer.from(data, "base64"), cx, cz, w, surfaces);
        w.quiet = false;
        for (const e of [...g.entities.list]) if (e !== g.player) g.removeEntity(e);
        g.pickups.clear();
        g.traps.clear();
        for (const k of [...(g.netTraps?.keys() || [])]) applyTrap(g, { a: 0, k });
        this.myId = msg.id;
        this.you = msg.you; // наш номер у хоста: свои эффекты из снимков пропускаем
        const s = msg.spawn || { x: 0, y: 0, z: 0 };
        g.player.position.x = s.x;
        g.player.position.y = s.y;
        g.player.position.z = s.z;
        g.player.velocity.x = g.player.velocity.y = g.player.velocity.z = 0;
        g.groundY = undefined; // перенесли в мир хоста — не падение
        this.ready = true;
        g.engine.log(`сеть: вошли в мир хоста — блоков ${w.blocks.size}`);
        g.engine.toast("CONNECTED", 2500);
        return;
      }
      case "snap":
        if (!this.ready) return;
        this.applyBlocks(msg.b);
        this.snapK = +msg.k || 0;
        this.hostTick = Math.max(this.hostTick ?? 0, this.snapK);
        this.applyEntities(msg.e || []);
        if (msg.p) this.applyPickups(msg.p);
        if (msg.h) for (const [id, held] of msg.h) {
          const e = this.copies.get(id);
          if (e && e.netHeld !== held) {
            e.netHeld = held;
            if (this.skinsById?.has(id)) setSkins(g, e, this.skinsById.get(id));
            try { showHeld(g, e, held); } catch {}
          }
        }
        if (msg.tab) this.table = msg.tab;
        if (g.match && !g.duel) g.teamPaused = !!msg.pz; // кто-то выбирает класс / оружие — стоим
        if (msg.du) g.duelRemote = { phase: msg.du[0], round: msg.du[1], time: msg.du[2], winner: msg.du[3], wins: Object.fromEntries(msg.du[4] || []) };
        if (msg.inv) {
          g.invasion.active = !!msg.inv[0];
          g.invasion.timeLeft = msg.inv[1];
          g.invasionKind = { ...(g.invasionKind || {}), name: msg.inv[2] };
        }
        this.fx.play(msg.fx, this.you);
        return;
      case "give": {
        // хост отдал подобранное: как обычный подбор; не влезло — обратно хосту на землю
        const fake = { item: msg.item, count: msg.count, data: msg.data, age: 0 };
        let left;
        if (isWeapon(fake.item) || isArmor(fake.item)) left = g.giveItem(fake.item, fake.count, fake.data);
        else left = g.giveResource(fake.item, fake.count, fake.data);
        const got = fake.count - left;
        if (got > 0) {
          g.engine.sound.play("pickup");
          g.engine.toast(`+${got} ${String(fake.item).toUpperCase()}`, 900);
        }
        if (left > 0) {
          const p = g.player.position;
          this.client.send({ t: "drop", item: fake.item, count: left, data: fake.data, x: p.x, y: p.y, z: p.z });
          g.engine.toast("NO ROOM IN INVENTORY");
        }
        return;
      }
      case "chat":
        if (msg.from) g.chat?.add(String(msg.from).slice(0, 16), String(msg.text || "").slice(0, 120));
        else g.chat?.system(String(msg.text || "").slice(0, 120));
        return;
      case "revive":
        g.standUp(); // нас оживил союзник
        return;
      case "duelPrep": // дуэль: подготовка раунда — в свою комнату, награды
        g.duelEnterPrep(msg.round, msg.grant, msg.at);
        return;
      case "duelFight": // дуэль: бой — на арену
        g.duelEnterFight(msg.at);
        return;
      case "duelOver": // дуэль окончена
        g.duelFinish(msg.champion, msg.wins);
        return;
      case "over":
        g.endMatch(); // погибли все — матч окончен
        return;
      case "pong":
        this.ping = Math.max(0, Date.now() - (+msg.ts || Date.now()));
        return;
      case "xp":
        // матч: опыт общий, хост уже посчитал множители — добавляем как есть
        if (g.match) g.applyXp(Math.max(0, +msg.n || 0));
        else g.gainXp(Math.max(0, +msg.n || 0));
        return;
      case "trap":
        if (msg.o !== this.myName) applyTrap(g, msg); // чужая ловушка (своя — уже стоит)
        return;
      case "skins":
        // чьи какие скины: копиям — сразу, ещё не появившимся — когда появятся
        this.skinsById ||= new Map();
        for (const [id, sk] of Array.isArray(msg.list) ? msg.list.slice(0, 16) : []) {
          if (id === this.myId) continue;
          this.skinsById.set(id, sk);
          const e = this.copies.get(id);
          if (e) setSkins(g, e, sk);
        }
        return;
      case "hurt":
        if (g.player.alive) {
          hurtLocal(g, Math.max(0, +(msg.a ?? msg.n) || 0), this.copies.get(msg.si) || null, msg.k, msg.s, msg.p);
          g.engine.sound.play("hurt");
        }
        return;
      case "bye":
      case "closed":
        g.engine.log(`сеть: отключены (${msg.reason || ""})`);
        g.engine.toast(`DISCONNECTED${msg.reason ? ": " + String(msg.reason).toUpperCase() : ""}`, 4000);
        this.ready = false;
        g.game.toMenu?.();
        return;
    }
  }

  applyBlocks(list) {
    if (!list) return;
    const w = this.g.world;
    w.quiet = true;
    for (const b of list) {
      if (b.length > 3) w.place(b[0], b[1], b[2], [b[3], b[4], b[5]], b[6] || null);
      else w.remove(b[0], b[1], b[2]);
    }
    w.quiet = false;
  }

  applyEntities(rows) {
    const g = this.g;
    const seen = new Set();
    for (const [id, type, x, y, z, yaw, hp, maxHp, flags] of rows) {
      if (id === this.myId) continue;
      seen.add(id);
      let e = this.copies.get(id);
      if (!e) {
        e = g.spawn(type, { x, y, z, yaw });
        if (!e) continue;
        e.remote = true;
        e.brain = null;
        e.netId = id;
        e.net = { samples: [], walk: false }; // снимки этой копии: { k, x, y, z, yaw } (последние 6)
        // попали по копии (наш удар, выстрел, горение) — сколько сняли, сообщаем хосту: урон считает он
        const shown = e.onDamage;
        e.onDamage = (d, dealt) => {
          shown?.(d, dealt);
          if (d.source === g.player || !d.source) this.client.send({ t: "hit", id, n: dealt, a: d.amount, p: d.part || null, k: d.kind || null, s: d.shot || null });
          // добили копию своим ударом — ачивки и статистика у гостя (сам моб умрёт у хоста)
          if (d.source === g.player && !e.alive && !e.achDone && e.kind === "mob") {
            e.achDone = true;
            g.achKill?.(e);
          }
        };
        this.copies.set(id, e);
      }
      const n = e.net;
      n.samples.push({ k: this.snapK ?? 0, x, y, z, yaw });
      if (n.samples.length > 6) n.samples.shift();
      n.walk = !!(flags & 2);
      e.downed = !!(flags & 8); // погиб в матче: урна и призрак (scene/coop.js)
      const low = flags & 32 ? 2 : flags & 16 ? 1 : 0; // присед / стойка: ниже рост и голова
      if (low !== (e.netLow || 0)) lowerBody(e, low);
      if (flags & 4) e.view?.animator.playOnce("Attack"); // замахнулся на хосте
      e.stats.maxHp = maxHp;
      e.stats.hp = flags & 1 ? Math.max(1, hp) : 0;
    }
    for (const [id, e] of this.copies) {
      if (seen.has(id)) continue;
      g.removeEntity(e);
      this.copies.delete(id);
    }
  }

  sendChat(text) {
    this.client.send({ t: "chat", text });
  }

  // Дооживили союзника (держали F у его урны) — хосту: он поднимет того, кого надо
  revive(target) {
    if (target?.netId !== undefined) this.client.send({ t: "reviveReq", id: target.netId });
  }

  // Свой опыт (задание) — хосту: опыт в матче общий, считает он
  requestXp(n) {
    if (n > 0) this.client.send({ t: "xpReq", n });
  }

  // Подобрать (автоподбор или клавиша): копию убираем сразу, хост пришлёт give
  take(p) {
    if (p.netId === undefined) return;
    this.client.send({ t: "take", id: p.netId });
    this.taken.set(p.netId, this.ticks + 120);
    this.items.delete(p.netId);
    this.g.pickups.remove(p);
  }

  applyPickups(rows) {
    const g = this.g;
    const seen = new Set();
    for (const [id, item, count, x, y, z, by] of rows) {
      if ((this.taken.get(id) || 0) > this.ticks) continue;
      seen.add(id);
      let it = this.items.get(id);
      if (!it) {
        // без физики: место — от хоста. Выбросили мы сами — автоподбор не берёт, пока не отойдём
        it = this.copyAdd(item, count, { x, y, z }, { stuck: true, ignore: by && by === this.myId ? g.player : null });
        if (!it) continue;
        it.netId = id;
        this.items.set(id, it);
      }
      it.count = count;
      it.position.x = x;
      it.position.y = y;
      it.position.z = z;
    }
    for (const [id, it] of this.items) {
      if (seen.has(id)) continue;
      g.pickups.remove(it);
      this.items.delete(id);
    }
  }

  close() {
    this.g.world.onChange = null;
    this.fx.close();
    this.undoPickups?.();
    this.client.close("вышли");
  }
}

