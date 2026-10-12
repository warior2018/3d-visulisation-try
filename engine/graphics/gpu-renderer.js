// ============================================================
//  Рендерер на видеокарте (WebGPU через @kmamal/gpu).
//  На Маке WebGPU работает поверх Metal — родной графики Apple.
//  JS готовит данные и говорит видеокарте «рисуй»,
//  а пиксели считают шейдеры (см. shaders.js) — параллельно.
// ============================================================

import gpu from "@kmamal/gpu";
import { SHADERS } from "./shaders.js";

const DEPTH_FORMAT = "depth24plus";
const FLOATS_PER_CUBE = 6; // x, y, z, r, g, b
const MAX_JOINTS = 64; //     столько костей помещается в шейдер (array<mat4x4f, 64>)
// Буфер одного существа: матрица модели (64 байта) + оттенок vec4 (16) + матрицы костей
const SKIN_BYTES = 64 + 16 + MAX_JOINTS * 64;
const NO_TINT = new Float32Array([0, 0, 0, 0]);

export class GPURenderer {
  // Подключение к видеокарте асинхронное (её надо «найти» и «открыть»),
  // поэтому вместо new GPURenderer(...) используем await GPURenderer.create(...)
  static async create(window, options) {
    const instance = gpu.create([]);
    const adapter = await instance.requestAdapter(); // какая видеокарта есть
    if (!adapter) throw new Error("Видеокарта с поддержкой WebGPU не найдена");
    const device = await adapter.requestDevice(); // открыть её для работы
    return new GPURenderer(window, instance, device, options);
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
    this.uniformData = new Float32Array(16);
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

    // Экземпляры кубиков: вместимость растёт по мере надобности
    this.instanceCapacity = 0;
    this.instanceCount = 0;
    this.ensureInstanceCapacity(1024);
    this.worldVersion = -1;

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

  ensureInstanceCapacity(count) {
    if (count <= this.instanceCapacity) return;
    let cap = Math.max(this.instanceCapacity, 1024);
    while (cap < count) cap *= 2; // растём вдвое — как динамический массив
    if (this.instanceBuffer) this.retire(this.instanceBuffer);
    this.instanceBuffer = this.device.createBuffer({
      size: cap * FLOATS_PER_CUBE * 4,
      usage: gpu.GPUBufferUsage.VERTEX | gpu.GPUBufferUsage.COPY_DST,
    });
    this.instanceCapacity = cap;
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

  // Мир поменялся (другой мир или другая version) — заново отправляем список блоков видеокарте.
  // Проверяем и сам мир: у нового мира счётчик version может совпасть со старым.
  updateWorld(world) {
    if (world === this.worldShown && world.version === this.worldVersion) return;
    this.worldShown = world;
    this.worldVersion = world.version;
    const blocks = [...world.blocks.values()];
    this.ensureInstanceCapacity(blocks.length);
    const data = new Float32Array(Math.max(blocks.length, 1) * FLOATS_PER_CUBE);
    blocks.forEach((b, i) => {
      data.set([b.x, b.y, b.z, b.color[0] / 255, b.color[1] / 255, b.color[2] / 255], i * FLOATS_PER_CUBE);
    });
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);
    this.instanceCount = blocks.length;
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
  render({ camera, world, ghost, ui, characters = [], viewModels = [], blur = null }) {
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
    device.queue.writeBuffer(this.uniformBuffer, 0, d);

    if (world) this.updateWorld(world);
    if (ui) this.updateUI(ui);
    if (ghost) {
      const c = ghost.color;
      device.queue.writeBuffer(this.ghostBuffer, 0, new Float32Array([ghost.x, ghost.y, ghost.z, c[0] / 255, c[1] / 255, c[2] / 255]));
    }

    // 2. Записываем команды кадра
    const encoder = device.createCommandEncoder();
    const screenView = this.output.getCurrentTextureView();
    // С размытием мир рисуем не на экран, а в свою картинку (её потом размоет blur_fs)
    const blurOn = !!(blur && camera);
    if (blurOn) this.prepareBlur(blur);
    const colorView = blurOn ? this.sceneView : screenView;
    let pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1, // 1 = «бесконечно далеко»
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setViewport(0, 0, width, height, 0, 1);

    // небо, земля, сетка — только если есть камера (в меню мира нет вообще)
    if (camera) {
      pass.setPipeline(this.skyPipeline);
      pass.setBindGroup(0, this.skyBind);
      pass.draw(3);
    }

    // все кубики мира — ОДНОЙ командой: 36 вершин × instanceCount экземпляров
    if (world && this.instanceCount > 0) {
      pass.setPipeline(this.cubePipeline);
      pass.setBindGroup(0, this.cubeBind);
      pass.setVertexBuffer(0, this.cubeVertexBuffer);
      pass.setVertexBuffer(1, this.instanceBuffer);
      pass.draw(this.cubeVertexCount, this.instanceCount);
    }

    // персонажи: сначала отдаём их матрицы, потом рисуем треугольники модели
    if (camera) this.drawCharacters(pass, characters);

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
          view: this.depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      pass.setViewport(0, 0, width, height, 0, 1);
      this.drawCharacters(pass, viewModels);
    }

    // Размытие: переносим картинку мира на экран (снаружи круга — размыто)
    if (blurOn) {
      pass.end();
      pass = encoder.beginRenderPass({
        colorAttachments: [{ view: screenView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: this.depthTexture.createView(), depthLoadOp: "load", depthStoreOp: "store" },
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
  prepareBlur(b) {
    const { width, height } = this;
    if (!this.sceneTexture || this.sceneSize !== `${width}x${height}`) {
      if (this.sceneTexture) this.retire(this.sceneTexture);
      this.sceneTexture = this.device.createTexture({
        size: [width, height],
        format: this.format,
        usage: gpu.GPUTextureUsage.RENDER_ATTACHMENT | gpu.GPUTextureUsage.TEXTURE_BINDING,
      });
      this.sceneSize = `${width}x${height}`;
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
    const [cx, cy] = b.center || [0.5, 0.5];
    this.blurData.set([cx, cy, b.radius * m, (b.feather ?? 0.01) * m, width, height, (b.strength ?? 0.015) * height, b.dim ?? 0.15]);
    this.device.queue.writeBuffer(this.blurBuffer, 0, this.blurData);
  }

  // Персонажи: сначала отдаём их матрицы, потом рисуем треугольники модели
  drawCharacters(pass, list) {
    for (const c of list) {
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
