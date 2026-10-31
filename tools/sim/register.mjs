// node --import ./tools/sim/register.mjs ... — игра без окна и видеокарты (пустышки вместо них)
import { register } from "node:module";
register("./stubs/loader.mjs", import.meta.url);
