// ============================================================
//  Порталы (PORTALS в config.js): со временем у героя появляются порталы (не больше max сразу), каждый ведёт
//  в свою комнату — отдельный мир (engine: World), которого нет в главном: зал с деревом посредине, каменный пол,
//  дальше от дерева — земля, поднимается в две ступени (полублок, потом блок). Вход — шагнуть в портал; выход —
//  портал в комнате. Мобы через портал не ходят; маунт и питомцы ждут у входа.
//  Мир, где есть герои, живёт полностью; главный без героев — «медленно» (тик раз в slowEvery).
//  Портал живёт life с; за warn с до конца тех, кто в комнате, затягивает к выходу: стоят (камера — в конусе),
//  летят к порталу сквозь блоки (скорость pull: start, ×mult в секунду, до max), урона нет, частицы и тряска
//  сильнее у портала; у портала — затемнение и главный мир. Портал ждёт последнего; комната исчезает с ним.
//  Сетевая игра (не дуэль): решает хост — кто вошёл / вышел (по позициям героев), гостю — «ты теперь в мире …»;
//  комнату гость строит сам (она одинаковая), существа — снимки хоста своего мира.
//  Сохраняться в комнате нельзя (сохраняется главный мир).
// ============================================================

import { Vec3, buildTree, dismount, HALF } from "../../../engine/index.js";
import { PORTALS, LIGHTS } from "../config.js";

const PURPLE = [170, 90, 255], CORE = [235, 210, 255];
const rnd = ([a, b]) => a + Math.random() * (b - a);
const near = (h, at) => Math.hypot(h.position.x - at.x, h.position.z - at.z) < PORTALS.enterRadius && Math.abs(h.position.y - at.y) < 1.6;

export class PortalsPart {
  get mainWorld() {
    return this.worlds.get("main");
  }

  inMain() {
    return this.activeWorld === this.mainWorld;
  }

  worldOf(e) {
    return this.worlds.get(e.worldId ?? "main") || this.mainWorld;
  }

  // Сделать мир w активным на время fn (тик другого мира)
  withWorld(w, fn) {
    const was = this.activeWorld;
    this.activeWorld = w;
    try {
      return fn();
    } finally {
      this.activeWorld = was;
    }
  }

  // Все герои (свой и гостей у хоста)
  allHeroes() {
    const list = this.dedicated ? [] : [this.player];
    if (this.net?.role === "host") for (const q of this.net.guests.values()) if (q.hero) list.push(q.hero);
    return list;
  }

  // ---------- Тик ----------
  // Каждый тик (вместо tickWorld): мир своего героя — полностью; другие миры, где есть герои (гости), — тоже
  // полностью; главный без героев — медленно; порталы
  tickWorlds(dt) {
    this.tickWorld(dt, { room: !this.inMain() });
    const busy = new Set(this.allHeroes().filter((h) => h.alive !== false).map((h) => this.worldOf(h)));
    for (const w of busy) if (w !== this.activeWorld) this.withWorld(w, () => this.tickWorld(dt, { room: w !== this.mainWorld, other: true }));
    if (!busy.has(this.mainWorld) && this.activeWorld !== this.mainWorld) {
      this.slowAcc = (this.slowAcc || 0) + dt;
      this.slowN = (this.slowN || 0) + 1;
      if (this.slowN >= PORTALS.slowEvery) {
        const sdt = this.slowAcc;
        this.slowN = 0;
        this.slowAcc = 0;
        this.withWorld(this.mainWorld, () => {
          this.slowTick = true;
          try {
            this.tickWorld(sdt, { slow: true });
          } finally {
            this.slowTick = false;
          }
        });
      }
    }
    this.updatePortals(dt);
  }

  // Порталы (хост / одиночная игра): появление, жизнь, вход / выход героев, затягивание при закрытии
  updatePortals(dt) {
    if (this.duel || this.role === "client") return;
    const P = PORTALS, p = this.player;
    this.portals ||= [];
    this.portalCd = Math.max(0, (this.portalCd || 0) - dt);
    const heroes = this.allHeroes();
    // появление: вокруг героя в главном мире
    const outside = heroes.filter((h) => h.alive && this.worldOf(h) === this.mainWorld);
    if (outside.length) {
      this.portalIn = (this.portalIn ?? rnd(P.every)) - dt;
      if (this.portalIn <= 0) {
        this.portalIn = rnd(P.every);
        if (this.portals.length < P.max) this.spawnPortal(outside[Math.floor(Math.random() * outside.length)]);
      }
    }
    for (const portal of [...this.portals]) {
      const inside = heroes.filter((h) => portal.room && this.worldOf(h) === portal.room);
      // за warn с до конца — затягивает всех внутри; портал ждёт, пока все не вышли
      if (portal.life > P.warn || !inside.length) portal.life -= dt;
      if (portal.life <= P.warn) for (const h of inside) {
        if (h === p) {
          if (!this.pull && p.alive) this.startPull(portal);
        } else if (!portal.pulled?.has(h)) {
          (portal.pulled ||= new Set()).add(h);
          this.net?.sendPull?.(h, portal.id);
        }
      }
      if (portal.life <= 0 && !inside.length) this.closePortal(portal);
    }
    // вход / выход: герой шагнул в портал
    for (const h of heroes) {
      if (!h.alive || h.downed || (h === p && (this.pull || this.portalCd > 0)) || (h.portalCd || 0) > Date.now()) continue;
      const w = this.worldOf(h);
      if (w === this.mainWorld) {
        const portal = this.portals.find((o) => near(h, o));
        if (portal) this.heroEnter(h, portal);
      } else {
        const portal = this.portals.find((o) => o.room === w);
        if (portal && near(h, portal.exit)) this.heroLeave(h, portal);
      }
    }
  }

  // Новый портал — на земле вокруг героя h (distance м), лицом к нему
  spawnPortal(h = this.player) {
    const P = PORTALS, p = h.position, v = this.mainWorld.voxels;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, d = rnd(P.distance);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!v.topBlock(Math.floor(x), Math.floor(z)) || this.onStructure?.(x, z)) continue;
      const y = v.surfaceY(x, z);
      if (Math.abs(y - p.y) > 8) continue;
      const portal = { id: (this.portalSeq = (this.portalSeq || 0) + 1), x, y, z, yaw: Math.atan2(p.x - x, p.z - z), life: rnd(P.life), room: null };
      this.portals.push(portal);
      if (this.inMain()) {
        this.engine.sound.play("zap", { at: portal });
        this.engine.toast(this.tr("A PORTAL HAS OPENED NEARBY"), 2500);
      }
      this.engine.log(`портал №${portal.id}: (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}), живёт ${portal.life.toFixed(0)} с`);
      return portal;
    }
    return null;
  }

  // Комната портала (отдельный мир; одинаковая у всех — гость строит сам): зал room.w × room.d × room.h, дерево
  // посредине, вокруг — каменный пол; с радиуса ground — земля по кругу, подъём в две ступени (полублок, блок)
  makeRoom(portal) {
    const R = PORTALS.room, w = this.makeWorld("room:" + portal.id), v = w.voxels;
    v.floor = false;
    v.setEmitters?.(Object.values(LIGHTS));
    const y0 = R.y, hx = Math.floor(R.w / 2), hz = Math.floor(R.d / 2);
    for (let x = -hx - 1; x <= hx + 1; x++) for (let z = -hz - 1; z <= hz + 1; z++) {
      const wall = x === -hx - 1 || x === hx + 1 || z === -hz - 1 || z === hz + 1;
      v.place(x, y0 - 1, z, R.stone);
      v.place(x, y0 + R.h, z, R.wall);
      if (wall) {
        for (let y = y0; y < y0 + R.h; y++) v.place(x, y, z, R.wall);
        continue;
      }
      const r = Math.hypot(x, z);
      if (r >= R.ground[1]) { // вторая ступень — целый блок земли с травой
        v.remove(x, y0 - 1, z);
        v.place(x, y0 - 1, z, R.dirt);
        v.place(x, y0, z, R.grass);
      } else if (r >= R.ground[0]) { // первая — полублок травы
        v.remove(x, y0 - 1, z);
        v.place(x, y0 - 1, z, R.dirt);
        v.place(x, y0, z, R.grass, HALF);
      }
    }
    buildTree(v, { x: 0, y: y0, z: 0, height: R.tree.height, crown: R.tree.crown, random: () => 0.5 }); // дерево посредине
    // свет: лампы в потолке сеткой (над деревом — нет) и по стенам
    for (let x = -hx + 2; x <= hx - 2; x += R.lampStep) for (let z = -hz + 2; z <= hz - 2; z += R.lampStep) {
      if (Math.hypot(x, z) < R.tree.crown + 1) continue;
      v.remove(x, y0 + R.h, z);
      v.place(x, y0 + R.h, z, LIGHTS.lamp.color);
    }
    for (const [x, z] of [[-hx - 1, 0], [hx + 1, 0], [0, -hz - 1], [0, hz + 1]]) {
      v.remove(x, y0 + 3, z);
      v.place(x, y0 + 3, z, LIGHTS.lamp.color);
    }
    portal.room = w;
    portal.exit = { x: 0.5, y: y0 + 1, z: -hz + 1.5, yaw: 0 }; //         выход — у дальней стены, на земле
    portal.spawn = { x: 0.5, y: y0 + 1, z: hz - 2, yaw: Math.PI }; //     вход — у ближней, лицом к дереву и выходу
    return w;
  }

  // Перенести существо e в мир w в точку at
  moveEntity(e, w, at) {
    const from = this.worldOf(e);
    from.entities.remove(e);
    for (const m of from.entities.list) if (m.aggro === e) m.aggro = null; // мобы потеряли цель
    w.entities.add(e);
    e.worldId = w.id;
    e.position = new Vec3(at.x, at.y, at.z);
    e.velocity.x = e.velocity.y = e.velocity.z = 0;
    if (e.renderPosition) e.renderPosition = new Vec3(at.x, at.y, at.z);
    e.nav?.reset?.();
  }

  // Свой герой — в мир w (этот мир становится видимым)
  moveHero(w, at, yaw) {
    const p = this.player;
    // маунт и питомцы ждут перед порталом (в главном мире)
    if (this.worldOf(p) === this.mainWorld && w !== this.mainWorld) this.leaveCompanions();
    this.moveEntity(p, w, at);
    this.activeWorld = w;
    this.look.yaw = yaw;
    this.camFootY = undefined;
    this.portalCd = PORTALS.cooldown;
    this.engine.renderer?.setLights?.([]);
  }

  // Маунт (слезаем — он остаётся) и питомцы героя — стоят там, где герой вошёл в портал
  leaveCompanions() {
    const p = this.player;
    const steed = p.mount;
    if (steed) {
      dismount(p, this.physics);
      this.rideController = null;
      steed.waiting = true; // ждёт у портала (позвать снова — mount.js уберёт его)
      this.waitingSteed = steed;
      steed.velocity.x = steed.velocity.z = 0;
    }
    for (const e of this.mainWorld.entities.list) if (e !== p && (e.owner === p || e.followOf === p)) e.velocity.x = e.velocity.z = 0;
  }

  // Герой h шагнул в портал / в выход (решает хост или одиночная игра)
  heroEnter(h, portal) {
    const w = portal.room || this.makeRoom(portal);
    if (h === this.player) {
      this.portalCd = PORTALS.cooldown + PORTALS.fade * 2;
      this.fadeTo(() => {
        this.moveHero(w, portal.spawn, portal.spawn.yaw);
        this.engine.sound.play("zap");
      });
    } else {
      this.moveEntity(h, w, portal.spawn);
      this.net?.sendWorld?.(h, portal.id, portal.spawn, portal.spawn.yaw);
    }
    this.engine.log(`${h.name || "герой"} вошёл в портал №${portal.id}`);
  }

  heroLeave(h, portal) {
    const out = { x: portal.x + Math.sin(portal.yaw) * 2, y: portal.y, z: portal.z + Math.cos(portal.yaw) * 2 };
    if (h === this.player) {
      this.portalCd = PORTALS.cooldown + PORTALS.fade * 2;
      this.fadeTo(() => {
        this.pull = null;
        this.player.invulnerable = false;
        this.moveHero(this.mainWorld, out, portal.yaw);
        this.engine.sound.play("zap");
      });
    } else {
      this.moveEntity(h, this.mainWorld, out);
      h.invulnerable = false;
      portal.pulled?.delete(h);
      this.net?.sendWorld?.(h, 0, out, portal.yaw);
    }
    this.engine.log(`${h.name || "герой"} вышел из портала №${portal.id}`);
  }

  // Портал исчез; его комната — тоже
  closePortal(portal) {
    this.portals = (this.portals || []).filter((o) => o !== portal);
    if (portal.room && this.activeWorld !== portal.room) this.worlds.delete(portal.room.id);
    portal.room = null;
    if (this.inMain()) {
      this.fx?.burst({ x: portal.x, y: portal.y + 1.2, z: portal.z }, { count: 40, speed: 3, color: PURPLE, size: 0.08, life: 0.8, drag: 2 });
      this.engine.sound.play("zap", { at: portal });
    }
    this.engine.log(`портал №${portal.id} закрылся`);
  }

  // ---------- Сеть: гость ----------
  // Список порталов от хоста: [[id, x, y, z, yaw], ...] — новые добавить, исчезнувшие — убрать (с комнатами)
  syncPortals(rows) {
    this.portals ||= [];
    const ids = new Set(rows.map((r) => r[0]));
    for (const o of [...this.portals]) if (!ids.has(o.id) && o.room !== this.activeWorld) this.closePortal(o);
    for (const [id, x, y, z, yaw] of rows) if (!this.portals.some((o) => o.id === id)) this.portals.push({ id, x, y, z, yaw, life: Infinity, room: null });
  }

  // Хост: «ты теперь в мире …» (id портала; 0 — главный мир)
  netWorld(msg, copies) {
    const portal = msg.id ? (this.portals || []).find((o) => o.id === msg.id) : null;
    if (msg.id && !portal) return;
    const w = portal ? portal.room || this.makeRoom(portal) : this.mainWorld;
    const at = { x: +msg.x || 0, y: +msg.y || 0, z: +msg.z || 0 };
    this.fadeTo(() => {
      for (const e of copies.values()) this.removeEntity(e); // чужие существа старого мира
      copies.clear();
      this.pull = null;
      this.player.invulnerable = false;
      this.moveHero(w, at, +msg.yaw || 0);
      this.engine.sound.play("zap");
    });
  }

  netPull(msg) {
    const portal = (this.portals || []).find((o) => o.id === msg.id);
    if (portal?.exit && !this.pull) this.startPull(portal);
  }

  // ---------- Затягивание при закрытии ----------
  startPull(portal) {
    const p = this.player;
    this.pull = { portal, speed: PORTALS.pull.start, t: 0, yaw0: this.look.yaw, pitch0: this.look.pitch };
    p.invulnerable = true;
    this.engine.toast(this.tr("THE PORTAL IS CLOSING!"), 2500);
    this.engine.sound.play("zap");
  }

  // Каждый тик вместо управления: летим к выходу сквозь блоки, частицы и тряска — сильнее ближе
  updatePull(dt) {
    const L = this.pull, P = PORTALS.pull, p = this.player, ex = L.portal.exit;
    L.t += dt;
    L.speed = Math.min(P.max, L.speed * Math.pow(P.mult, dt));
    const dx = ex.x - p.position.x, dy = ex.y - p.position.y, dz = ex.z - p.position.z, d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, L.speed * dt);
    if (d > 1e-3) p.position = new Vec3(p.position.x + (dx / d) * step, p.position.y + (dy / d) * step, p.position.z + (dz / d) * step);
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    const close = Math.max(0, 1 - d / 12); // 0 — далеко, 1 — у портала
    this.shake?.add(PORTALS.shake * (0.2 + close) * dt * 10);
    if (Math.random() < 0.3 + close) this.fx?.burst({ x: p.position.x, y: p.position.y + 1, z: p.position.z }, { count: 2 + Math.round(close * 6), speed: 1.5, color: PURPLE, size: 0.05, life: 0.5, drag: 2 });
    if (d < 0.6 && !L.done) {
      L.done = true;
      if (this.role === "client") this.net?.client?.send({ t: "leaveRoom" }); // выпускает хост (netWorld)
      else this.heroLeave(p, L.portal);
    }
  }

  // Камера при затягивании — только в конусе (PORTALS.cone: ° по горизонтали / вертикали, во всю ширину)
  clampPullLook() {
    const L = this.pull;
    if (!L) return;
    const h = ((PORTALS.cone[0] / 2) * Math.PI) / 180, v = ((PORTALS.cone[1] / 2) * Math.PI) / 180;
    let dyaw = this.look.yaw - L.yaw0;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.look.yaw = L.yaw0 + Math.max(-h, Math.min(h, dyaw));
    this.look.pitch = Math.max(L.pitch0 - v, Math.min(L.pitch0 + v, this.look.pitch));
  }

  // ---------- Затемнение ----------
  // Экран темнеет за fade с, then() — в темноте (перенос), потом светлеет
  fadeTo(then) {
    if (this.portalFade && !this.portalFade.done) {
      const prev = this.portalFade.then;
      this.portalFade.then = () => { prev?.(); then?.(); };
      return;
    }
    this.portalFade = { t: 0, then, done: false };
  }

  updateFade(dt) {
    const F = this.portalFade;
    if (!F) return;
    F.t += dt;
    if (!F.done && F.t >= PORTALS.fade) {
      F.done = true;
      F.then?.();
    }
    if (F.t >= PORTALS.fade * 2) this.portalFade = null;
  }

  fadeAlpha() {
    const F = this.portalFade;
    if (!F) return 0;
    const k = F.t < PORTALS.fade ? F.t / PORTALS.fade : 1 - (F.t - PORTALS.fade) / PORTALS.fade;
    return Math.max(0, Math.min(1, k));
  }

  // ---------- Вид ----------
  visiblePortals() {
    if (this.inMain()) return this.portals || [];
    return (this.portals || []).filter((o) => o.room === this.activeWorld && o.exit).map((o) => o.exit);
  }

  // Каждый кадр: порталы мира героя — светящийся вертикальный овал (лучи) и искры
  drawPortals() {
    const t = performance.now() / 1000;
    for (const o of this.visiblePortals()) {
      const cx = o.x, cy = o.y + 1.2, cz = o.z, yaw = o.yaw ?? 0, sx = Math.cos(yaw), sz = -Math.sin(yaw);
      const n = 18;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 0.6;
        const pt = { x: cx + sx * Math.cos(a) * 0.8, y: cy + Math.sin(a) * 1.15, z: cz + sz * Math.cos(a) * 0.8 };
        if (prev) this.beams.add({ from: prev, to: pt, color: PURPLE, core: CORE, life: 0.05, width: 6 });
        prev = pt;
      }
      if (Math.random() < 0.4) this.fx?.burst({ x: cx, y: cy, z: cz }, { count: 1, speed: 0.6, color: PURPLE, size: 0.05, life: 0.6, drag: 1 });
    }
  }

  // Свет порталов (вспышки движка: scene/effects.js → updateFlashes)
  portalLights() {
    return this.visiblePortals().map((o) => ({ x: o.x, y: o.y + 1.2, z: o.z, radius: PORTALS.light.radius, power: PORTALS.light.power, color: PURPLE.map((c) => c / 255) }));
  }
}
