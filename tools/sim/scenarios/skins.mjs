// Скины: своя модель перекрашивается (вариант модели), чужая — нет; значок предмета — в скине; консоль skin;
// читы консоли — только в мире с галочкой
import path from "node:path";
export default async function (t, g) {
  const { scene, engine, root } = g;
  const SK = await import(path.join(root, "games", "builder", "skins.js"));
  const models = scene.game.models;
  const S = engine.settings.data;
  t.check("у каждой цели есть DEFAULT и хотя бы один свой скин", SK.SKIN_TARGETS.every((x) => x.skins[0].id === "default" && x.skins.length >= 2));
  t.check("все разделы не пусты", SK.SKIN_CATEGORIES.every((c) => SK.SKIN_TARGETS.some((x) => x.category === c.id)));
  t.check("модели целей есть в игре", SK.SKIN_TARGETS.flatMap((x) => x.models).every((m) => models.has(m)), SK.SKIN_TARGETS.flatMap((x) => x.models).filter((m) => !models.has(m)).join(","));
  S.skins.pistol = "default";
  t.check("без скина — обычная модель", models.resolve("w-pistol", { skinned: true }) === "w-pistol");
  engine.console.exec("skin pistol gilded");
  t.check("консоль: skin pistol gilded", S.skins.pistol === "gilded");
  t.check("свой герой — позолоченный пистолет", models.resolve("w-pistol", scene.player) === "w-pistol@gilded" && models.has("w-pistol@gilded"));
  t.check("моб с пистолетом — обычный", models.resolve("w-pistol", { skinned: false }) === "w-pistol");
  t.check("от 1-го лица — тоже в скине", models.resolve("fp-pistol", null) === "fp-pistol@gilded");
  const a = models.models.get("w-pistol").model.colors, b = models.models.get("w-pistol@gilded").model.colors;
  t.check("вариант правда перекрашен (скелет тот же)", a.length === b.length && a.some((v, i) => Math.abs(v - b[i]) > 0.05));
  // значок
  const ui = engine.ui, I = await import(path.join(root, "games", "builder", "items.js"));
  const draw = () => { ui.rect(0, 0, 64, 64, [0, 0, 0], 255); I.ITEMS.pistol.drawIcon(ui, 8, 8, 48); const out = []; for (let y = 0; y < 64; y++) out.push(...ui.fb.pixels.subarray(y * ui.fb.width, y * ui.fb.width + 64)); return out.join(); };
  const gilded = draw();
  S.skins.pistol = "default";
  const plain = draw();
  t.check("значок предмета — в скине", gilded !== plain);
  // примерка в меню не меняет выбор (настройки — копия настоящих: катана могла быть уже в скине)
  S.skins.katana = "default";
  t.check("примерка: skinOverride", models.resolve("w-katana", { skinned: true, skinOverride: { katana: "sakura" } }) === "w-katana@sakura" && S.skins.katana === "default");
  engine.console.exec("skin katana nope");
  t.check("неизвестный скин — ошибка, выбор прежний", S.skins.katana === "default");

  // читы: мир без галочки — give не работает, skin работает
  scene.cheats = false;
  const coins = scene.itemCount("coin");
  engine.console.exec("give coin 5");
  t.check("читы выключены: give не выдал", scene.itemCount("coin") === coins);
  engine.console.exec("skin pistol gilded");
  t.check("читы выключены: skin работает (не чит)", S.skins.pistol === "gilded");
  engine.console.exec("sensitivity 7");
  t.check("читы выключены: настройки работают", S.controls.sensitivity === 7);
  scene.cheats = true;
  engine.console.exec("give coin 5");
  t.check("читы включены: give выдал", scene.itemCount("coin") === coins + 5);
  S.skins.pistol = "default";
  scene.refreshSkins();
  await g.frames(5);
  t.check("после смены скинов игра идёт", scene.player.alive);
}
