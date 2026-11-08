// ============================================================
//  Сцена «мир», часть: Командная игра (матч из лобби, lobby.js).
//  Методы GameScene (this — сцена), подмешиваются в класс (mixParts).
//
//  Погиб в матче — не конец: на месте гибели урна (кувшин), над ней полупрозрачный силуэт героя (призрак),
//  камера — оттуда же (можно оглядываться). Союзник подходит и держит F (interact) MULTIPLAYER.revive.time
//  секунд — герой встаёт с частью здоровья. Урон по оживляющему сбивает. Погибли все — матч окончен.
//  Союзники видны сквозь блоки (силуэт, gpu-renderer: drawSilhouettes), призраки — полупрозрачные всегда.
//
//  Кто в команде: у хоста — свой герой и герои гостей (remote); у гостя — свой и копии героев (type "player").
//  Кто погиб: свой — this.downed; хост знает о гостях из их state (d), гости о всех — из снимка (флаг 8).
// ============================================================

import { Vec3 } from "../../../engine/index.js";
import { MULTIPLAYER } from "../config.js";

const GHOST_LIFT = 0.45; // призрак «выглядывает» из урны: поднят над ней на столько метров

export class CoopPart {
  // Союзники (без своего героя)
  teammates() {
    if (!this.net) return [];
    if (this.net.role === "host") return [...this.net.guests.values()].map((q) => q.hero).filter(Boolean);
    return [...this.net.copies.values()].filter((e) => e.type === "player");
  }

  // Тик командной игры (после сети): силуэты, урны, оживление, конец матча
  tickCoop(dt, input) {
    if (!this.match) return;
    const mates = this.teammates();
    // силуэты: союзник — сквозь стены, погибший — призраком над урной
    const own = this.dedicated ? [] : [this.player]; // сервер — без своего героя
    for (const e of [...own, ...mates]) {
      e.silhouette = e.downed ? "ghost" : e === this.player ? null : "ally";
      e.drawOffsetY = e.downed ? GHOST_LIFT : 0;
    }
    this.syncUrns([...own, ...mates]);
    if (!this.downed && !this.dedicated) this.tickRevive(dt, input, mates);
    // хост: погибли все — матч окончен (у всех); сервер — когда пали все гости
    const allDown = (this.dedicated || this.downed) && mates.every((e) => e.downed) && (mates.length > 0 || !this.dedicated);
    if (this.net?.role === "host" && allDown && !this.matchEnded) this.endMatch();
  }

  // ---------- Гибель и оживление ----------

  // Свой герой погиб в матче: урна, призрак, камера оттуда
  goDown() {
    const p = this.player;
    this.downed = true;
    p.downed = true;
    p.stats.hp = 0;
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    this.reviving = null;
    this.dismountSteed?.(null);
    this.engine.sound.play("death");
    this.engine.toast("YOU ARE DOWN - AN ALLY CAN REVIVE YOU (HOLD F AT THE URN)", 5000);
    this.engine.log("матч: погиб — урна, ждём, пока оживят");
    this.chat?.system?.(`${this.net?.myName || "YOU"} IS DOWN`);
  }

  // Оживили: встаём у урны с частью здоровья
  standUp() {
    if (!this.downed) return;
    const p = this.player;
    this.downed = false;
    p.downed = false;
    p.stats.hp = Math.max(1, Math.round(p.stats.maxHp * MULTIPLAYER.revive.hp));
    p.hurtTime = 99;
    this.groundY = undefined; // не падение
    this.engine.sound.play("levelup");
    this.engine.toast("REVIVED!", 2500);
    this.engine.log("матч: оживили");
  }

  reviveTime() {
    return MULTIPLAYER.revive.time;
  }

  // Держим F рядом с урной союзника — шкала; урон сбивает; дошла — оживляем
  tickRevive(dt, input, mates) {
    const p = this.player;
    const R = MULTIPLAYER.revive;
    let target = null, best = R.range;
    for (const e of mates) {
      if (!e.downed) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d <= best && Math.abs(e.position.y - p.position.y) < 2.5) { best = d; target = e; }
    }
    this.reviveTarget = target; // HUD: «HOLD F TO REVIVE»
    if (!target || !p.alive || !input.isDown("interact")) {
      this.reviving = null;
      return;
    }
    if (!this.reviving || this.reviving.target !== target) this.reviving = { target, t: 0, hp: p.stats.hp };
    const r = this.reviving;
    if (p.stats.hp < r.hp) { // по нам попали — сбилось
      this.reviving = null;
      this.engine.toast("REVIVE INTERRUPTED", 1500);
      this.engine.sound.play("hurt");
      return;
    }
    r.hp = p.stats.hp;
    r.t += dt;
    if (r.t < R.time) return;
    this.reviving = null;
    this.net?.revive(target);
    this.engine.log(`матч: оживил ${target.name || "союзника"}`);
  }

  // ---------- Урны ----------

  // Урна на месте гибели каждого погибшего героя (место — где погиб; ожил — урна пропадает)
  syncUrns(heroes) {
    this.urns ||= new Map(); // герой -> урна
    for (const e of heroes) {
      let u = this.urns.get(e);
      if (e.downed && !u) {
        u = { position: new Vec3(e.position.x, e.position.y, e.position.z), yaw: e.yaw || 0, alive: true, hurtTime: 99, deadTime: 0, scale: 1, roll: 0, tilt: 0 };
        try { this.game.models.attach(u, "urn"); } catch {}
        this.urns.set(e, u);
      } else if (!e.downed && u) this.dropUrn(e);
    }
    for (const e of [...this.urns.keys()]) if (!heroes.includes(e)) this.dropUrn(e); // ушёл из игры
  }

  dropUrn(e) {
    const u = this.urns?.get(e);
    if (!u) return;
    this.game.models.detach(u);
    this.urns.delete(e);
  }

  urnList() {
    return this.urns ? [...this.urns.values()] : [];
  }

  clearUrns() {
    for (const e of [...(this.urns?.keys() || [])]) this.dropUrn(e);
  }

  // ---------- Конец матча ----------

  // Погибли все: итоги у всех, потом — главное меню (мир матча не сохраняется)
  endMatch() {
    if (this.matchEnded) return;
    this.matchEnded = true;
    if (this.net?.role === "host") this.net.server.broadcast({ t: "over" });
    this.dead = true;
    while (this.engine.scene !== this && this.engine.scenes.includes(this)) this.engine.pop();
    this.engine.log("матч окончен: погибли все");
    this.showDeathSummary();
  }

  // ---------- Таблица игроков (TAB) ----------

  // Строки: { name, ping (мс или null), cls, down, me }
  scoreRows() {
    if (!this.net) return [];
    if (this.net.role === "host") {
      return [
        ...(this.dedicated ? [] : [{ name: this.net.myName, ping: 0, cls: this.playerClass, down: !!this.downed, me: true, host: true }]),
        ...[...this.net.guests.values()].map((q) => ({ name: q.name, ping: q.ping ?? null, cls: q.cls || null, down: !!q.hero?.downed })),
      ];
    }
    return (this.net.table || []).map(([name, ping, cls, down, host]) => ({ name, ping, cls, down: !!down, host: !!host, me: name === this.net.myName }));
  }
}
