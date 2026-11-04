// Окна поверх игры и меню открываются и рисуются без ошибок (кадр движка целиком: view() всех сцен, UI)
import path from "node:path";
export default async function (t, g) {
  const { engine, E, root, scene } = g;
  const M = await import(path.join(root, "games", "builder", "menu.js"));
  const rows = [{ id: "a", label: "A", value: () => "ON", change() {} }];
  const open = async (name, sc) => {
    let err = null;
    try {
      engine.push(sc);
      sc.drawUI?.(engine.ui);
      await g.frames(3);
      sc.onWheel?.({ dy: -1 });
      await g.frames(2);
    } catch (e) { err = e; }
    t.check(`${name}: открывается и рисуется без ошибок`, !err, err?.message);
    while (engine.scene !== scene && engine.scenes.includes(scene)) engine.pop();
  };
  await open("настройки", new E.SettingsScene({ tabs: [{ id: "general", label: "GENERAL", rows }] }));
  const menu = new M.MainMenu({ game: scene.game, actions: {} });
  await open("главное меню", menu);
  const m2 = new M.MainMenu({ game: scene.game, actions: {} });
  engine.push(m2);
  await open("настройки поверх меню", new E.SettingsScene({ tabs: [{ id: "general", label: "GENERAL", rows }] }));
  await open("подтверждение", new E.ConfirmScene({ level: 3 }));
  // разрешения окна: всё, что влезает в рабочую область экрана, и сама рабочая область (Мак 1512×982 → 1512×949)
  const sizes = E.windowSizes({ usable: { width: 1512, height: 949 } });
  t.check("разрешения: до размера экрана, и сам экран в списке", sizes.every(([w, h]) => w <= 1512 && h <= 949) && sizes.some(([w, h]) => w === 1512 && h === 949), sizes.map((x) => x.join("x")).join(" "));
  const big = E.windowSizes({ usable: { width: 3840, height: 2100 } });
  t.check("большой экран — и 2560×1440", big.some(([w]) => w === 2560));
  // фон страницы: картинка от игры (setBackgroundSource) — своя у каждой страницы, нет — градиент
  const img = E.loadPNG(path.join(root, "games/builder/assets/backgrounds/void.png"));
  const asked = [];
  E.widgets.setBackgroundSource((page) => { asked.push(page); return page === "play" ? img : null; });
  const ui = engine.ui;
  E.widgets.drawBackground(ui, "play");
  const a = ui.fb.pixels[ui.fb.width * 300 + 300];
  E.widgets.drawBackground(ui, "skins");
  const b = ui.fb.pixels[ui.fb.width * 300 + 300];
  t.check("фон: у страницы своя картинка, у другой — градиент", asked.includes("play") && asked.includes("skins") && a !== b);
  E.widgets.setBackgroundSource(null);
}
