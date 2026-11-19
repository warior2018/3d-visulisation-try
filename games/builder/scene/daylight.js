// ============================================================
//  Свет мира: модели темнеют под крышей и в пещере (как блоки — тот же расчёт lightOf), смена дня и ночи
//  (DAY: ночью вся картинка мира темнее — интерфейс нет). Время суток — у героя в сохранении.
// ============================================================

import { lightAt } from "../../../engine/index.js";
import { DAY, LIGHTS, SKY_BODIES, HERO_LIGHT, TORCH } from "../config.js";

export class DaylightPart {
  // Свет в точке p (у головы): { k — сколько (0…1+), warm — доля тёплого (лампы, факел) }; освещение выключено — 1
  lightHere(p, e = null) {
    if (this.settings.graphics?.lighting === false) return 1;
    const h = e?.height ?? 1.6;
    const l = lightAt(this.world, Math.floor(p.x), Math.floor(p.y + h * 0.75), Math.floor(p.z));
    let lamp = l.lamp;
    // свет у героя (горящий факел — heroLight) — и на модели рядом
    const me = this.player?.position, t = this.heroLight();
    if (me && t) {
      const d = Math.hypot(p.x - me.x, p.y + h * 0.75 - (me.y + t.height), p.z - me.z);
      lamp += t.power * Math.max(0, 1 - d / t.radius) ** 2;
    }
    lamp += this.flashLightAt?.(p.x, p.y + h * 0.75, p.z) || 0; // вспышки (выстрел, взрыв)
    const k = l.sky + lamp; // день / ночь — шейдер умножит сам (u.brightness)
    return { k, warm: k > 0 ? lamp / k : 0 };
  }

  // Факел (TORCH): зажечь / потушить
  toggleTorch() {
    const s = this.player.hotbar.slots.find((x) => x?.item === "torch");
    if (!s) return;
    this.torchLit = !this.torchLit;
    if (!this.torchLit) delete this.player.speedBonuses.torch;
    this.engine.sound.play("equip");
    this.engine.toast(this.tr(this.torchLit ? "TORCH LIT" : "TORCH PUT OUT"), 900);
    this.engine.redraw();
  }

  // Каждый кадр: горящий факел сгорает (data.burn), пока горит — медленнее (TORCH.slow); сгорел — пропал
  updateTorch(dt) {
    const p = this.player;
    if (!this.torchLit || !p?.alive) {
      if (p?.speedBonuses) delete p.speedBonuses.torch;
      if (!p?.alive) this.torchLit = false;
      return;
    }
    const hb = p.hotbar, i = hb.slots.findIndex((x) => x?.item === "torch");
    if (i < 0) { // убрали из ячейки — погас
      this.torchLit = false;
      delete p.speedBonuses.torch;
      return;
    }
    const s = hb.slots[i];
    s.data = s.data || { burn: TORCH.time };
    s.data.burn = Math.max(0, (s.data.burn ?? TORCH.time) - dt);
    const label = String(Math.ceil(s.data.burn));
    if (label !== s.data.label) {
      s.data.label = label;
      this.engine.redraw();
    }
    p.speedBonuses.torch = TORCH.slow;
    if (s.data.burn <= 0) {
      hb.slots[i] = null;
      this.torchLit = false;
      delete p.speedBonuses.torch;
      this.syncAbilities?.();
      this.engine.toast(this.tr("TORCH BURNED OUT"), 1500);
    }
  }

  // Свет у героя сейчас: горит факел — его; иначе HERO_LIGHT (radius 0 — нет)
  heroLight() {
    if (this.torchLit) return TORCH;
    return HERO_LIGHT.radius > 0 ? HERO_LIGHT : null;
  }

  // Доля дня: 0 — полночь, 0.25 — рассвет, 0.5 — полдень, 0.75 — закат
  dayLight(t = this.dayTime ?? DAY.start) {
    const sun = Math.sin((t - 0.25) * Math.PI * 2); // > 0 — солнце над горизонтом
    const k = Math.max(0, Math.min(1, (sun + DAY.dusk * 2) / (DAY.dusk * 4))); // мягкий рассвет и закат
    return DAY.night + (1 - DAY.night) * k;
  }

  // Ночь ли сейчас (солнце под горизонтом). Смена дня и ночи выключена — ночи нет
  isNight() {
    if (this.settings.general.dayNight === false) return false;
    return Math.sin(((this.dayTime ?? DAY.start) - 0.25) * Math.PI * 2) < 0;
  }

  // Каждый кадр: время суток идёт (если включено), яркость мира — от него
  updateDaylight(dt) {
    this.updateTorch(dt);
    this.updateFlashes?.(dt); // вспышки света: выстрелы, взрывы, снаряды (scene/effects.js)
    const on = this.settings.general.dayNight !== false;
    if (on) this.dayTime = ((this.dayTime ?? DAY.start) + dt / DAY.length) % 1;
    const r = this.engine.renderer;
    if (!r) return;
    const base = (this.settings.video?.brightness ?? 100) / 100;
    r.brightness = base * (on ? this.dayLight() : 1);
    // свет у героя (факел): мягкий, небольшой — в пещере без ламп видно вокруг себя (HERO_LIGHT)
    const me = this.player?.alive !== false ? this.player?.position : null;
    const t = this.heroLight();
    r.setTorch?.(me && t && this.settings.graphics?.lighting !== false ? { x: me.x, y: me.y + t.height, z: me.z, radius: t.radius, power: t.power } : null);
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
      fx.sprites = this.fireflySprites?.() || []; // светлячки комнаты портала
      fx.pack();
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
    list.push(...(this.fireflySprites?.() || [])); // светлячки комнаты портала
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
