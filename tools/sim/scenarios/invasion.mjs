// Нашествие минуту (игрового времени): мобы бегут, герой бессмертный и раз в секунду «убивает» ближайшего —
// идёт спавн. Ничего не падает, числа в порядке, профайлер размечен без ошибок
export default async function (t, g) {
  const { scene, engine } = g;
  engine.profiler.enabled = true;
  t.log(`мир: ${scene.world.blocks.size} блоков, существ ${scene.entities.list.length}`);
  scene.invasion.start(1e9);
  const spawned0 = scene.spawner.spawned;
  let maxMobs = 0, bad = 0;
  await g.frames(3600, 1 / 60, (i) => {
    if (i % 60 === 0) {
      const p = g.player.position;
      let best = null, bd = Infinity;
      for (const e of g.mobs()) if (!e.boss) { const d = Math.hypot(e.position.x - p.x, e.position.z - p.z); if (d < bd) { bd = d; best = e; } }
      best?.damage(1e6);
    }
    const m = g.mobs().length;
    if (m > maxMobs) maxMobs = m;
    if (i % 120 === 0) for (const e of scene.entities.list) if (!Number.isFinite(e.position.x + e.position.y + e.position.z)) bad++;
  });
  const p = engine.profiler;
  t.check("нашествие идёт", scene.invasion.active);
  t.check("мобы появляются (спавн работает)", scene.spawner.spawned > spawned0, `появилось ${scene.spawner.spawned - spawned0}`);
  t.check("мобов не больше предела нашествия (+боссы)", maxMobs <= g.C.INVASION.max + 4, `максимум ${maxMobs}`);
  t.check("ни у кого не сломались координаты (NaN / Infinity)", bad === 0, `сломанных ${bad}`);
  t.check("профайлер: ошибок разметки нет", p.mismatches === 0, p.mismatches);
  t.check("профайлер: всё время кадра размечено (OTHER < 5 %)", p.stats.other.avg <= p.stats.frame.avg * 0.05 + 0.01, `${p.stats.other.avg.toFixed(3)} из ${p.stats.frame.avg.toFixed(3)} мс`);
  const ctx = scene.hitchContext();
  t.check("строка рывка от игры (мобы, нашествие)", /MOBS \d+/.test(ctx) && ctx.includes("INVASION"), ctx);
}
