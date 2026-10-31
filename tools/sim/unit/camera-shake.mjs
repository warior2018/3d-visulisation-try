// Тряска камеры: только копия для рисования, исходная камера (прицел) не меняется; гаснет сама; удержание —
// только на кадр; выключатель
import { CameraShake } from "../../../engine/graphics/camera-shake.js";
import { Camera } from "../../../engine/graphics/camera.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const cam = new Camera(); cam.yaw = 0.3; cam.pitch = -0.1; cam.roll = 0;
const out = new Camera();
const s = new CameraShake({ decay: 2 });
s.update(1 / 60); s.apply(cam, out);
check("без встряски — копия совпадает с камерой", out.yaw === cam.yaw && out.pitch === cam.pitch && out.position.x === cam.position.x && out.position !== cam.position);
s.add(0.8);
let maxDev = 0;
for (let i = 0; i < 20; i++) { s.update(1 / 60); s.apply(cam, out); maxDev = Math.max(maxDev, Math.abs(out.yaw - cam.yaw), Math.abs(out.pitch - cam.pitch)); }
check("встряска — картинка трясётся (до ~1.6°)", maxDev > 0.002 && maxDev < 0.03, (maxDev * 180 / Math.PI).toFixed(2) + "°");
check("исходная камера (прицел) не тронута", cam.yaw === 0.3 && cam.pitch === -0.1 && cam.roll === 0);
for (let i = 0; i < 40; i++) s.update(1 / 60);
check("встряска гаснет сама (0.8 при decay 2 — за 0.4 с)", s.level === 0, s.level);
s.add(0.7); s.add(0.7);
check("встряски складываются, но не больше 1", s.trauma === 1);
const h = new CameraShake();
h.hold(0.4); h.update(1 / 60); const l1 = h.level; h.update(1 / 60);
check("удержание (падение) — только на свой кадр", l1 === 0.4 && h.level === 0, `${l1} → ${h.level}`);
const off = new CameraShake(); off.enabled = false; off.add(1); off.update(1 / 60); off.apply(cam, out);
check("выключатель (настройка) — не трясёт", off.level === 0 && out.yaw === cam.yaw);
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
