// Свет: под крышей модель героя темнее (оттенок чёрным), ночью мир темнее (яркость), днём — как в настройках
export default async function (t, g) {
  const { scene, engine } = g;
  const p = g.player;
  const m = scene.game.models;
  t.check("модели знают свет мира", typeof m.lightAt === "function");
  const open = scene.lightHere(p.position, p);
  // крыша над головой
  const x = Math.floor(p.position.x), y = Math.floor(p.position.y), z = Math.floor(p.position.z);
  const roof = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { scene.world.place(x + dx, y + 4, z + dz, [90, 90, 90]); roof.push([x + dx, y + 4, z + dz]); }
  const under = scene.lightHere(p.position, p);
  t.check("под крышей темнее", under < open - 0.2, `${open.toFixed(2)} → ${under.toFixed(2)}`);
  p.hurtTime = 99;
  for (let i = 0; i < 40; i++) m.drawList([p]);
  t.check("модель героя под крышей — затемнена", p.view.tint[3] > 0.2, p.view.tint[3].toFixed(2));
  for (const [a, b, c] of roof) scene.world.remove(a, b, c);
  // день и ночь
  engine.settings.data.general.dayNight = true;
  scene.dayTime = 0.5; // полдень
  scene.updateDaylight(0);
  const noon = engine.renderer.brightness;
  scene.dayTime = 0; // полночь
  scene.updateDaylight(0);
  const night = engine.renderer.brightness;
  t.check("ночью темнее, чем днём", Number(night) < Number(noon), `${noon} → ${night}`);
  engine.settings.data.general.dayNight = false;
  scene.updateDaylight(0);
  t.check("выключили — яркость как в настройках", Math.abs(engine.renderer.brightness - engine.settings.data.video.brightness / 100) < 1e-6);
  engine.settings.data.general.dayNight = true;
  scene.dayTime = 0.3;
}
