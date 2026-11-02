// Каждое оружие и его скилл: удары попадают, следы ударов есть, взрывы рвутся, динамит догорает,
// рывки двигают героя. Сначала нашествие подтягивает мобов к герою
export default async function (t, g) {
  const { scene } = g;
  scene.invasion.start(1e9);
  await g.frames(900); // мобы подходят
  scene.look.pitch = -0.2;
  let booms = 0, hits = 0;
  const explode = scene.explode.bind(scene);
  scene.explode = (...a) => { booms++; const r = explode(...a); hits += r.hits.length; return r; };
  const ready = (a) => { if (a.attack) { a.attack.cooldownLeft = 0; if (a.attack.magazine) a.attack.ammo = a.attack.magazine; } };
  const near = () => g.mobs().filter((e) => Math.hypot(e.position.x - g.player.position.x, e.position.z - g.player.position.z) < 8).length;
  t.log(`мобов рядом с героем: ${near()}`);

  // Ближний бой: след удара (сектор), у молота — вертикальный, в момент удара о землю
  for (const [name, id, arc] of [["мачете", "machete", 80], ["катана", "katana", 110], ["молот", "war-hammer", 100]]) {
    const a = g.equip(id);
    ready(a);
    scene.slashes.list.length = 0;
    a.primary(scene);
    for (let i = 0; i < 40 && !scene.slashes.list.length; i++) { a.attack.update(1 / 60); await g.frames(1); }
    const s = scene.slashes.list[0];
    t.check(`${name}: след удара есть, ширина ${arc}°`, s && Math.round((s.arc * 180) / Math.PI) === arc, s ? Math.round((s.arc * 180) / Math.PI) : "нет следа");
  }
  // ИАЙ (Q катаны): рывок двигает героя
  {
    const a = g.equip("katana");
    await g.frames(30);
    const p0 = { ...g.player.position };
    a.iai(scene);
    await g.frames(40);
    const moved = Math.hypot(g.player.position.x - p0.x, g.player.position.z - p0.z);
    t.check("ИАЙ: рывок сдвинул героя", moved > 2, `${moved.toFixed(1)} м`);
    // талант IAI RESET: убил рывком — перезарядка сбрасывается (тогда 0 — тоже правильно)
    const reset = scene.talents.rank("katana-reset") > 0;
    t.check("ИАЙ: перезарядка пошла (или сброшена убийством — талант IAI RESET)", a.iaiLeft > 0 || reset, `осталось ${a.iaiLeft.toFixed(1)} с, талант ${reset ? "есть" : "нет"}`);
  }
  // Стрелок: выстрелы и ОТСКОК дробовика
  for (const [name, id] of [["пистолет", "pistol"], ["автомат", "auto"], ["снайперка", "rifle"], ["дробовик", "shotgun"]]) {
    const a = g.equip(id);
    ready(a);
    const ammo0 = a.attack.ammo;
    a.primary(scene);
    await g.frames(2);
    t.check(`${name}: выстрел (патрон потрачен)`, a.attack.ammo === ammo0 - 1, `${ammo0} → ${a.attack.ammo}`);
  }
  {
    const a = g.equip("shotgun");
    await g.frames(10);
    a.blast(scene);
    await g.frames(3);
    t.check("ОТСКОК: рывок отдачи начался", !!g.player.dash);
    t.check("ОТСКОК: перезарядка пошла", a.blastLeft > 0);
  }
  // Подрывник: гранаты, гранатомёт + КАССЕТА, динамит с фитилём
  for (const [name, id, skill, minBooms] of [["гранаты", "grenades", null, 1], ["гранатомёт + кассета", "launcher", "cluster", 2 + 6], ["динамит", "dynamite", null, 1]]) {
    const a = g.equip(id);
    ready(a);
    booms = 0;
    a.primary(scene);
    if (skill) { await g.frames(5); a[skill](scene); }
    await g.frames(240);
    t.check(`${name}: взрывы (не меньше ${minBooms})`, booms >= minBooms, `взрывов ${booms}`);
  }
  t.check("динамит догорел — горящих фитилей не осталось", scene.fuses.length === 0);
  t.check("взрывы кого-то задели", hits > 0, `попаданий ${hits}`);
  // Обоймы выключены (CLIPS.enabled = false): ствол перезаряжается без обойм в сумке — магазин полный
  if (!g.C.CLIPS.enabled) {
    const a = g.equip("pistol");
    await g.frames(30);
    a.attack.ammo = 0;
    t.check("обоймы не нужны: запаса у ствола нет (бесконечный)", a.attack.reserve === null);
    scene.reloadWeapon(a);
    await g.frames(Math.ceil((a.attack.reloadTime || 2) * 60) + 30);
    t.check("перезарядка без обойм — магазин полный", a.attack.ammo === a.attack.magazine, `${a.attack.ammo}/${a.attack.magazine}`);
  }
}
