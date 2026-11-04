// ============================================================
//  Клавиши «Стройки» поверх клавиш движка. Спринта нет: Shift (и нажатие левого стика геймпада) —
//  способность 3. В старых настройках бег был на Shift — переносим (зовут main.js и вход в мир)
// ============================================================

export function noSprint(engine) {
  const c = engine.settings.data.controls;
  let changed = false;
  if (c.bindings.run) {
    if (c.bindings.run === "key:LSHIFT" && !c.bindings.skill3) c.bindings.skill3 = "key:LSHIFT";
    c.bindings.run = "";
    changed = true;
  }
  const pad = engine.pad?.bindings;
  if (pad?.run) { pad.run = ""; changed = true; }
  if (pad && !pad.skill3) pad.skill3 = "leftStick";
  if (c.pad) { c.pad.run = ""; c.pad.skill3 ??= "leftStick"; }
  if (changed) engine.settings.save();
}
