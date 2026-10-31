// Скользкие блоки (лёд): на них не устоять — съезжаешь к краю; хоть одна обычная опора под ногами — стоишь;
// прыгнуть со льда нельзя; сохраняется вместе с миром
import { VoxelWorld } from "../../../engine/world/voxel-world.js";
import { Physics } from "../../../engine/world/physics.js";
import { CharacterController } from "../../../engine/world/character-controller.js";
import { Entity } from "../../../engine/world/entity.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const C = [175, 225, 245];
let jump = false;
const input = { isDown: (a) => a === "jump" && jump, wasPressed: () => false };
function setup(build, pos) {
  const w = new VoxelWorld();
  build(w);
  const physics = new Physics({ isSolid: (x, y, z) => w.isSolid(x, y, z), surfaceAt: (x, y, z) => w.surfaceAt(x, y, z) });
  const e = new Entity({ type: "hero", position: { ...pos }, radius: 0.3, height: 1.8 });
  return { w, e, c: new CharacterController(e, input, physics, { speed: 4 }) };
}
const run = (c, n) => { for (let i = 0; i < n; i++) c.update(1 / 60, 0); };

// Столб изо льда 1×1 на высоте 3 (стоим сверху, чуть правее середины)
const icePillar = (w) => { for (let y = 0; y < 3; y++) w.place(5, y, 5, C, "slip"); };
{ const { e, c } = setup(icePillar, { x: 5.6, y: 3, z: 5.5 }); run(c, 60);
  check("на ледяном столбе не устоять — съехал и упал", e.position.y < 1, `x ${e.position.x.toFixed(2)}, y ${e.position.y.toFixed(2)}`);
  check("съезжает от середины к ближнему краю (вправо)", e.position.x > 5.9, `x ${e.position.x.toFixed(2)}`); }
// Тот же столб, но обычный камень — стоит
const stonePillar = (w) => { for (let y = 0; y < 3; y++) w.place(5, y, 5, C); };
{ const { e, c } = setup(stonePillar, { x: 5.6, y: 3, z: 5.5 }); run(c, 60);
  check("обычный столб — стоит на месте", Math.abs(e.position.x - 5.6) < 1e-6 && e.position.y >= 3 && e.onGround); }
// Лёд рядом с камнем: стоим на стыке (под ногами и лёд, и камень) — держит
const mixed = (w) => { w.place(5, 0, 5, C, "slip"); w.place(6, 0, 5, C); };
{ const { e, c } = setup(mixed, { x: 5.9, y: 1, z: 5.5 }); run(c, 60);
  check("на стыке льда и камня — стоит (обычная опора держит)", e.onGround && e.position.y >= 1 && !e.onSlip); }
// Прыгнуть со льда нельзя
{ const { e, c } = setup((w) => { for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) w.place(x, 0, z, C, "slip"); }, { x: 10.5, y: 1, z: 10.5 });
  run(c, 20); jump = true; run(c, 10); jump = false; // первые 0.12 с — «койот» (только ступил на лёд — ещё можно)
  check("с катка (лёд везде) не прыгнуть", e.position.y < 1.05, `y ${e.position.y.toFixed(2)}`);
  check("на катке едешь (разогнался)", Math.hypot(e.slipVel.x, e.slipVel.z) > 1, Math.hypot(e.slipVel.x, e.slipVel.z).toFixed(2)); }
// Съехал со льда на камень — скольжение быстро гаснет
{ const { e, c } = setup((w) => { w.place(5, 0, 5, C, "slip"); for (let x = 6; x < 12; x++) w.place(x, 0, 5, C); }, { x: 5.6, y: 1, z: 5.5 });
  run(c, 90);
  check("съехал на камень — остановился", Math.hypot(e.slipVel.x, e.slipVel.z) < 0.05 && e.onGround, `скольжение ${Math.hypot(e.slipVel.x, e.slipVel.z).toFixed(3)}, x ${e.position.x.toFixed(2)}`); }
// Сохранение
{ const w = new VoxelWorld(); w.place(1, 0, 1, C, "slip"); w.place(2, 0, 1, C);
  const back = new VoxelWorld(); back.loadFrom(JSON.parse(JSON.stringify(w.toJSON())));
  check("лёд сохраняется и загружается скользким, камень — обычным", back.surfaceAt(1, 0, 1) === "slip" && back.surfaceAt(2, 0, 1) === null); }
// Без surfaceAt (как раньше) — ничего не меняется
{ const w = new VoxelWorld(); icePillar(w);
  const e = new Entity({ type: "hero", position: { x: 5.6, y: 3, z: 5.5 }, radius: 0.3, height: 1.8 });
  const c = new CharacterController(e, input, new Physics({ isSolid: (x, y, z) => w.isSolid(x, y, z) }), { speed: 4 }); run(c, 60);
  check("физика без surfaceAt — лёд как камень (обратная совместимость)", e.onGround && e.position.y >= 3); }
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
