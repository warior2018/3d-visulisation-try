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
  Object.assign(gr, { quality: "high", drawDistance: 1, motionBlur: "off", sky: true, clouds: true, shadows: "real" });
  engine.settings.data.video.renderScale = 100;
  engine.applySettings("all");
  engine.pop();
}
