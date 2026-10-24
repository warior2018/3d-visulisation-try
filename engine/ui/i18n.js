// ============================================================
//  Языки интерфейса — возможность движка. Игра пишет надписи по-английски, а словарь языка
//  переводит их прямо при рисовании (ui.text и measureText зовут translate): ничего в коде игры
//  менять не нужно, язык переключается на лету (настройки → INTERFACE → LANGUAGE).
//
//    locale.add("ru", { "PAUSE": "ПАУЗА", "HP ${hp}/${max}": "ЗДОРОВЬЕ ${hp}/${max}" });
//    locale.set("ru");
//    translate("HP 40/100")   // "ЗДОРОВЬЕ 40/100"
//
//  Ключ словаря — надпись целиком; ${...} в ключе — «что угодно» (число, имя): эта часть переносится
//  в перевод (по тому же ${...}) и сама тоже переводится — "HAMMER  BLOCKS: 16" → "МОЛОТ  БЛОКИ: 16".
//  Чего нет в словаре — остаётся как есть. Результаты запоминаются (надписи повторяются каждый кадр).
// ============================================================

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class Locale {
  constructor() {
    this.dictionaries = {}; // язык → { exact: Map, patterns: [{ re, names, out }] }
    this.language = "en";
    this.cache = new Map();
  }

  add(language, dict) {
    const d = (this.dictionaries[language] ||= { exact: new Map(), patterns: [] });
    for (const [key, out] of Object.entries(dict)) {
      if (!key.includes("${")) {
        d.exact.set(key, out);
        continue;
      }
      // Шаблон: ${expr} → (.+?); в переводе ${expr} — та же часть
      const names = [];
      const parts = key.split(/(\$\{[^}]*\})/);
      const literal = parts.filter((p, i) => i % 2 === 0).join("");
      if (literal.trim() === "" && literal.length < 2) continue; // «${a} ${b}» поймал бы всё подряд
      // ${a ? "S" : ""} — условная часть: может быть и пустой
      const src = parts.map((p, i) => (i % 2 ? (names.push(p), p.includes("?") ? "(.*?)" : "(.+?)") : escape(p))).join("");
      d.patterns.push({ re: new RegExp("^" + src + "$", "s"), names, out, weight: literal.length });
    }
    d.patterns.sort((a, b) => b.weight - a.weight); // сначала самые «конкретные»
    this.cache.clear();
  }

  set(language) {
    this.language = language || "en";
    this.cache.clear();
  }

  // Языки, для которых есть словарь (английский — всегда)
  get languages() {
    return ["en", ...Object.keys(this.dictionaries).filter((l) => l !== "en")];
  }

  translate(text) {
    const d = this.dictionaries[this.language];
    if (!d || !text) return text;
    const hit = this.cache.get(text);
    if (hit !== undefined) return hit;
    const out = this.lookup(d, text, 0);
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(text, out);
    return out;
  }

  lookup(d, text, depth) {
    if (d.exact.has(text)) return d.exact.get(text);
    if (depth > 3 || !/[A-Z]/.test(text)) return text;
    for (const p of d.patterns) {
      const m = p.re.exec(text);
      if (!m) continue;
      let out = p.out;
      p.names.forEach((name, i) => {
        out = out.split(name).join(this.lookup(d, m[i + 1], depth + 1));
      });
      return out;
    }
    return text;
  }
}

// Общий для движка (ui.text, measureText): игра настраивает его через engine.locale
export const locale = new Locale();
export const translate = (text) => locale.translate(text);
