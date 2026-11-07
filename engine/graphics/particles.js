// ============================================================
//  Частицы в 3D — маленькие кубики, которые рисует видеокарта С ГЛУБИНОЙ (стены их закрывают, в отличие от
//  эффектов, нарисованных плоским слоем интерфейса). Считает процессор (полёт, тяжесть, сопротивление,
//  угасание), видеокарте — один буфер экземпляров на кадр: центр, размер, цвет с прозрачностью.
//
//    const fx = new Particles();
//    fx.burst(at, { count: 12, color: [200, 30, 30], speed: 3, life: 0.6, size: 0.08, gravity: 9 }); // кровь
//    fx.line(from, to, { color, size: 0.03, life: 0.2 });                                          // трассер
//    fx.update(dt);  renderer.render({ ..., particles: fx })  // fx.data / fx.count — 8 чисел на частицу
//
//  Своя кисть: emit({ at, vel, life, size, color, alpha, gravity, drag, grow, glow }).
// ============================================================

export const FLOATS_PER_PARTICLE = 8; // x, y, z, size, r, g, b, a
const MAX = 6000; // больше одновременно не держим (старые уходят первыми)

export class Particles {
  constructor() {
    this.list = [];
    // «Постоянные» кубики поверх частиц (солнце, луна): { x, y, z, size, color: [r, g, b] 0…255+, alpha } —
    // игра ставит каждый кадр (sprites = [...]; pack()), не стареют
    this.sprites = [];
    this.data = new Float32Array(256 * FLOATS_PER_PARTICLE);
    this.count = 0;
  }

  get active() {
    return this.list.length > 0;
  }

  // Одна частица. color — 0..255; alpha 0..1 в начале (к концу жизни гаснет, если fade); grow — размер к концу ×
  emit({ at, vel = { x: 0, y: 0, z: 0 }, life = 0.5, size = 0.06, color = [255, 255, 255], alpha = 1, gravity = 0, drag = 0, grow = 1, fade = true, bounce = 0, ground = null }) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ x: at.x, y: at.y, z: at.z, vx: vel.x, vy: vel.y, vz: vel.z, life, age: 0, size, color, alpha, gravity, drag, grow, fade, bounce, ground });
  }

  // Брызги во все стороны (кровь, искры, щепки): count штук, скорость speed (±разброс), чуть вверх — up
  burst(at, { count = 10, speed = 3, spread = 0.5, up = 1, dir = null, ...rest } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() * 2 - 1) * 0.9;
      let vx = Math.cos(a) * Math.cos(e), vy = Math.sin(e) * 0.6 + up * 0.5, vz = Math.sin(a) * Math.cos(e);
      if (dir) { vx = vx * spread + dir.x; vy = vy * spread + dir.y; vz = vz * spread + dir.z; }
      const s = speed * (0.5 + Math.random() * 0.7);
      this.emit({ ...rest, at, vel: { x: vx * s, y: vy * s, z: vz * s }, life: (rest.life ?? 0.5) * (0.7 + Math.random() * 0.6) });
    }
  }

  // Линия из кубиков от from к to (через каждые step м): трассер, луч, кольцо по частям
  line(from, to, { step = 0.12, size = 0.04, life = 0.15, color = [255, 220, 120], alpha = 1, taper = true } = {}) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    const n = Math.max(1, Math.min(600, Math.ceil(len / step)));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      this.emit({ at: { x: from.x + dx * k, y: from.y + dy * k, z: from.z + dz * k }, life, size: taper ? size * (1 - k * 0.6) : size, color, alpha, grow: 0.6 });
    }
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.gravity * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.ground !== null && p.y < p.ground) { p.y = p.ground; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; }
      this.list[w++] = p;
    }
    this.list.length = w;
    this.pack();
  }

  // Данные для видеокарты: 8 чисел на частицу
  pack() {
    const need = (this.list.length + this.sprites.length) * FLOATS_PER_PARTICLE;
    if (this.data.length < need) this.data = new Float32Array(Math.ceil(need * 1.5));
    const d = this.data;
    let o = 0;
    for (const p of this.list) {
      const k = p.age / p.life;
      const a = p.fade ? p.alpha * (1 - k * k) : p.alpha;
      d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z;
      d[o + 3] = p.size * (1 + (p.grow - 1) * k);
      d[o + 4] = p.color[0] / 255; d[o + 5] = p.color[1] / 255; d[o + 6] = p.color[2] / 255; d[o + 7] = a;
      o += FLOATS_PER_PARTICLE;
    }
    for (const sp of this.sprites) {
      d[o] = sp.x; d[o + 1] = sp.y; d[o + 2] = sp.z; d[o + 3] = sp.size;
      d[o + 4] = sp.color[0] / 255; d[o + 5] = sp.color[1] / 255; d[o + 6] = sp.color[2] / 255; d[o + 7] = sp.alpha ?? 1;
      o += FLOATS_PER_PARTICLE;
    }
    this.count = this.list.length + this.sprites.length;
  }

  clear() {
    this.list.length = 0;
    this.count = 0;
  }
}

// Шейдер частиц — свой модуль (ошибка в нём не ломает остальное: рисовальщик тогда просто без частиц).
// Uniforms — та же раскладка, что в shaders.js
export const PARTICLE_SHADER = /* wgsl */ `
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

struct PIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) center: vec3f,
  @location(3) size: f32,
  @location(4) color: vec4f,
};

struct POut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn particle_vs(in: PIn) -> POut {
  let world = in.center + (in.pos - vec3f(0.5, 0.5, 0.5)) * in.size;
  var out: POut;
  out.pos = project(toView(world));
  let shade = 0.78 + 0.22 * max(dot(in.normal, vec3f(-0.42, 0.84, -0.34)), 0.0);
  out.color = vec4f(in.color.rgb * shade, in.color.a);
  return out;
}

@fragment
fn particle_fs(in: POut) -> @location(0) vec4f {
  let c = in.color.rgb * u.brightness;
  let lin = select(c, pow(c, vec3f(2.2, 2.2, 2.2)), u.srgb > 0.5);
  return vec4f(lin, in.color.a);
}
`;
