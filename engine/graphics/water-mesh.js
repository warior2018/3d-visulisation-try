// ============================================================
//  Вода на экране: каждая клетка воды (world.water) — полупрозрачная коробка 1 × высота × 1 (высота — от уровня:
//  источник почти полный, дальше от него — ниже). Рисуется после блоков и существ, с проверкой глубины, глубину
//  сама не пишет (видно дно и то, что в воде). Список коробок пересобирается, когда вода поменялась или камера
//  ушла далеко (только клетки ближе RADIUS м).
// ============================================================

export const FLOATS_PER_WATER = 10; // центр xyz, размер xyz, цвет rgba
export const WATER_LOOK = { radius: 72, color: [52, 110, 200], alpha: 0.5, surface: [90, 150, 230] };

export const WATER_SHADER = /* wgsl */ `
struct Uniforms {
  camPos: vec3f, yaw: f32, pitch: f32, tanHalfFov: f32, aspect: f32, fadeDist: f32,
  gridStep: f32, srgb: f32, near: f32, far: f32, brightness: f32, roll: f32, voidSky: f32, pad2: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn toView(p: vec3f) -> vec3f {
  let d = p - u.camPos;
  let cy = cos(u.yaw);
  let sy = sin(u.yaw);
  let x1 = d.x * cy - d.z * sy;
  let z1 = d.x * sy + d.z * cy;
  let cp = cos(u.pitch);
  let sp = sin(u.pitch);
  let y2 = d.y * cp - z1 * sp;
  let cr = cos(u.roll);
  let sr = sin(u.roll);
  return vec3f(x1 * cr - y2 * sr, x1 * sr + y2 * cr, d.y * sp + z1 * cp);
}

fn project(v: vec3f) -> vec4f {
  let f = 1.0 / u.tanHalfFov;
  let a = u.far / (u.far - u.near);
  let b = -u.far * u.near / (u.far - u.near);
  return vec4f(v.x * f / u.aspect, v.y * f, a * v.z + b, v.z);
}

struct WIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) center: vec3f,
  @location(3) size: vec3f,
  @location(4) color: vec4f,
};

struct WOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) dist: f32,
};

@vertex
fn water_vs(in: WIn) -> WOut {
  let world = in.center + (in.pos - vec3f(0.5, 0.5, 0.5)) * in.size;
  var out: WOut;
  let v = toView(world);
  out.pos = project(v);
  out.dist = length(v);
  // верх — светлее (небо отражается), бока — темнее
  let shade = select(0.75, 1.0, in.normal.y > 0.5);
  out.color = vec4f(in.color.rgb * shade, in.color.a);
  return out;
}

@fragment
fn water_fs(in: WOut) -> @location(0) vec4f {
  let c = in.color.rgb * u.brightness;
  let lin = select(c, pow(c, vec3f(2.2, 2.2, 2.2)), u.srgb > 0.5);
  // вдали — растворяется в дымке, как блоки. Прозрачность больше 1.5 — «не таять» (облака: высоко, видны
  // дальше дымки), сама прозрачность — минус 2
  let noFade = in.color.a > 1.5;
  let a = select(in.color.a, in.color.a - 2.0, noFade);
  let fade = select(clamp(1.0 - (in.dist - u.fadeDist * 0.85) / max(u.fadeDist * 0.15, 1.0), 0.0, 1.0), 1.0, noFade);
  return vec4f(lin, a * fade);
}
`;

// Коробки воды вокруг (cx, cz): Float32Array по FLOATS_PER_WATER на клетку
export function buildWater(water, cx, cz, out = null) {
  const R = WATER_LOOK.radius, list = [];
  for (const c of water.cells.values()) if (Math.abs(c.x + 0.5 - cx) <= R && Math.abs(c.z + 0.5 - cz) <= R) list.push(c);
  const data = out && out.length >= list.length * FLOATS_PER_WATER ? out : new Float32Array(Math.max(64, list.length * 2) * FLOATS_PER_WATER);
  let n = 0;
  for (const c of list) {
    const up = water.has(c.x, c.y + 1, c.z);
    const h = up ? 1 : water.height(c); // под водой — до потолка клетки (без щели между слоями)
    const top = !up;
    const col = top ? WATER_LOOK.surface : WATER_LOOK.color;
    const i = n * FLOATS_PER_WATER;
    data[i] = c.x + 0.5; data[i + 1] = c.y + h / 2; data[i + 2] = c.z + 0.5;
    data[i + 3] = 1; data[i + 4] = h; data[i + 5] = 1;
    data[i + 6] = col[0] / 255; data[i + 7] = col[1] / 255; data[i + 8] = col[2] / 255; data[i + 9] = WATER_LOOK.alpha * (top ? 1 : 0.55);
    n++;
  }
  return { data, count: n };
}
