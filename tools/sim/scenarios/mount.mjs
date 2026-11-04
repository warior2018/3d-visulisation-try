// Маунт (MOUNT): купить в магазине, Z — сесть / слезть, быстрее пешком; любой урон сбрасывает (талант — порог),
// перезарядка; двуручное — медленнее; скилл движения — сначала слезть; молот верхом — взмах, не удар под себя
export const immortal = false;
export default async function (t, g) {
  const { scene, C } = g;
  for (const e of [...scene.entities.list]) if (e !== scene.player && e.kind === "mob") scene.removeEntity(e);
  const p = g.player;
  scene.regenOff = true;
  scene.hasMount = false;
  scene.mountCd = 0;
  g.equip("machete");
  await g.frames(30);
  scene.callMount();
  t.check("без покупки не сесть", !p.mount);
  // покупка
  const coins = scene.itemCount("coin");
  scene.giveItem("coin", C.MOUNT.price);
  const slot = scene.shop.slots.find((s) => s.id === "mount");
  const r = scene.shop.buy("mount", p, scene);
  t.check("маунт куплен в магазине", scene.hasMount && (r?.ok ?? true), JSON.stringify(r));
  t.check("деньги списаны", scene.itemCount("coin") === coins);
  t.check("второй раз не продаётся", !slot.when());
  t.check("вкладка талантов MOUNT открылась", scene.talents.isAllowed("mount"));
  g.press("Z");
  await g.frames(2);
  t.check("Z — в седле", !!p.mount && p.mount.type === "steed");
  t.check("сидим выше земли", p.position.y > p.mount.position.y + 0.5, `${p.position.y.toFixed(2)} / ${p.mount.position.y.toFixed(2)}`);
  // быстрее, чем пешком
  scene.updateMountSpeed();
  t.check("скорость верхом больше пешей", scene.rideController.speed > C.PLAYER.speed);
  g.equip("war-hammer");
  scene.updateMountSpeed();
  t.check("двуручное (молот) — медленнее", scene.rideController.speed < C.MOUNT.speed && scene.rideController.runMultiplier === 1, `${scene.rideController.speed} ${scene.abilities.current?.id}`);
  const ab = scene.abilities.current;
  t.check("молот верхом — взмах (не удар под себя)", ab.swing && ab.swing.id === "hammer-swing");
  // урон — слетаем, перезарядка
  p.stats.hp = p.stats.maxHp;
  p.onDamage?.({ tags: new Set(), source: null }, 1);
  t.check("1 урона — маунт исчез", !p.mount && !scene.entities.list.some((e) => e.type === "steed"));
  t.check("перезарядка 10 с", Math.abs(scene.mountCd - C.MOUNT.cooldown) < 0.01);
  scene.callMount();
  t.check("на перезарядке не позвать", !p.mount);
  // талант STEADY SADDLE: мелкий урон не сбрасывает
  scene.mountCd = 0;
  scene.talents.ranks["mount-saddle"] = 3;
  scene.applyTalents();
  g.equip("machete");
  await g.frames(5);
  scene.callMount();
  p.onDamage?.({ tags: new Set(), source: null }, Math.floor(p.stats.maxHp * 0.1));
  t.check("STEADY SADDLE 3: удар в 10% HP не сбросил", !!p.mount);
  p.onDamage?.({ tags: new Set(), source: null }, Math.ceil(p.stats.maxHp * 0.13));
  t.check("а 13% — сбросил", !p.mount);
  t.check("QUICK CALL нет — перезарядка обычная", scene.mountCd === C.MOUNT.cooldown);
  // скилл движения: ИАЙ катаны — сначала слезть
  scene.mountCd = 0;
  g.equip("katana");
  await g.frames(40);
  scene.callMount();
  t.check("снова в седле", !!p.mount);
  scene.abilities.current.iai(scene);
  t.check("ИАЙ верхом: сначала слезли", !p.mount);
  // сохранение: маунта среди существ нет
  scene.mountCd = 0;
  scene.callMount();
  scene.save(false);
  const S = await import(g.root + "/games/builder/save.js");
  const meta = JSON.parse((await import("node:fs")).readFileSync(S.SAVE_FILE, "utf8"));
  t.check("маунт не сохраняется существом", !(meta.entities || []).some((e) => e.type === "steed"));
  t.check("покупка маунта сохраняется", Object.values(meta.players || {}).some((x) => x.progression?.mount) || meta.progression?.mount);
  scene.dismountSteed(null);
  await g.frames(5);
  t.check("игра идёт", p.alive);
}
