// ============================================================
//  Свет мира: модели темнеют под крышей и в пещере (как блоки — тот же расчёт lightOf), смена дня и ночи
//  (DAY: ночью вся картинка мира темнее — интерфейс нет). Время суток — у героя в сохранении.
// ============================================================

import { lightOf } from "../../../engine/index.js";
import { DAY, LIGHTS, SKY_BODIES } from "../config.js";

export class DaylightPart {
  // Свет в точке p (у головы): 0..1; освещение выключено в настройках — 1
  lightHere(p, e = null) {
    if (this.settings.graphics?.lighting === false) return 1;
    const h = e?.height ?? 1.6;
    return lightOf(this.world, Math.floor(p.x), Math.floor(p.y + h * 0.75), Math.floor(p.z));
  }

  // Доля дня: 0 — полночь, 0.25 — рассвет, 0.5 — полдень, 0.75 — закат
  dayLight(t = this.dayTime ?? DAY.start) {
    const sun = Math.sin((t - 0.25) * Math.PI * 2); // > 0 — солнце над горизонтом
    const k = Math.max(0, Math.min(1, (sun + DAY.dusk * 2) / (DAY.dusk * 4))); // мягкий рассвет и закат
    return DAY.night + (1 - DAY.night) * k;
  }

  // Каждый кадр: время суток идёт (если включено), яркость мира — от него
  updateDaylight(dt) {
    const on = this.settings.general.dayNight !== false;
    if (on) this.dayTime = ((this.dayTime ?? DAY.start) + dt / DAY.length) % 1;
    const r = this.engine.renderer;
    if (!r) return;
    const base = (this.settings.video?.brightness ?? 100) / 100;
    r.brightness = base * (on ? this.dayLight() : 1);
    // солнце по небу: встаёт на востоке (+X), в полдень — почти над головой, садится на западе
    const sun = this.sunDir(on ? this.dayTime ?? DAY.start : 0.5);
    const day = Math.max(0, Math.min(1, (sun[1] + 0.12) / 0.3));
    r.setSky?.({ sun, day, base });
  }

  // Направление на солнце в момент суток t (0 — полночь, 0.25 — рассвет, 0.5 — полдень): круг вокруг оси,
  // наклонённой на SKY_BODIES.tilt. Луна — ровно напротив (−sun)
  sunDir(t) {
    const a = (t - 0.25) * Math.PI * 2;
    const v = [Math.cos(a), Math.sin(a), SKY_BODIES.tilt];
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  }

  // Каждый кадр перед рисованием: солнце и луна — кубики на небе вокруг камеры (частицы: глубина есть —
  // горы их закрывают). Под горизонтом не видно; яркость — не гаснет вместе с ночью (подняли на 1 / яркость)
  updateSkyBodies(camera) {
    const fx = this.fx;
    if (!fx?.pack || !camera) return; // сетевой гость: эффекты идут через FxRelay — без неба
    if (this.settings.general.dayNight === false) {
      fx.sprites = [];
      return;
    }
    const B = SKY_BODIES, sun = this.sunDir(this.dayTime ?? DAY.start);
    const k = 1 / Math.max(0.3, this.engine.renderer?.brightness ?? 1);
    const at = (d, b, glow) => ({
      x: camera.position.x + d[0] * B.distance, y: camera.position.y + d[1] * B.distance, z: camera.position.z + d[2] * B.distance,
      size: b.size, color: b.color.map((c) => c * glow), alpha: Math.max(0, Math.min(1, (d[1] + 0.08) / 0.12)), // у горизонта — тает
    });
    const list = [];
    if (sun[1] > -0.08) list.push(at(sun, B.sun, k));
    if (-sun[1] > -0.08) list.push(at(sun.map((v) => -v), B.moon, k));
    fx.sprites = list;
    fx.pack();
  }

  // Светящиеся блоки мира (LIGHTS): лампы из палитры, факелы, крышка сундука
  setupLights() {
    this.world.setEmitters?.(Object.values(LIGHTS));
  }

  // Ушли из мира (меню) — яркость как в настройках
  resetDaylight() {
    const r = this.engine.renderer;
    if (r) r.brightness = (this.settings.video?.brightness ?? 100) / 100;
  }
}
