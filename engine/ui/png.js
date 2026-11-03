// ============================================================
//  PNG — картинки для интерфейса (пиксель-арт миров, кадры заставки). Без библиотек: zlib есть в Node.
//
//    const img = loadPNG("assets/world-icons/island.png"); // { width, height, data: RGBA Uint8Array }
//    ui.image(img, x, y, w, h, { circle: true });          // нарисовать (engine/ui/ui.js)
//    fs.writeFileSync(file, encodePNG(w, h, rgba));         // записать (генераторы картинок в tools/)
//
//  Читает PNG без чересстрочности, 8 бит на канал: серый, RGB, палитра (и прозрачность tRNS), серый+альфа, RGBA.
// ============================================================

import fs from "node:fs";
import zlib from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePNG(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("не PNG");
  let o = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const kind = buf.toString("latin1", o + 4, o + 8);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (kind === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === "PLTE") plte = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    o += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`PNG: поддерживается 8 бит без чересстрочности (тут ${depth} бит${interlace ? ", чересстрочный" : ""})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`PNG: неизвестный тип цвета ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = new Uint8Array(stride * h);
  // снять фильтры строк (None, Sub, Up, Average, Paeth)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= ch ? px[dst + i - ch] : 0;
      const b = y > 0 ? px[dst - stride + i] : 0;
      const c = i >= ch && y > 0 ? px[dst - stride + i - ch] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[dst + i] = v & 255;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const s = i * ch;
    if (type === 6) { data[j] = px[s]; data[j + 1] = px[s + 1]; data[j + 2] = px[s + 2]; data[j + 3] = px[s + 3]; }
    else if (type === 2) { data[j] = px[s]; data[j + 1] = px[s + 1]; data[j + 2] = px[s + 2]; data[j + 3] = 255; }
    else if (type === 0) { data[j] = data[j + 1] = data[j + 2] = px[s]; data[j + 3] = 255; }
    else if (type === 4) { data[j] = data[j + 1] = data[j + 2] = px[s]; data[j + 3] = px[s + 1]; }
    else {
      const k = px[s];
      data[j] = plte[k * 3]; data[j + 1] = plte[k * 3 + 1]; data[j + 2] = plte[k * 3 + 2];
      data[j + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width: w, height: h, data };
}

export function loadPNG(file) {
  return decodePNG(fs.readFileSync(file));
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (kind, body) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const kb = Buffer.concat([Buffer.from(kind, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kb));
  return Buffer.concat([len, kb, crc]);
};

export function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
