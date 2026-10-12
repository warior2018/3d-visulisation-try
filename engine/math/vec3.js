// Вектор в 3D: точка или направление.
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  scale(k) { return new Vec3(this.x * k, this.y * k, this.z * k); }
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
