// ============================================================
//  Сборщик моделей glTF (.glb) из брусков — общий для всех генераторов моделей
//  (tools/make-skeleton.js, tools/make-arm.js, ...).
//
//  Модель описываем тремя списками:
//   bones — кости: { name, parent, pos, rotation?, scale? }
//           pos — где сустав в исходной позе (в координатах модели),
//           rotation — исходный поворот кости (кватернион), если нужен;
//   parts — бруски: { bone, center, size, color } — каждый жёстко привязан к одной кости;
//   animations — { Имя: [дорожки] }, дорожки делаются функциями rot() и move() ниже.
// ============================================================

import fs from "node:fs";
import path from "node:path";

// ---------- Повороты ----------
// Поворот задаётся кватернионом [x, y, z, w]. Для поворота на угол a вокруг оси:
// [ось * sin(a/2), cos(a/2)]. Углы — в градусах.
export const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

export function quat(axis, deg) {
  const a = (deg * Math.PI) / 180;
  const s = Math.sin(a / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)];
}

// Два поворота подряд: сначала b, потом a
export function qmul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// Дорожки анимации: какая кость, что меняем, времена (с) и значения ключевых кадров
export const rot = (bone, axis, times, degs) => ({ bone, path: "rotation", times, values: degs.map((d) => quat(axis, d)) });
export const rotQ = (bone, times, quats) => ({ bone, path: "rotation", times, values: quats });
export const move = (bone, times, values) => ({ bone, path: "translation", times, values });
export const scale = (bone, times, values) => ({ bone, path: "scale", times, values }); // [sx, sy, sz]; 0 — кость (и её бруски) не видно

// ---------- Сетка из брусков ----------
// У каждой грани свои 4 вершины (нормаль у граней разная) и 2 треугольника.
const FACES = [
  [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
  [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
  [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
  [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]],
  [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
];

function buildMesh(parts, boneIndex) {
  const positions = [], normals = [], colors = [], joints = [], weights = [], indices = [];
  for (const p of parts) {
    for (const [n, corners] of FACES) {
      const base = positions.length / 3;
      for (const c of corners) {
        positions.push(...c.map((v, k) => p.center[k] + (v * p.size[k]) / 2));
        normals.push(...n);
        colors.push(...p.color);
        joints.push(boneIndex[p.bone], 0, 0, 0); // вершина привязана к одной кости...
        weights.push(1, 0, 0, 0); //                 ...на 100%
      }
      // Порядок вершин — против часовой стрелки, если смотреть на грань снаружи.
      // Проверка: векторное произведение двух рёбер должно смотреть туда же, куда нормаль.
      const v = (k) => corners[k];
      const e1 = v(1).map((x, i) => x - v(0)[i]);
      const e2 = v(2).map((x, i) => x - v(0)[i]);
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const outward = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0;
      if (outward) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return { positions, normals, colors, joints, weights, indices };
}

// ---------- Сборка glTF ----------
// glTF = JSON (что есть в файле) + один большой двоичный буфер (сами числа).
// accessor говорит: «в буфере с такого-то места лежит столько-то чисел такого-то вида».
export function buildGLB({ name, generator, bones, parts, animations }) {
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  const mesh = buildMesh(parts, boneIndex);

  const chunks = [];
  let byteLength = 0;
  const bufferViews = [];
  const accessors = [];

  function addData(typedArray, target) {
    const pad = (4 - (byteLength % 4)) % 4; // данные выравниваем по 4 байта
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunks.push(bytes);
    byteLength += bytes.length;
    return bufferViews.length - 1;
  }

  const COMPONENT = { f32: 5126, u16: 5123 };
  const SIZE = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 };
  function addAccessor(array, type, kind, target, withMinMax = false) {
    const view = addData(array, target);
    const acc = { bufferView: view, componentType: COMPONENT[kind], count: array.length / SIZE[type], type };
    if (withMinMax) {
      const n = SIZE[type];
      acc.min = Array.from({ length: n }, (_, k) => Math.min(...array.filter((_, i) => i % n === k)));
      acc.max = Array.from({ length: n }, (_, k) => Math.max(...array.filter((_, i) => i % n === k)));
    }
    accessors.push(acc);
    return accessors.length - 1;
  }

  const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;
  const attributes = {
    POSITION: addAccessor(new Float32Array(mesh.positions), "VEC3", "f32", ARRAY_BUFFER, true),
    NORMAL: addAccessor(new Float32Array(mesh.normals), "VEC3", "f32", ARRAY_BUFFER),
    COLOR_0: addAccessor(new Float32Array(mesh.colors), "VEC3", "f32", ARRAY_BUFFER),
    JOINTS_0: addAccessor(new Uint16Array(mesh.joints), "VEC4", "u16", ARRAY_BUFFER),
    WEIGHTS_0: addAccessor(new Float32Array(mesh.weights), "VEC4", "f32", ARRAY_BUFFER),
  };
  const indexAccessor = addAccessor(new Uint16Array(mesh.indices), "SCALAR", "u16", ELEMENT_ARRAY_BUFFER);

  // Узлы-кости. В glTF у каждого узла позиция задаётся ОТНОСИТЕЛЬНО родителя.
  const nodes = bones.map((b) => {
    const parentPos = b.parent ? bones[boneIndex[b.parent]].pos : [0, 0, 0];
    const node = { name: b.name, translation: b.pos.map((v, k) => +(v - parentPos[k]).toFixed(4)) };
    if (b.rotation) node.rotation = b.rotation.map((v) => +v.toFixed(6));
    if (b.scale) node.scale = b.scale;
    return node;
  });
  bones.forEach((b, i) => {
    if (!b.parent) return;
    const parent = nodes[boneIndex[b.parent]];
    (parent.children ||= []).push(i);
  });
  const roots = bones.map((b, i) => (b.parent ? -1 : i)).filter((i) => i >= 0);

  // «Обратные матрицы привязки»: переводят вершину из системы модели в систему её кости.
  // Бруски заданы в позе, где кости ещё не повёрнуты, поэтому это просто сдвиг на -позицию кости.
  // Матрицы в glTF записываются по столбцам (column-major).
  const ibm = new Float32Array(bones.length * 16);
  bones.forEach((b, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1], i * 16));
  const ibmAccessor = addAccessor(ibm, "MAT4", "f32");

  const meshNode = nodes.length;
  nodes.push({ name: name + "Mesh", mesh: 0, skin: 0 });

  const anims = Object.entries(animations).map(([animName, tracks]) => {
    const samplers = [];
    const channels = [];
    for (const tr of tracks) {
      const input = addAccessor(new Float32Array(tr.times), "SCALAR", "f32", undefined, true);
      const output = addAccessor(new Float32Array(tr.values.flat()), tr.path === "rotation" ? "VEC4" : "VEC3", "f32");
      samplers.push({ input, output, interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: boneIndex[tr.bone], path: tr.path } });
    }
    return { name: animName, samplers, channels };
  });

  const gltf = {
    asset: { version: "2.0", generator },
    scene: 0,
    scenes: [{ name, nodes: [...roots, meshNode] }],
    nodes,
    meshes: [{ name, primitives: [{ attributes, indices: indexAccessor, material: 0 }] }],
    materials: [{ name: name + "Material", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    skins: [{ name: name + "Rig", joints: bones.map((_, i) => i), skeleton: roots[0], inverseBindMatrices: ibmAccessor }],
    animations: anims,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  // ---------- Упаковка в .glb ----------
  // Заголовок (12 байт) + кусок JSON + кусок BIN. Каждый кусок дополняется до кратности 4.
  const pad4 = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
  const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20); // JSON дополняют пробелами
  const bin = pad4(Buffer.concat(chunks), 0);
  const chunkHeader = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4); //          версия 2
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);

  return {
    data: Buffer.concat([header, chunkHeader(json.length, 0x4e4f534a), json, chunkHeader(bin.length, 0x004e4942), bin]),
    stats: { parts: parts.length, vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3, bones: bones.length, animations: Object.keys(animations) },
  };
}

// Записать .glb и рассказать, что получилось
export function writeGLB(file, model) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, model.data);
  const s = model.stats;
  console.log(`Готово: ${file}`);
  console.log(`  брусков: ${s.parts}, вершин: ${s.vertices}, треугольников: ${s.triangles}`);
  console.log(`  костей: ${s.bones}, анимации: ${s.animations.join(", ")}`);
}
