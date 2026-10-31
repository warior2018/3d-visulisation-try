// Хук загрузки модулей: вместо библиотек окна и видеокарты отдаём пустышки
const MAP = {
  "@kmamal/sdl": new URL("./sdl.mjs", import.meta.url).href,
  "@kmamal/gpu": new URL("./gpu.mjs", import.meta.url).href,
};
export async function resolve(spec, ctx, next) {
  if (MAP[spec]) return { url: MAP[spec], shortCircuit: true };
  return next(spec, ctx);
}
