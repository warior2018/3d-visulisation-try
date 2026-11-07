// Проверка графики на ЭТОЙ видеокарте: шейдеры собираются? и собирается ли весь рисовальщик (небо, свет ламп,
// тени, частицы) — как в игре, в скрытом окне. Что не так — текст ошибки. Запуск: node tools/check-shaders.mjs
import "../engine/core/env.js";
import sdl from "@kmamal/sdl";
import gpu from "@kmamal/gpu";
import { SHADERS } from "../engine/graphics/shaders.js";
import { worldFxShader } from "../engine/graphics/world-fx.js";
import { PARTICLE_SHADER } from "../engine/graphics/particles.js";
import { GPURenderer } from "../engine/graphics/gpu-renderer.js";

let bad = 0;
const instance = gpu.create([]);
const adapter = await instance.requestAdapter();
if (!adapter) {
  console.log("видеокарта с WebGPU не найдена");
  process.exit(1);
}
const device = await adapter.requestDevice();
for (const [name, code] of [["шейдер: основной", SHADERS], ["шейдер: небо, свет, тени", worldFxShader()], ["шейдер: частицы", PARTICLE_SHADER]]) {
  device.pushErrorScope("validation");
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const err = await device.popErrorScope();
  const msgs = info.messages.filter((m) => m.type !== "info");
  const lines = code.split("\n");
  if (!msgs.length && !err) console.log(`${name}: OK`);
  else {
    bad++;
    console.log(`${name}: ОШИБКА${err ? " " + err.message : ""}`);
    for (const m of msgs) console.log(`  ${m.type} строка ${m.lineNum}:${m.linePos}: ${m.message}\n    > ${(lines[m.lineNum - 1] || "").trim()}`);
  }
}
// весь рисовальщик — как в игре
const window = sdl.video.createWindow({ title: "VOID check", width: 320, height: 200, hidden: true, webgpu: true });
try {
  const r = await GPURenderer.create(window, {});
  console.log(`рисовальщик: небо/свет/тени ${r.worldFx ? "OK" : "НЕ СОБРАЛИСЬ: " + r.worldFxError}`);
  console.log(`рисовальщик: настоящие тени ${r.realShadows ? "OK" : "нет"}`);
  console.log(`рисовальщик: частицы ${r.particlePipeline ? "OK" : "НЕ СОБРАЛИСЬ: " + r.particleError}`);
  if (!r.worldFx || !r.particlePipeline) bad++;
  r.destroy?.();
} catch (e) {
  bad++;
  console.log("рисовальщик: ОШИБКА " + (e.stack || e));
}
window.destroy();
process.exit(bad ? 1 : 0);
