// Правка чисел в исходнике config.js: меняется только нужное значение (комментарии и соседи целы)
import { patchNumber } from "../../../engine/core/config-patch.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const src = `// шапка
export const MOVEMENT = { ground: 0.1, stop: 0.05 }; // разгон
export const SPAWN = { interval: 10 / 3, max: 45 };
export const ATTACKS = {
  // пистолет: "damage: 1" в комментарии не трогаем
  pistol: { id: "pistol", name: "SHOT, {x}", damage: 15, range: 40 },
  auto: { damage: 8 },
};
export const TIERS = { 1: { price: 100 }, 2: { price: 2000 } };
`;
const a = patchNumber(src, ["MOVEMENT", "stop"], 0.07);
check("простое число", a.includes("stop: 0.07 }") && a.includes("ground: 0.1,") && a.includes("// разгон"));
const b = patchNumber(src, ["SPAWN", "interval"], 5);
check("выражение → число", b.includes("interval: 5, max: 45"));
const c = patchNumber(src, ["ATTACKS", "pistol", "damage"], 18);
check("вложенное, строки и комментарии не мешают", c.includes('damage: 18, range: 40') && c.includes('"damage: 1" в комментарии') && c.includes("auto: { damage: 8 }"));
check("нет такого — null", patchNumber(src, ["ATTACKS", "rifle", "damage"], 1) === null);
check("объект вместо числа — null", patchNumber(src, ["ATTACKS", "pistol"], 1) === null);
check("числовые ключи", patchNumber(src, ["TIERS", 2, "price"], 1500)?.includes("2: { price: 1500 }"));
console.log(`итого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
