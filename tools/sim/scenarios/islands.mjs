// Острова: мост с главного острова на маленький — настил над бездной; сундук на дальнем острове — F рядом:
// монеты и вещь не ниже EPIC, один раз; сундук — на карте
export default async function (t, g) {
  const { scene } = g;
  const T = scene.terrain;
  const main = T?.discs.find((d) => d.main), small = T?.discs.filter((d) => !d.main) || [];
  t.check("в мире есть маленькие острова", !!main && small.length > 0, small.length);
  if (!main || !small.length) return;
  const d = small[0];
  scene.buildBridge(main, d);
  // середина пролёта — над бездной, там настил
  const mx = (main.x + main.r * (d.x - main.x) / Math.hypot(d.x - main.x, d.z - main.z) + d.x - d.r * (d.x - main.x) / Math.hypot(d.x - main.x, d.z - main.z)) / 2;
  const mz = (main.z + main.r * (d.z - main.z) / Math.hypot(d.x - main.x, d.z - main.z) + d.z - d.r * (d.z - main.z) / Math.hypot(d.x - main.x, d.z - main.z)) / 2;
  const top = scene.world.topBlock(Math.floor(mx), Math.floor(mz));
  t.check("над бездной — настил моста", !!top && scene.groundHeight(Math.floor(mx), Math.floor(mz)) >= 0, top ? `y ${top.y}` : "нет");
  scene.treasure = scene.placeChest(d);
  t.check("сундук стоит", !!scene.treasure && !!scene.world.get(scene.treasure.x, scene.treasure.y + 1, scene.treasure.z));
  t.check("сундук на карте", scene.mapData().markers.some((m) => m.icon === "chest"));
  const p = g.player, c = scene.treasure;
  p.position.x = c.x + 1; p.position.z = c.z + 2; p.position.y = c.y;
  const coins = scene.itemCount("coin"), picks = scene.pickups.list.length;
  t.check("F рядом — открыт", scene.tryChest() && c.opened);
  t.check("награда: монеты и вещь", scene.itemCount("coin") > coins && scene.pickups.list.length > picks);
  const loot = scene.pickups.list.slice(picks).find((x) => x.item !== "coin");
  t.check("вещь не ниже EPIC", ["epic", "legendary"].includes(loot?.data?.rarity), loot?.data?.rarity);
  t.check("второй раз — нет", !scene.tryChest());
}
