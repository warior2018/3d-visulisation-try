// Прощение краёв у рывков (как в Overwatch): подняться на край, пройти под краем потолка, обогнуть угол.
// И что настоящая стена остаётся стеной, а без slide (и у мобов) ничего не меняется
import { VoxelWorld } from "../../../engine/world/voxel-world.js";
import { Physics } from "../../../engine/world/physics.js";
import { CharacterController, dash } from "../../../engine/world/character-controller.js";
import { Entity } from "../../../engine/world/entity.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const input = { isDown: () => false, wasPressed: () => false };
const C = [128, 128, 128];
function setup(build, pos) {
  const w = new VoxelWorld();
  build(w);
  const physics = new Physics({ isSolid: (x, y, z) => w.isSolid(x, y, z) });
  const e = new Entity({ type: "hero", position: { ...pos }, radius: 0.3, height: 1.8 });
  const c = new CharacterController(e, input, physics, { speed: 4 });
  return { e, c };
}
const run = (c, n) => { for (let i = 0; i < n; i++) c.update(1 / 60, 0); };
// рывок «по горизонтали, без тяжести» (dirY: 0) по +X, 12 м/с на 0.5 с
const go = (e, slide = true) => dash(e, 1, 0, 12, 0.5, 0, { slide });

// --- Край снизу: блок y=0 (верх 1.0) на x = 5 ---
const step = (w) => { for (let z = -3; z < 4; z++) w.place(5, 0, z, C); };
{ const { e, c } = setup(step, { x: 3.5, y: 0.7, z: 0.5 }); go(e);
  let top = 0; for (let i = 0; i < 30; i++) { run(c, 1); if (e.position.x > 4.9 && e.position.x < 6.1) top = Math.max(top, e.position.y); }
  check("край снизу 0.3 (ноги на 0.7, верх блока 1.0) — поднялся на край и пролетел", e.position.x > 6 && top >= 1, `x ${e.position.x.toFixed(2)}, над блоком на высоте ${top.toFixed(2)}`); }
{ const { e, c } = setup(step, { x: 3.5, y: 0.3, z: 0.5 }); go(e); run(c, 30);
  check("край снизу 0.7 (глубже 0.5) — это стена, встал", e.position.x < 5, `x ${e.position.x.toFixed(2)}`); }
{ const { e, c } = setup(step, { x: 3.5, y: 0.7, z: 0.5 }); go(e, null); run(c, 30);
  check("без slide (обычный рывок, мобы) — край не прощается", e.position.x < 5, `x ${e.position.x.toFixed(2)}`); }

// --- Край сверху: потолок y=2 (низ 2.0) на x = 5 ---
const ceil = (w) => { for (let z = -3; z < 4; z++) w.place(5, 2, z, C); };
{ const { e, c } = setup(ceil, { x: 3.5, y: 0.3, z: 0.5 }); go(e); run(c, 30);
  check("край сверху 0.1 (голова на 2.1) — прижался и прошёл под ним", e.position.x > 6, `x ${e.position.x.toFixed(2)}, y ${e.position.y.toFixed(2)}`); }
{ const { e, c } = setup(ceil, { x: 3.5, y: 0.6, z: 0.5 }); go(e); run(c, 30);
  check("край сверху 0.4 (глубже 0.25) — стена", e.position.x < 5, `x ${e.position.x.toFixed(2)}`); }

// --- Угол: стена x = 5, z от −3 до 2 (клетки −3..1), за ней — пусто ---
const wall = (w) => { for (let z = -3; z < 2; z++) for (let y = 0; y < 3; y++) w.place(5, y, z, C); };
{ const { e, c } = setup(wall, { x: 3.5, y: 0, z: 2.15 }); go(e); run(c, 30);
  check("угол задет на 0.15 м — обогнул и пролетел", e.position.x > 6, `x ${e.position.x.toFixed(2)}, z ${e.position.z.toFixed(2)}`); }
{ const { e, c } = setup(wall, { x: 3.5, y: 0, z: 1.6 }); go(e); run(c, 30);
  check("угол задет на 0.7 м — стена (рывок в лоб — стоп)", e.position.x < 5, `x ${e.position.x.toFixed(2)}`); }
{ const { e, c } = setup(wall, { x: 3.5, y: 0, z: -1 }); go(e); run(c, 30);
  check("прямо в стену — стоп, сквозь не прошёл", e.position.x < 5 && Math.abs(e.position.z + 1) < 0.01, `x ${e.position.x.toFixed(2)} z ${e.position.z.toFixed(2)}`); }

// --- Ходьба и мобы: прощения нет (forgive только на время рывка) ---
{ const { e, c } = setup(step, { x: 3.5, y: 0, z: 0.5 }); e.velocity.x = 0; run(c, 5);
  check("после рывка forgive снят", e.forgive === null); }
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
