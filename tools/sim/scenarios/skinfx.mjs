// Скины красят и эффекты: трассер, взрыв, разрез; снаряды — в скине своего оружия. Обычный удар катаной и
// мачете — разрез-серп (как у ИАЙ) по хитбоксу
export default async function (t, g) {
  const { scene } = g;
  const S = scene.settings;
  const was = { ...S.skins };
  const { skinFx } = await import(g.root + "games/builder/skins.js");
  S.skins.pistol = "neon";
  t.check("скин пистолета Неон — свой цвет эффектов", Array.isArray(skinFx(S, "pistol")));
  S.skins.pistol = "default";
  t.check("обычный скин — обычные цвета", skinFx(S, "pistol") === null);
  // трассер
  S.skins.pistol = "neon";
  scene.lastRay = null;
  scene.tracer({ x: 0, y: 100, z: 0 }, { x: 0, y: 100, z: 5 }, "pistol");
  const beam = scene.beams.list?.at(-1);
  t.check("трассер пистолета — цвета скина", !beam || JSON.stringify(beam.color) === JSON.stringify(skinFx(S, "pistol")), JSON.stringify(beam?.color));
  // разрез катаны и мачете
  const a = g.equip("katana");
  await g.frames(30);
  const c0 = scene.crescents.list.length;
  a.attack.cooldownLeft = 0;
  a.primary(scene);
  t.check("удар катаной — разрез-серп", scene.crescents.list.length > c0);
  const m = g.equip("machete");
  await g.frames(30);
  const c1 = scene.crescents.list.length;
  m.attack.cooldownLeft = 0;
  m.primary(scene);
  t.check("удар мачете — разрез-серп", scene.crescents.list.length > c1);
  Object.assign(S.skins, was);
}
