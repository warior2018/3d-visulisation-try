// Сетка соседей: near находит ВСЕХ, кто в радиусе (как честный перебор), и не тащит весь мир
import { SpatialGrid } from "../../../engine/world/spatial-grid.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const list = [];
for (let i = 0; i < 300; i++) list.push({ alive: i % 17 !== 0, position: { x: (rnd() - 0.5) * 120, y: 0, z: (rnd() - 0.5) * 120 } });
const g = new SpatialGrid(4);
g.rebuild(list);
let missed = 0, extra = 0, total = 0;
const out = [];
for (let q = 0; q < 400; q++) {
  const x = (rnd() - 0.5) * 130, z = (rnd() - 0.5) * 130, r = 0.5 + rnd() * 4;
  const got = new Set(g.near(x, z, r, out));
  for (const e of list) {
    const inR = Math.hypot(e.position.x - x, e.position.z - z) <= r;
    if (inR && e.alive && !got.has(e)) missed++;
    if (got.has(e) && !e.alive) extra++;
  }
  total += got.size;
}
check("400 случайных запросов: никого в радиусе не пропустили", missed === 0, `пропущено ${missed}`);
check("павших в сетке нет", extra === 0);
check("кандидатов в среднем мало (не весь мир)", total / 400 < 15, `${(total / 400).toFixed(1)} из ${list.length}`);
check("near возвращает тот же массив (без мусора)", g.near(0, 0, 3, out) === out);
// переезд: rebuild после сдвига
list[1].position.x = 500; list[1].position.z = 500;
g.rebuild(list);
check("после rebuild сущность — на новом месте", g.near(500, 500, 1, out).includes(list[1]) && !g.near(0, 0, 200, []).includes(list[1]) === (Math.hypot(500, 500) > 200 + 8));
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
