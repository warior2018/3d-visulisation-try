// ============================================================
//  Полигон (TRAINING, главное меню → TRAINING): квадратный плоский остров, с севера мост на гору; манекены-скелеты (TRAINING.dummies) —
//  не дерутся, не умирают (здоровье сразу обратно), над каждым — урон за последние TRAINING.window с и урон в
//  секунду. Ни мобов, ни стража, ни гиганта, ни нашествий; читы консоли включены; мир не сохраняется; погиб —
//  встаёшь на месте появления, все существа исчезают, манекены — заново.
// ============================================================

import { TRAINING, WORLDGEN, LIGHTS } from "../config.js";
import { HALF, QUARTER, THREE_Q } from "../../../engine/index.js";

export class TrainingPart {
  // Новый полигон: квадратный плоский остров (трава, под ней земля и камень), фонари по краю; с севера (−z) —
  // мост на второй остров: склон с самого пологого начала плавно круче — в гору (TRAINING.mountain)
  buildTrainingWorld() {
    const T = TRAINING, v = this.world, C = WORLDGEN.colors, R = T.radius, WOOD = [92, 64, 40];
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
      for (let y = -4; y < 0; y++) v.place(x, y, z, y < -2 ? C.stone : C.dirt);
      v.place(x, 0, z, C.grass);
    }
    // фонари по краю (углы и середины сторон): столбик и лампа
    for (const [x, z] of [[-R + 1, -R + 1], [R - 1, -R + 1], [-R + 1, R - 1], [R - 1, R - 1], [-R + 1, 0], [R - 1, 0], [0, R - 1]]) {
      v.place(x, 1, z, WOOD);
      v.place(x, 2, z, WOOD);
      v.place(x, 3, z, LIGHTS.lamp.color);
    }
    // мост на север: настил на уровне травы, перила-столбики с фонарями
    const M = T.mountain, z0 = -R - 1, z1 = -R - M.bridge, hw = M.bridgeWidth;
    for (let z = z0; z >= z1; z--) {
      for (let x = -hw; x < hw; x++) v.place(x, 0, z, [120, 84, 52]);
      if ((z0 - z) % 4 === 0) for (const x of [-hw - 1, hw]) {
        v.place(x, 0, z, WOOD);
        v.place(x, 1, z, WOOD);
        if ((z0 - z) % 8 === 0) v.place(x, 2, z, LIGHTS.torch.color);
      }
    }
    // остров-гора: вдоль (от моста на север) высота растёт от 0 плавно круче — (t / L)², до вершины M.height;
    // за вершиной — спуск круче; поперёк — к краям ниже. Верх — с точностью до четверти блока (неполные блоки)
    const zs = z1 - 1, L = M.length, back = M.back, W = M.width;
    for (let t = 0; t <= L + back; t++) for (let x = -W; x <= W; x++) {
      const z = zs - t;
      const along = t <= L ? (t / L) ** 2 : Math.max(0, 1 - ((t - L) / back) ** 1.5);
      const across = Math.max(0, 1 - (Math.abs(x) / W) ** 2);
      const top = 1 + M.height * along * across; // где стоять
      const full = Math.floor(top), part = top - full;
      const color = top > M.snow ? C.snow : top > M.rock ? C.stone : C.grass;
      for (let y = -4; y < full - 1; y++) v.place(x, y, z, y < full - 4 ? C.stone : C.dirt);
      v.place(x, full - 1, z, color);
      if (part >= 0.125) v.place(x, full, z, color, part < 0.375 ? QUARTER : part < 0.625 ? HALF : part < 0.875 ? THREE_Q : null);
    }
    // остров на восток (+x) с двумя небоскрёбами рядом — щель между ними TRAINING.towers.gap
    const B = T.towers, bx0 = R + 1, bx1 = R + B.bridge;
    for (let x = bx0; x <= bx1; x++) {
      for (let z = -2; z < 2; z++) v.place(x, 0, z, [120, 84, 52]);
      if ((x - bx0) % 4 === 0) for (const z of [-3, 2]) { v.place(x, 0, z, WOOD); v.place(x, 1, z, WOOD); if ((x - bx0) % 8 === 0) v.place(x, 2, z, LIGHTS.torch.color); }
    }
    const icx = bx1 + 1 + B.half;
    for (let x = icx - B.half; x <= icx + B.half; x++) for (let z = -B.half; z <= B.half; z++) {
      for (let y = -4; y < 0; y++) v.place(x, y, z, y < -2 ? C.stone : C.dirt);
      v.place(x, 0, z, C.grass);
    }
    const CONC = [150, 152, 158], GLASS = [70, 110, 140];
    for (const sz of [-B.gap / 2 - B.side, B.gap / 2]) { // две башни по z, щель посередине
      const x0 = icx - Math.floor(B.side / 2), z0 = Math.round(sz);
      for (let y = 1; y <= B.height; y++) for (let i = 0; i < B.side; i++) for (let k = 0; k < B.side; k++) {
        const edge = i === 0 || k === 0 || i === B.side - 1 || k === B.side - 1;
        if (!edge && y < B.height) continue; // внутри пусто, крыша сплошная
        const win = edge && y % 4 !== 0 && (i + k) % 2 === 1 && y < B.height; // окна полосами
        v.place(x0 + i, y, z0 + k, win ? GLASS : CONC);
      }
      v.place(x0 + Math.floor(B.side / 2), B.height + 1, z0 + Math.floor(B.side / 2), LIGHTS.lamp.color);
    }
    this.engine.log(`полигон: остров ${R * 2 + 1}×${R * 2 + 1}, мост ${M.bridge}, гора ${M.height} блоков`);
  }

  // Манекены: на линии перед местом появления, на разных расстояниях
  spawnDummies() {
    this.dummies = [];
    for (const [x, z] of TRAINING.dummies) {
      const e = this.spawn("dummy", { x: x + 0.5, y: this.world.surfaceY(x, z), z: z + 0.5, yaw: Math.PI });
      if (!e) continue;
      e.dummy = { hits: [] }; // попадания: { t, n }
      const shown = e.onDamage;
      e.onDamage = (d, dealt) => {
        shown?.(d, dealt);
        if (dealt > 0) e.dummy.hits.push({ t: this.combatClock || 0, n: dealt });
      };
      this.dummies.push(e);
    }
  }

  // Каждый тик: манекены целы (здоровье — обратно), старые попадания — забыть
  updateTraining() {
    if (!this.training) return;
    const now = this.combatClock || 0;
    for (const e of this.dummies || []) {
      e.stats.hp = e.stats.maxHp;
      const h = e.dummy.hits;
      while (h.length && now - h[0].t > TRAINING.window) h.shift();
      const sum = h.reduce((a, x) => a + x.n, 0);
      // в секунду — за время от первого попадания в окне (не меньше секунды), а не за все 10 с
      const dps = h.length ? Math.round(sum / Math.max(1, now - h[0].t)) : 0;
      e.dummy.shown = sum;
      e.dummy.dps = dps;
    }
    if (this.dummies?.length) this.engine.redraw(); // цифры над манекенами — в мире: двигаются вместе с камерой
  }

  // Погиб на полигоне — встаёшь на месте появления, здоровье полное; все существа (мобы из консоли и т. п.)
  // исчезают, манекены — заново (счёт урона с нуля)
  trainingRespawn() {
    const p = this.player;
    for (const e of [...this.entities.list]) if (e !== p && !e.remote && e.type !== "steed") this.removeEntity(e);
    this.spawnDummies();
    p.statuses?.splice?.(0); // яды, замедления — сняты
    p.position.x = 0.5;
    p.position.z = 0.5;
    p.position.y = this.world.surfaceY(0, 0) + 0.05;
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    p.stats.hp = p.stats.maxHp;
    this.groundY = undefined;
    this.engine.toast(this.tr("RESPAWNED"), 1200);
  }

  // Над манекенами: урон за последние TRAINING.window с и в секунду
  drawDummyMeters(ui) {
    if (!this.training || !this.viewCamera) return;
    for (const e of this.dummies || []) {
      const p = { x: e.position.x, y: e.position.y + (e.height || 1.8) + 0.7, z: e.position.z };
      if (Math.hypot(p.x - this.player.position.x, p.z - this.player.position.z) > 60) continue;
      const sp = this.viewCamera.toScreen(p, ui.width, ui.height);
      if (!sp) continue;
      const sum = Math.round(e.dummy.shown || 0);
      ui.text(`${sum}`, sp.x, sp.y - 26, 3, [255, 230, 150], "center");
      ui.text(`DMG ${TRAINING.window}S  ·  ${e.dummy.dps || 0} DPS`, sp.x, sp.y, 2, [220, 220, 228], "center");
    }
  }
}
