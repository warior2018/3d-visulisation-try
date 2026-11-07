// ============================================================
//  Небо и свет мира «посложнее» (шейдер WGSL): солнце и луна ходят по небу со сменой дня и ночи, ночью — звёзды,
//  на закате — тёплое зарево, облака плывут; кубики светятся от ламп и факелов (glow — у кубика, chunk-mesh.js)
//  и ночью не темнеют рядом с ними. Свет граней — от солнца (днём) или луны (ночью).
//
//  Это ОТДЕЛЬНЫЙ модуль поверх основного (shaders.js): рисовальщик собирает его под «ловушкой ошибок»
//  (gpu-renderer.js → initWorldFx). Не собрался (старая видеокарта, ошибка) — рисуем как раньше, без него.
//  Uniforms здесь длиннее основных: поля 16…23 (sunDir, day, time, clouds, base) пишет gpu-renderer.js.
// ============================================================

import { SHADERS } from "./shaders.js";

const UNIFORMS_OLD = "  voidSky: f32,       // 1 — пола нет (летающие острова): внизу — бездна вместо земли и сетки\n  _pad2: f32,\n};";
const UNIFORMS_NEW = `  voidSky: f32,
  _pad2: f32,
  sunDir: vec3f,      // куда смотреть, чтобы увидеть солнце (длина 1); луна — напротив
  day: f32,           // 0 — ночь, 1 — день
  time: f32,          // секунды (облака плывут)
  clouds: f32,        // 0 — без облаков, 1 — как обычно
  base: f32,          // яркость из настроек (без смены дня и ночи) — для неба
  _pad3: f32,
  sCamPos: vec3f,     // камера карты теней (далеко в сторону солнца, смотрит на героя) — как основная, но своя
  sYaw: f32,
  sPitch: f32,
  sTan: f32,          // tan половины угла (узкий: «почти параллельные» лучи солнца)
  sNear: f32,
  sFar: f32,
  shadowOn: f32,      // 1 — настоящие тени (карта теней готова на этот кадр)
  sTexel: f32,        // размер точки карты теней (1 / её ширина)
  _pad4: f32,
  _pad5: f32,
};
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;`;

const FX = /* wgsl */ `

const LAMP = vec3f(1.0, 0.8, 0.52);   // тёплый свет ламп
const CLOUD_H = 70.0;                 // высота облаков (м)

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn hash3(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  let w = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn cloudNoise(p: vec2f) -> f32 {
  var s = 0.0;
  var amp = 0.5;
  var q = p;
  for (var i = 0; i < 4; i = i + 1) {
    s = s + amp * vnoise(q);
    q = q * 2.03 + vec2f(1.7, 9.2);
    amp = amp * 0.5;
  }
  return s;
}

// Луч через пиксель (как в sky_fs)
fn skyRay(ndc: vec2f) -> vec3f {
  let v0 = vec3f(ndc.x * u.tanHalfFov * u.aspect, ndc.y * u.tanHalfFov, 1.0);
  let cr = cos(u.roll);
  let sr = sin(u.roll);
  let v = vec3f(v0.x * cr + v0.y * sr, -v0.x * sr + v0.y * cr, 1.0);
  let cp = cos(u.pitch);
  let sp = sin(u.pitch);
  let dy = v.y * cp + v.z * sp;
  let z1 = -v.y * sp + v.z * cp;
  let cy = cos(u.yaw);
  let sy = sin(u.yaw);
  return normalize(vec3f(cy * v.x + sy * z1, dy, -sy * v.x + cy * z1));
}

@fragment
fn sky_fx_fs(in: ScreenOut) -> @location(0) vec4f {
  let dir = skyRay(in.ndc);
  let sun = normalize(u.sunDir);
  let day = clamp(u.day, 0.0, 1.0);
  let upK = smoothstep(0.0, 0.5, dir.y);

  // небо: днём — как раньше, ночью — тёмно-синее
  let skyDay = mix(SKY_HORIZON, SKY_TOP, upK);
  let skyNight = mix(vec3f(0.07, 0.09, 0.17), vec3f(0.012, 0.016, 0.045), upK);
  var sky = mix(skyNight, skyDay, day);

  // закат / рассвет: солнце у горизонта — тёплое зарево с его стороны
  let toSun = max(dot(dir, sun), 0.0);
  let dusk = clamp(1.0 - abs(sun.y) * 3.0, 0.0, 1.0);
  sky = mix(sky, vec3f(1.0, 0.52, 0.28), dusk * pow(toSun, 5.0) * (1.0 - smoothstep(0.0, 0.4, dir.y)) * 0.75);

  // звёзды (ночью)
  let cell = floor(dir * 220.0);
  let star = step(0.9978, hash3(cell)) * (1.0 - day) * smoothstep(0.02, 0.2, dir.y);
  sky = sky + vec3f(star * 0.9);

  // ореол вокруг солнца (сами солнце и луна — кубики на небе: игра рисует их частицами)
  sky = sky + vec3f(1.0, 0.92, 0.75) * pow(toSun, 60.0) * 0.4 * smoothstep(-0.05, 0.05, sun.y);

  // облака: плоскость на высоте CLOUD_H, шум плывёт по ветру
  if (dir.y > 0.01 && u.clouds > 0.0) {
    let t = (CLOUD_H - u.camPos.y) / dir.y;
    let p = (u.camPos.xz + dir.xz * t) * 0.011 + vec2f(u.time * 0.006, u.time * 0.002);
    let n = cloudNoise(p);
    let cov = smoothstep(0.52, 0.78, n) * u.clouds * smoothstep(0.01, 0.12, dir.y) * (1.0 - smoothstep(600.0, 1600.0, t));
    let lit = mix(vec3f(0.18, 0.2, 0.28), vec3f(1.0, 0.99, 0.97), day);
    let warm = mix(lit, vec3f(1.0, 0.62, 0.42), dusk * 0.6);
    sky = mix(sky, warm, cov * 0.85);
  }

  // низ: земля / бездна — как раньше, ночью темнее
  let voidMode = u.voidSky > 0.5;
  let solidGround = mix(GROUND_FAR, GROUND_NEAR, smoothstep(0.0, 0.5, -dir.y));
  let abyss = mix(mix(skyNight, SKY_HORIZON, day), VOID_DEEP, smoothstep(0.0, 0.6, -dir.y));
  let ground = select(solidGround, abyss, voidMode) * mix(0.45, 1.0, day);
  let isGround = dir.y < 0.0;
  var color = select(sky, ground, isGround);
  let hline = 1.0 - smoothstep(0.0, fwidth(dir.y) * 1.5, abs(dir.y));
  color = mix(color, mix(skyNight, HORIZON_LINE, day), hline * 0.6);
  return vec4f(toOutput(color * u.base), 1.0);
}

struct CubeFxIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) offset: vec3f,
  @location(3) color: vec3f,
  @location(4) glow: f32,
};

struct CubeFxOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) worldXZ: vec2f,
  @location(4) glow: f32,
  @location(5) worldPos: vec3f,
};

@vertex
fn cube_fx_vs(in: CubeFxIn) -> CubeFxOut {
  let world = in.pos + in.offset;
  var out: CubeFxOut;
  out.pos = project(toView(world));
  out.local = in.pos;
  out.normal = in.normal;
  out.color = in.color;
  out.worldXZ = world.xz;
  out.glow = in.glow;
  out.worldPos = world;
  return out;
}

// Настоящие тени: точка мира глазами камеры карты теней (как toView + project основной камеры). Ближе к солнцу
// что-то есть (в карте глубина меньше) — тень. 9 проб вокруг (PCF) — мягкий край. 1 — свет, 0 — тень
fn shadowVis(world: vec3f, n: vec3f) -> f32 {
  if (u.shadowOn < 0.5) {
    return 1.0;
  }
  let d = world + n * 0.06 - u.sCamPos;
  let cy = cos(u.sYaw);
  let sy = sin(u.sYaw);
  let x1 = d.x * cy - d.z * sy;
  let z1 = d.x * sy + d.z * cy;
  let cp = cos(u.sPitch);
  let sp = sin(u.sPitch);
  let vy = d.y * cp - z1 * sp;
  let vz = d.y * sp + z1 * cp;
  let f = 1.0 / u.sTan;
  let a = u.sFar / (u.sFar - u.sNear);
  let b = -u.sFar * u.sNear / (u.sFar - u.sNear);
  let ndc = vec3f(x1 * f / vz, vy * f / vz, (a * vz + b) / vz);
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let depthRef = ndc.z - 0.0002;
  var sum = 0.0;
  for (var i = -1; i <= 1; i = i + 1) {
    for (var j = -1; j <= 1; j = j + 1) {
      let o = vec2f(f32(i), f32(j)) * u.sTexel * 1.5;
      sum = sum + textureSampleCompareLevel(shadowMap, shadowSampler, uv + o, depthRef);
    }
  }
  return sum / 9.0;
}

@fragment
fn cube_fx_fs(in: CubeFxOut) -> @location(0) vec4f {
  let sun = normalize(u.sunDir);
  let lightDir = select(-sun, sun, sun.y > 0.0); // днём — солнце, ночью — луна
  let light = 0.45 + 0.55 * max(dot(in.normal, lightDir), 0.0);
  var color = in.color * light;
  // тень: только на гранях к солнцу (обратные и так темнее), мягко к краю; ночью — нет
  let vis = shadowVis(in.worldPos, in.normal);
  let facing = smoothstep(0.0, 0.25, dot(in.normal, sun));
  color = color * mix(1.0, mix(0.6, 1.0, vis), facing * clamp(u.day, 0.0, 1.0));
  color = color * (1.0 - 0.35 * edgeness(in.local));
  // ночь темнит всё (u.brightness), кроме света ламп: он тёплый и не темнеет
  let night = clamp(1.0 - u.brightness, 0.0, 1.0);
  let k = max(u.brightness, in.glow * 1.1 * u.base);
  let tint = mix(vec3f(1.0), LAMP, clamp(in.glow * (0.4 + night), 0.0, 1.0));
  color = haze(color * tint, in.worldXZ);
  return vec4f(toOutput(color * k), 1.0);
}
`;

// Код модуля: основной (с длинными Uniforms) + своё. null — основной поменялся и подменить поля не вышло
export function worldFxShader() {
  if (!SHADERS.includes(UNIFORMS_OLD)) return null;
  return SHADERS.replace(UNIFORMS_OLD, UNIFORMS_NEW) + FX;
}
