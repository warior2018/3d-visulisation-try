// ============================================================
//  Вода в «Стройке» (движок: engine/world/water.js — растекание, physics.js — плавание):
//    · дыхание героя: голова под водой — 7 пузырьков (каждый на BREATH.bubble с), кончились — тонет:
//      BREATH.damage макс. HP в секунду, по частям BREATH.hits раз в секунду; вынырнул — воздух быстро обратно;
//    · в воде медленнее (WATER_MOVE); мобы обходят воду, пока цель не в ней (движок: hostile.js);
//      живые (SWIMMERS: упыри, гоблины, тролль, звери) держатся на плаву, мёртвые — идут по дну;
//    · озёра при создании мира (LAKES): плоские, у ровного места; у края острова — может быть сток наружу.
// ============================================================

import { BREATH, WATER_MOVE, SWIMMERS, LAKES } from "../config.js";

export class WaterPart {
  // Каждый тик мира: вода растекается; существа в воде — медленнее, живые держатся на плаву
  tickWater(dt) {
    this.world.water.tick(dt);
    for (const e of this.entities.list) {
      if (!e.alive || e === this.player || e.remote || e.firefly) continue;
      e.speedBonuses.water = e.inWater ? WATER_MOVE : 0;
      // живые всплывают (голова под водой — гребут вверх), мёртвые тонут и идут по дну
      e.swimUp = !!(e.inWater && e.headInWater && SWIMMERS.includes(e.type));
    }
  }

  // Каждый тик героя: скорость в воде, дыхание и утопление
  updateBreath(dt) {
    const p = this.player, B = BREATH;
    p.speedBonuses.water = p.inWater ? WATER_MOVE : 0;
    const max = B.bubbles * B.bubble;
    this.air ??= max;
    if (!p.alive || this.god) return void (this.air = max);
    if (p.headInWater) this.air = Math.max(0, this.air - dt);
    else this.air = Math.min(max, this.air + dt * B.refill);
    if (this.air > 0 || !p.headInWater) return void (this.drownT = 0);
    // воздух кончился — урон частями
    this.drownT = (this.drownT || 0) + dt;
    const every = 1 / B.hits;
    while (this.drownT >= every) {
      this.drownT -= every;
      const n = Math.max(1, Math.round((p.stats.maxHp * B.damage) / B.hits));
      p.damage(n);
      this.engine.sound.play("hurt", { volume: 0.5 });
    }
  }

  // Поверх экрана: под водой — синеватая пелена; пузырьки воздуха внизу (пока не полный запас)
  drawWater(ui) {
    const p = this.player, B = BREATH;
    if (!p) return;
    if (p.headInWater) ui.rect(0, 0, ui.width, ui.height, [30, 80, 160], 70);
    const max = B.bubbles * B.bubble;
    if ((this.air ?? max) >= max) return;
    const s = 16, gap = 6, w = B.bubbles * s + (B.bubbles - 1) * gap;
    const x0 = Math.round(ui.width / 2 - w / 2), y = ui.height - 150;
    for (let i = 0; i < B.bubbles; i++) {
      const left = this.air - i * B.bubble; // сколько осталось у этого пузырька (с)
      const x = x0 + i * (s + gap);
      if (left >= B.bubble) { //                                   целый — голубой
        ui.rect(x, y, s, s, [20, 40, 70], 200);
        ui.rect(x + 2, y + 2, s - 4, s - 4, [140, 210, 255], 255);
        ui.rect(x + 4, y + 4, 4, 4, [235, 250, 255], 255);
      } else if (left > 0) { //                                    лопается — меньше и бледнее
        const k = left / B.bubble, ss = Math.max(4, Math.round(s * k));
        ui.rect(x + (s - ss) / 2, y + (s - ss) / 2, ss, ss, [120, 170, 210], Math.round(120 + 135 * k));
      } else ui.rect(x + 3, y + 3, s - 6, s - 6, [90, 90, 96], 160); // лопнул — серый
    }
  }

  // ---------- Озёра (новый мир) ----------
  // Ровное место (перепад ≤ 1) на главном острове, не у места появления, не на постройках и не у логова:
  // чаша с плоским дном к краям мельче (по кругу с неровным краем), заполнена источниками до уровня земли.
  // Дно и бока — сплошные (пусто снизу — досыпаем землёй: вода не висит над пропастью). У края острова —
  // иногда сток наружу (канавка): вода выливается и падает вниз
  generateLakes(rnd, W) {
    const L = LAKES, R = W.terrain.radius;
    const count = Math.max(0, Math.round(L.perRadius * R * (0.6 + rnd() * 0.8)));
    const maxR = Math.max(L.radius[0], Math.min(L.radius[1], Math.round(L.radius[0] + R * L.radiusGrow)));
    const maxD = Math.max(L.depth[0], Math.min(L.depth[1], Math.round(L.depth[0] + R * L.depthGrow)));
    const lakes = (this.lakes = []);
    for (let n = 0, tries = 0; n < count && tries < count * 60; tries++) {
      const r = L.radius[0] + Math.floor(rnd() * (maxR - L.radius[0] + 1));
      const a = rnd() * Math.PI * 2, dist = rnd() * (R * 0.85 - r);
      const cx = Math.round(Math.sin(a) * dist), cz = Math.round(Math.cos(a) * dist);
      if (Math.hypot(cx, cz) < W.keepClear + r + 3) continue; //               не у места появления
      if (lakes.some((o) => Math.hypot(o.x - cx, o.z - cz) < o.r + r + 4)) continue; // не вплотную к другому озеру
      if (this.arena && Math.hypot(this.arena.x - cx, this.arena.z - cz) < this.arena.r + r + 4) continue;
      if (this.terrain.lairs.some((l) => Math.hypot(l.x - cx, l.z - cz) < l.r + r + 4)) continue;
      // ровно ли: все столбики чаши (с запасом 1) — на острове, без построек, перепад ≤ 1
      let lo = Infinity, hi = -Infinity, ok = true;
      for (let x = cx - r - 1; x <= cx + r + 1 && ok; x++) for (let z = cz - r - 1; z <= cz + r + 1 && ok; z++) {
        if (Math.hypot(x - cx, z - cz) > r + 1) continue;
        if (this.groundRel(x, z) < 1 || this.onStructure(x, z) || this.nearLairTunnel(x, z, 2)) ok = false;
        const h = Math.floor(this.world.surfaceY(x, z));
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (!ok || hi - lo > L.maxSlope) continue;
      const depth = Math.max(1, Math.min(maxD, 1 + Math.floor(rnd() * maxD)));
      this.digLake({ x: cx, z: cz, r, depth, level: lo }, rnd);
      lakes.push({ x: cx, z: cz, r, depth, level: lo });
      n++;
    }
    if (lakes.length) this.engine.log(`озёра: ${lakes.map((o) => `r${o.r} г${o.depth} (${o.x}, ${o.z})`).join(", ")}`);
  }

  digLake({ x: cx, z: cz, r, depth, level }, rnd) {
    const v = this.world, dirt = (this.worldgen?.colors || {}).dirt || [120, 85, 55];
    const wob = Array.from({ length: 12 }, () => 0.8 + rnd() * 0.25); // неровный край
    const edge = (x, z) => r * wob[Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / (Math.PI * 2)) * 12) % 12];
    const cells = [];
    for (let x = cx - r - 1; x <= cx + r + 1; x++) for (let z = cz - r - 1; z <= cz + r + 1; z++) {
      const d = Math.hypot(x - cx, z - cz), e = edge(x, z);
      if (d > e) continue;
      const k = d / Math.max(1, e);
      const dd = Math.max(1, Math.round(depth * (1 - k * k * 0.75))); // к краю мельче, середина — плоская
      const bottom = level - dd; // самая нижняя клетка воды
      // что над водой — убрать (трава, кусты); воду — от дна до уровня земли (level − 1)
      for (let y = bottom; y <= level + 2; y++) v.remove(x, y, z);
      if (!v.isSolid(x, bottom - 1, z)) v.place(x, bottom - 1, z, dirt); // дно не висит над пустотой
      for (let y = bottom; y < level; y++) cells.push([x, y, z]);
    }
    // бока: у клетки воды сосед на её высоте пуст и это не вода — досыпать землю (вода не вытечет вбок)
    const inLake = new Set(cells.map((c) => c.join(",")));
    for (const [x, y, z] of cells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!inLake.has(`${nx},${y},${nz}`) && !v.isSolid(nx, y, nz)) v.place(nx, y, nz, dirt);
    }
    for (const [x, y, z] of cells) v.water.setSource(x, y, z);
    this.lakeOutlet({ x: cx, z: cz, r, level }, rnd);
  }

  // У края острова: канавка от озера до обрыва (не длиннее LAKES.outlet) — вода течёт по ней и падает вниз
  lakeOutlet({ x: cx, z: cz, r, level }, rnd) {
    const L = LAKES, v = this.world;
    if (rnd() > L.outletChance) return;
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      for (let s = r; s <= r + L.outlet; s++) {
        const x = Math.round(cx + dx * s), z = Math.round(cz + dz * s);
        if (this.groundRel(x, z) < 1 && !v.isSolid(x, level - 1, z) && !v.isSolid(x, level - 2, z)) {
          if (!best || s < best.s) best = { a, s };
          break;
        }
      }
    }
    if (!best) return;
    const dx = Math.sin(best.a), dz = Math.cos(best.a);
    for (let s = r - 1; s <= best.s; s++) {
      const x = Math.round(cx + dx * s), z = Math.round(cz + dz * s);
      for (let y = level - 1; y <= level + 2; y++) v.remove(x, y, z);
      if (!v.isSolid(x, level - 2, z) && s < best.s) v.place(x, level - 2, z, (this.worldgen?.colors || {}).dirt || [120, 85, 55]);
      v.water.mark(x, level - 1, z); // потечёт
    }
  }

  // Столбик (x, z) — в озере (туда не сажаем деревья)
  inLake(x, z) {
    return (this.lakes || []).some((o) => Math.hypot(x - o.x, z - o.z) <= o.r + 1.5);
  }
}
