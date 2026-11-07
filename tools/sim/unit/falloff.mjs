// Падение урона с расстоянием (RangedAttack falloff): вблизи — полный, к дальности — доля; без falloff — всегда полный
import { RangedAttack } from "../../../engine/combat/attacks.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const at = (z) => ({ position: { x: 0, y: 0, z } });
const me = at(0);
const a = new RangedAttack({ id: "t", damage: 10, range: 65, falloff: [35, 0.7] });
check("до 35 м — полный", a.falloffAt(me, at(30)) === 1);
check("на дальности — 70 %", Math.abs(a.falloffAt(me, at(65)) - 0.7) < 1e-9);
check("посередине — между", Math.abs(a.falloffAt(me, at(50)) - 0.85) < 1e-9, a.falloffAt(me, at(50)));
const r = new RangedAttack({ id: "r", damage: 10, range: 200 });
check("снайперка — без падения", r.falloffAt(me, at(190)) === 1);
console.log(`итого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
