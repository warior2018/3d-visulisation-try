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
}
