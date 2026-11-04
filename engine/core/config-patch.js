// ============================================================
//  Поменять число в исходнике модуля настроек (config.js), не трогая остальное: комментарии, порядок, отступы.
//  path — путь до значения: ["ATTACKS", "pistol", "damage"] — в export const ATTACKS = { ... pistol: { damage: 15 ...
//  Заменяется текст значения целиком (было «10 / 3» — станет число). Вернёт новый текст или null (не нашли).
//
//    const text = patchNumber(fs.readFileSync(file, "utf8"), ["MOVEMENT", "ground"], 0.12);
// ============================================================

// Пропустить строку / комментарий начиная с i; вернёт индекс после них или i
function skip(src, i) {
  const c = src[i];
  if (c === "/" && src[i + 1] === "/") return src.indexOf("\n", i) === -1 ? src.length : src.indexOf("\n", i);
  if (c === "/" && src[i + 1] === "*") return src.indexOf("*/", i + 2) + 2;
  if (c === '"' || c === "'" || c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  return i;
}

// Внутри объекта, что начинается «{» на позиции open: найти ключ key на ВЕРХНЕМ уровне. Вернёт индекс начала
// значения (после «:» и пробелов) или -1
function findKey(src, open, key) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const j = skip(src, i);
    if (j !== i) {
      i = j - 1;
      continue;
    }
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) return -1;
    } else if (depth === 1 && /[A-Za-z0-9_$"']/.test(c) && /[{,\s]/.test(src[i - 1])) {
      const m = /^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*|\d+))\s*:\s*/.exec(src.slice(i, i + 200));
      if (m) {
        if ((m[1] ?? m[2] ?? m[3]) === String(key)) return i + m[0].length;
        i += m[0].length - 1;
      }
    }
  }
  return -1;
}

// Конец значения: до запятой или закрывающей скобки на своём уровне
function valueEnd(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const j = skip(src, i);
    if (j !== i) {
      i = j - 1;
      continue;
    }
    const c = src[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") {
      if (depth === 0) return i;
      depth--;
    } else if (c === "," && depth === 0) return i;
  }
  return src.length;
}

export function formatNumber(v) {
  return String(Math.round(v * 1e6) / 1e6);
}

export function patchNumber(src, path, value) {
  const [name, ...keys] = path;
  const m = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*`).exec(src);
  if (!m) return null;
  let pos = m.index + m[0].length;
  for (const k of keys) {
    if (src[pos] !== "{") return null;
    const v = findKey(src, pos, k);
    if (v < 0) return null;
    pos = v;
  }
  if (src[pos] === "{" || src[pos] === "[") return null; // это объект, а не число
  let end = valueEnd(src, pos);
  while (end > pos && /\s/.test(src[end - 1])) end--;
  return src.slice(0, pos) + formatNumber(value) + src.slice(end);
}
