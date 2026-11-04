// Геймпад: кнопки — те же действия (прыжок, атака курком), левый стик — ходьба, правый — взгляд,
// в меню стик двигает курсор, A — клик
export default async function (t, g) {
  const { scene, engine, E } = g;
  const pad = engine.pad;
  t.check("геймпад есть в движке и в вводе", !!pad && engine.input.pad === pad);
  // «подключили» поддельный
  pad.instance = { closed: false, hasRumble: false };
  pad.axis("leftStickY", -1);
  t.check("левый стик вверх — вперёд", engine.input.isDown("forward") && !engine.input.isDown("back"));
  const z0 = g.player.position.clone ? g.player.position.clone() : { ...g.player.position };
  await g.frames(30);
  const moved = Math.hypot(g.player.position.x - z0.x, g.player.position.z - z0.z);
  t.check("герой пошёл", moved > 0.5, moved.toFixed(2));
  pad.axis("leftStickY", 0);
  t.check("отпустил — стоит", !engine.input.isDown("forward"));
  pad.axis("rightTrigger", 1);
  t.check("правый курок — основное действие", engine.input.isDown("primary"));
  pad.axis("rightTrigger", 0);
  pad.button("south", true);
  t.check("A — прыжок (wasPressed)", engine.input.wasPressed("jump"));
  pad.button("south", false);
  // взгляд
  const yaw = scene.look.yaw;
  pad.axis("rightStickX", 1);
  await g.frames(10);
  pad.axis("rightStickX", 0);
  t.check("правый стик крутит взгляд", Math.abs(scene.look.yaw - yaw) > 0.05, (scene.look.yaw - yaw).toFixed(3));
  t.check("кнопки → действия по таблице", pad.actionsFor("start").includes("pause") && pad.actionsFor("dpadRight").includes("mount"));
  // в меню: курсор и клик
  let clicked = null;
  const menu = new (class extends E.Scene { drawUI(ui) { ui.button("ok", "OK", 100, 100, 80, 40); } onButton(id) { clicked = id; } })();
  engine.push(menu);
  engine.ensureUI();
  menu.drawUI(engine.ui);
  engine.ui.setMouse(20, 20);
  pad.axis("leftStickX", 1); pad.axis("leftStickY", 1);
  for (let i = 0; i < 8; i++) engine.updatePad(1 / 60);
  pad.axis("leftStickX", 0); pad.axis("leftStickY", 0);
  t.check("в меню стик двигает курсор", engine.ui.mouseX > 60 && engine.ui.mouseY > 60, `${engine.ui.mouseX},${engine.ui.mouseY}`);
  engine.ui.setMouse(100, 100);
  pad.button("south", true); pad.button("south", false);
  t.check("A в меню — клик по кнопке под курсором", clicked === "ok");
  engine.pop();
  // игра может закрыть геймпад (в «Стройке» пока закрыт): кнопки и стики не действуют
  pad.enabled = false;
  pad.axis("leftStickY", -1);
  t.check("геймпад закрыт — стик не ведёт героя", !engine.input.isDown("forward") && !pad.connected);
  pad.enabled = true;
  pad.axis("leftStickY", 0);
  pad.instance = null;
}
