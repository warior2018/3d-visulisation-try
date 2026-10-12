// ============================================================
//  Шейдеры — маленькие программы, которые выполняет ВИДЕОКАРТА.
//  Язык — WGSL (язык шейдеров WebGPU, похож на Rust/C).
//  Вершинный шейдер — для каждой вершины, пиксельный (fragment) — для каждого пикселя.
//
//  Что рисуем за кадр, по порядку:
//   1. небо/землю/сетку — один треугольник на весь экран, всё решает пиксельный шейдер;
//   2. кубики — один кубик в памяти, повторённый для каждого блока мира (инстансинг);
//   3. «призрак» — полупрозрачный кубик там, куда встанет новый блок;
//   4. интерфейс — картинка, нарисованная процессором, поверх всего.
// ============================================================

export const SHADERS = /* wgsl */ `

// Данные от JS, одинаковые для всего кадра (uniform).
// Порядок и размеры полей должны совпадать с тем, как их пишет gpu-renderer.js.
struct Uniforms {
  camPos: vec3f,      // позиция камеры
  yaw: f32,           // поворот влево/вправо
  pitch: f32,         // наклон вверх/вниз
  tanHalfFov: f32,    // tan(fov / 2)
  aspect: f32,        // ширина / высота
  fadeDist: f32,      // где сетка и дальние кубики тают в дымке
  gridStep: f32,      // размер клетки (метры)
  srgb: f32,          // 1 — окно ждёт «линейные» цвета (формат *-srgb)
  near: f32,          // ближняя граница видимости
  far: f32,           // дальняя граница видимости
  brightness: f32,    // яркость из настроек: 1 — как есть, 0.5 — темнее, 1.5 — светлее
  roll: f32,          // крен камеры (наклон головы вбок), > 0 — голова вправо
  _pad1: f32,
  _pad2: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const SKY_TOP      = vec3f( 27.0,  42.0,  74.0) / 255.0;
const SKY_HORIZON  = vec3f(109.0, 139.0, 184.0) / 255.0;
const GROUND_FAR   = vec3f( 52.0,  58.0,  70.0) / 255.0;
const GROUND_NEAR  = vec3f( 34.0,  38.0,  46.0) / 255.0;
const HORIZON_LINE = vec3f(190.0, 205.0, 230.0) / 255.0;
const GRID         = vec3f(160.0, 175.0, 200.0) / 255.0;
const LIGHT_DIR    = vec3f(-0.42, 0.84, -0.34);   // откуда светит «солнце» (длина ≈ 1)

// Если окно ждёт «линейные» цвета — переводим, иначе всё выглядело бы выцветшим
fn toOutput(c: vec3f) -> vec3f {
  return select(c, pow(c, vec3f(2.2)), u.srgb > 0.5);
}

// Мир -> координаты камеры (как Camera.toView в JS)
fn toView(p: vec3f) -> vec3f {
  let d = p - u.camPos;
  let cy = cos(u.yaw);
  let sy = sin(u.yaw);
  let x1 = d.x * cy - d.z * sy;
  let z1 = d.x * sy + d.z * cy;
  let cp = cos(u.pitch);
  let sp = sin(u.pitch);
  let y2 = d.y * cp - z1 * sp;
  // Крен: голова наклонена вправо — мир на экране поворачивается против часовой
  let cr = cos(u.roll);
  let sr = sin(u.roll);
  return vec3f(x1 * cr - y2 * sr, x1 * sr + y2 * cr, d.y * sp + z1 * cp);
}

// Координаты камеры -> экран. Видеокарта сама поделит на w, поэтому кладём в w глубину:
// это наша формула x / z. В z — глубина от 0 (near) до 1 (far) для z-буфера.
fn project(v: vec3f) -> vec4f {
  let f = 1.0 / u.tanHalfFov;
  let a = u.far / (u.far - u.near);
  let b = -u.far * u.near / (u.far - u.near);
  return vec4f(v.x * f / u.aspect, v.y * f, a * v.z + b, v.z);
}

// Дымка: дальние вещи сливаются с цветом у горизонта
fn haze(color: vec3f, worldXZ: vec2f) -> vec3f {
  let dist = length(worldXZ - u.camPos.xz);
  return mix(color, GROUND_FAR, smoothstep(u.fadeDist * 0.5, u.fadeDist * 1.1, dist));
}

// ---------- 1. Небо, земля, сетка, горизонт ----------

struct ScreenOut {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,   // где на экране этот пиксель: от -1 до 1
};

// Три вершины так, что треугольник с запасом накрывает весь экран
@vertex
fn screen_vs(@builtin(vertex_index) i: u32) -> ScreenOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: ScreenOut;
  out.pos = vec4f(corners[i], 0.0, 1.0);
  out.ndc = corners[i];
  return out;
}

@fragment
fn sky_fs(in: ScreenOut) -> @location(0) vec4f {
  // Луч через этот пиксель: проекция наоборот, потом поворот камеры наоборот
  let v0 = vec3f(in.ndc.x * u.tanHalfFov * u.aspect, in.ndc.y * u.tanHalfFov, 1.0);
  // Крен наоборот (сначала убираем наклон головы)
  let cr = cos(u.roll);
  let sr = sin(u.roll);
  let v = vec3f(v0.x * cr + v0.y * sr, -v0.x * sr + v0.y * cr, 1.0);
  let cp = cos(u.pitch);
  let sp = sin(u.pitch);
  let dy = v.y * cp + v.z * sp;
  let z1 = -v.y * sp + v.z * cp;
  let cy = cos(u.yaw);
  let sy = sin(u.yaw);
  let dir = normalize(vec3f(cy * v.x + sy * z1, dy, -sy * v.x + cy * z1));

  // Луч вверх — небо, вниз — земля
  let sky = mix(SKY_HORIZON, SKY_TOP, smoothstep(0.0, 0.5, dir.y));
  let ground = mix(GROUND_FAR, GROUND_NEAR, smoothstep(0.0, 0.5, -dir.y));
  let isGround = dir.y < 0.0;
  var color = select(sky, ground, isGround);

  // Сетка: где луч встречает пол, и попадает ли эта точка на линию клетки
  let t = u.camPos.y / max(-dir.y, 0.0001);
  let hit = (u.camPos.xz + dir.xz * t) / u.gridStep;
  let perPixel = fwidth(hit);
  let toLine = abs(fract(hit - 0.5) - 0.5) / perPixel;
  let onLine = 1.0 - min(min(toLine.x, toLine.y), 1.0);
  let dist = t * length(dir.xz);
  let fade = (1.0 - smoothstep(u.fadeDist * 0.4, u.fadeDist, dist))
           * (1.0 - smoothstep(0.15, 0.6, max(perPixel.x, perPixel.y)));
  color = mix(color, GRID, select(0.0, onLine * 0.35 * fade, isGround));

  // Линия горизонта ~1.5 пикселя
  let line = 1.0 - smoothstep(0.0, fwidth(dir.y) * 1.5, abs(dir.y));
  color = mix(color, HORIZON_LINE, line * 0.6);

  return vec4f(toOutput(color * u.brightness), 1.0);
}

// ---------- 2–3. Кубики и «призрак» ----------

struct CubeIn {
  @location(0) pos: vec3f,      // вершина кубика 1×1×1, от 0 до 1 — одна на всех
  @location(1) normal: vec3f,   // куда смотрит грань
  @location(2) offset: vec3f,   // где стоит ЭТОТ блок (своё у каждого экземпляра)
  @location(3) color: vec3f,    // его цвет (0–1)
};

struct CubeOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) worldXZ: vec2f,
};

@vertex
fn cube_vs(in: CubeIn) -> CubeOut {
  let world = in.pos + in.offset;
  var out: CubeOut;
  out.pos = project(toView(world));
  out.local = in.pos;
  out.normal = in.normal;
  out.color = in.color;
  out.worldXZ = world.xz;
  return out;
}

// Насколько точка грани близка к ребру кубика: 0 — середина грани, 1 — ребро.
// На грани одна из координат равна 0 или 1; если ещё одна близка к краю — это ребро.
fn edgeness(local: vec3f) -> f32 {
  let q = abs(local - 0.5) * 2.0;
  let second = q.x + q.y + q.z - max(q.x, max(q.y, q.z)) - min(q.x, min(q.y, q.z));
  return smoothstep(0.88, 0.95, second);
}

@fragment
fn cube_fs(in: CubeOut) -> @location(0) vec4f {
  // Простое освещение: чем прямее свет падает на грань, тем она ярче
  let light = 0.45 + 0.55 * max(dot(in.normal, LIGHT_DIR), 0.0);
  var color = in.color * light;
  color = color * (1.0 - 0.35 * edgeness(in.local));   // тёмные рёбра — блоки не сливаются
  color = haze(color, in.worldXZ);
  return vec4f(toOutput(color * u.brightness), 1.0);
}

@fragment
fn ghost_fs(in: CubeOut) -> @location(0) vec4f {
  // «Призрак»: полупрозрачная заливка и яркие рёбра
  let e = edgeness(in.local);
  let color = mix(in.color, vec3f(1.0), e * 0.8);
  return vec4f(toOutput(color * u.brightness), mix(0.3, 0.9, e));
}

// ---------- Модели со скелетом (персонажи) ----------
// Скиннинг: каждая вершина привязана к 1–4 костям с весами. Её итоговая матрица —
// смесь матриц этих костей по весам. Матрицы костей каждый кадр считает аниматор (JS).

struct Skin {
  model: mat4x4f,                  // где стоит персонаж и куда повёрнут
  tint: vec4f,                     // оттенок поверх цвета: rgb + сила (a), 0 — без оттенка
  joints: array<mat4x4f, 64>,      // матрицы костей (до 64 костей)
};
@group(0) @binding(3) var<uniform> skin: Skin;

struct SkinIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) joints: vec4<u32>,  // номера костей вершины
  @location(4) weights: vec4f,     // насколько каждая кость влияет (в сумме 1)
};

struct SkinOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
  @location(2) worldXZ: vec2f,
};

@vertex
fn skin_vs(in: SkinIn) -> SkinOut {
  let bones = skin.joints[in.joints.x] * in.weights.x
            + skin.joints[in.joints.y] * in.weights.y
            + skin.joints[in.joints.z] * in.weights.z
            + skin.joints[in.joints.w] * in.weights.w;
  let m = skin.model * bones;
  let world = (m * vec4f(in.pos, 1.0)).xyz;
  var out: SkinOut;
  out.pos = project(toView(world));
  out.normal = (m * vec4f(in.normal, 0.0)).xyz;
  out.color = in.color;
  out.worldXZ = world.xz;
  return out;
}

@fragment
fn skin_fs(in: SkinOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  let light = 0.45 + 0.55 * max(dot(n, LIGHT_DIR), 0.0);
  let lit = mix(in.color * light, skin.tint.rgb, skin.tint.a);
  let color = haze(lit, in.worldXZ);
  return vec4f(toOutput(color * u.brightness), 1.0);
}

// ---------- 4. Интерфейс поверх всего ----------

@group(0) @binding(1) var uiSampler: sampler;
@group(0) @binding(2) var uiTexture: texture_2d<f32>;

@fragment
fn ui_fs(in: ScreenOut) -> @location(0) vec4f {
  // Экран (-1..1, y вверх) -> картинка интерфейса (0..1, y вниз: строка 0 — верх)
  let uv = vec2f(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let c = textureSample(uiTexture, uiSampler, uv);
  return vec4f(toOutput(c.rgb), c.a);
}

// ---------- 5. Размытие вокруг круга (оптика прицела) ----------
// Мир сначала нарисован в отдельную картинку (sceneTex). Здесь переносим её на экран:
// внутри круга — как есть, снаружи — среднее из 48 соседних точек по диску (размыто),
// между ними — плавный переход шириной feather.
struct Blur {
  center: vec2f,  // центр круга, доли экрана (0.5, 0.5 — середина)
  radius: f32,    // радиус круга, пиксели
  feather: f32,   // ширина перехода, пиксели
  size: vec2f,    // размер экрана, пиксели
  strength: f32,  // радиус размытия, пиксели
  dim: f32,       // насколько затемнить размытое (0 — нет, 0.3 — на 30 %)
};
@group(0) @binding(3) var<uniform> blur: Blur;
@group(0) @binding(4) var sceneSampler: sampler;
@group(0) @binding(5) var sceneTex: texture_2d<f32>;

@fragment
fn blur_fs(in: ScreenOut) -> @location(0) vec4f {
  let uv = vec2f(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let sharp = textureSampleLevel(sceneTex, sceneSampler, uv, 0.0).rgb;
  let d = distance(uv * blur.size, blur.center * blur.size);
  let k = smoothstep(blur.radius - blur.feather, blur.radius + blur.feather, d); // 0 — внутри
  if (k <= 0.0) {
    return vec4f(sharp, 1.0);
  }
  // Точки по диску «золотым углом» — ровно заполняют круг без узоров
  var acc = vec3f(0.0);
  let n = 48;
  for (var i = 0; i < n; i++) {
    let r = sqrt((f32(i) + 0.5) / f32(n)) * blur.strength;
    let a = f32(i) * 2.39996;
    let off = vec2f(cos(a), sin(a)) * r / blur.size;
    acc += textureSampleLevel(sceneTex, sceneSampler, uv + off, 0.0).rgb;
  }
  let soft = acc / f32(n) * (1.0 - blur.dim);
  return vec4f(mix(sharp, soft, k), 1.0);
}
`;
