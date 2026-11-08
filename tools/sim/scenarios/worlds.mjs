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
  // лента «o O БОЛЬШОЙ  +»: в ленте только миры, «создать» — отдельно справа; клик по миру — он в центре
  const ui = new Proxy({ width: 1280, height: 720, mouseX: 0, mouseY: 0, theme: { accent: [1, 1, 1], window: { border: [1, 1, 1] }, text: [1, 1, 1], muted: [1, 1, 1], warn: [1, 1, 1] } }, { get: (o, k) => (k in o ? o[k] : () => false) });
  let pushed = null;
  menu.engine = { ui, redraw() {}, sound: { play() {} }, push: (s) => { pushed = s; } };
  menu.update(1 / 60);
  menu.drawPlay(ui);
  t.check("лента: «создать» не в ленте", !menu.ring.some((w) => w.create) && S.MAX_WORLDS === 4);
  t.check("лента: центр крупнее, дальше влево — меньше", menu.slot(ui, 0).r > menu.slot(ui, 1).r && menu.slot(ui, 1).r > menu.slot(ui, 2).r && menu.slot(ui, 1).x < menu.slot(ui, 0).x && menu.createSlot(ui).x > menu.slot(ui, 0).x);
  const cs = menu.createSlot(ui);
  menu.onMouseDown({ x: cs.x, y: cs.y });
  t.check("лента: клик по «+» справа — окно создания мира", menu.worlds.length >= 4 || pushed?.constructor?.name === "CreateWorldScene");
  if (menu.ring.length > 1) {
    for (let i = 0; i < 30; i++) menu.update(1 / 60);
    const left = menu.order()[1], a1 = menu.anim.get(left.id);
    menu.onMouseDown({ x: a1.x, y: a1.y });
    t.check("лента: клик по миру слева — он в центре", menu.center.id === left.id);
    for (let i = 0; i < 10; i++) menu.turn(1);
    t.check("лента: до края влево — последний мир, дальше не едет", menu.center.id === menu.ring.at(-1).id);
    for (let i = 0; i < 10; i++) menu.turn(-1);
    t.check("лента: до края вправо — первый мир", menu.center.id === menu.ring[0].id);
  }
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
