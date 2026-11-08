// Присед (Ctrl): «держать» — пока зажат, «переключать» — нажал / нажал ещё раз. В приседе ниже рост, глаза и
// голова (хитбокс), медленнее ход, меньше отдача стволов
export default async function (t, g) {
  const { scene, engine, E, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player) scene.removeEntity(e);
  const p = g.player;
  const P = p.position;
  const bx = Math.floor(P.x), bz = Math.floor(P.z), by = 95;
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) scene.world.place(bx + x, by, bz + z, [90, 90, 90]);
  P.x = bx + 0.5; P.y = by + 1; P.z = bz + 0.5;
  g.equip("pistol");
  await g.frames(30);
  const code = E.KEYS[engine.input.bindings.crouch.split(":")[1]];
  const head0 = p.hitboxes.find((h) => h.id === "head").max[1];
  scene.settings.general.crouchMode = "hold";
  engine.input.keys.add(code);
  await g.frames(30);
  t.check("Ctrl (держать): присел — ниже рост", scene.crouched && Math.abs(p.height - C.CROUCH.height) < 1e-9, `${p.height}`);
  t.check("в приседе: глаза ниже", Math.abs(scene.eyeY - C.CROUCH.eyeHeight) < 0.01, `${scene.eyeY}`);
  t.check("в приседе: голова (хитбокс) ниже", p.hitboxes.find((h) => h.id === "head").max[1] < head0 - 0.3);
  t.check("в приседе: медленнее", p.speedBonuses.crouch === C.CROUCH.speed);
  // отдача меньше
  const kicks = [];
  const kick = scene.recoil.kick.bind(scene.recoil);
  scene.recoil.kick = (cfg, aimT) => { kicks.push(cfg?.scale ?? 1); return kick(cfg, aimT); };
  const a = scene.abilities.current;
  a.attack.cooldownLeft = 0;
  a.primary(scene);
  t.check("в приседе: отдача ×0.5", kicks.length && Math.abs(kicks[0] - (C.RECOIL_PISTOL.scale ?? 1) * C.CROUCH.recoil) < 1e-9, JSON.stringify(kicks));
  scene.recoil.kick = kick;
  engine.input.keys.delete(code);
  await g.frames(10);
  t.check("отпустил Ctrl — встал во весь рост", !scene.crouched && p.height === C.PLAYER.height && !p.speedBonuses.crouch);
  t.check("встал — голова на месте", p.hitboxes.find((h) => h.id === "head").max[1] === head0);
  // режим «переключать»
  scene.settings.general.crouchMode = "toggle";
  scene.onPress(["crouch"], {});
  await g.frames(10);
  t.check("переключать: нажал — сел", scene.crouched);
  scene.onPress(["crouch"], {});
  await g.frames(10);
  t.check("переключать: нажал ещё раз — встал", !scene.crouched);
  scene.settings.general.crouchMode = "hold";
}
