// Проверка шейдеров на ЭТОЙ видеокарте (без окна): собираются ли основной модуль, небо/свет/тени (world-fx.js)
// и частицы; что не так — строка, столбец, текст ошибки. Запуск: node tools/check-shaders.mjs
import gpu from "@kmamal/gpu";
import { SHADERS } from "../engine/graphics/shaders.js";
import { worldFxShader } from "../engine/graphics/world-fx.js";
import { PARTICLE_SHADER } from "../engine/graphics/particles.js";

const instance = gpu.create([]);
const adapter = await instance.requestAdapter();
if (!adapter) {
  console.log("видеокарта с WebGPU не найдена");
  process.exit(1);
}
const device = await adapter.requestDevice();
let bad = 0;
for (const [name, code] of [["основной (shaders.js)", SHADERS], ["небо, свет, тени (world-fx.js)", worldFxShader()], ["частицы", PARTICLE_SHADER]]) {
  if (!code) {
    console.log(`${name}: нет кода`);
    continue;
  }
  device.pushErrorScope("validation");
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const err = await device.popErrorScope();
  const lines = code.split("\n");
  const msgs = info.messages.filter((m) => m.type !== "info");
  if (!msgs.length && !err) console.log(`${name}: OK`);
  else {
    bad++;
    console.log(`${name}: ОШИБКА${err ? " " + err.message : ""}`);
    for (const m of msgs) console.log(`  ${m.type} строка ${m.lineNum}:${m.linePos}: ${m.message}\n    > ${(lines[m.lineNum - 1] || "").trim()}`);
  }
}
process.exit(bad ? 1 : 0);
