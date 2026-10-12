// ============================================================
//  Матрицы 4×4 и кватернионы — математика для моделей и скелетов.
//
//  Матрица 4×4 одним умножением делает сразу всё: поворот, масштаб и сдвиг.
//  Храним по столбцам (column-major), как glTF и шейдеры WGSL:
//  элемент «строка r, столбец c» лежит в m[c * 4 + r].
//
//  Кватернион [x, y, z, w] — способ хранить поворот. Удобен тем, что
//  два поворота можно плавно смешать (slerp) без рывков и «переворотов».
// ============================================================

export function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

// out = a × b (сначала применяется b, потом a)
export function multiply(a, b, out = new Float32Array(16)) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// Матрица из сдвига t, поворота q (кватернион) и масштаба s
export function fromTRS(t, q, s = [1, 1, 1], out = new Float32Array(16)) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0;
  out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
  out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0;
  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
  return out;
}

// Поворот вокруг вертикальной оси Y на угол (радианы) — в виде кватерниона
export function quatY(angle) {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

// Поворот вокруг оси X (кивок вперёд/назад)
export function quatX(angle) {
  return [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
}

// Два поворота подряд: сначала b, потом a (как у матриц)
export function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// Линейная интерполяция векторов — наш старый знакомый mix, для каждого компонента
export function lerp(a, b, t, out = []) {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

// Сферическая интерполяция поворотов: идёт по кратчайшей дуге с постоянной скоростью
export function slerp(a, b, t, out = [0, 0, 0, 1]) {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; } // кратчайший путь
  let k0, k1;
  if (cos > 0.9995) { // повороты почти одинаковые — хватит обычного mix
    k0 = 1 - t;
    k1 = t;
  } else {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    k0 = Math.sin((1 - t) * angle) / sin;
    k1 = Math.sin(t * angle) / sin;
  }
  out[0] = a[0] * k0 + bx * k1;
  out[1] = a[1] * k0 + by * k1;
  out[2] = a[2] * k0 + bz * k1;
  out[3] = a[3] * k0 + bw * k1;
  const len = Math.hypot(out[0], out[1], out[2], out[3]);
  for (let i = 0; i < 4; i++) out[i] /= len;
  return out;
}
