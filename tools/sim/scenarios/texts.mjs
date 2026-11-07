// Надписи не вылезают за свои рамки: главные окна (настройки — все вкладки, меню, скины, HUD, пауза, магазин,
// таланты, инвентарь, баланс, страж, итоги, подтверждение) — по-русски и по-английски, на 1280×720 и 1024×640.
// Текст должен кончаться в той рамке, где начался (кнопка, ячейка, окно), и не выходить за экран
import path from "node:path";
export default async function (t, g) {
  const { engine, E, root, scene, C } = g;
  const { RU } = await import(path.join(root, "games", "builder", "lang", "ru.js"));
  const { fitText } = await import(path.join(root, "engine", "ui", "ui.js"));
  const { measureText } = await import(path.join(root, "engine", "ui", "font.js"));
  const M = await import(path.join(root, "games", "builder", "menu.js"));
  E.locale.add("ru", RU);
  engine.viewDistances = C.DRAW_DISTANCES;
  const ui = engine.ui;
  const problems = new Map();
  let where = "", frames = [];
  const origText = ui.text.bind(ui), origFrame = ui.frame.bind(ui);
  ui.frame = (x, y, w, h, ...rest) => { if (w > 30 && h > 16) frames.push({ x, y, w, h }); return origFrame(x, y, w, h, ...rest); };
  ui.text = (str, x, y, scale, color, align = "left", alpha = 255, maxWidth = Infinity) => {
    let s = E.translate(String(str)), k = scale;
    if (maxWidth < Infinity) ({ str: s, scale: k } = fitText(s, scale, maxWidth));
    const tw = measureText(s, k);
    const x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    if (x0 < -1 || x0 + tw > ui.width + 1) problems.set(`${where}: «${s.slice(0, 50)}» за экраном`, 1);
    const cy = y + 3 * k, mid = x0 + Math.min(tw, 6 * k) / 2;
    const box = frames.filter((f) => mid >= f.x && mid <= f.x + f.w && cy >= f.y && cy <= f.y + f.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (box && (x0 < box.x - 1 || x0 + tw > box.x + box.w + 1)) problems.set(`${where}: «${s.slice(0, 50)}» шире рамки (${Math.round(tw)} > ${Math.round(box.w)})`, 1);
    return origText(str, x, y, scale, color, align, alpha, maxWidth);
  };
  const draw = (name, sc) => { where = name; frames = []; ui.buttons = []; sc.drawUI(ui); };
  for (const lang of ["ru", "en"]) for (const [W, H] of [[1280, 720], [1024, 640]]) {
    engine.settings.data.interface.language = lang; engine.applySettings("language");
    ui.resize(W, H);
    const tag = `${lang} ${W}×${H}`;
    const st = new E.SettingsScene({ tabs: [] }); engine.push(st);
    for (const tab of st.tabs) { st.onButton("tab:" + tab.id); draw(`${tag} настройки/${tab.id}`, st); }
    engine.pop();
    const menu = new M.MainMenu({ game: scene.game, actions: {} }); engine.push(menu);
    for (let i = 0; i < 3; i++) menu.update(1 / 60);
    for (const tb of ["play", "skins"]) { menu.tab = tb; menu.update(1 / 60); draw(`${tag} меню/${tb}`, menu); }
    engine.pop();
    scene.playerClass = null; scene.chooseClass("ranged");
    draw(`${tag} HUD`, scene);
    for (const [n, fn] of [["пауза", () => scene.pause()], ["магазин", () => scene.openShop()], ["таланты", () => scene.openTalents()], ["инвентарь", () => scene.openInventory()], ["баланс", () => scene.openTune()]]) {
      fn(); const sc = engine.scene; if (sc !== scene) { draw(`${tag} ${n}`, sc); engine.pop(); }
    }
    const w = scene.spawn("warden", { x: 0, y: 0, z: 0 }); scene.loadQuests(null); scene.openWarden(w); draw(`${tag} страж`, engine.scene); engine.pop();
    scene.run = { time: 754, kills: 87, bosses: 1, dealt: 15432, taken: 900, by: { katana: 12000 }, killedBy: "SKELETON GUNNER" };
    scene.showDeathSummary(); draw(`${tag} итоги`, engine.scene); engine.pop();
    E.confirmAction(engine, { level: 2, title: "DELETE WORLD", text: "WORLD 1 WILL BE GONE FOREVER" }); draw(`${tag} подтверждение`, engine.scene); engine.pop();
  }
  engine.settings.data.interface.language = "en"; engine.applySettings("language");
  ui.text = origText; ui.frame = origFrame;
  t.check("надписи — в своих рамках и на экране", problems.size === 0, [...problems.keys()].slice(0, 6).join(" | "));
}
