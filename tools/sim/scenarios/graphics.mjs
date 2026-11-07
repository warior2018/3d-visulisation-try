// Вкладка ГРАФИКА: дальность прорисовки (3 ступени — дымка вместе с ней), освещение, небо, облака, тени
// (настоящие / простые / выкл); мобы появляются по VIEW_DISTANCE — от настройки графики не зависит
export default async function (t, g) {
  const { engine, C, E, scene } = g;
  engine.viewDistances = C.DRAW_DISTANCES;
  const gr = engine.settings.data.graphics;
  gr.drawDistance = 1; engine.applySettings("drawDistance");
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
  t.check("тени по умолчанию — настоящие", gr.shadows === "real" && engine.renderer.shadowMode === "real");
  st.onButton("row:shadows:1");
  t.check("тени: настоящие → выкл", gr.shadows === "off" && engine.renderer.shadowMode === "off");
  st.onButton("row:shadows:1");
  t.check("выкл → простые", gr.shadows === "simple" && engine.renderer.shadowMode === "simple");
  st.onButton("row:shadows:1");
  gr.drawDistance = 1; engine.applySettings("drawDistance");
  engine.pop();
}
