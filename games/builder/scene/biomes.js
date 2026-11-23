// ============================================================
//  Биомы (BIOMES), только в новых мирах основного режима: зима, осень, пустыня, вулкан — пятнами по островам.
//  Пятно — эллипс с неровным краем на одном острове (главном, маленьком или небесном: у каждого свои пятна,
//  небесный не копирует то, что под ним). Сохраняется (worldgen.biomes) и уходит гостям (net.js → worldMeta).
//    · создание мира: makeBiomes (сразу после рельефа) → biomeTree вместо деревьев (кактусы, обгорелые стволы,
//      осенняя / зимняя листва) → biomeLakes (озёра: лёд / лава) → applyBiomes (перекраска верхних слоёв,
//      снег 0.25 / 0.5 сверху, кратеры). Глубже BIOMES.depth под землёй (пещеры) — не трогаем;
//    · в игре: лёд скользкий (p.onIce → контроллер), лава жжёт и замедляет (LAVA), кактус колется,
//      у лавы — бульканье, брызги и свет; мобы: в зиме — кабаны, в пустыне — больше мумий
//      (biomeMobType), на снегу обычные не появляются.
// ============================================================

import { BIOMES, LAVA, WORLDGEN, LIGHTS } from "../config.js";
import { Damage, LIGHT, buildTree, QUARTER, HALF, shapeOf } from "../../../engine/index.js";

// Шум: хеш клетки (0…1) и плавный шум (scale м) — переходы снега, оттенки осени
const hash = (x, z, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (x, z, scale, s = 0) => {
  const fx = x / scale, fz = z / scale, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const u = tx * tx * (3 - 2 * tx), w = tz * tz * (3 - 2 * tz);
  const a = hash(x0, z0, s), b = hash(x0 + 1, z0, s), c = hash(x0, z0 + 1, s), d = hash(x0 + 1, z0 + 1, s);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
};
const key = (c) => c[0] * 65536 + c[1] * 256 + c[2];
const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Новая листва — тоже пропускает свет (как обычная: chunk-mesh.js LIGHT.leaves)
for (const c of [BIOMES.winter.leaves, ...BIOMES.autumn.leaves]) if (!LIGHT.leaves.includes(key(c))) LIGHT.leaves.push(key(c));

// Насколько глубоко в пятне точка: 0 — край, 1 — середина; вне пятна — отрицательно
function patchDepth(p, x, z) {
  const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot);
  const u = (dx * c + dz * s) / p.a, v = (-dx * s + dz * c) / p.b;
  const r = Math.hypot(u, v), t = Math.atan2(v, u);
  const edge = 1 + BIOMES.wobble * (Math.sin(3 * t + p.s1) * 0.5 + Math.sin(5 * t + p.s2) * 0.3 + Math.sin(7 * t + p.s3) * 0.2);
  return 1 - r / edge;
}

export class BiomesPart {
  // ---------- Создание мира ----------

  // Пятна: всего ~coverage площади островов; остров — по площади; пятна почти не пересекаются
  makeBiomes(rnd, W) {
    const B = BIOMES, T = this.terrain;
    this.biomes = [];
    if (!T || this.training || this.duel) return;
    const min = B.minSize[W.size] ?? B.minSize[3];
    const discs = T.discs.map((d, i) => ({ d, i, area: Math.PI * d.r * d.r }));
    const total = discs.reduce((a, o) => a + o.area, 0);
    const w0 = (min * (1 + B.grow)) / 2, avg = (Math.PI / 4) * w0 * w0 * ((1 + B.stretch) / 2);
    const count = Math.max(1, Math.round((B.coverage * total) / avg));
    const order = [...B.kinds].sort(() => rnd() - 0.5);
    const out = this.biomes;
    for (let tries = 0; out.length < count && tries < count * 60; tries++) {
      let pick = rnd() * total, o = discs[0];
      for (const q of discs) if ((pick -= q.area) <= 0) { o = q; break; }
      const d = o.d, ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * Math.max(0, d.r - d.edge * 0.5);
      const w = min * (1 + rnd() * (B.grow - 1)), l = w * (1 + rnd() * (B.stretch - 1));
      const p = { kind: order[out.length % order.length], disc: o.i, x: Math.round(d.x + Math.sin(ang) * rr), z: Math.round(d.z + Math.cos(ang) * rr), a: l / 2, b: w / 2, rot: rnd() * Math.PI, s1: rnd() * 6.28, s2: rnd() * 6.28, s3: rnd() * 6.28 };
      // не налезать на другие пятна этого острова (сначала строго, к концу попыток — мягче)
      const apart = tries < count * 30 ? B.apart : B.apart * 0.7;
      if (out.some((q) => q.disc === p.disc && Math.hypot(q.x - p.x, q.z - p.z) < ((q.a + q.b) / 2 + (p.a + p.b) / 2) * apart)) continue;
      out.push(p);
    }
    this.engine.log(`биомы: ${out.map((p) => `${p.kind} ${Math.round(p.a * 2)}×${Math.round(p.b * 2)} (${p.x}, ${p.z})`).join(", ") || "нет"}`);
  }

  // Пятно в точке (x, z) на высоте y (null — на земле: небесные острова не в счёт): { p, k } или null
  biomePatch(x, z, y = null) {
    const list = this.biomes;
    if (!list?.length || !this.terrain) return null;
    let best = null;
    for (const p of list) {
      const R = Math.max(p.a, p.b) * (1 + BIOMES.wobble);
      if (Math.abs(x - p.x) > R || Math.abs(z - p.z) > R) continue;
      const d = this.terrain.discs[p.disc];
      if (!d || Math.hypot(x - d.x, z - d.z) > d.r + 1) continue; // пятно — только на своём острове
      if (d.sky ? y === null || y < d.lift - 8 : y !== null && y >= 38) continue; // небесный — над землёй
      const k = patchDepth(p, x, z);
      if (k >= 0 && (!best || k > best.k)) best = { p, k };
    }
    return best;
  }

  biomeAt(x, z, y = null) {
    return this.biomePatch(x, z, y)?.p.kind || null;
  }

  // Дерево с учётом биома: пустыня — кактус, вулкан — обгорелый ствол, осень / зима — своя листва
  biomeTree(world, opts, rnd) {
    const kind = this.biomeAt(opts.x, opts.z, opts.y);
    if (kind === "desert") return this.buildCactus(world, opts.x, opts.y, opts.z, rnd);
    if (kind === "volcano") {
      const h = Math.max(2, (opts.height || 4) - 1);
      for (let j = 0; j < h; j++) world.place(opts.x, opts.y + j, opts.z, BIOMES.volcano.trunk);
      if (rnd() < 0.6) world.place(opts.x + (rnd() < 0.5 ? 1 : -1), opts.y + h - 1, opts.z, BIOMES.volcano.trunk); // сучок
      return;
    }
    if (kind === "autumn") return buildTree(world, { ...opts, leaves: BIOMES.autumn.leaves[Math.floor(rnd() * BIOMES.autumn.leaves.length)], random: rnd });
    if (kind === "winter") return buildTree(world, { ...opts, leaves: BIOMES.winter.leaves, random: rnd });
    return buildTree(world, { ...opts, random: rnd });
  }

  // Кактус: столбик height блоков (поверхность "cactus" — колется), иногда «рука» вбок и вверх
  buildCactus(world, x, y, z, rnd) {
    const C = BIOMES.desert.cactus, h = C.height[0] + Math.floor(rnd() * (C.height[1] - C.height[0] + 1));
    for (let j = 0; j < h; j++) world.place(x, y + j, z, C.color, "cactus");
    if (h >= 3 && rnd() < C.arm) {
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
      world.place(x + dx, y + 1, z + dz, C.color, "cactus");
      world.place(x + dx, y + 2, z + dz, C.color, "cactus");
    }
  }

  // Озёра в биомах: зима — целиком лёд (скользкий), вулкан — лава
  biomeLakes() {
    const v = this.world;
    for (const o of this.lakes || []) {
      const kind = this.biomeAt(o.x, o.z, o.level);
      if (kind !== "winter" && kind !== "volcano") continue;
      const cells = [...v.water.cells.values()].filter((c) => Math.hypot(c.x - o.x, c.z - o.z) <= o.r + 2 && c.y < o.level + 1 && c.y >= o.level - o.depth - 2);
      for (const c of cells) {
        v.water.del(c.x, c.y, c.z);
        if (kind === "winter") v.place(c.x, c.y, c.z, BIOMES.winter.ice, "ice");
        else v.lava.setSource(c.x, c.y, c.z);
      }
      o.biome = kind;
    }
  }

  // Последний шаг создания мира: перекраска верхних слоёв в пятнах, снег сверху (зима), кратеры (вулкан)
  applyBiomes(rnd) {
    if (!this.biomes?.length) return;
    const T = this.terrain, C = this.worldgen?.colors || WORLDGEN.colors;
    const terrainColors = { grass: C.grass, dirt: C.dirt, stone: C.stone, snow: C.snow, rock: [112, 104, 100] };
    let changed = 0, snow = 0;
    for (const p of this.biomes) {
      const d = T.discs[p.disc], R = Math.ceil(Math.max(p.a, p.b) * (1 + BIOMES.wobble)) + 1;
      for (let x = p.x - R; x <= p.x + R; x++) for (let z = p.z - R; z <= p.z + R; z++) {
        if (Math.hypot(x + 0.5 - d.x, z + 0.5 - d.z) > d.r + 1) continue;
        const k = patchDepth(p, x + 0.5, z + 0.5);
        if (k < 0) continue;
        // а не перебило ли это место более глубокое соседнее пятно (на стыке — у кого глубже)
        if (this.biomePatch(x + 0.5, z + 0.5, d.sky ? d.lift : null)?.p !== p) continue;
        const r = this.recolorColumn(x, z, d, p.kind, k, terrainColors);
        changed += r.changed;
        snow += r.snow;
      }
    }
    const craters = this.biomeCraters();
    this.engine.log(`биомы: перекрашено ${changed} блоков, снега ${snow}, кратеров ${craters}`);
  }

  // Столбик (x, z) острова d: всё от верха до земли и depth слоёв под ней — цвета рельефа на цвета биома
  // (постройки — свои цвета, не трогаем, кроме пола-травы); пустота под землёй — пещера, дальше не идём
  recolorColumn(x, z, d, kind, k, tc) {
    const v = this.world, T = this.terrain;
    const ground = Math.round((d.lift || 0) + T.discHeight(d, x + 0.5, z + 0.5));
    const from = ground + 16, to = ground - BIOMES.depth;
    let top = null, changed = 0, snow = 0;
    for (let y = from; y >= to; y--) {
      const b = v.get(x, y, z);
      if (!b) {
        if (y < ground) break; // под землёй пусто — пещера: глубже не красим
        continue;
      }
      top ||= { y, b };
      const c = this.biomeColor(kind, b.color, x, y, z, tc, y >= ground - 1 && !v.has(x, y + 1, z));
      if (c && !same(c, b.color) && v.remove(x, y, z)) {
        v.place(x, y, z, c, b.surface || null);
        changed++;
      }
    }
    // зима: сверху — снег 0.25 / 0.5 (переходы плавные; у края пятна — только 0.25)
    if (kind === "winter" && top) {
      const W = BIOMES.winter, b = v.get(x, top.y, z);
      if (b && b.surface !== "ice" && !v.has(x, top.y + 1, z) && !v.water.has(x, top.y + 1, z) && !v.lava.has(x, top.y + 1, z) && !same(b.color, LIGHTS.lamp.color) && !same(b.color, LIGHTS.torch.color)) {
        if (shapeOf(b.surface)) {
          // неполный блок (склон) — сам становится снегом той же формы
          if (!same(b.color, W.snow) && v.remove(x, top.y, z)) v.place(x, top.y, z, W.snow, b.surface);
        } else {
          const half = k > W.edge && smooth(x, z, W.scale, 11) > W.half;
          if (v.place(x, top.y + 1, z, W.snow, half ? HALF : QUARTER)) snow++;
        }
      }
    }
    return { changed, snow };
  }

  // Цвет блока в биоме kind вместо color (null — не менять). surface — верхний открытый блок земли
  biomeColor(kind, color, x, y, z, tc, surface) {
    const is = (c) => same(color, c);
    const isTerrain = is(tc.grass) || is(tc.dirt) || is(tc.stone) || is(tc.snow) || is(tc.rock);
    if (!isTerrain) return null;
    if (kind === "winter") {
      const W = BIOMES.winter;
      if (is(tc.grass) || is(tc.snow)) return W.ground;
      if (is(tc.dirt)) return W.dirt;
      return null;
    }
    if (kind === "autumn") {
      const A = BIOMES.autumn;
      if (is(tc.grass)) return A.grass[Math.min(A.grass.length - 1, Math.floor(smooth(x, z, A.scale, 5) * A.grass.length))];
      if (is(tc.dirt)) return A.dirt;
      return null;
    }
    if (kind === "desert") {
      const D = BIOMES.desert;
      if (is(tc.grass) || is(tc.snow)) return surface || hash(x, z, y) < 0.7 ? D.sand : D.sandDark;
      if (is(tc.dirt)) return D.sandDark;
      return D.sandstone;
    }
    if (kind === "volcano") {
      const V = BIOMES.volcano, h = hash(x * 7 + y, z, 3);
      if (is(tc.snow)) return V.ash;
      if (h < V.embers) return V.ember;
      if (h < V.embers + V.speckle) return V.ash;
      return is(tc.dirt) ? V.dark : V.stone;
    }
    return null;
  }

  // Кратеры: гора, у которой вулкан накрывает вершину и всё в crater.peak м от неё — чаша с лавой и бортом
  biomeCraters() {
    const V = BIOMES.volcano.crater, T = this.terrain, v = this.world;
    let n = 0;
    for (const m of T.mountains || []) {
      const pts = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.sin((i / 8) * Math.PI * 2) * V.peak, Math.cos((i / 8) * Math.PI * 2) * V.peak])];
      if (!pts.every(([dx, dz]) => this.biomeAt(m.x + dx, m.z + dz) === "volcano")) continue;
      const cx = Math.round(m.x), cz = Math.round(m.z);
      const peak = Math.floor(v.surfaceY(cx, cz)) - 1; // верхний блок вершины
      const rc = Math.max(V.radius[0], Math.min(V.radius[1], Math.round(m.r * 0.3)));
      const level = peak - 1; // уровень лавы
      const rock = BIOMES.volcano.stone;
      for (let x = cx - rc - 2; x <= cx + rc + 2; x++) for (let z = cz - rc - 2; z <= cz + rc + 2; z++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d > rc + 1.6) continue;
        const top = Math.ceil(v.surfaceY(x, z)) - 1; // верхний блок (неполный — тоже)
        if (d > rc) {
          // борт: не ниже уровня лавы + 1 (иначе лава вытечет по склону)
          for (let y = top + 1; y <= level + 1; y++) v.place(x, y, z, hash(x, z, y) < 0.15 ? BIOMES.volcano.ash : rock);
          continue;
        }
        const bottom = Math.round(peak - V.depth * (1 - (d / rc) ** 2)); // чаша: в середине глубже
        for (let y = top; y > bottom; y--) v.remove(x, y, z);
        for (let y = top + 1; y <= bottom; y++) v.place(x, y, z, rock); // склон ниже дна — досыпать
        if (!v.isSolid(x, bottom, z)) v.place(x, bottom, z, rock);
        for (let y = bottom + 1; y <= level; y++) v.lava.setSource(x, y, z);
      }
      (this.craters ||= []).push({ x: cx, z: cz, r: rc, level });
      n++;
    }
    return n;
  }

  // ---------- В игре ----------

  // Каждый тик героя: лёд под ногами, лава (урон частями и медленнее), кактус рядом
  updateBiomes(dt) {
    const p = this.player, v = this.world;
    if (!p) return;
    p.onIce = p.onGround && this.cellSurface(p, -0.05) === "ice" ? BIOMES.winter.iceFriction : 0;
    if (!this.inMain?.() || !v.lava) return;
    v.lava.tick(dt);
    const lava = this.inLava(p);
    p.speedBonuses.lava = lava ? LAVA.slow : 0;
    this.headInLava = lava && v.lava.has(Math.floor(p.position.x), Math.floor(p.position.y + (p.eyeHeight || 1.5)), Math.floor(p.position.z));
    if (p.alive && !this.downed && !this.god && lava) {
      this.lavaT = (this.lavaT || 0) + dt;
      const every = 1 / LAVA.ticks;
      while (this.lavaT >= every) {
        this.lavaT -= every;
        p.receive(new Damage({ amount: LAVA.damage / LAVA.ticks, type: "pure", kind: "magic", tags: ["dot", "lava"] }));
        if (Math.random() < 0.4) this.engine.sound.play("hurt", { volume: 0.4 });
      }
    } else this.lavaT = 0;
    // кактус: стоишь вплотную — колется и отталкивает
    this.cactusT = (this.cactusT || 0) - dt;
    if (p.alive && !this.downed && this.cactusT <= 0) {
      const c = this.cactusNear(p);
      if (c) {
        const C = BIOMES.desert.cactus;
        this.cactusT = C.every;
        if (!this.god) p.receive(new Damage({ amount: C.damage, type: "physical", kind: "melee", tags: ["cactus"] }));
        const dx = p.position.x - (c.x + 0.5), dz = p.position.z - (c.z + 0.5), l = Math.hypot(dx, dz) || 1;
        p.velocity.x += (dx / l) * C.push;
        p.velocity.z += (dz / l) * C.push;
        this.engine.sound.play("hurt", { volume: 0.35 });
      }
    }
    // мобы (у хоста / в одиночной): лава — так же, кактус — тоже колется
    if (this.role !== "client") this.biomeMobs(dt);
    this.lavaFx(dt);
  }

  // Поверхность клетки под ногами / у тела (dy — смещение от ног)
  cellSurface(e, dy) {
    return this.world.surfaceAt(Math.floor(e.position.x), Math.floor(e.position.y + dy), Math.floor(e.position.z));
  }

  inLava(e) {
    const L = this.world.lava;
    if (!L?.size) return false;
    const x = Math.floor(e.position.x), z = Math.floor(e.position.z);
    return L.has(x, Math.floor(e.position.y + 0.1), z) || L.has(x, Math.floor(e.position.y + 0.9), z);
  }

  // Кактус вплотную к телу (на 0.15 м шире коробки): клетка или null
  cactusNear(e) {
    const r = (e.radius || 0.3) + 0.15, P = e.position;
    for (let y = Math.floor(P.y); y <= Math.floor(P.y + (e.height || 1.6)); y++)
      for (let x = Math.floor(P.x - r); x <= Math.floor(P.x + r); x++)
        for (let z = Math.floor(P.z - r); z <= Math.floor(P.z + r); z++) if (this.world.surfaceAt(x, y, z) === "cactus") return { x, z };
    return null;
  }

  biomeMobs(dt) {
    this.biomeMobT = (this.biomeMobT || 0) + dt;
    if (this.biomeMobT < 1 / LAVA.ticks) return;
    const step = this.biomeMobT;
    this.biomeMobT = 0;
    const cactus = this.world.surfaces > 0;
    for (const e of this.entities.list) {
      if (!e.alive || e === this.player || e.remote || e.firefly || e.tumble || e.boss) continue;
      const lava = this.inLava(e);
      e.speedBonuses.lava = lava ? LAVA.slow : 0;
      if (lava) e.receive(new Damage({ amount: LAVA.damage * step, type: "pure", kind: "magic", tags: ["dot", "lava"] }));
      if (!cactus) continue;
      e.cactusT = (e.cactusT || 0) - step;
      if (e.cactusT > 0 || !this.cactusNear(e)) continue;
      e.cactusT = BIOMES.desert.cactus.every;
      e.receive(new Damage({ amount: BIOMES.desert.cactus.damage, type: "physical", kind: "melee", tags: ["cactus"] }));
    }
  }

  // Ближайшее к (x, z) место без лавы (урна погибшего в матче — на берегу, а не в лаве)
  lavaSafeSpot(at) {
    const L = this.world.lava;
    const dry = (x, z) => {
      const y = Math.floor(this.world.surfaceY(x, z));
      return this.world.topBlock(Math.floor(x), Math.floor(z)) && !L.has(Math.floor(x), y, Math.floor(z)) && !L.has(Math.floor(x), y - 1, Math.floor(z));
    };
    if (!L?.size || dry(at.x, at.z)) return null;
    for (let r = 1; r <= 16; r++) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = at.x + Math.sin(a) * r, z = at.z + Math.cos(a) * r;
      if (dry(x, z)) return { x: Math.floor(x) + 0.5, y: this.world.surfaceY(x, z), z: Math.floor(z) + 0.5 };
    }
    return null;
  }

  // Верхние клетки лавы (поверхность) — пересчёт, когда лава поменялась
  lavaTops() {
    const L = this.world.lava;
    if (this.lavaTopsVer === L.version && this.lavaTopsOf === L) return this.lavaTopList;
    this.lavaTopsVer = L.version;
    this.lavaTopsOf = L;
    this.lavaTopList = [...L.cells.values()].filter((c) => !L.has(c.x, c.y + 1, c.z) && !this.world.has(c.x, c.y + 1, c.z));
    return this.lavaTopList;
  }

  // Лава у героя: пузыри лопаются (брызги вверх, «бульк»), свет от поверхности
  lavaFx(dt) {
    const L = this.world.lava, me = this.look?.position || this.player.position;
    if (!L.size) return void (this.lavaLightList = null);
    const tops = this.lavaTops();
    const near = [];
    for (const c of tops) {
      const d = Math.hypot(c.x + 0.5 - me.x, c.z + 0.5 - me.z);
      if (d < 26 && Math.abs(c.y - me.y) < 20) near.push({ c, d });
    }
    // пузыри: каждая клетка поверхности — в среднем раз в ~7 с (мало клеток рядом — всё равно хоть иногда)
    for (const { c, d } of near) {
      if (Math.random() >= dt * 0.14) continue;
      const at = { x: c.x + Math.random(), y: c.y + L.height(c) + 0.02, z: c.z + Math.random() };
      this.fx?.burst(at, { count: 3 + Math.floor(Math.random() * 4), speed: 2.6, up: 3, color: [255, 120 + Math.floor(Math.random() * 60), 30], size: 0.07, life: 0.7, gravity: 9, drag: 0.5 });
      this.flash?.(at, { radius: 3, power: 0.5, life: 0.45, color: [255, 120, 40], local: true });
      if (d < 14 && Math.random() < 0.35) this.engine.sound.play("lavaBlob", { at, volume: 0.35, local: true });
    }
    // свет: до 3 ближайших мест, не ближе 5 м друг к другу (пересчёт раз в 0.3 с)
    this.lavaLightT = (this.lavaLightT || 0) - dt;
    if (this.lavaLightT > 0) return;
    this.lavaLightT = 0.3;
    near.sort((a, b) => a.d - b.d);
    const out = [];
    for (const { c } of near) {
      if (out.length >= 3) break;
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 5)) continue;
      out.push({ x: c.x + 0.5, y: c.y + 1.2, z: c.z + 0.5, radius: 7, power: 0.9, color: [1, 0.45, 0.12] });
    }
    this.lavaLightList = out;
  }

  lavaLights() {
    return this.inMain?.() ? this.lavaLightList || [] : [];
  }

  // Под лавой — оранжевая пелена
  drawLava(ui) {
    if (this.headInLava) ui.rect(0, 0, ui.width, ui.height, [230, 90, 20], 190);
  }

  // ---------- Мобы ----------

  // Кого спавнить в (x, z) вместо обычного type: null — никого. Зима — кабан (не больше max), на снегу — никого;
  // пустыня — часто мумия
  biomeMobType(type, x, z) {
    const y = this.world.surfaceY(x, z), kind = this.biomeAt(x, z, y);
    if (kind === "winter") {
      const wild = this.entities.list.filter((e) => e.type === "boar" && e.alive).length;
      return wild < BIOMES.winterBoars ? "boar" : null;
    }
    const top = this.world.topBlock(Math.floor(x), Math.floor(z));
    const C = this.worldgen?.colors || WORLDGEN.colors;
    if (top && (same(top.color, C.snow) || same(top.color, BIOMES.winter.snow) || same(top.color, BIOMES.winter.ground))) return null;
    if (kind === "desert" && Math.random() < BIOMES.desertMummies) return "mummy";
    return type;
  }
}
