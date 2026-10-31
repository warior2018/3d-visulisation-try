// Сглаживание между тиками: рисуем между прошлым и последним тиком; телепорт — сразу; поворот — коротким путём
import { capture, blend } from "../../../engine/world/interpolation.js";
import { Vec3 } from "../../../engine/math/vec3.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const e = { position: new Vec3(0, 0, 0), yaw: 0 };
const list = [e];
blend(list, 0.5);
check("нет снимка (появился внутри тика) — рисуем где стоит", e.renderPosition.x === 0 && e.renderYaw === 0);
capture(list);
e.position.x = 1; e.position.z = -0.5; e.yaw = 1;
blend(list, 0); const a0 = e.renderPosition.x;
blend(list, 0.25); const aq = { x: e.renderPosition.x, z: e.renderPosition.z, yaw: e.renderYaw };
blend(list, 1); const a1 = e.renderPosition.x;
check("alpha 0 — место до тика, 1 — после", near(a0, 0) && near(a1, 1));
check("alpha 0.25 — четверть пути (и поворота)", near(aq.x, 0.25) && near(aq.z, -0.125) && near(aq.yaw, 0.25));
// телепорт
capture(list);
e.position.x = 50;
blend(list, 0.1);
check("перенос дальше 3 м за тик — сразу на новом месте", e.renderPosition.x === 50);
// поворот через ±180°
capture(list);
e.yaw = Math.PI - 0.1;
capture(list);
e.yaw = -Math.PI + 0.1;
blend(list, 0.5);
check("поворот с 170° на −170° — через 180°, а не через 0°", Math.abs(Math.abs(e.renderYaw) - Math.PI) < 1e-9, e.renderYaw.toFixed(3));
// без мусора: те же объекты
const rp = e.renderPosition, pp = e.prevPosition;
capture(list); blend(list, 0.5);
check("повторно — те же объекты (без новых выделений)", e.renderPosition === rp && e.prevPosition === pp);
// ровное движение на 144 Гц: тело едет 6 м/с, тики 60 Гц — шаги картинки между кадрами одинаковые
{
  const { FixedStep } = await import("../../../engine/core/fixed-step.js");
  const f = new FixedStep({ rate: 60 });
  const b = { position: new Vec3(0, 0, 0), yaw: 0 };
  const L = [b];
  const steps = [];
  let last = null;
  for (let i = 0; i < 288; i++) {
    f.advance(1 / 144, (dt) => { capture(L); b.position.x += 6 * dt; });
    blend(L, f.alpha);
    if (last !== null && i > 10) steps.push(b.renderPosition.x - last);
    last = b.renderPosition.x;
  }
  const mn = Math.min(...steps), mx = Math.max(...steps);
  check("144 Гц: картинка едет ровно (шаги кадров одинаковые)", mx - mn < 1e-6 && near(mn, 6 / 144), `${mn.toFixed(5)}…${mx.toFixed(5)}`);
  // без сглаживания было бы 0 / 0.1 / 0 / 0.1 ...
}
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
