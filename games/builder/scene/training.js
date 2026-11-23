// ============================================================
//  Полигон (TRAINING, главное меню → TRAINING): небольшой плоский остров, манекены-скелеты (TRAINING.dummies) —
//  не дерутся, не умирают (здоровье сразу обратно), над каждым — урон за последние TRAINING.window с и урон в
//  секунду. Ни мобов, ни стража, ни гиганта, ни нашествий; читы консоли включены; мир не сохраняется; погиб
//  (упал в пустоту) — встаёшь посередине.
// ============================================================

import { TRAINING, WORLDGEN, LIGHTS } from "../config.js";

export class TrainingPart {
  // Новый полигон: круглый плоский остров (трава сверху, земля и камень ниже), фонари по краю, манекены
  buildTrainingWorld() {
    const T = TRAINING, v = this.world, C = WORLDGEN.colors;
    for (let x = -T.radius; x <= T.radius; x++) for (let z = -T.radius; z <= T.radius; z++) {
      const d = Math.hypot(x, z);
      if (d > T.radius) continue;
      const depth = 3 + Math.round(Math.max(0, T.radius - d) * 0.25); // снизу — чуть конусом
      for (let y = -depth; y < 0; y++) v.place(x, y, z, y < -2 ? C.stone : C.dirt);
      v.place(x, 0, z, C.grass);
    }
    // фонари по краю: столбик и лампа
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = Math.round(Math.sin(a) * (T.radius - 2)), z = Math.round(Math.cos(a) * (T.radius - 2));
      v.place(x, 1, z, [92, 64, 40]);
      v.place(x, 2, z, [92, 64, 40]);
      v.place(x, 3, z, LIGHTS.lamp.color);
    }
    this.engine.log(`полигон: остров радиусом ${T.radius}`);
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
      e.alive = true;
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

  // Погиб на полигоне — встаёшь посередине, здоровье полное
  trainingRespawn() {
    const p = this.player;
    p.position.x = 0.5;
    p.position.z = 0.5;
    p.position.y = this.world.surfaceY(0, 0) + 0.05;
    p.velocity.x = p.velocity.y = p.velocity.z = 0;
    p.stats.hp = p.stats.maxHp;
    p.alive = true;
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
