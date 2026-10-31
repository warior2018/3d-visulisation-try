import { slideVelocity } from "../../../engine/world/physics.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const R = Math.SQRT1_2;
const fmt = (r) => `${r.x.toFixed(3)}, ${r.z.toFixed(3)}`;

// Стена по оси X (нормаль −X: стена справа), летим 45° в неё со скоростью 10
let r = slideVelocity(10 * R, 10 * R, [{ x: -1, z: 0 }], { stopAngle: 30, keep: 0.9 });
check("кубик, 45°: вдоль стены, 90 % скорости", near(r.x, 0) && near(r.z, 9), fmt(r));
r = slideVelocity(10 * R, 10 * R, [{ x: -1, z: 0 }], { stopAngle: 30, keep: 0 });
check("keep 0 — «честно»: остаётся только своя часть (7.07)", near(r.z, 10 * R), fmt(r));
// Наклонная стена (как у модели): нормаль смотрит наискось (−1, −1)/√2; летим прямо по +X
r = slideVelocity(10, 0, [{ x: -R, z: -R }], { stopAngle: 30, keep: 0 });
check("наклонная стена, 45° к ней: скорость уходит вдоль неё (вектор (5, −5))", near(r.x, 5) && near(r.z, -5), fmt(r));
check("и перпендикулярна нормали (скалярное произведение 0)", near(r.x * -R + r.z * -R, 0));
r = slideVelocity(10, 0, [{ x: -R, z: -R }], { stopAngle: 30, keep: 0.9 });
check("наклонная, keep 0.9 — длина 9", near(Math.hypot(r.x, r.z), 9), fmt(r));
// Почти в лоб под любым углом стены
const a = (20 * Math.PI) / 180;
r = slideVelocity(-R * Math.cos(a) + R * Math.sin(a), -R * Math.cos(a) - R * Math.sin(a), [{ x: R, z: R }], { stopAngle: 30 });
check("наклонная стена, 20° от лба — стоп", near(r.x, 0) && near(r.z, 0), fmt(r));
// От поверхности — не трогаем
r = slideVelocity(-10, 3, [{ x: -1, z: 0 }]);
check("летим ОТ стены — скорость та же", near(r.x, -10) && near(r.z, 3), fmt(r));
// Внутренний угол из двух стен
r = slideVelocity(10 * R, 10 * R, [{ x: -1, z: 0 }, { x: 0, z: -1 }], { stopAngle: 10, keep: 0 });
check("внутренний угол (две стены) — ноль", near(r.x, 0) && near(r.z, 0), fmt(r));
// Угол 90° между стенами, но летим вдоль одной из них — вторая не мешает
r = slideVelocity(0, 10, [{ x: -1, z: 0 }, { x: 0, z: 1 }], { stopAngle: 30, keep: 0.9 });
check("вдоль стены, вторая стена позади — едем как ехали", near(r.x, 0) && near(r.z, 10), fmt(r));
// count — берём только первую нормаль из массива
r = slideVelocity(10 * R, 10 * R, [{ x: -1, z: 0 }, { x: 0, z: -1 }], { stopAngle: 30, keep: 0.9 }, undefined, 1);
check("count = 1 — вторая нормаль не учитывается", near(r.x, 0) && near(r.z, 9), fmt(r));
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
