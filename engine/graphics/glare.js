// ============================================================
//  Солнце слепит: смотришь на солнце — вокруг него яркое пятно, лучи-«звезда» и кружки-отблески объектива по
//  линии через центр кадра; чем ближе солнце к центру взгляда — тем сильнее. Солнце закрыто блоком — блика нет.
//  Свой шейдер (отдельный модуль: не собрался — без блика), складывается со светом (additive).
//
//    glareOf(camera, sunDir, aspect, world) → { x, y (экран −1…1), strength 0…1 }
// ============================================================

export const GLARE_SHADER = /* wgsl */ `
struct Glare {
  sun: vec2f,      // где солнце на экране (−1…1)
  strength: f32,   // 0…1
  aspect: f32,
  day: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
};
@group(0) @binding(0) var<uniform> gl: Glare;

struct GlOut {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn glare_vs(@builtin(vertex_index) i: u32) -> GlOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: GlOut;
  out.pos = vec4f(corners[i], 0.0, 1.0);
  out.ndc = corners[i];
  return out;
}

fn spot(p: vec2f, c: vec2f, r: f32) -> f32 {
  let d = distance(p, c) / r;
  return clamp(1.0 - d * d, 0.0, 1.0);
}

@fragment
fn glare_fs(in: GlOut) -> @location(0) vec4f {
  let a = vec2f(gl.aspect, 1.0);
  let p = in.ndc * a;
  let s = gl.sun * a;
  let d = distance(p, s);
  let warm = vec3f(1.0, 0.86, 0.62);
  // пятно и широкий ореол
  var c = vec3f(1.0, 0.95, 0.85) * exp(-d * d * 30.0) * 1.2 + warm * exp(-d * 2.6) * 0.45;
  // лучи-«звезда»: 6 лучей от солнца
  let v = p - s;
  let ang = atan2(v.y, v.x);
  let rays = pow(abs(cos(ang * 3.0)), 24.0) * exp(-d * 3.5) * 0.35;
  c = c + warm * rays;
  // отблески объектива — по линии через центр кадра
  let axis = -s;
  c = c + vec3f(0.55, 0.75, 1.0) * spot(p, s + axis * 0.55, 0.07) * 0.18;
  c = c + vec3f(0.9, 0.7, 1.0) * spot(p, s + axis * 1.25, 0.12) * 0.12;
  c = c + vec3f(1.0, 0.85, 0.5) * spot(p, s + axis * 1.7, 0.05) * 0.2;
  // весь кадр чуть светлеет (засветка)
  c = c + warm * 0.08;
  return vec4f(c * gl.strength * gl.day, 1.0);
}
`;

// Где солнце на экране и насколько слепит. Солнце за спиной, под горизонтом или закрыто блоком — 0
export function glareOf(camera, sun, aspect, world = null) {
  const [sx, sy, sz] = sun;
  if (sy < 0.02) return { x: 0, y: 0, strength: 0 };
  const cy = Math.cos(camera.yaw), syw = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const right = [cy, 0, -syw], up = [-syw * sp, cp, -cy * sp], fwd = [syw * cp, sp, cy * cp];
  const x = sx * right[0] + sz * right[2], y = sx * up[0] + sy * up[1] + sz * up[2], z = sx * fwd[0] + sy * fwd[1] + sz * fwd[2];
  if (z <= 0.2) return { x: 0, y: 0, strength: 0 };
  const t = Math.tan(camera.fov / 2);
  const nx = x / (z * t * aspect), ny = y / (z * t);
  // сильнее, когда солнце ближе к центру взгляда; у края кадра — почти нет
  let strength = Math.max(0, Math.min(1, (z - 0.55) / 0.45)) ** 2 * Math.min(1, sy / 0.12);
  if (strength > 0 && world?.raycast) {
    const hit = world.raycast(camera.position, { x: sx, y: sy, z: sz }, 160);
    if (hit?.block) strength = 0; // солнце закрыто блоком
  }
  return { x: nx, y: ny, strength };
}
