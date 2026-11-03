// ============================================================
//  Свет мира: модели темнеют под крышей и в пещере (как блоки — тот же расчёт lightOf), смена дня и ночи
//  (DAY: ночью вся картинка мира темнее — интерфейс нет). Время суток — у героя в сохранении.
// ============================================================

import { lightOf } from "../../../engine/index.js";
import { DAY } from "../config.js";

export class DaylightPart {
  // Свет в точке p (у головы): 0..1; освещение выключено в настройках — 1
  lightHere(p, e = null) {
    if (this.settings.video?.lighting === false) return 1;
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
  }

  // Ушли из мира (меню) — яркость как в настройках
  resetDaylight() {
    const r = this.engine.renderer;
    if (r) r.brightness = (this.settings.video?.brightness ?? 100) / 100;
  }
}
