// ============================================================
//  Проверки для автотестов: t.check("что проверяем", условие, "подробности") копит итог.
//  Сценарий (scenarios/*.mjs) — export default async (t, g) => { ... }, где g — игра (harness.mjs).
//  Модульный тест (unit/*.mjs) — отдельный скрипт, печатает «итого: X OK, Y FAIL» и выходит с кодом.
// ============================================================

export function createChecker({ print = true } = {}) {
  const t = {
    ok: 0,
    fail: 0,
    failures: [],
    check(name, cond, info = "") {
      if (cond) t.ok++;
      else {
        t.fail++;
        t.failures.push(info !== "" ? `${name} (${info})` : name);
      }
      if (print) console.log(`${cond ? "OK  " : "FAIL"} ${name}${info !== "" ? `  (${info})` : ""}`);
      return !!cond;
    },
    log(...a) {
      if (print) console.log("    ", ...a);
    },
  };
  return t;
}

export const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
