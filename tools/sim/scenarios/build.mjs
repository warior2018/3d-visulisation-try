// Стройка: 1000 блоков поставить и сломать — верхний блок столбика (миникарта) совпадает с честным перебором,
// миникарта и карта рисуются без ошибок, мир помечается изменённым (рендер пересоберёт)
export default async function (t, g) {
  const { scene, engine } = g;
  const w = scene.world, p = scene.player;
  const cx = Math.floor(p.position.x), cz = Math.floor(p.position.z);
  const v0 = w.version;
  let seed = 11;
  const rnd = (n) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * n);
  const placed = [];
  for (let i = 0; i < 1000; i++) {
    const x = cx + rnd(16) - 8, z = cz + rnd(16) - 8, y = 40 + rnd(20);
    if (w.place(x, y, z, [rnd(255), 100, 100])) placed.push([x, y, z]);
    if (i % 3 === 0 && placed.length) { const [a, b, c] = placed.splice(rnd(placed.length), 1)[0]; w.remove(a, b, c); }
    if (i % 50 === 0) { engine.redraw(); await g.frames(1); } // перерисовка HUD с миникартой посреди стройки
  }
  t.check("мир помечен изменённым (версия выросла)", w.version > v0);
  let wrong = 0;
  for (let x = cx - 8; x < cx + 8; x++) for (let z = cz - 8; z < cz + 8; z++) {
    let best = -1;
    for (let y = w.maxY; y >= 0; y--) if (w.has(x, y, z)) { best = y; break; }
    if ((w.topBlock(x, z)?.y ?? -1) !== best) wrong++;
  }
  t.check("верхний блок каждого столбика — как честный перебор (256 столбиков)", wrong === 0, `расхождений ${wrong}`);
  const md = scene.mapData();
  t.check("данные карты собираются", !!md.world && Array.isArray(md.markers));
  for (const [x, y, z] of placed) w.remove(x, y, z);
  engine.redraw();
  await g.frames(5);
  t.check("всё убрали — игра идёт", !!scene.player.alive);
}
