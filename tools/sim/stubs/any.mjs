// Пустышка: любое свойство — снова пустышка, любой вызов — пустышка. Ей подменяем окно и видеокарту,
// чтобы игра шла без них (автотесты): рисование уходит «в никуда», логика работает по-настоящему
export function any(name = "any") {
  const f = function () {};
  return new Proxy(f, {
    get(t, k) {
      if (k === "then") return undefined; //            не «обещание» — иначе await зависнет
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === "length") return 0;
      if (!(k in t)) t[k] = any(name + "." + String(k));
      return t[k];
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
    apply() {
      return any(name + "()");
    },
    construct() {
      return any("new " + name);
    },
  });
}
