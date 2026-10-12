// ============================================================
//  Загрузчик моделей glTF в двоичном виде (.glb).
//
//  .glb = заголовок + кусок JSON (что есть в модели) + кусок BIN (сами числа).
//  В JSON «аксессоры» описывают, где в BIN лежат вершины, кости, ключевые кадры:
//  с какого байта, сколько штук и какого вида (float, uint16, по 3 или по 4 числа...).
//
//  Поддерживается то, что нужно нашим моделям: одна сетка, скелет, анимации.
// ============================================================

import fs from "node:fs";

const COMPONENTS = {
  5120: [Int8Array, 1, "getInt8", 127],
  5121: [Uint8Array, 1, "getUint8", 255],
  5122: [Int16Array, 2, "getInt16", 32767],
  5123: [Uint16Array, 2, "getUint16", 65535],
  5125: [Uint32Array, 4, "getUint32", 4294967295],
  5126: [Float32Array, 4, "getFloat32", 1],
};
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function loadGLB(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: это не .glb`);

  // Куски файла: [длина, тип, данные], JSON идёт первым, BIN вторым
  let json = null;
  let bin = null;
  for (let offset = 12; offset < data.length; ) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

  // Прочитать аксессор в обычный плотный массив чисел
  function read(index, { asFloat = false } = {}) {
    const acc = json.accessors[index];
    const bv = json.bufferViews[acc.bufferView];
    const [Typed, bytes, getter, max] = COMPONENTS[acc.componentType];
    const n = TYPE_SIZE[acc.type];
    const stride = bv.byteStride || n * bytes; // между элементами могут быть «чужие» данные
    const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const toFloat = asFloat || acc.normalized;
    const out = toFloat ? new Float32Array(acc.count * n) : new Typed(acc.count * n);
    for (let i = 0; i < acc.count; i++) {
      for (let k = 0; k < n; k++) {
        let v = view[getter](start + i * stride + k * bytes, true);
        if (acc.normalized) v /= max; // 0..255 -> 0..1 и т. п.
        out[i * n + k] = v;
      }
    }
    return { array: out, size: n, count: acc.count };
  }

  // --- Сетка (первая) ---
  const prim = json.meshes[0].primitives[0];
  const attr = prim.attributes;
  const positions = read(attr.POSITION).array;
  const count = positions.length / 3;
  const normals = attr.NORMAL !== undefined ? read(attr.NORMAL).array : new Float32Array(count * 3).fill(0);

  // Цвет: из вершин (если есть), умноженный на цвет материала
  const material = prim.material !== undefined ? json.materials[prim.material] : null;
  const base = material?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  const colors = new Float32Array(count * 3);
  const vc = attr.COLOR_0 !== undefined ? read(attr.COLOR_0, { asFloat: true }) : null;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) colors[i * 3 + k] = (vc ? vc.array[i * vc.size + k] : 1) * base[k];
  }

  // Кости вершин (до 4 штук) и их веса. Модель без скелета — всё на «кость 0» с весом 1.
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  if (attr.JOINTS_0 !== undefined) {
    joints.set(read(attr.JOINTS_0).array);
    weights.set(read(attr.WEIGHTS_0, { asFloat: true }).array);
  } else {
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
  }

  const indices = prim.indices !== undefined
    ? read(prim.indices).array
    : Uint32Array.from({ length: count }, (_, i) => i);

  // --- Узлы (кости — это тоже узлы) ---
  const nodes = json.nodes.map((n) => ({
    name: n.name || "",
    translation: n.translation || [0, 0, 0],
    rotation: n.rotation || [0, 0, 0, 1],
    scale: n.scale || [1, 1, 1],
    children: n.children || [],
  }));

  // --- Скелет ---
  const skinDef = json.skins?.[0];
  const skin = skinDef
    ? {
        joints: skinDef.joints,
        inverseBindMatrices: skinDef.inverseBindMatrices !== undefined
          ? read(skinDef.inverseBindMatrices).array
          : new Float32Array(skinDef.joints.length * 16).map((_, i) => ((i % 16) % 5 === 0 ? 1 : 0)), // единичные матрицы
      }
    : { joints: [], inverseBindMatrices: new Float32Array(0) };

  // --- Анимации ---
  const animations = (json.animations || []).map((a) => {
    const channels = a.channels.map((ch) => {
      const s = a.samplers[ch.sampler];
      return {
        node: ch.target.node,
        path: ch.target.path, // "translation" | "rotation" | "scale"
        interpolation: s.interpolation || "LINEAR",
        times: read(s.input).array,
        values: read(s.output, { asFloat: true }),
      };
    });
    const duration = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
    return { name: a.name || "", channels, duration };
  });

  return { positions, normals, colors, joints, weights, indices, nodes, skin, animations };
}
