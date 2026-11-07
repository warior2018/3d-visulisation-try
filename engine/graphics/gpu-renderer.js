// ============================================================
//  Рендерер на видеокарте (WebGPU через @kmamal/gpu).
//  На Маке WebGPU работает поверх Metal — родной графики Apple.
//  JS готовит данные и говорит видеокарте «рисуй»,
//  а пиксели считают шейдеры (см. shaders.js) — параллельно.
// ============================================================

import gpu from "@kmamal/gpu";
import { SHADERS } from "./shaders.js";
import { worldFxShader } from "./world-fx.js";

const DEPTH_FORMAT = "depth24plus";
import { PARTICLE_SHADER, FLOATS_PER_PARTICLE } from "./particles.js";
import { FLOATS_PER_CUBE, exposedFaces, facesFacing, viewOf, chunkInView } from "./chunk-mesh.js"; // x, y, z, r, g, b на кубик
const MAX_JOINTS = 64; //     столько костей помещается в шейдер (array<mat4x4f, 64>)
// Буфер одного существа: матрица модели (64 байта) + оттенок vec4 (16) + матрицы костей
const SKIN_BYTES = 64 + 16 + MAX_JOINTS * 64;
const NO_TINT = new Float32Array([0, 0, 0, 0]);

export class GPURenderer {
  // Подключение к видеокарте асинхронное (её надо «найти» и «открыть»),
  // поэтому вместо new GPURenderer(...) используем await GPURenderer.create(...)
  // Флаги видеокарты (Dawn): options.gpuFlags или переменная окружения VOID_GPU_FLAGS через запятую.
  // Например VOID_GPU_FLAGS=backend=vulkan — рисовать через Vulkan, а не D3D12 (если на Windows D3D12 падает);
  // backend: d3d12 | d3d11 | vulkan | metal | opengl | opengles.
  static async create(window, options = {}) {
    const flags = options.gpuFlags ?? (process.env.VOID_GPU_FLAGS ? process.env.VOID_GPU_FLAGS.split(",").filter(Boolean) : []);
    const instance = gpu.create(flags);
    const adapter = await instance.requestAdapter(); // какая видеокарта есть
    if (!adapter) throw new Error(`Видеокарта с поддержкой WebGPU не найдена${flags.length ? ` (флаги: ${flags.join(", ")})` : ""}`);
    const device = await adapter.requestDevice(); // открыть её для работы
    const renderer = new GPURenderer(window, instance, device, options);
    // Что за видеокарта — для журнала (по нему разбираем падения на чужих компьютерах)
    const info = adapter.info || {};
    renderer.adapterName = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" / ") || "?";
    renderer.gpuFlags = flags;
    await renderer.initParticles(); // частицы с глубиной — если шейдер не собрался, без них (эффекты — плоские)
    await renderer.initWorldFx(); //   небо с солнцем, луной и облаками, свет ламп — не собралось: как раньше
    return renderer;
  }

  constructor(window, instance, device, { gridStep = 1, fadeDist = 60, near = 0.05, far = 300, vsync = true, brightness = 1 } = {}) {
    this.window = window;
    this.instance = instance;
    this.device = device;
    this.gridStep = gridStep;
    this.fadeDist = fadeDist;
    this.near = near;
    this.far = far;
    this.brightness = brightness;

    // Связываем видеокарту с окном: всё нарисованное попадёт в него
    this.setVsync(vsync);
    const format = this.output.getPreferredFormat();
    this.srgb = format.endsWith("-srgb"); // такой формат ждёт «линейные» цвета

    // Uniform-буфер: 16 чисел (64 байта), раскладку описывает struct Uniforms в шейдере
    this.uniformData = new Float32Array(36); // 16 основных + небо (world-fx.js): солнце, день, время, облака, яркость + камера карты теней
    this.uniformBuffer = device.createBuffer({
      size: this.uniformData.byteLength,
      usage: gpu.GPUBufferUsage.UNIFORM | gpu.GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({ code: SHADERS });
    const alphaBlend = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    // Буфер глубины: для каждого пикселя помним, насколько далеко то, что там уже нарисовано.
    // Ближнее закрывает дальнее — независимо от порядка рисования.
    const depth = (write, compare) => ({ format: DEPTH_FORMAT, depthWriteEnabled: write, depthCompare: compare });

    // Описание данных кубика: буфер 0 — вершины (общие), буфер 1 — экземпляры (свои у каждого блока)
    const cubeBuffers = [
      {
        arrayStride: 6 * 4,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" }, // позиция вершины
          { shaderLocation: 1, offset: 12, format: "float32x3" }, // нормаль грани
        ],
      },
      {
        arrayStride: FLOATS_PER_CUBE * 4,
        stepMode: "instance", // берём следующие данные не на каждую вершину, а на каждый кубик
        attributes: [
          { shaderLocation: 2, offset: 0, format: "float32x3" }, // где стоит блок
          { shaderLocation: 3, offset: 12, format: "float32x3" }, // его цвет
        ],
      },
    ];

    // «Конвейеры»: какие шейдеры, что рисуем и как смешиваем цвета
    this.skyPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "screen_vs" },
      fragment: { module, entryPoint: "sky_fs", targets: [{ format }] },
      depthStencil: depth(false, "always"), // фон: глубину не пишет
    });
    this.cubePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "cube_vs", buffers: cubeBuffers },
      fragment: { module, entryPoint: "cube_fs", targets: [{ format }] },
      depthStencil: depth(true, "less"),
    });
    this.ghostPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "cube_vs", buffers: cubeBuffers },
      fragment: { module, entryPoint: "ghost_fs", targets: [{ format, blend: alphaBlend }] },
      depthStencil: depth(false, "less"), // прозрачный: другие блоки его закрывают, но сам он никого не прячет
    });
    // Персонажи со скелетом: пять отдельных буферов вершин — позиция, нормаль, цвет, кости, веса
    this.skinPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "skin_vs",
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x3" }] },
          { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }] },
          { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: "float32x4" }] },
        ],
      },
      fragment: { module, entryPoint: "skin_fs", targets: [{ format }] },
      depthStencil: depth(true, "less"),
    });
    this.uiPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "screen_vs" },
      fragment: { module, entryPoint: "ui_fs", targets: [{ format, blend: alphaBlend }] },
      depthStencil: depth(false, "always"), // интерфейс поверх всего
    });

    const uniformEntry = { binding: 0, resource: { buffer: this.uniformBuffer } };
    this.skyBind = device.createBindGroup({ layout: this.skyPipeline.getBindGroupLayout(0), entries: [uniformEntry] });
    this.cubeBind = device.createBindGroup({ layout: this.cubePipeline.getBindGroupLayout(0), entries: [uniformEntry] });
    this.ghostBind = device.createBindGroup({ layout: this.ghostPipeline.getBindGroupLayout(0), entries: [uniformEntry] });
    this.uiSampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest" }); // пиксели шрифта чёткие

    // Размытие (оптика прицела): мир рисуется в отдельную картинку, потом blur_fs переносит её на экран
    this.format = format;
    this.blurPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "screen_vs" },
      fragment: { module, entryPoint: "blur_fs", targets: [{ format }] },
      depthStencil: depth(false, "always"),
    });
    this.blurData = new Float32Array(8);
    this.blurBuffer = device.createBuffer({ size: 32, usage: gpu.GPUBufferUsage.UNIFORM | gpu.GPUBufferUsage.COPY_DST });
    this.sceneSampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });

    // Один кубик 1×1×1: 6 граней × 2 треугольника × 3 вершины = 36 вершин
    const cubeMesh = buildCubeMesh();
    this.cubeVertexBuffer = this.createBuffer(cubeMesh, gpu.GPUBufferUsage.VERTEX);
    this.cubeVertexCount = cubeMesh.length / 6;

    // Кубики мира — по чанкам (engine/world/voxel-world.js): у каждого куска свой буфер на видеокарте.
    // Поставили блок — пересобираем только его кусок; рисуем только куски в кадре (chunk-mesh.js)
    this.chunkMeshes = new Map(); // Chunk -> { chunk, version, buffer, capacity, count }
    this.chunkScratch = null; //    общий черновик данных куска (не создаём новый на каждую пересборку)
    this.worldVersion = -1;
    this.cullView = {}; //          направление взгляда для отсечения (раз в кадр, без мусора)
    this.worldStats = { chunks: 0, drawn: 0, cubes: 0, rebuilt: 0 }; // тех. панели: кусков всего / в кадре, кубиков в кадре
    this.ghostData = new Float32Array(FLOATS_PER_CUBE);
    this.lighting = true; // освещение кубиков (chunk-mesh.js lightOf): небо, тень под крышей, углы
    // Небо и солнце (world-fx.js; setSky): направление на солнце, день 0…1, облака, яркость из настроек
    this.sky = { sun: [-0.42, 0.84, -0.34], day: 1, clouds: 1, base: 1 };
    // Тени (настройка графики SHADOWS): "real" — карта теней на видеокарте (world-fx.js; не собралась — как
    // "simple"), "simple" — запечённые в кубики (chunk-mesh.js inShadow), "off" — без теней
    this.shadowMode = "real";
    this.shadowSize = 2048; // карта теней: точек по стороне
    this.shadowRadius = 72; // м вокруг камеры, где тени настоящие (дальше — без теней)
    this.shadowKey = null; // солнце, для которого запечены тени (шагами — см. setSky)
    this.rebake = []; //     куски, которые ещё перезапечь под новое солнце (по несколько за кадр)

    this.ghostBuffer = device.createBuffer({
      size: FLOATS_PER_CUBE * 4,
      usage: gpu.GPUBufferUsage.VERTEX | gpu.GPUBufferUsage.COPY_DST,
    });

    this.resize();
  }

  // Вертикальная синхронизация — это режим вывода кадров в окно:
  //   "fifo" — кадры встают в очередь и показываются строго в такт экрану (vsync вкл);
  //   "immediate" — кадр показывается сразу, как готов (vsync выкл, FPS не ограничен).
  // Чтобы сменить режим, заново связываем видеокарту с окном.
  setVsync(on) {
    this.vsync = on;
    this.output = gpu.renderGPUDeviceToWindow({ device: this.device, window: this.window, presentMode: on ? "fifo" : "immediate" });
  }

  createBuffer(data, usage) {
    const buffer = this.device.createBuffer({ size: data.byteLength, usage: usage | gpu.GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  // Загрузить модель (из engine/gltf.js) в память видеокарты — ОДИН раз на модель.
  // Десять скелетов используют одну и ту же сетку, у каждого — только свои матрицы.
  createMesh(model) {
    const V = gpu.GPUBufferUsage.VERTEX;
    if (model.skin.joints.length > MAX_JOINTS) throw new Error(`Слишком много костей: ${model.skin.joints.length} > ${MAX_JOINTS}`);
    // Индексы для видеокарты — только uint16 или uint32
    const indices = model.indices instanceof Uint32Array ? model.indices : Uint16Array.from(model.indices);
    return {
      buffers: [
        this.createBuffer(model.positions, V),
        this.createBuffer(model.normals, V),
        this.createBuffer(model.colors, V),
        this.createBuffer(model.joints, V),
        this.createBuffer(model.weights, V),
      ],
      indexBuffer: this.createBuffer(padTo4(indices), gpu.GPUBufferUsage.INDEX),
      indexFormat: indices instanceof Uint32Array ? "uint32" : "uint16",
      indexCount: indices.length,
    };
  }

  // «Экземпляр» модели для одного существа: свой маленький буфер с его матрицами.
  // Общий буфер на всех нельзя: все команды кадра выполняются потом разом,
  // и все существа увидели бы матрицы последнего.
  createSkin(mesh) {
    const uniformBuffer = this.device.createBuffer({
      size: SKIN_BYTES,
      usage: gpu.GPUBufferUsage.UNIFORM | gpu.GPUBufferUsage.COPY_DST,
    });
    return {
      mesh,
      uniformBuffer,
      bindGroup: this.device.createBindGroup({
        layout: this.skinPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 3, resource: { buffer: uniformBuffer } },
        ],
      }),
    };
  }

  // Окно поменяло размер: новая картинка вывода и новый буфер глубины того же размера.
  // Запоминаем, под какой размер всё настроено, — render() сам заметит, если окно стало другим.
  resize() {
    this.width = this.window.pixelWidth;
    this.height = this.window.pixelHeight;
    this.output.resize();
    if (this.depthTexture) this.retire(this.depthTexture);
    this.depthTexture = this.device.createTexture({
      size: [this.width, this.height],
      format: DEPTH_FORMAT,
      usage: gpu.GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  // Мир поменялся: пересобрать изменившиеся чанки (у чанка своя version). Другой мир — забыть всё старое
  updateWorld(world) {
    if (world !== this.worldShown) {
      for (const m of this.chunkMeshes.values()) if (m.buffer) this.retire(m.buffer);
      this.chunkMeshes.clear();
      this.worldShown = world;
      this.worldVersion = -1;
    }
    // тени: солнце сдвинулось — перезапекаем по несколько кусков за кадр (иначе — рывок)
    this.updateShadows(world);
    if (this.rebake.length) {
      for (const m of this.rebake.splice(0, 6)) m.version = -1;
      this.worldVersion = -1;
    }
    if (world.version === this.worldVersion) return;
    this.worldVersion = world.version;
    let rebuilt = 0;
    for (const c of world.chunks.values()) {
      const m = this.chunkMeshes.get(c);
      if (m && m.version === c.version) continue;
      this.buildChunk(world, c, m);
      rebuilt++;
    }
    // куски, которых в мире больше нет (мир очищали: clear) — освободить
    if (this.chunkMeshes.size > world.chunks.size) {
      for (const [c, m] of this.chunkMeshes) {
        if (world.chunks.get(c.key) === c) continue;
        if (m.buffer) this.retire(m.buffer);
        this.chunkMeshes.delete(c);
      }
    }
    this.worldStats.chunks = this.chunkMeshes.size;
    this.worldStats.rebuilt += rebuilt;
  }

  // Конвейер частиц (engine/graphics/particles.js): свой шейдер в своём модуле, под «ловушкой ошибок» —
  // не собрался (старая видеокарта, ошибка в шейдере) — this.particlePipeline = null, игра рисует эффекты плоско
  async initParticles() {
    const device = this.device;
    try {
      device.pushErrorScope?.("validation");
      const module = device.createShaderModule({ code: PARTICLE_SHADER });
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module, entryPoint: "particle_vs",
          buffers: [
            { arrayStride: 6 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] },
            {
              arrayStride: FLOATS_PER_PARTICLE * 4, stepMode: "instance",
              attributes: [
                { shaderLocation: 2, offset: 0, format: "float32x3" },
                { shaderLocation: 3, offset: 12, format: "float32" },
                { shaderLocation: 4, offset: 16, format: "float32x4" },
              ],
            },
          ],
        },
        fragment: {
          module, entryPoint: "particle_fs",
          targets: [{ format: this.output.getPreferredFormat(), blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          } }],
        },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less" }, // стены закрывают, сами — нет
      });
      const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }] });
      const err = device.popErrorScope ? await device.popErrorScope() : null;
      if (err) throw new Error(err.message || String(err));
      this.particlePipeline = pipeline;
      this.particleBind = bind;
      this.particleCapacity = 0;
    } catch (e) {
      this.particlePipeline = null;
      this.particleError = e.message;
      console.warn("Частицы в 3D недоступны:", e.message);
    }
  }

  // Карта теней этого кадра. Камера — далеко в сторону солнца (sun × D), смотрит на героя, узкий угол: лучи
  // почти параллельны, квадрат 2R × 2R вокруг героя. Центр сдвигается шагами в точку карты — тени не «дрожат»
  renderShadowMap(encoder, camera, world, characters) {
    const [sx, sy, sz] = this.sky.sun;
    if (sy < 0.08) return; // солнце у горизонта или ночь — без настоящих теней
    const R = Math.min(this.shadowRadius, this.viewDistance), D = 1500;
    const pitch = Math.asin(-sy), yaw = Math.atan2(-sx, -sz);
    const cy = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const right = [cy, 0, -syw], up = [-syw * sp, cp, -cy * sp];
    const c = camera.position, texel = (2 * R) / this.shadowSize;
    const pr = c.x * right[0] + c.z * right[2], pu = c.x * up[0] + c.y * up[1] + c.z * up[2];
    const dr = Math.round(pr / texel) * texel - pr, du = Math.round(pu / texel) * texel - pu;
    const cx = c.x + right[0] * dr + up[0] * du, cyy = c.y + up[1] * du, cz = c.z + right[2] * dr + up[2] * du;
    const pos = [cx + sx * D, cyy + sy * D, cz + sz * D];
    const tan = R / D, near = D - 250, far = D + 250;
    // своя «камера» в раскладке основных Uniforms (cube_vs / skin_vs читают только её)
    const s = this.shadowData;
    s[0] = pos[0]; s[1] = pos[1]; s[2] = pos[2]; s[3] = yaw; s[4] = pitch; s[5] = tan; s[6] = 1;
    s[7] = this.fadeDist; s[8] = 1; s[9] = 0; s[10] = near; s[11] = far; s[12] = 1; s[13] = 0; s[14] = 0; s[15] = 0;
    this.device.queue.writeBuffer(this.shadowUniform, 0, s);
    const d = this.uniformData;
    d[24] = pos[0]; d[25] = pos[1]; d[26] = pos[2]; d[27] = yaw; d[28] = pitch; d[29] = tan; d[30] = near; d[31] = far;
    d[32] = 1; d[33] = 1 / this.shadowSize;
    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    // куски мира вокруг (все грани: тень отбрасывает и то, что к солнцу спиной)
    pass.setPipeline(this.shadowCube);
    pass.setBindGroup(0, this.shadowCubeBind);
    pass.setVertexBuffer(0, this.cubeVertexBuffer);
    const reach = R + 24; // + кусок: высокое (дерево, гора) за краем тоже бросает тень внутрь
    for (const m of this.chunkMeshes.values()) {
      if (!m.count || m.chunk.maxY < m.chunk.minY) continue;
      const mx = m.chunk.cx * 16 + 8 - cx, mz = m.chunk.cz * 16 + 8 - cz;
      if (Math.abs(mx) > reach || Math.abs(mz) > reach) continue;
      pass.setVertexBuffer(1, m.buffer);
      for (let f = 0; f < 6; f++) if (m.counts[f]) pass.draw(6, m.counts[f], f * 6, m.starts[f]);
    }
    // существа (мобы, герой) — только те, что рисуются в этом кадре (их матрицы уже свежие)
    pass.setPipeline(this.shadowSkin);
    const max2 = Math.min(R, this.viewDistance) ** 2;
    for (const ch of characters || []) {
      const mm = ch.modelMatrix, ex = mm[12] - c.x, ez = mm[14] - c.z;
      if (ex * ex + ez * ez > max2) continue;
      const skin = ch.skin;
      skin.shadowBind ||= this.device.createBindGroup({ layout: this.skinLayout, entries: [
        { binding: 0, resource: { buffer: this.shadowUniform } }, { binding: 3, resource: { buffer: skin.uniformBuffer } },
      ] });
      pass.setBindGroup(0, skin.shadowBind);
      skin.mesh.buffers.forEach((b, i) => pass.setVertexBuffer(i, b));
      pass.setIndexBuffer(skin.mesh.indexBuffer, skin.mesh.indexFormat);
      pass.drawIndexed(skin.mesh.indexCount);
    }
    pass.end();
  }

  // Дальность прорисовки (м по горизонтали): куски мира дальше — не рисуем, существа — тоже. Одна на всё:
  // fadeDist × 1.15 — там дымка уже полная (haze), за этим ничего не видно
  get viewDistance() {
    return this.fadeDist * 1.15;
  }

  // Небо и свет мира «посложнее» (world-fx.js): свой модуль под ловушкой ошибок. Не собрался — как раньше
  async initWorldFx() {
    const device = this.device;
    const code = worldFxShader();
    if (!code) return;
    let scoped = false;
    try {
      device.pushErrorScope?.("validation");
      scoped = !!device.pushErrorScope;
      const module = device.createShaderModule({ code });
      const format = this.format || this.output.getPreferredFormat();
      const depth = (write, compare) => ({ format: DEPTH_FORMAT, depthWriteEnabled: write, depthCompare: compare });
      const sky = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "screen_vs" },
        fragment: { module, entryPoint: "sky_fx_fs", targets: [{ format }] },
        depthStencil: depth(false, "always"),
      });
      const cube = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module, entryPoint: "cube_fx_vs",
          buffers: [
            { arrayStride: 6 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] },
            {
              arrayStride: FLOATS_PER_CUBE * 4, stepMode: "instance",
              attributes: [
                { shaderLocation: 2, offset: 0, format: "float32x3" },
                { shaderLocation: 3, offset: 12, format: "float32x3" },
                { shaderLocation: 4, offset: 24, format: "float32" }, // glow — свет ламп
              ],
            },
          ],
        },
        fragment: { module, entryPoint: "cube_fx_fs", targets: [{ format }] },
        depthStencil: depth(true, "less"),
      });
      const entry = [{ binding: 0, resource: { buffer: this.uniformBuffer } }];
      const skyBind = device.createBindGroup({ layout: sky.getBindGroupLayout(0), entries: entry });
      // Карта теней: глубина мира глазами «солнечной» камеры. Рисуют её основные cube_vs / skin_vs (без
      // пиксельного шейдера — только глубина) со своим uniform-буфером: та же раскладка, другая камера
      const shadowTex = device.createTexture({ size: [this.shadowSize, this.shadowSize], format: "depth32float", usage: gpu.GPUTextureUsage.RENDER_ATTACHMENT | gpu.GPUTextureUsage.TEXTURE_BINDING });
      const shadowView = shadowTex.createView();
      const shadowSampler = device.createSampler({ compare: "less-equal", magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
      const shadowUniform = device.createBuffer({ size: 64, usage: gpu.GPUBufferUsage.UNIFORM | gpu.GPUBufferUsage.COPY_DST });
      const baseModule = device.createShaderModule({ code: SHADERS });
      const depthOnly = { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" };
      const shadowCube = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: baseModule, entryPoint: "cube_vs",
          buffers: [
            { arrayStride: 6 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }] },
            { arrayStride: FLOATS_PER_CUBE * 4, stepMode: "instance", attributes: [{ shaderLocation: 2, offset: 0, format: "float32x3" }, { shaderLocation: 3, offset: 12, format: "float32x3" }] },
          ],
        },
        depthStencil: depthOnly,
      });
      const skinLayout = this.skinPipeline.getBindGroupLayout(0);
      const shadowSkin = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [skinLayout] }), // те же группы, что у персонажей
        vertex: {
          module: baseModule, entryPoint: "skin_vs",
          buffers: [
            { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
            { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
            { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x3" }] },
            { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: "uint16x4" }] },
            { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: "float32x4" }] },
          ],
        },
        depthStencil: depthOnly,
      });
      const shadowCubeBind = device.createBindGroup({ layout: shadowCube.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: shadowUniform } }] });
      const cubeBind = device.createBindGroup({ layout: cube.getBindGroupLayout(0), entries: [
        ...entry, { binding: 1, resource: shadowView }, { binding: 2, resource: shadowSampler },
      ] });
      Object.assign(this, { shadowTex, shadowView, shadowUniform, shadowCube, shadowSkin, shadowCubeBind, skinLayout });
      this.shadowData = new Float32Array(16);
      scoped = false;
      const err = device.popErrorScope ? await device.popErrorScope() : null;
      if (err) throw new Error(err.message || String(err));
      Object.assign(this, { skyFxPipeline: sky, skyFxBind: skyBind, cubeFxPipeline: cube, cubeFxBind: cubeBind });
      this.worldFx = true;
      this.realShadows = true; // карта теней собралась
    } catch (e) {
      if (scoped) try { await device.popErrorScope(); } catch {} // ловушку ошибок — убрать (иначе поймает чужие)
      this.worldFx = false;
      this.realShadows = false;
      this.worldFxError = e.message;
      console.warn("Небо с солнцем и свет ламп недоступны (рисуем как раньше):", e.message);
    }
  }

  // Небо и солнце (зовёт игра каждый кадр): sun — направление на солнце [x, y, z] (длина 1), day — 0 ночь … 1 день,
  // base — яркость из настроек, clouds — 0…1. Солнце сдвинулось на шаг (≈ 4°) — тени перезапекаются понемногу
  setSky({ sun, day, base, clouds } = {}) {
    const s = this.sky;
    if (sun) s.sun = sun;
    if (day !== undefined) s.day = day;
    if (base !== undefined) s.base = base;
    if (clouds !== undefined) s.clouds = clouds;
  }

  // Тени под это солнце: ключ — направление шагами; поменялся — все куски в очередь на перезапекание
  updateShadows(world) {
    const [x, y, z] = this.sky.sun;
    const realOk = this.realShadows && this.worldFx && this.fxEnabled !== false; // настоящие тени рисуются
    const on = (this.shadowMode === "simple" || (this.shadowMode === "real" && !realOk)) && this.lighting && y > 0.12;
    const step = 0.07;
    const key = on ? `${Math.round(x / step)},${Math.round(y / step)},${Math.round(z / step)}` : "off";
    if (key === this.shadowKey && world.sunFor === key) return;
    this.shadowKey = key;
    world.sunFor = key;
    if (on) {
      const qx = Math.round(x / step) * step, qy = Math.round(y / step) * step, qz = Math.round(z / step) * step, l = Math.hypot(qx, qy, qz) || 1;
      world.sun = { x: qx / l, y: qy / l, z: qz / l };
    } else world.sun = null;
    this.rebake = [...this.chunkMeshes.values()];
  }

  // Включить / выключить освещение кубиков — все куски пересобрать
  setLighting(on) {
    if (this.lighting === !!on) return;
    this.lighting = !!on;
    for (const m of this.chunkMeshes.values()) m.version = -1;
    this.worldVersion = -1;
  }

  // Собрать кусок: открытые грани, по 6 спискам (chunk-mesh.js → exposedFaces). Буфер — с запасом
  buildChunk(world, chunk, m) {
    const { data, starts, counts, total } = exposedFaces(world, chunk, this.chunkScratch, this.lighting);
    const count = total;
    this.chunkScratch = data;
    if (!m) this.chunkMeshes.set(chunk, (m = { chunk, version: 0, buffer: null, capacity: 0, count: 0 }));
    m.version = chunk.version;
    m.count = count;
    m.starts = starts;
    m.counts = counts;
    if (!count) return;
    if (count > m.capacity) {
      if (m.buffer) this.retire(m.buffer);
      m.capacity = Math.max(64, Math.ceil(count * 1.5));
      m.buffer = this.device.createBuffer({ size: m.capacity * FLOATS_PER_CUBE * 4, usage: gpu.GPUBufferUsage.VERTEX | gpu.GPUBufferUsage.COPY_DST });
    }
    this.device.queue.writeBuffer(m.buffer, 0, data.subarray(0, count * FLOATS_PER_CUBE));
  }

  // Картинка интерфейса поменялась — отправляем её видеокарте
  updateUI(ui) {
    if (!ui.dirty) return;
    ui.dirty = false;
    const { width, height } = ui.fb;
    // Отправляем КОПИЮ картинки интерфейса: если видеокарта забирает данные не сразу,
    // интерфейс тем временем может начать рисоваться заново — копия от этого не испортится.
    // Две копии по очереди — пока одна, возможно, ещё читается, пишем в другую.
    this.uiCopies ||= [];
    this.uiCopyIndex = (this.uiCopyIndex || 0) ^ 1;
    let buffer = this.uiCopies[this.uiCopyIndex];
    if (!buffer || buffer.length !== ui.fb.buffer.length) buffer = this.uiCopies[this.uiCopyIndex] = new Uint8Array(ui.fb.buffer.length);
    buffer.set(ui.fb.buffer);
    if (!this.uiTexture || this.uiSize[0] !== width || this.uiSize[1] !== height) {
      if (this.uiTexture) this.retire(this.uiTexture);
      this.uiSize = [width, height];
      this.uiTexture = this.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: gpu.GPUTextureUsage.TEXTURE_BINDING | gpu.GPUTextureUsage.COPY_DST,
      });
      this.uiBind = this.device.createBindGroup({
        layout: this.uiPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.uiSampler },
          { binding: 2, resource: this.uiTexture.createView() },
        ],
      });
    }
    this.device.queue.writeTexture({ texture: this.uiTexture }, buffer, { bytesPerRow: width * 4 }, [width, height]);
  }

  // scene: { camera, world, ghost: { x, y, z, color } | null, ui,
  //          characters: [{ skin, modelMatrix, jointMatrices, tint? }] }
  //          tint — [r, g, b, сила 0..1], например красная вспышка при ударе
  //        viewModels: то же, что characters, но «слой для экрана» (рука от 1-го лица):
  //          рисуются ПОСЛЕ мира с чистым буфером глубины — поэтому никогда не
  //          проваливаются в стену, даже если игрок стоит к ней вплотную.
  // camera = null — рисуем только интерфейс (главное меню)
  //        blur: { radius, feather?, strength?, dim?, center? } — размыть всё ВНЕ круга (оптика прицела).
  //          radius и feather — доли меньшей стороны экрана (0.4 — круг почти во всю высоту),
  //          strength — сила размытия в долях высоты (0.015 ≈ 11 пикселей на 720p), center — [0.5, 0.5].
  // particles — engine/graphics/particles.js (data, count): кубики-частицы с глубиной, после персонажей
  // target — нарисовать не в окно, а в свою картинку (снимок экрана: capture)
  render({ camera, world, ghost, ui, characters = [], viewModels = [], blur = null, particles = null }, { target = null } = {}) {
    const { device } = this;
    // Размер окна поменялся, а события об этом не было (так бывает на Маке при смене
    // полного экрана) — перенастраиваемся сами. Иначе картинка вывода, буфер глубины
    // и окно будут разного размера, и на экране начнётся мусор.
    if (this.window.pixelWidth !== this.width || this.window.pixelHeight !== this.height) this.resize();
    const { width, height } = this; // рисуем в настоящих пикселях (на Retina — во всех)
    this.frameNumber = (this.frameNumber || 0) + 1;
    this.emptyTrash();

    // 1. Данные кадра — в том же порядке, что в struct Uniforms
    const d = this.uniformData;
    if (camera) {
      d[0] = camera.position.x;
      d[1] = camera.position.y;
      d[2] = camera.position.z;
      d[3] = camera.yaw;
      d[4] = camera.pitch;
      d[5] = Math.tan(camera.fov / 2);
    }
    d[6] = width / height;
    d[7] = this.fadeDist;
    d[8] = this.gridStep;
    d[9] = this.srgb ? 1 : 0;
    d[10] = this.near;
    d[11] = this.far;
    d[12] = this.brightness;
    d[13] = camera?.roll || 0; // крен (наклон головы вбок)
    d[14] = world && world.floor === false ? 1 : 0; // пола нет — внизу бездна (летающие острова)
    // небо (world-fx.js): солнце, день, время, облака, яркость из настроек
    const sky = this.sky;
    d[16] = sky.sun[0]; d[17] = sky.sun[1]; d[18] = sky.sun[2];
    d[19] = sky.day;
    d[20] = (performance.now() / 1000) % 100000;
    d[21] = sky.clouds;
    d[22] = sky.base;
    device.queue.writeBuffer(this.uniformBuffer, 0, d);

    if (world) this.updateWorld(world);
    if (ui) this.updateUI(ui);
    if (ghost) {
      const c = ghost.color;
      const g = this.ghostData;
      g[0] = ghost.x; g[1] = ghost.y; g[2] = ghost.z;
      g[3] = c[0] / 255; g[4] = c[1] / 255; g[5] = c[2] / 255;
      device.queue.writeBuffer(this.ghostBuffer, 0, g);
    }

    // 2. Записываем команды кадра
    const encoder = device.createCommandEncoder();
    // Настоящие тени: сначала — карта теней (глубина глазами солнца), основной проход её читает (world-fx.js)
    d[32] = 0;
    if (camera && world && this.realShadows && this.worldFx && this.fxEnabled !== false && this.shadowMode === "real" && this.lighting) this.renderShadowMap(encoder, camera, world, characters);
    device.queue.writeBuffer(this.uniformBuffer, 96, d, 24, 12); // камера теней и «тени есть» — к основному шейдеру
    const screenView = target || this.output.getCurrentTextureView();
    // Мир рисуем не на экран, а в свою картинку, если: размытие (оптика) или масштаб рендера < 100 %
    // (картинка мира меньше экрана — быстрее; потом растягиваем на экран тем же blur_fs, без размытия).
    // Интерфейс — всегда в полном разрешении экрана
    const scale = camera ? Math.max(0.3, Math.min(1, this.renderScale ?? 1)) : 1;
    const blurOn = !!(camera && (blur || scale < 0.999));
    const rw = blurOn ? Math.max(1, Math.round(width * scale)) : width;
    const rh = blurOn ? Math.max(1, Math.round(height * scale)) : height;
    if (blurOn) this.prepareBlur(blur, rw, rh);
    const colorView = blurOn ? this.sceneView : screenView;
    const depthView = blurOn ? this.sceneDepthView : this.depthTexture.createView();
    this.renderSize = [rw, rh]; // тех. панели: во сколько пикселей рисуется мир
    let pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1, // 1 = «бесконечно далеко»
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setViewport(0, 0, rw, rh, 0, 1);

    // небо, земля, сетка — только если есть камера (в меню мира нет вообще)
    if (camera) {
      const fx = this.worldFx && this.fxEnabled !== false;
      pass.setPipeline(fx ? this.skyFxPipeline : this.skyPipeline);
      pass.setBindGroup(0, fx ? this.skyFxBind : this.skyBind);
      pass.draw(3);
    }

    // мир — по граням: на кусок до 6 команд (6 вершин × граней списка, грани кубика в буфере вершин идут
    // подряд по 6 — firstVertex = 6 · грань). Куски вне кадра и за дымкой и грани спиной к камере — пропускаем
    if (world && camera) {
      const fx = this.worldFx && this.fxEnabled !== false; // свет ламп и солнце/луна на гранях (world-fx.js)
      pass.setPipeline(fx ? this.cubeFxPipeline : this.cubePipeline);
      pass.setBindGroup(0, fx ? this.cubeFxBind : this.cubeBind);
      pass.setVertexBuffer(0, this.cubeVertexBuffer);
      const v = viewOf(camera, width / height, this.viewDistance, this.cullView);
      let drawn = 0, faces = 0;
      for (const m of this.chunkMeshes.values()) {
        if (!m.count || !chunkInView(v, m.chunk)) continue;
        const facing = facesFacing(v, m.chunk);
        pass.setVertexBuffer(1, m.buffer);
        for (let f = 0; f < 6; f++) {
          if (!m.counts[f] || !(facing & (1 << f))) continue;
          pass.draw(6, m.counts[f], f * 6, m.starts[f]);
          faces += m.counts[f];
        }
        drawn++;
      }
      this.worldStats.drawn = drawn;
      this.worldStats.cubes = faces; // теперь — граней в кадре (по 2 треугольника)
      this.worldStats.faces = faces;
    }

    // персонажи: сначала отдаём их матрицы, потом рисуем треугольники модели
    // существа — до той же дальности, что и блоки (дальше — уже растворились в дымке; иначе силуэты мобов и
    // боссов «висят» в пустоте за краем мира)
    if (camera) this.drawCharacters(pass, characters, { x: camera.position.x, z: camera.position.z, max: this.viewDistance });

    // частицы: прозрачные кубики с проверкой глубины (за стеной не видно), глубину сами не пишут
    if (camera && particles?.count && this.particlePipeline) {
      const n = particles.count, bytes = n * FLOATS_PER_PARTICLE * 4;
      if (n > this.particleCapacity) {
        if (this.particleBuffer) this.retire(this.particleBuffer);
        this.particleCapacity = Math.ceil(n * 1.5);
        this.particleBuffer = device.createBuffer({ size: this.particleCapacity * FLOATS_PER_PARTICLE * 4, usage: gpu.GPUBufferUsage.VERTEX | gpu.GPUBufferUsage.COPY_DST });
      }
      device.queue.writeBuffer(this.particleBuffer, 0, particles.data.buffer, particles.data.byteOffset, bytes);
      pass.setPipeline(this.particlePipeline);
      pass.setBindGroup(0, this.particleBind);
      pass.setVertexBuffer(0, this.cubeVertexBuffer);
      pass.setVertexBuffer(1, this.particleBuffer);
      pass.draw(this.cubeVertexCount, n);
      this.worldStats.particles = n;
    }

    // призрак нового блока
    if (ghost) {
      pass.setPipeline(this.ghostPipeline);
      pass.setBindGroup(0, this.ghostBind);
      pass.setVertexBuffer(0, this.cubeVertexBuffer);
      pass.setVertexBuffer(1, this.ghostBuffer);
      pass.draw(this.cubeVertexCount, 1);
    }

    // Слой «для экрана» (рука от 1-го лица): новый проход по той же картинке,
    // но буфер глубины очищен — мир этот слой не загораживает
    if (camera && viewModels.length) {
      pass.end();
      pass = encoder.beginRenderPass({
        colorAttachments: [{ view: colorView, loadOp: "load", storeOp: "store" }],
        depthStencilAttachment: {
          view: depthView,
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      pass.setViewport(0, 0, rw, rh, 0, 1);
      this.drawCharacters(pass, viewModels);
    }

    // Размытие: переносим картинку мира на экран (снаружи круга — размыто)
    if (blurOn) {
      pass.end();
      pass = encoder.beginRenderPass({
        colorAttachments: [{ view: screenView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      pass.setViewport(0, 0, width, height, 0, 1);
      pass.setPipeline(this.blurPipeline);
      pass.setBindGroup(0, this.blurBind);
      pass.draw(3);
    }

    // интерфейс
    if (ui && this.uiBind) {
      pass.setPipeline(this.uiPipeline);
      pass.setBindGroup(0, this.uiBind);
      pass.draw(3);
    }

    pass.end();

    // 3. Отдаём команды видеокарте — дальше она работает сама, параллельно с JS
    device.queue.submit([encoder.finish()]);
  }

  // Картинка для мира под размытием (размер — как у окна) и параметры круга
  // Картинка мира (rw × rh — меньше экрана при масштабе рендера) и её буфер глубины. b — размытие (оптика)
  // или null: тогда только растягиваем на экран (круг «резко» — на весь экран)
  prepareBlur(b, rw = this.width, rh = this.height) {
    const { width, height } = this;
    if (!this.sceneTexture || this.sceneSize !== `${rw}x${rh}`) {
      if (this.sceneTexture) this.retire(this.sceneTexture);
      if (this.sceneDepth) this.retire(this.sceneDepth);
      this.sceneTexture = this.device.createTexture({
        size: [rw, rh],
        format: this.format,
        usage: gpu.GPUTextureUsage.RENDER_ATTACHMENT | gpu.GPUTextureUsage.TEXTURE_BINDING,
      });
      this.sceneDepth = this.device.createTexture({ size: [rw, rh], format: DEPTH_FORMAT, usage: gpu.GPUTextureUsage.RENDER_ATTACHMENT });
      this.sceneDepthView = this.sceneDepth.createView();
      this.sceneSize = `${rw}x${rh}`;
      this.sceneView = this.sceneTexture.createView();
      this.blurBind = this.device.createBindGroup({
        layout: this.blurPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 3, resource: { buffer: this.blurBuffer } },
          { binding: 4, resource: this.sceneSampler },
          { binding: 5, resource: this.sceneView },
        ],
      });
    }
    const m = Math.min(width, height);
    if (!b) this.blurData.set([0.5, 0.5, 1e6, 1, width, height, 0, 0]); // без размытия: везде «резко»
    else {
      const [cx, cy] = b.center || [0.5, 0.5];
      this.blurData.set([cx, cy, b.radius * m, (b.feather ?? 0.01) * m, width, height, (b.strength ?? 0.015) * height, b.dim ?? 0.15]);
    }
    this.device.queue.writeBuffer(this.blurBuffer, 0, this.blurData);
  }

  // Персонажи: сначала отдаём их матрицы, потом рисуем треугольники модели
  // cull — { x, z, max }: дальше max по горизонтали от камеры не рисуем (как куски мира — см. viewDistance)
  drawCharacters(pass, list, cull = null) {
    const max2 = cull ? cull.max * cull.max : 0;
    for (const c of list) {
      if (cull) {
        const m = c.modelMatrix, dx = m[12] - cull.x, dz = m[14] - cull.z; // где стоит (перенос матрицы модели)
        if (dx * dx + dz * dz > max2) continue;
      }
      const { mesh, uniformBuffer, bindGroup } = c.skin;
      this.device.queue.writeBuffer(uniformBuffer, 0, c.modelMatrix);
      this.device.queue.writeBuffer(uniformBuffer, 64, c.tint || NO_TINT);
      this.device.queue.writeBuffer(uniformBuffer, 80, c.jointMatrices);
      pass.setPipeline(this.skinPipeline);
      pass.setBindGroup(0, bindGroup);
      mesh.buffers.forEach((b, i) => pass.setVertexBuffer(i, b));
      pass.setIndexBuffer(mesh.indexBuffer, mesh.indexFormat);
      pass.drawIndexed(mesh.indexCount);
    }
  }

  // Ресурс видеокарты больше не нужен. Уничтожать сразу нельзя: прошлые кадры, возможно,
  // ещё рисуются с ним (на Маке это давало мусор на экране). Уничтожаем через несколько кадров.
  retire(resource) {
    (this.trash ||= []).push({ resource, frame: this.frameNumber || 0 });
  }

  emptyTrash() {
    if (!this.trash?.length) return;
    const now = this.frameNumber || 0;
    this.trash = this.trash.filter((t) => {
      if (now - t.frame < 4) return true;
      t.resource.destroy();
      return false;
    });
  }

  // Снимок экрана: тот же кадр (что и render(args)) — ещё раз, в свою картинку, и прочитать её пиксели.
  // Вернёт обещание { width, height, rgba } (RGBA по 4 байта, строки сверху вниз)
  async capture(args) {
    const { device, width, height } = this;
    const tex = device.createTexture({ size: [width, height], format: this.format, usage: gpu.GPUTextureUsage.RENDER_ATTACHMENT | gpu.GPUTextureUsage.COPY_SRC });
    this.render(args, { target: tex.createView() });
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256; // видеокарта копирует строками, кратными 256 байтам
    const buf = device.createBuffer({ size: bytesPerRow * height, usage: gpu.GPUBufferUsage.COPY_DST | gpu.GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow }, [width, height]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(gpu.GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const rgba = Buffer.alloc(width * height * 4);
    const bgra = String(this.format).startsWith("bgra");
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * bytesPerRow + x * 4, o = (y * width + x) * 4;
        rgba[o] = src[i + (bgra ? 2 : 0)];
        rgba[o + 1] = src[i + 1];
        rgba[o + 2] = src[i + (bgra ? 0 : 2)];
        rgba[o + 3] = 255;
      }
    }
    buf.unmap();
    buf.destroy();
    tex.destroy();
    return { width, height, rgba };
  }

  // Показать нарисованное в окне
  present() {
    this.output.swap();
  }

  // WebGPU нужно закрыть явно перед выходом
  destroy() {
    this.device.destroy();
    gpu.destroy(this.instance);
  }
}

// Вершины кубика от (0,0,0) до (1,1,1): для каждой грани — нормаль и 2 треугольника.
// Каждая вершина — 6 чисел: x, y, z, nx, ny, nz.
function buildCubeMesh() {
  const faces = [
    // нормаль,     четыре угла грани
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[0, -1, 0], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]],
    [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]],
    [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
  ];
  const out = [];
  for (const [n, [a, b, c, d]] of faces) {
    for (const p of [a, b, c, a, c, d]) out.push(...p, ...n);
  }
  return new Float32Array(out);
}

// Видеокарта копирует данные кусками, кратными 4 байтам: дополняем массив uint16 нулём, если нужно
function padTo4(arr) {
  if (arr.byteLength % 4 === 0) return arr;
  const out = new arr.constructor(arr.length + 1);
  out.set(arr);
  return out;
}
