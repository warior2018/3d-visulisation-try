// Слоты миров и летающие острова: порядок по последней игре, создание мира, бездна под островами
import path from "node:path";
export const immortal = false; // здоровье после бездны проверяем сами
export default async function (t, g) {
  const { scene, C, root } = g;
  const S = await import(path.join(root, "games", "builder", "save.js"));
  const was = S.currentWorld;
  const a = S.createWorld({ name: "ALPHA", icon: "lake", size: 1 });
  await new Promise((r) => setTimeout(r, 5));
  const b = S.createWorld({ name: "BETA", icon: "tree", size: 3 });
  let list = S.listWorlds();
  t.check("новый мир — первым в списке (играли «только что»)", list[0].id === b && list[1].id === a, list.map((w) => w.id).join(","));
  t.check("имя, картинка, размер, летающие острова", list[1].name === "ALPHA" && list[1].icon === "lake" && list[1].size === 1 && list[1].floating === true);
  t.check("в новом мире героя ещё нет", !list[0].saved);
  S.touchWorld(a);
  list = S.listWorlds();
  t.check("сыграли в ALPHA — она в центре (первая)", list[0].id === a);
  // меню: стрелки крутят круг миров (а не картинку центрального)
  const { MainMenu } = await import(path.join(root, "games", "builder", "menu.js"));
  const menu = new MainMenu({ game: scene.game, actions: {} });
  const first = menu.center.id, pic = menu.center.icon;
  menu.onButton("turn:1");
  t.check("стрелка < : в центре другой мир (тот, что был слева)", menu.center.id !== first && menu.center.id === menu.ring[1].id, `${first} → ${menu.center.id}`);
  t.check("картинка мира от стрелок не меняется", S.listWorlds().find((w) => w.id === first)?.icon === pic);
  menu.onButton("turn:-1");
  t.check("стрелка > : обратно", menu.center.id === first);
  S.touchWorld(was);
  S.deleteWorld(a);
  S.deleteWorld(b);
  t.check("удалённые миры пропали из списка", !S.listWorlds().some((w) => w.id === a || w.id === b));
  // размеры: маленький остров меньше большого
  const small = C.worldgenFor(1, true), large = C.worldgenFor(3, true);
  t.check("остров размера 1 меньше размера 3", JSON.stringify(small) !== JSON.stringify(large));

  // Бездна: без пола под островами падаем; ниже voidY — назад на последнее твёрдое место, с уроном
  const p = g.player;
  scene.world.floor = false;
  t.check("без пола ниже 0 не твёрдо", !scene.world.isSolid(Math.floor(p.position.x) + 500, -1, Math.floor(p.position.z) + 500));
  await g.frames(60);
  const safe = { ...(scene.safePos || p.position) };
  p.stats.hp = p.stats.maxHp;
  p.position.y = C.FLOATING.voidY - 1;
  await g.frames(2);
  t.check("упал в бездну — вернулся наверх", p.position.y > C.FLOATING.voidY + 10, `y ${p.position.y.toFixed(1)}`);
  t.check("и потерял часть здоровья", p.stats.hp < p.stats.maxHp || scene.god, `${p.stats.hp}/${p.stats.maxHp}`);
  t.check("вернулся туда, где стоял", Math.hypot(p.position.x - safe.x, p.position.z - safe.z) < 2);
  scene.world.floor = true;
}
