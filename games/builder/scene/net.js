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
//   гость → хост: hello { name }, state { x, y, z, yaw, w }, place { x, y, z, c, s }, remove { x, y, z },
//                 hit { id, n }, take { id } (подобрать с земли), drop { item, count, data, x, y, z }
//   хост → гость: welcome { id, surfaces, chunks, spawn }, snap { e, b, p }, hurt { n, from }, give { item, count, data },
//                 xp { n } (опыт — общий: за любого убитого моба всем), bye { reason }
//   снимок e — строки [id, тип, x, y, z, yaw, hp, maxHp, флаги: 1 — жив, 2 — идёт, 4 — замахнулся]; b — блоки
//   [x, y, z, r, g, b, поверхность] (поставили) или [x, y, z] (сломали); p — предметы на земле [id, item, count, x, y, z]
//   (раз в 4 снимка); h — что в руках у героев [[id, held]]; inv — нашествие [идёт, осталось с, название];
//   fx — эффекты и звуки [[откуда (0 — хост, иначе номер гостя), вид, аргументы]] (гость шлёт свои: fx { list })
// ============================================================

import { encodeChunk, decodeChunk } from "../../../engine/index.js";
import { isWeapon, isArmor } from "../items.js";
import { PICKUP_AUTO_RADIUS } from "../config.js";

const SNAP_EVERY = 3; //   снимок раз в 3 тика (20 в секунду при 60 тиках)
const SNAP_TIME = SNAP_EVERY / 60;
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

// Номер сущности в сети (один на всю игру хоста)
let nextNetId = 1;
const netId = (e) => (e.netId ||= nextNetId++);

export class HostNet {
  constructor(scene, server) {
    this.g = scene;
    this.server = server;
    this.role = "host";
    this.inbox = []; //    сообщения приходят между кадрами — разбираем в тике
    this.guests = new Map(); // peer.id -> { peer, hero, name }
    this.blocks = []; //   изменения блоков с прошлого снимка
    this.ticks = 0;
    server.onMessage = (peer, msg) => this.inbox.push([peer, msg]);
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
      const walking = x === g.player ? !!g.move?.moving : !!x.netWalk;
      e.push([netId(x), x.type, r2(x.position.x), r2(x.position.y), r2(x.position.z), r2(x === g.player ? g.look.yaw : x.yaw), Math.round(x.stats.hp), Math.round(x.stats.maxHp), (x.alive ? 1 : 0) | (walking ? 2 : 0) | (x.netAttack ? 4 : 0)]);
      x.netAttack = false;
    }
    let p, h, inv;
    if (this.ticks % (SNAP_EVERY * 4) === 0) {
      p = g.pickups.list.map((x) => [netId(x), x.item, x.count, r2(x.position.x), r2(x.position.y), r2(x.position.z)]);
      h = [[netId(g.player), heldOf(g)], ...[...this.guests.values()].map((q) => [netId(q.hero), q.held || ""])];
      inv = [g.invasion.active ? 1 : 0, Math.ceil(g.invasion.timeLeft || 0), g.invasionKind?.name || "INVASION"];
    }
    const fx = this.fxOut.length ? this.fxOut.splice(0) : undefined;
    this.server.broadcast({ t: "snap", e, b: this.blocks.length ? this.blocks.splice(0) : undefined, p, h, inv, fx });
  }

  // Опыт за убитого — и гостям (общий, как в кооперативе)
  shareXp(n) {
    if (n > 0 && this.guests.size) this.server.broadcast({ t: "xp", n });
  }

  handle(peer, msg) {
    const g = this.g;
    const guest = this.guests.get(peer.id);
    switch (msg.t) {
      case "hello": {
        if (guest) return;
        const p = g.player.position;
        const spawn = { x: p.x + 1.5, y: p.y + 0.5, z: p.z + 1.5 };
        const hero = g.spawn("player", spawn);
        hero.remote = true; // двигает сеть: физика и мозги его не трогают
        hero.name = String(msg.name || "GUEST").slice(0, 16).toUpperCase();
        // по гостю попали (мобы на хосте) — урон уходит гостю; здесь он не умирает (здоровье — у гостя)
        hero.onDamage = (d, dealt) => {
          this.server.send(peer, { t: "hurt", n: dealt, from: d.source?.name || "" });
          hero.stats.hp = hero.stats.maxHp;
        };
        this.guests.set(peer.id, { peer, hero, name: hero.name });
        const surfaces = [];
        const chunks = [];
        for (const c of g.world.chunks.values()) if (c.blocks.size) chunks.push([c.cx, c.cz, encodeChunk(c, surfaces).toString("base64")]);
        this.server.send(peer, { t: "welcome", id: netId(hero), you: peer.id, surfaces, chunks, spawn });
        g.engine.log(`сеть: подключился ${hero.name} (${peer.address}), отправлено кусков мира ${chunks.length}`);
        g.engine.toast(`${hero.name} JOINED`, 3000);
        return;
      }
      case "leave": {
        if (!guest) return;
        g.removeEntity(guest.hero);
        this.guests.delete(peer.id);
        g.engine.log(`сеть: ${guest.name} отключился (${msg.reason || ""})`);
        g.engine.toast(`${guest.name} LEFT`, 3000);
        return;
      }
    }
    if (!guest) return; // остальное — только после hello
    const h = guest.hero;
    switch (msg.t) {
      case "state":
        h.position.x = +msg.x || 0;
        h.position.y = +msg.y || 0;
        h.position.z = +msg.z || 0;
        h.yaw = +msg.yaw || 0;
        h.netWalk = !!msg.w;
        if (typeof msg.h === "string" && msg.h !== guest.held) {
          guest.held = msg.h; // что в руках у гостя — показать у его героя и разослать другим
          try { showHeld(g, h, msg.h); } catch {}
        }
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
      case "take": {
        // подобрать: кто первый попросил — того и предмет
        const it = g.pickups.list.find((x) => x.netId === msg.id);
        if (!it) return;
        g.pickups.remove(it);
        this.server.send(peer, { t: "give", item: it.item, count: it.count, data: it.data || null });
        break;
      }
      case "drop":
        // не влезло гостю — обратно на землю
        if (typeof msg.item === "string" && msg.count > 0) g.pickups.add(msg.item, msg.count | 0, { x: +msg.x || 0, y: (+msg.y || 0) + 0.5, z: +msg.z || 0 }, msg.data ? { data: msg.data, ignore: h } : { ignore: h });
        break;
      case "hit": {
        const target = g.entities.list.find((e) => e.netId === msg.id);
        const n = Math.max(0, Math.min(100000, +msg.n || 0));
        if (target?.alive && !target.remote && target !== g.player) {
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
    client.onMessage = (msg) => this.inbox.push(msg);
    client.onClose = (reason) => this.inbox.push({ t: "closed", reason });
    // свои изменения блоков — хосту (чужие применяем тихо: world.quiet)
    scene.world.onChange = (x, y, z, b) => {
      if (b) this.client.send({ t: "place", x, y, z, c: b.color, s: b.surface || null });
      else this.client.send({ t: "remove", x, y, z });
    };
    this.fx = new FxRelay(scene);
  }

  start() {
    this.client.send({ t: "hello", name: this.name });
  }

  tick(dt) {
    const g = this.g;
    for (const msg of this.inbox.splice(0)) this.handle(msg);
    if (!this.ready) return;
    // копии едут от прошлого снимка к новому (снимок раз в SNAP_TIME)
    for (const e of this.copies.values()) {
      const n = e.net;
      n.t = Math.min(1, n.t + dt / SNAP_TIME);
      e.position.x = n.fx + (n.tx - n.fx) * n.t;
      e.position.y = n.fy + (n.ty - n.fy) * n.t;
      e.position.z = n.fz + (n.tz - n.fz) * n.t;
      let d = (n.tyaw - n.fyaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      e.yaw = n.fyaw + d * n.t;
      e.view?.animator.setBase(n.walk ? "Walk" : "Idle", 1);
    }
    g.entities.update(dt); // часы: вспышка от удара, падение павших
    // автоподбор: попросить хоста (предмет — тому, кто первый)
    if (g.settings.general.autoLoot !== false && g.player.alive) g.pickups.autoCollect(g.player, PICKUP_AUTO_RADIUS, (p) => this.take(p));
    g.fog.reveal(g.player.position);
    if (++this.ticks % SNAP_EVERY === 0) {
      const p = g.player.position;
      const st = { t: "state", x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(g.look.yaw), w: g.move?.moving ? 1 : 0 };
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
        this.myId = msg.id;
        this.you = msg.you; // наш номер у хоста: свои эффекты из снимков пропускаем
        const s = msg.spawn || { x: 0, y: 0, z: 0 };
        g.player.position.x = s.x;
        g.player.position.y = s.y;
        g.player.position.z = s.z;
        g.player.velocity.x = g.player.velocity.y = g.player.velocity.z = 0;
        this.ready = true;
        g.engine.log(`сеть: вошли в мир хоста — блоков ${w.blocks.size}`);
        g.engine.toast("CONNECTED", 2500);
        return;
      }
      case "snap":
        if (!this.ready) return;
        this.applyBlocks(msg.b);
        this.applyEntities(msg.e || []);
        if (msg.p) this.applyPickups(msg.p);
        if (msg.h) for (const [id, held] of msg.h) {
          const e = this.copies.get(id);
          if (e && e.netHeld !== held) {
            e.netHeld = held;
            try { showHeld(g, e, held); } catch {}
          }
        }
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
        if (isWeapon(fake.item) || isArmor(fake.item)) left = g.giveItem(fake.item, fake.count);
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
      case "xp":
        g.gainXp(Math.max(0, +msg.n || 0));
        return;
      case "hurt":
        if (g.player.alive) {
          g.player.damage(Math.max(0, +msg.n || 0));
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
        e.net = { fx: x, fy: y, fz: z, fyaw: yaw, tx: x, ty: y, tz: z, tyaw: yaw, t: 1, walk: false };
        // попали по копии (наш удар, выстрел, горение) — сколько сняли, сообщаем хосту: урон считает он
        const shown = e.onDamage;
        e.onDamage = (d, dealt) => {
          shown?.(d, dealt);
          if (d.source === g.player || !d.source) this.client.send({ t: "hit", id, n: dealt });
        };
        this.copies.set(id, e);
      }
      const n = e.net;
      n.fx = e.position.x;
      n.fy = e.position.y;
      n.fz = e.position.z;
      n.fyaw = e.yaw;
      n.tx = x;
      n.ty = y;
      n.tz = z;
      n.tyaw = yaw;
      n.t = 0;
      n.walk = !!(flags & 2);
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
    for (const [id, item, count, x, y, z] of rows) {
      if ((this.taken.get(id) || 0) > this.ticks) continue;
      seen.add(id);
      let it = this.items.get(id);
      if (!it) {
        it = g.pickups.add(item, count, { x, y, z }, { stuck: true }); // без физики: место — от хоста
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
    this.client.close("вышли");
  }
}

