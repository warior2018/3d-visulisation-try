// Кольца интерфейса рисуются строками (быстро) — картинка должна совпадать с простым «по пикселю» до пикселя
import { UI } from "../../../engine/ui/ui.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
function slowRing(ui, cx, cy, r0, r1, color, alpha = 255, fraction = 1) {
  const limit = fraction * Math.PI * 2;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d < r0 || d > r1) continue;
    if (fraction < 1) { let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2; if (a > limit) continue; }
    ui.pixel(x, y, color, alpha);
  }
}
const a = new UI(200, 150), b = new UI(200, 150);
let diff = 0, seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 2000; i++) {
  a.fb.pixels.fill(0); b.fb.pixels.fill(0);
  const cx = rnd() * 220 - 10, cy = rnd() * 170 - 10, r1 = rnd() * 40, r0 = rnd() < 0.3 ? 0 : rnd() * r1, f = rnd() < 0.5 ? 1 : rnd();
  slowRing(a, cx, cy, r0, r1, [10, 200, 30], 180, f); b.ring(cx, cy, r0, r1, [10, 200, 30], 180, f);
  for (let k = 0; k < a.fb.pixels.length; k++) if (a.fb.pixels[k] !== b.fb.pixels[k]) { diff++; break; }
}
check("2000 случайных колец (целые, части, у края экрана) — совпадают до пикселя", diff === 0, `расхождений ${diff}`);
// grab / paste — кусок картинки возвращается как был
const u = new UI(100, 80); u.rect(10, 10, 30, 20, [200, 50, 50]); const img = u.grab(5, 5, 40, 30);
u.rect(0, 0, 100, 80, [0, 0, 0]); u.paste(img);
check("grab → paste возвращает кусок как был", u.fb.pixels[15 * 100 + 15] === ((255 << 24) | (50 << 16) | (50 << 8) | 200) >>> 0);
const u2 = new UI(120, 80);
check("paste после смены размера окна — отказ (нарисовать заново)", u2.paste(img) === false);
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
