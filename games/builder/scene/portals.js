// ============================================================
//  Порталы (PORTALS в config.js): со временем у героя появляются порталы (не больше max сразу), каждый ведёт
//  в свою комнату — отдельный мир (engine: World), которого нет в главном. Вход — шагнуть в портал; выход —
//  портал в комнате (такой же). Пока герой в комнате, главный мир живёт «медленно» (тик раз в slowEvery).
//  Мобы через портал не ходят. Портал живёт life с; за warn с до конца того, кто в комнате, затягивает к
//  выходу: стоит (камера — только в конусе), летит к порталу сквозь блоки (скорость pull: start, ×mult в
//  секунду, до max), урона нет, частицы и тряска сильнее у портала; у портала — затемнение и главный мир.
//  Комната исчезает, когда портал закрылся. Сохраняться в комнате нельзя (сохраняется главный мир).
// ============================================================

import { Vec3 } from "../../../engine/index.js";
import { PORTALS, LIGHTS } from "../config.js";

const PURPLE = [170, 90, 255], CORE = [235, 210, 255];
const rnd = ([a, b]) => a + Math.random() * (b - a);

export class PortalsPart {
  get mainWorld() {
    return this.worlds.get("main");
  }

  inMain() {
    return this.activeWorld === this.mainWorld;
  }

  // Сделать мир w активным на время fn (тик главного мира, пока герой в комнате)
  withWorld(w, fn) {
    const was = this.activeWorld;
    this.activeWorld = w;
    try {
      return fn();
    } finally {
      this.activeWorld = was;
    }
  }

  // ---------- Тик ----------
  // Каждый тик (вместо tickWorld): мир героя — полностью; главный, если герой в комнате, — медленно; порталы
  tickWorlds(dt) {
    if (this.inMain()) this.tickWorld(dt);
    else {
      this.tickWorld(dt, { room: true });
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

  // Порталы: появление, жизнь, вход / выход, затягивание при закрытии
  updatePortals(dt) {
    if (this.duel || this.match || this.role === "client" || this.dedicated) return; // пока — только одиночная игра
    const P = PORTALS, p = this.player;
    this.portals ||= [];
    this.portalCd = Math.max(0, (this.portalCd || 0) - dt);
    // появление: пока герой в главном мире
    if (this.inMain() && p.alive) {
      this.portalIn = (this.portalIn ?? rnd(P.every)) - dt;
      if (this.portalIn <= 0) {
        this.portalIn = rnd(P.every);
        if (this.portals.length < P.max) this.spawnPortal();
      }
    }
    for (const portal of [...this.portals]) {
      const inside = this.activeWorld === portal.room;
      if (!this.pull || this.pull.portal !== portal) portal.life -= dt; // ждёт, пока последний не долетел
      if (inside && portal.life <= P.warn && !this.pull && p.alive) this.startPull(portal);
      if (portal.life <= 0 && !inside) this.closePortal(portal);
    }
    if (this.pull || this.portalCd > 0 || !p.alive) return;
    // вход / выход: шагнул в портал
    const near = (at) => Math.hypot(p.position.x - at.x, p.position.z - at.z) < P.enterRadius && Math.abs(p.position.y - at.y) < 1.6;
    if (this.inMain()) {
      const portal = this.portals.find((o) => near(o));
      if (portal) this.enterRoom(portal);
    } else {
      const portal = this.portals.find((o) => o.room === this.activeWorld);
      if (portal && near(portal.exit)) this.fadeTo(() => this.leaveRoom(portal));
    }
  }

  // Новый портал — на земле вокруг героя (distance м), лицом к нему
  spawnPortal() {
    const P = PORTALS, p = this.player.position;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, d = rnd(P.distance);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!this.world.topBlock(Math.floor(x), Math.floor(z)) || this.onStructure?.(x, z)) continue;
      const y = this.world.surfaceY(x, z);
      if (Math.abs(y - p.y) > 8) continue;
      const portal = { id: (this.portalSeq = (this.portalSeq || 0) + 1), x, y, z, yaw: Math.atan2(p.x - x, p.z - z), life: rnd(P.life), room: null };
      this.portals.push(portal);
      this.engine.sound.play("zap", { at: portal });
      this.engine.toast(this.tr("A PORTAL HAS OPENED NEARBY"), 2500);
      this.engine.log(`портал №${portal.id}: (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}), живёт ${portal.life.toFixed(0)} с`);
      return portal;
    }
    return null;
  }

  // Комната портала (отдельный мир): каменная коробка с лампами, выход — у дальней стены
  makeRoom(portal) {
    const R = PORTALS.room, w = this.makeWorld("room:" + portal.id), v = w.voxels;
    v.floor = false;
    v.setEmitters?.(Object.values(LIGHTS));
    const y0 = R.y, hx = Math.floor(R.w / 2), hz = Math.floor(R.d / 2);
    for (let x = -hx - 1; x <= hx + 1; x++) for (let z = -hz - 1; z <= hz + 1; z++) for (let y = y0 - 1; y <= y0 + R.h; y++) {
      const wall = x === -hx - 1 || x === hx + 1 || z === -hz - 1 || z === hz + 1;
      if (y === y0 - 1) v.place(x, y, z, (x + z) % 2 ? R.floor : R.floor2);
      else if (y === y0 + R.h) v.place(x, y, z, R.wall);
      else if (wall) v.place(x, y, z, R.wall);
    }
    for (const [x, z] of [[-hx + 1, -hz + 1], [hx - 1, -hz + 1], [-hx + 1, hz - 1], [hx - 1, hz - 1], [0, 0]]) {
      v.remove(x, y0 + R.h, z);
      v.place(x, y0 + R.h, z, LIGHTS.lamp.color);
    }
    portal.room = w;
    portal.exit = { x: 0.5, y: y0, z: -hz + 1.2, yaw: 0 }; // выход — у дальней стены (лицом к комнате)
    portal.spawn = { x: 0.5, y: y0, z: hz - 1.5, yaw: Math.PI }; // где герой появляется — у ближней, лицом к выходу
    return w;
  }

  // Перенести героя в мир w в точку at (yaw — куда смотреть)
  moveHero(w, at, yaw) {
    const p = this.player, from = this.activeWorld;
    if (this.player.mount) this.beforeMovementSkill?.(); // верхом — слезть (маунт остаётся)
    from.entities.remove(p);
    for (const e of from.entities.list) if (e.aggro === p) e.aggro = null; // мобы потеряли цель
    w.entities.add(p);
    p.worldId = w.id;
    this.activeWorld = w;
    p.position = new Vec3(at.x, at.y, at.z);
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    if (p.renderPosition) p.renderPosition = new Vec3(at.x, at.y, at.z);
    p.nav?.reset?.();
    this.look.yaw = yaw;
    this.camFootY = undefined;
    this.portalCd = PORTALS.cooldown;
    this.engine.renderer?.setLights?.([]);
  }

  enterRoom(portal) {
    const w = portal.room || this.makeRoom(portal);
    this.fadeTo(() => {
      this.moveHero(w, portal.spawn, portal.spawn.yaw);
      this.engine.sound.play("zap");
      this.engine.log(`вошли в портал №${portal.id}`);
    });
    this.portalCd = PORTALS.cooldown + PORTALS.fade * 2;
  }

  leaveRoom(portal) {
    const out = { x: portal.x + Math.sin(portal.yaw) * 2, y: portal.y, z: portal.z + Math.cos(portal.yaw) * 2 };
    this.moveHero(this.mainWorld, out, portal.yaw);
    this.engine.sound.play("zap");
    this.engine.log(`вышли из портала №${portal.id}`);
    if (portal.life <= PORTALS.warn) this.closePortal(portal); // закрывался — закрыть
  }

  // Портал исчез; его комната — тоже
  closePortal(portal) {
    this.portals = this.portals.filter((o) => o !== portal);
    if (portal.room) this.worlds.delete(portal.room.id);
    portal.room = null;
    if (this.inMain()) {
      this.fx?.burst({ x: portal.x, y: portal.y + 1.2, z: portal.z }, { count: 40, speed: 3, color: PURPLE, size: 0.08, life: 0.8, drag: 2 });
      this.engine.sound.play("zap", { at: portal });
    }
    this.engine.log(`портал №${portal.id} закрылся`);
  }

  // ---------- Затягивание при закрытии ----------
  startPull(portal) {
    const p = this.player;
    this.pull = { portal, speed: PORTALS.pull.start, t: 0, yaw0: this.look.yaw, pitch0: this.look.pitch };
    p.invulnerable = true;
    this.engine.toast(this.tr("THE PORTAL IS CLOSING!"), 2500);
    this.engine.sound.play("zap");
  }

  // Каждый тик вместо tickPlayer: летим к выходу сквозь блоки, частицы и тряска — сильнее ближе
  updatePull(dt) {
    const L = this.pull, P = PORTALS.pull, p = this.player, ex = L.portal.exit;
    L.t += dt;
    L.speed = Math.min(P.max, L.speed * Math.pow(P.mult, dt));
    const tx = ex.x, ty = ex.y, tz = ex.z, dx = tx - p.position.x, dy = ty - p.position.y, dz = tz - p.position.z, d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, L.speed * dt);
    if (d > 1e-3) p.position = new Vec3(p.position.x + (dx / d) * step, p.position.y + (dy / d) * step, p.position.z + (dz / d) * step);
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    const close = Math.max(0, 1 - d / 12); // 0 — далеко, 1 — у портала
    this.shake?.add(PORTALS.shake * (0.2 + close) * dt * 10);
    if (Math.random() < 0.3 + close) this.fx?.burst({ x: p.position.x, y: p.position.y + 1, z: p.position.z }, { count: 2 + Math.round(close * 6), speed: 1.5, color: PURPLE, size: 0.05, life: 0.5, drag: 2 });
    if (d < 0.6 && !L.done) {
      L.done = true;
      this.fadeTo(() => {
        this.pull = null;
        p.invulnerable = false;
        this.leaveRoom(L.portal);
      });
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
    if (this.portalFade) return;
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
  // Каждый кадр: порталы мира героя — светящийся вертикальный овал (лучи) и искры
  drawPortals() {
    const list = this.inMain() ? this.portals || [] : (this.portals || []).filter((o) => o.room === this.activeWorld).map((o) => ({ ...o.exit, portal: o }));
    const t = performance.now() / 1000;
    for (const o of list) {
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
    const list = this.inMain() ? this.portals || [] : (this.portals || []).filter((o) => o.room === this.activeWorld).map((o) => o.exit);
    return list.map((o) => ({ x: o.x, y: o.y + 1.2, z: o.z, radius: PORTALS.light.radius, power: PORTALS.light.power, color: PURPLE.map((c) => c / 255) }));
  }
}
