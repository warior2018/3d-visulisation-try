// Виды урона (как в Dota 2): физический режет броня (resist.physical), магический — сопротивление стихии
// и магии (resist.magical, вместе), чистый — ничего
import { Damage } from "../../../engine/combat/damage.js";
import { resistTo } from "../../../engine/world/entity.js";
import { typeOf } from "../../../engine/combat/elements.js";
let ok = 0, bad = 0;
const check = (name, cond, info = "") => { cond ? ok++ : bad++; console.log((cond ? "OK  " : "FAIL") + " " + name + (info ? "  (" + info + ")" : "")); };
const R = { physical: 0.3, fire: 0.5, magical: 0.2 };
const d = (o) => new Damage({ amount: 100, ...o });
check("вид по стихии: physical — физ., fire / ice / poison / lightning — маг.", typeOf("physical") === "physical" && ["fire", "ice", "poison", "lightning"].every((e) => typeOf(e) === "magical"));
check("физический — режет броня", Math.abs(resistTo(R, d({})) - 0.3) < 1e-9);
check("огонь — стихия и магия вместе: 1 − 0.5 × 0.8 = 0.6", Math.abs(resistTo(R, d({ element: "fire" })) - 0.6) < 1e-9);
check("лёд — только общая магия 0.2", Math.abs(resistTo(R, d({ element: "ice" })) - 0.2) < 1e-9);
check("чистый — ничего не режет", resistTo(R, d({ type: "pure" })) === 0 && resistTo(R, d({ element: "pure" })) === 0);
check("вид у атаки (damageType) — сильнее стихии", d({ element: "fire", attack: { damageType: "pure" } }).type === "pure");
check("предел — 95 %", resistTo({ physical: 2 }, d({})) === 0.95);
console.log(`\nитого: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
