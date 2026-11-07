import path from "node:path";
// Вкладка ГРАФИКА: дальность прорисовки (3 ступени — дымка вместе с ней), освещение, небо, облака, тени
// (настоящие / простые / выкл); мобы появляются по VIEW_DISTANCE — от настройки графики не зависит
export default async function (t, g) {
  const { engine, C, E, scene } = g;
  engine.viewDistances = C.DRAW_DISTANCES;
  const gr = engine.settings.data.graphics;
  gr.drawDistance = 1; engine.applySettings("drawDistance");
  gr.shadows = "real"; engine.applySettings("shadows"); // настройки — копия настроек игрока: ставим сами
  const st = new E.SettingsScene({ tabs: [] });
  engine.push(st);
  st.onButton("tab:graphics");
  const tab = st.tabs.find((x) => x.id === "graphics");
  t.check("вкладка ГРАФИКА есть", !!tab && ["drawDistance", "lighting", "sky", "clouds", "shadows"].every((id) => tab.rows.some((r) => r.id === id)));
  t.check("по умолчанию — средняя дальность", engine.renderer.fadeDist === C.DRAW_DISTANCES[1]);
  st.onButton("row:drawDistance:1");
  t.check("дальше — дальняя", gr.drawDistance === 2 && engine.renderer.fadeDist === C.DRAW_DISTANCES[2]);
  st.onButton("row:drawDistance:1");
  t.check("по кругу — ближняя", gr.drawDistance === 0 && engine.renderer.fadeDist === C.DRAW_DISTANCES[0]);
  t.check("мобы появляются не по графике", scene.spawner.radius === C.VIEW_DISTANCE);
  t.check("тени — настоящие", gr.shadows === "real" && engine.renderer.shadowMode === "real");
  st.onButton("row:shadows:1");
  t.check("тени: настоящие → выкл", gr.shadows === "off" && engine.renderer.shadowMode === "off");
  st.onButton("row:shadows:1");
  t.check("выкл → простые", gr.shadows === "simple" && engine.renderer.shadowMode === "simple");
  st.onButton("row:shadows:1");
  // наборы: низкие / средние / высокие — всё сразу; поменял вручную — «свои»
  gr.quality = "medium";
  st.onButton("row:quality:1");
  t.check("набор ВЫСОКИЕ: дальняя, настоящие тени, размытие", gr.quality === "high" && gr.drawDistance === 2 && gr.shadows === "real" && gr.motionBlur === "low" && engine.renderer.motionBlur === 0.5);
  st.onButton("row:quality:1");
  t.check("НИЗКИЕ: близкая, без теней, без неба, масштаб 75 %", gr.quality === "low" && gr.drawDistance === 0 && gr.shadows === "off" && gr.sky === false && engine.settings.data.video.renderScale === 75 && engine.renderer.fadeDist === C.DRAW_DISTANCES[0]);
  st.onButton("row:clouds:1");
  t.check("поменял вручную — набор «свой»", gr.quality === "custom");
  st.onButton("row:quality:1");
  t.check("из «своих» — снова набор", gr.quality === "low");
  st.onButton("row:motionBlur:1");
  t.check("размытие в движении: выкл → слабое", gr.motionBlur === "low" && engine.renderer.motionBlur === 0.5);
  // скорость смаза: повернул камеру за кадр — смаз вдоль поворота, стоишь — нет
  const { motionVelocity } = await import(path.join(g.root, "engine", "graphics", "motion-blur.js"));
  const cam = { yaw: 0.05, pitch: 0, fov: Math.PI / 2 };
  const v = motionVelocity({ yaw: 0, pitch: 0 }, cam, 1 / 60, 1, 16 / 9);
  t.check("поворот — смаз по горизонтали", v[0] > 0.005 && Math.abs(v[1]) < 1e-9, v.map((x) => x.toFixed(4)).join(","));
  t.check("стоишь — смаза нет", motionVelocity({ yaw: 0.05, pitch: 0 }, cam, 1 / 60, 1)[0] === 0);
  t.check("резкий разворот — не больше 6 % экрана", Math.hypot(...motionVelocity({ yaw: 0, pitch: 0 }, { ...cam, yaw: 2 }, 1 / 60, 1)) <= 0.0600001);
  // качество света: лучи тени; блик солнца
  gr.quality = "medium"; st.onButton("row:quality:-1");
  t.check("НИЗКИЕ: 1 луч тени, без блика", gr.quality === "low" && gr.lightQuality === "low" && gr.glare === false && engine.renderer.glare === 0);
  st.onButton("row:quality:-1");
  t.check("ВЫСОКИЕ: лучей больше всего, блик", gr.lightQuality === "high" && engine.renderer.glare === 1);
  // рисовальщик в тестах — заглушка: его метод проверяем на простом объекте
  const { LIGHT } = await import(path.join(g.root, "engine", "graphics", "chunk-mesh.js"));
  const { GPURenderer } = await import(path.join(g.root, "engine", "graphics", "gpu-renderer.js"));
  const rr = {};
  GPURenderer.prototype.setLightQuality.call(rr, "high");
  t.check("высокое качество света: 25 проб настоящей тени, 9 лучей простой", rr.shadowPcf === 2 && LIGHT.rays === 3);
  GPURenderer.prototype.setLightQuality.call(rr, "medium");
  const { glareOf } = await import(path.join(g.root, "engine", "graphics", "glare.js"));
  const sunUp = [0, Math.sin(0.5), Math.cos(0.5)];
  const look = { yaw: 0, pitch: 0.5, fov: Math.PI / 2, position: { x: 0, y: 200, z: 0 } };
  const gl1 = glareOf(look, sunUp, 16 / 9, scene.world);
  t.check("смотришь на солнце — слепит, солнце в центре", gl1.strength > 0.9 && Math.abs(gl1.x) < 0.01 && Math.abs(gl1.y) < 0.01, gl1.strength.toFixed(2));
  t.check("спиной к солнцу — нет", glareOf({ ...look, yaw: Math.PI }, sunUp, 16 / 9).strength === 0);
  const wall = { raycast: () => ({ block: {} }) };
  t.check("солнце закрыто блоком — нет", glareOf(look, sunUp, 16 / 9, wall).strength === 0);
  Object.assign(gr, { quality: "high", drawDistance: 1, motionBlur: "off", sky: true, clouds: true, shadows: "real", lightQuality: "high", glare: true });
  engine.settings.data.video.renderScale = 100;
  engine.applySettings("all");
  engine.pop();
}
