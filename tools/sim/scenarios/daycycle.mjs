// День и ночь: цикл 15 минут, день — половина (с переходами), ночь — другая; солнце ходит по кругу, луна —
// ровно напротив; на небе — кубики солнца (днём) и луны (ночью), за горизонтом не видно
export default async function (t, g) {
  const { scene, C } = g;
  t.check("цикл — 15 минут", C.DAY.length === 900);
  const noon = scene.sunDir(0.5), midnight = scene.sunDir(0), dawn = scene.sunDir(0.25);
  t.check("полдень — солнце высоко", noon[1] > 0.9, noon[1].toFixed(2));
  t.check("полночь — солнце внизу (луна вверху)", midnight[1] < -0.9);
  t.check("рассвет — у горизонта", Math.abs(dawn[1]) < 0.01);
  let day = 0;
  for (let i = 0; i < 1000; i++) if (scene.sunDir(i / 1000)[1] > 0) day++;
  t.check("день — половина цикла", Math.abs(day - 500) <= 2, day);
  t.check("ночью темнее, днём светло", scene.dayLight(0) < scene.dayLight(0.5) && scene.dayLight(0.5) === 1);
  const cam = scene.rig.camera;
  scene.settings.general.dayNight = true;
  scene.dayTime = 0.5; scene.updateSkyBodies(cam);
  const s1 = scene.fx.sprites;
  t.check("днём на небе — солнце (луна под горизонтом)", s1.length === 1 && s1[0].size === C.SKY_BODIES.sun.size && s1[0].y > cam.position.y);
  scene.dayTime = 0; scene.updateSkyBodies(cam);
  const s2 = scene.fx.sprites;
  t.check("ночью — луна", s2.length === 1 && s2[0].size === C.SKY_BODIES.moon.size && s2[0].y > cam.position.y);
  scene.dayTime = 0.255; scene.updateSkyBodies(cam);
  const [a, b] = scene.fx.sprites;
  t.check("утром оба у горизонта, луна напротив солнца", !!b && Math.abs((a.x - cam.position.x) + (b.x - cam.position.x)) < 1e-6);
  t.check("кубики — в частицах для видеокарты", scene.fx.count >= scene.fx.sprites.length);
  await g.frames(2);
}
