// Ощущения: тряска только картинки (прицел на месте) — от молота, при падении, при приземлении
export default async function (t, g) {
  const { scene } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  await g.frames(20);
  // --- молот: удар о землю трясёт картинку, прицел не двигается ---
  const a = g.equip("war-hammer");
  const look0 = { yaw: scene.look.yaw, pitch: scene.look.pitch };
  a.attack.cooldownLeft = 0;
  a.primary(scene);
  let maxLevel = 0, viewDiff = 0;
  for (let i = 0; i < 40; i++) {
    a.attack.update(1 / 60);
    await g.frames(1);
    maxLevel = Math.max(maxLevel, scene.shake.level);
    viewDiff = Math.max(viewDiff, Math.abs(scene.viewCamera.yaw - scene.rig.camera.yaw) + Math.abs(scene.viewCamera.pitch - scene.rig.camera.pitch));
  }
  t.check("молот: встряска была", maxLevel > 0.2, maxLevel.toFixed(2));
  t.check("молот: картинка тряслась (камера рисования ≠ камера прицела)", viewDiff > 1e-4, (viewDiff * 180 / Math.PI).toFixed(2) + "°");
  t.check("молот: прицел не сдвинулся", Math.abs(scene.look.yaw - look0.yaw) < 1e-9 && Math.abs(scene.look.pitch - look0.pitch) < 1e-9);
  // --- падение с высоты: дрожь в полёте, толчок при приземлении ---
  await g.frames(90); // всё затихло
  const p = g.player;
  p.position.y += 20;
  p.velocity.y = 0;
  let fallLevel = 0, landed = null;
  const onLand = scene.onLand.bind(scene);
  scene.onLand = (l) => { landed = l; onLand(l); };
  for (let i = 0; i < 180 && !landed; i++) { await g.frames(1); fallLevel = Math.max(fallLevel, scene.shake.level); }
  t.check("падение: дрожь в полёте", fallLevel > 0.05, fallLevel.toFixed(2));
  t.check("падение: приземление замечено (высота ~20)", landed && landed.fall > 18, landed ? landed.fall.toFixed(1) : "нет");
  t.check("приземление: толчок", scene.shake.trauma > 0.3, scene.shake.trauma.toFixed(2));
  // --- выключатель в настройках ---
  scene.settings.general.screenShake = false;
  scene.shake.add(1);
  await g.frames(2);
  t.check("настройка «тряска» выключена — не трясёт", scene.shake.level === 0 && scene.viewCamera.yaw === scene.rig.camera.yaw);
  scene.settings.general.screenShake = true;
}
