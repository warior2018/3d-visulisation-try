// Ввод и тики: короткое нажатие (быстрее тика) не теряется, одно нажатие — одно действие, сколько бы тиков
// ни прошло за кадр; нажатия в паузе / под окном (инвентарь) не срабатывают после закрытия
export default async function (t, g) {
  const { scene, engine, E } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const p = g.player;
  g.equip("machete");
  const jumpCode = E.KEYS[engine.input.bindings.jump.split(":")[1]];
  const land = async (fps) => {
    for (let i = 0; i < fps * 3 && !(p.onGround && p.velocity.y === 0); i++) await g.frames(1, 1 / fps);
    await g.frames(Math.ceil(fps / 3), 1 / fps);
  };
  // сколько раз оттолкнулись вверх (прыжок и двойной прыжок — каждый даёт рывок скорости вверх)
  const countJumps = async (fps, frames) => {
    let jumps = 0, vy = p.velocity.y;
    for (let i = 0; i < frames; i++) {
      await g.frames(1, 1 / fps);
      if (p.velocity.y > 1 && p.velocity.y > vy + 2) jumps++; // приземление тоже «поднимает» скорость (до 0) — не в счёт
      vy = p.velocity.y;
    }
    return jumps;
  };

  // 1. Тап быстрее тика на 240 Гц: нажал и отпустил между тиками — прыжок есть
  await land(240);
  engine.input.pressedKeys.add(jumpCode); // нажатие пришло событием, клавиша уже отпущена
  t.check("240 Гц: тап короче тика — прыжок есть (ровно один)", (await countJumps(240, 60)) === 1);

  // 2. 20 FPS: за кадр 3 тика — одно нажатие = один прыжок, не прыжок + двойной
  await land(20);
  engine.input.pressedKeys.add(jumpCode);
  { const n = await countJumps(20, 20); t.check("20 FPS (3 тика за кадр): одно нажатие — один прыжок", n === 1, `${n}`); }

  // 3. Пробел в паузе — после паузы не прыгаем
  await land(60);
  scene.pause();
  t.check("пауза открылась", engine.scene !== scene);
  await g.frames(3);
  engine.input.pressedKeys.add(jumpCode);
  await g.frames(3);
  while (engine.scene !== scene) engine.pop();
  t.check("пробел в паузе — после неё прыжка нет", (await countJumps(60, 40)) === 0);

  // 4. Пробел под живым окном (инвентарь) — после закрытия не прыгаем
  await land(60);
  scene.openInventory();
  t.check("инвентарь открылся поверх мира (одиночная игра — мир на паузе)", engine.scene !== scene && !engine.scene.live);
  await g.frames(3);
  engine.input.pressedKeys.add(jumpCode);
  await g.frames(3);
  while (engine.scene !== scene) engine.pop();
  t.check("пробел в инвентаре — после закрытия прыжка нет", (await countJumps(60, 40)) === 0);

  // 5. Обычное нажатие после этого работает
  await land(60);
  engine.input.pressedKeys.add(jumpCode);
  t.check("обычное нажатие после окон — прыжок есть", (await countJumps(60, 40)) === 1);

  // 6. wasPressed с кнопкой мыши: одно нажатие — один раз
  const inp = engine.input, was = inp.bindings.testClick;
  inp.bindings.testClick = "mouse:LEFT";
  inp.pressedButtons.add(E.sdl?.mouse?.BUTTON?.LEFT ?? 1);
  const first = inp.wasPressed("testClick"), second = inp.wasPressed("testClick");
  if (was === undefined) delete inp.bindings.testClick; else inp.bindings.testClick = was;
  t.check("кнопка мыши: wasPressed — один раз на нажатие", first && !second);
}
