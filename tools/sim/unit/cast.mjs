// Каст скилла (engine/combat/cast.js): фазы, скорость каста ускоряет замах и хвост, но не перезарядку;
// прерванный замах заряд не тратит; заряды копятся по одному; поддержание тикает и прерывается
import { Cast } from "../../../engine/combat/cast.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const run = (c, sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) c.update(dt); };

let fired = 0, ended = 0;
let speed = 1;
const c = new Cast({ castPoint: 0.3, backswing: 0.3, cooldown: 2, castSpeed: () => speed, onFire: () => fired++, onEnd: () => ended++ });
check("старт: замах", c.tryCast() && c.state === "windup");
run(c, 0.25);
check("до castPoint — ещё не сработало", fired === 0);
run(c, 0.1);
check("после castPoint — сработало, хвост", fired === 1 && c.state === "backswing");
run(c, 0.35);
check("после хвоста — свободен", c.state === "idle" && ended === 1);
check("перезарядка: нельзя", !c.tryCast() && c.reason === "COOLDOWN");
run(c, 2);
check("через 2 с — снова можно", c.tryCast());
// скорость каста ×2: замах вдвое короче, перезарядка — та же
speed = 2;
const c2 = new Cast({ castPoint: 0.4, cooldown: 3, castSpeed: () => speed, onFire: () => fired++ });
const f0 = fired;
c2.tryCast();
run(c2, 0.21);
check("скорость каста ×2: замах 0.4 с → 0.2 с", fired === f0 + 1, `${fired - f0}`);
check("скорость каста не трогает перезарядку", Math.abs(c2.recharge - (3 - 0.21 + 0.2)) < 0.05 || (c2.recharge > 2.7 && c2.recharge <= 3), c2.recharge.toFixed(2));
check("анимация каста ускорена так же", c2.animSpeed === 2);
// сокращение перезарядки — отдельно
const c3 = new Cast({ cooldown: 10, cooldownMult: () => 0.7 });
c3.tryCast();
check("сокращение перезарядки 30 %: 10 → 7 с", Math.abs(c3.recharge - 7) < 1e-9);
// прерывание замаха — заряд не тратится
speed = 1;
const c4 = new Cast({ castPoint: 0.5, cooldown: 5 });
c4.tryCast();
run(c4, 0.2);
check("оглушили в замахе — прервано", c4.interrupt("stun") === true && c4.state === "idle");
check("прерванный замах заряд не потратил", c4.charges === 1 && c4.tryCast());
// заряды: 2 рывка подряд, потом по одному
const c5 = new Cast({ cooldown: 4, charges: 2 });
check("2 заряда: два каста подряд", c5.tryCast() && (c5.update(0.01), c5.tryCast()));
check("третий — нельзя", (c5.update(0.01), !c5.tryCast()));
run(c5, 4);
check("через 4 с — один заряд вернулся", c5.charges === 1);
run(c5, 4);
check("ещё через 4 с — оба", c5.charges === 2);
// поддержание
let ticks = 0;
const c6 = new Cast({ channel: 1, tickEvery: 0.25, onTick: () => ticks++ });
c6.tryCast();
run(c6, 1.05);
check("поддержание 1 с, тик раз в 0.25 — 4 тика", ticks === 4, `${ticks}`);
ticks = 0;
c6.charges = 1;
c6.tryCast();
run(c6, 0.3);
c6.interrupt("stun");
run(c6, 1);
check("поддержание прервали — тики кончились", ticks === 2, `${ticks}`);
// хвост отменяется движением
const c7 = new Cast({ backswing: 1 });
c7.tryCast();
check("хвост отменяется (движение)", c7.state === "backswing" && c7.cancelBackswing() && c7.state === "idle");
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
