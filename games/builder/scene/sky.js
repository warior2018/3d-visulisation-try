// ============================================================
//  Небесные острова (SKY_ISLANDS): высоко над главным (рельеф — engine/world/terrain.js, discs с sky). Попасть —
//  только порталом-вратами: одни стоят в комнате большого дома или в замке на земле, другие — на острове. Врата
//  постоянные и в обе стороны: шагнул — затемнение и ты у других (this.gates: [{ a, b }], в сохранении мира).
//  Переносит каждый сам себя (у гостя — тоже сам): мир один и тот же, мобы врата не проходят.
// ============================================================

import { SKY_ISLANDS, PORTALS } from "../config.js";
import { buildTree } from "../../../engine/index.js";

const GATE = [90, 210, 255]; // врата — голубые (временные порталы — фиолетовые)

export class SkyPart {
  // Новый мир: деревья на небесных островах и врата к каждому. spots — постройки (у главного — s.main)
  generateSky(rnd, spots) {
    const T = this.terrain, v = this.world;
    const sky = (T?.discs || []).filter((d) => d.sky);
    this.gates = [];
    if (!sky.length) return;
    const hosts = spots.filter((s) => s.main && (s.kind === "big" || s.kind === "castle"));
    for (const d of sky) {
      // деревья на острове
      const want = SKY_ISLANDS.trees[0] + Math.floor(rnd() * (SKY_ISLANDS.trees[1] - SKY_ISLANDS.trees[0] + 1));
      for (let t = 0, n = 0; t < want * 20 && n < want; t++) {
        const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * Math.max(0, d.r - d.edge - 2.5);
        const x = Math.floor(d.x + Math.sin(a) * r), z = Math.floor(d.z + Math.cos(a) * r);
        const y = Math.ceil(v.surfaceY(x, z));
        if (y < d.lift) continue;
        buildTree(v, { x, y, z, height: 3 + Math.floor(rnd() * 3), crown: 2, random: rnd });
        n++;
      }
      // врата на острове — посередине (без дерева)
      const cx = Math.round(d.x), cz = Math.round(d.z);
      const top = this.skyTop(d, cx, cz);
      for (let j = 0; j < 3; j++) v.remove(cx, top + j, cz);
      const b = { x: cx + 0.5, y: top, z: cz + 0.5, yaw: 0 };
      // врата на земле: в комнате большого дома / в замке (в главном доме двора); нет таких — на ровной земле
      const host = hosts.splice(Math.floor(rnd() * hosts.length), 1)[0];
      const a = host ? this.gateInHouse(host) : this.gateOnGround(rnd);
      if (!a) continue;
      for (let j = 0; j < 3; j++) v.remove(Math.floor(a.x), a.y + j, Math.floor(a.z));
      this.gates.push({ a, b });
    }
    this.engine.log(`небесные острова: ${sky.length}, врата: ${this.gates.map((g) => `(${Math.round(g.a.x)}, ${g.a.y}, ${Math.round(g.a.z)}) ↔ (${Math.round(g.b.x)}, ${g.b.y}, ${Math.round(g.b.z)})`).join(", ")}`);
  }

  // Верх небесного острова в столбике (над землёй — ищем сверху вниз до его низа)
  skyTop(d, x, z) {
    const v = this.world;
    for (let y = d.lift + 40; y >= d.lift - 2; y--) if (v.has(x, y, z)) return y + 1;
    return d.lift + 1;
  }

  // Врата в доме: в углу комнаты (у восточной стены, у северной — подальше от лестницы и двери), лицом в комнату.
  // Замок — в главном доме двора (его место считается как в buildCastle)
  gateInHouse(s) {
    let x = s.x, z = s.z, w = s.w, d = s.d;
    if (s.kind === "castle") {
      const T = 5, kw = Math.max(7, s.w - 2 * T - 4), kd = Math.max(7, s.w - 2 * T - 6);
      x = s.x + Math.floor((s.w - kw) / 2);
      z = s.z + Math.floor((s.w - kd) / 2) - 1;
      w = kw;
      d = kd;
    }
    const gx = x + w - 2, gz = z + 2;
    return { x: gx + 0.5, y: s.y, z: gz + 0.5, yaw: Math.atan2(x + w / 2 - (gx + 0.5), z + d / 2 - (gz + 0.5)) };
  }

  gateOnGround(rnd) {
    for (let t = 0; t < 40; t++) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * this.terrain.radius * 0.4;
      const x = Math.floor(Math.sin(a) * r), z = Math.floor(Math.cos(a) * r);
      if (this.onStructure(x, z) || this.inLake?.(x, z) || this.groundRel(x, z) < 1) continue;
      return { x: x + 0.5, y: Math.ceil(this.world.surfaceY(x, z)), z: z + 0.5, yaw: rnd() * Math.PI * 2 };
    }
    return null;
  }

  // Концы врат для рисования (как порталы: scene/portals.js → visiblePortals) — только в главном мире
  gatePoints() {
    if (this.inMain && !this.inMain()) return [];
    return (this.gates || []).flatMap((g) => [{ ...g.a, color: GATE }, { ...g.b, color: GATE }]);
  }

  // Каждый тик (у каждого — свой герой): встал во врата — затемнение и перенос к другим (чуть вперёд)
  updateGates(dt) {
    this.gateCd = Math.max(0, (this.gateCd || 0) - dt);
    const p = this.player;
    if (!this.gates?.length || !p?.alive || this.gateCd > 0 || this.pull || (this.inMain && !this.inMain())) return;
    for (const g of this.gates) for (const [from, to] of [[g.a, g.b], [g.b, g.a]]) {
      if (Math.hypot(p.position.x - from.x, p.position.z - from.z) > PORTALS.enterRadius || Math.abs(p.position.y - from.y) > 1.6) continue;
      this.gateCd = SKY_ISLANDS.gateCooldown + PORTALS.fade * 2;
      this.fadeTo(() => {
        const out = { x: to.x + Math.sin(to.yaw) * 1.6, y: to.y + 0.05, z: to.z + Math.cos(to.yaw) * 1.6 };
        p.position.x = out.x;
        p.position.y = out.y;
        p.position.z = out.z;
        p.velocity.x = p.velocity.y = p.velocity.z = 0;
        if (p.renderPosition) {
          p.renderPosition.x = out.x;
          p.renderPosition.y = out.y;
          p.renderPosition.z = out.z;
        }
        this.look.yaw = to.yaw;
        this.groundY = undefined; // перенос — не падение
        this.fallGrace = 1;
        this.engine.sound.play("zap");
      });
      return;
    }
  }
}
