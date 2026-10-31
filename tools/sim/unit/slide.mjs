import { VoxelWorld } from "../../../engine/world/voxel-world.js";
import { Physics } from "../../../engine/world/physics.js";
import { CharacterController, dash } from "../../../engine/world/character-controller.js";
import { Entity } from "../../../engine/world/entity.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const input = { isDown: () => false, wasPressed: () => false };
const GRAY = [128, 128, 128];

// Мир: пол на y=0 (физика сама), стена вдоль Z на x = 5 (клетка x=5), z от 0 до 9, высотой 3
function setup({ wallLen = 10, cornerWall = false } = {}) {
  const w = new VoxelWorld();
  for (let z = 0; z < wallLen; z++) for (let y = 0; y < 3; y++) w.place(5, y, z, GRAY);
  if (cornerWall) for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) w.place(x, y, 6, GRAY); // поперёк — внутренний угол у z = 6
  const physics = new Physics({ isSolid: (x, y, z) => w.isSolid(x, y, z) });
  const e = new Entity({ type: "hero", position: { x: 3.5, y: 0, z: 2 }, radius: 0.3, height: 1.8 });
  const c = new CharacterController(e, input, physics, { speed: 4 });
  return { w, physics, e, c };
}
const run = (c, n) => { for (let i = 0; i < n; i++) c.update(1 / 60, 0); };
const deg = (a) => (a * Math.PI) / 180;

// 1. Под 45° в стену — скользим вдоль неё почти всей скоростью
{
  const { e, c } = setup();
  run(c, 5);
  dash(e, Math.sin(deg(45)), Math.cos(deg(45)), 20, 0.4, null, { slide: true });
  const z0 = e.position.z;
  run(c, 24); // 0.4 с
  const dz = e.position.z - z0;
  check("45°: упёрлись и поехали вдоль стены", e.position.x < 5 && e.position.x > 4.6, "x " + e.position.x.toFixed(2));
  check("45°: вдоль стены — около 90 % скорости (почти 8 м за 0.4 с при 20 м/с)", dz > 5.5, "прошли по z " + dz.toFixed(2) + " м");
}
// 2. То же без скольжения — как раньше: вдоль стены только своя часть скорости
{
  const { e, c } = setup();
  run(c, 5);
  dash(e, Math.sin(deg(45)), Math.cos(deg(45)), 20, 0.4);
  const z0 = e.position.z; run(c, 24);
  const dz = e.position.z - z0;
  check("без slide — по-старому (вдоль стены cos45 ≈ 71 % скорости)", dz < 5.8 && dz > 5.2, dz.toFixed(2));
}
// 3. Почти в лоб (20° от перпендикуляра) — стоп
{
  const { e, c } = setup();
  run(c, 5);
  dash(e, Math.cos(deg(20)), Math.sin(deg(20)), 20, 0.4, null, { slide: true });
  run(c, 6); const z1 = e.position.z; run(c, 18);
  check("20° от перпендикуляра — встали у стены", Math.abs(e.position.z - z1) < 0.01, "сдвиг после касания " + (e.position.z - z1).toFixed(3));
}
// 4. Стена кончилась — летим дальше в сторону скольжения
{
  const { e, c } = setup({ wallLen: 4 });
  run(c, 5);
  dash(e, Math.sin(deg(50)), Math.cos(deg(50)), 20, 0.5, null, { slide: true });
  run(c, 30);
  check("стена кончилась (z=4) — пролетели мимо неё дальше", e.position.z > 6, "z " + e.position.z.toFixed(2) + ", x " + e.position.x.toFixed(2));
  check("после конца стены — направление вдоль стены (x почти не растёт)", e.position.x < 5.2, "x " + e.position.x.toFixed(2));
}
// 5. Внутренний угол — стоп
{
  const { e, c } = setup({ cornerWall: true });
  run(c, 5);
  dash(e, Math.sin(deg(50)), Math.cos(deg(50)), 20, 0.5, null, { slide: true });
  run(c, 30);
  check("внутренний угол — встали, не прошли сквозь", e.position.z < 6 && e.position.x < 5, `x ${e.position.x.toFixed(2)} z ${e.position.z.toFixed(2)}`);
}
// 6. 3D-рывок (как ИАЙ: вверх-вперёд) — скольжение по горизонтали, вертикаль своя
{
  const { e, c } = setup();
  run(c, 5);
  dash(e, Math.sin(deg(45)), Math.cos(deg(45)), 20, 0.3, 0.3, { slide: true });
  const y0 = e.position.y, z0 = e.position.z; run(c, 18);
  check("3D-рывок: скользит вдоль стены и летит вверх", e.position.z - z0 > 3.5 && e.position.y > y0 + 1, `dz ${(e.position.z - z0).toFixed(2)}, dy ${(e.position.y - y0).toFixed(2)}`);
}
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
