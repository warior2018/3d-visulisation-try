// ============================================================
//  Размытие в движении (motion blur): камеру резко повернули — картинка смазывается вдоль поворота, как на
//  камере с выдержкой. Свой маленький шейдер (отдельный модуль: не собрался — просто без размытия).
//  Мир уже нарисован в свою картинку (как для масштаба рендера), этот проход переносит её на экран:
//  8 проб вдоль скорости картинки (vel — доли экрана за «выдержку»), середина — сам пиксель.
//
//    motionVelocity(prev, camera, dt, strength) → [vx, vy] (доли экрана) — сколько смазать за этот кадр
// ============================================================

export const MOTION_SHADER = /* wgsl */ `
struct Motion {
  vel: vec2f,
  _p0: f32,
  _p1: f32,
};
@group(0) @binding(0) var<uniform> mo: Motion;
@group(0) @binding(1) var moSampler: sampler;
@group(0) @binding(2) var moTex: texture_2d<f32>;

struct MoOut {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn motion_vs(@builtin(vertex_index) i: u32) -> MoOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: MoOut;
  out.pos = vec4f(corners[i], 0.0, 1.0);
  out.ndc = corners[i];
  return out;
}

@fragment
fn motion_fs(in: MoOut) -> @location(0) vec4f {
  let uv = vec2f(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  var acc = vec3f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let k = f32(i) / 7.0 - 0.5;
    acc = acc + textureSampleLevel(moTex, moSampler, uv + mo.vel * k, 0.0).rgb;
  }
  return vec4f(acc / 8.0, 1.0);
}
`;

const SHUTTER = 1 / 60; // «выдержка», с: смаз — сколько картинка сдвинется за это время (не зависит от FPS)
const MAX = 0.06; //      не больше 6 % экрана

// Скорость картинки от поворота камеры (рад/с → доли экрана за выдержку). prev — { yaw, pitch } прошлого кадра
export function motionVelocity(prev, camera, dt, strength = 1, aspect = 16 / 9) {
  if (!prev || !camera || !(dt > 0) || strength <= 0) return [0, 0];
  let dy = camera.yaw - prev.yaw;
  if (dy > Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  const dp = camera.pitch - prev.pitch;
  const t = Math.tan(camera.fov / 2);
  const k = (SHUTTER / dt) * strength;
  let vx = (dy / (2 * t * aspect)) * k, vy = (dp / (2 * t)) * k;
  const len = Math.hypot(vx, vy);
  if (len > MAX) {
    vx *= MAX / len;
    vy *= MAX / len;
  }
  return [vx, vy];
}
