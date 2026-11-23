// ============================================================
//  Погода (WEATHER), только в основном мире: изредка дождь (раз в every с, длится time с) — капли падают
//  вокруг героя и пропадают о землю / крышу (под крышей не капает). В зимнем пятне вместо капель — снежинки:
//  медленнее и качаются. На слабой графике частиц меньше (WEATHER.quality). Когда идёт дождь, решает хост
//  (гостю — в снимке: net.js → wr), соло — сам.
//  Осень: порывы ветра — полосы и листья по ветру (только видно). Пустыня: перекати-поле (TUMBLEWEED).
// ============================================================

import { WEATHER, TUMBLEWEED, BIOMES } from "../config.js";
import { Entity, Vec3 } from "../../../engine/index.js";

const rnd = ([a, b]) => a + Math.random() * (b - a);

export class WeatherPart {
  // Каждый кадр
  updateWeather(dt) {
    const p = this.player;
    if (!p || this.training || this.duel || !this.inMain?.()) return;
    // хост / соло: когда начнётся и сколько продлится дождь
    if (this.role !== "client") {
      if (this.rainLeft > 0) {
        this.rainLeft -= dt;
        if (this.rainLeft <= 0) this.rainIn = rnd(WEATHER.every);
      } else {
        this.rainIn ??= rnd(WEATHER.every);
        this.rainIn -= dt;
        if (this.rainIn <= 0) {
          this.rainLeft = rnd(WEATHER.time);
          this.engine.log(`погода: дождь на ${Math.round(this.rainLeft)} с`);
        }
      }
    } else if (this.rainLeft > 0) this.rainLeft -= dt;
    const q = WEATHER.quality[this.settings.graphics?.quality] ?? 1;
    if (this.rainLeft > 0) this.rainFx(dt, q);
    this.updateGusts(dt, q);
    this.updateTumbleweeds(dt);
  }

  // Гость: дождь — как у хоста (секунд осталось; 0 — нет)
  setRain(sec) {
    this.rainLeft = sec;
  }

  // Капли (и снежинки в зиме) вокруг камеры: столько новых в секунду, чтобы в воздухе было ~drops штук
  rainFx(dt, q) {
    const fx = this.fx, cam = this.look?.position || this.player.position;
    if (!fx?.emit) return;
    const R = WEATHER.rain, S = WEATHER.snow;
    const dropLife = R.height / R.speed, flakeLife = R.height / S.speed;
    this.rainAcc = (this.rainAcc || 0) + ((R.drops * q) / dropLife) * dt;
    // снежинка живёт дольше капли — берём не каждую (их в воздухе ~flakes)
    const flakeShare = (dropLife / flakeLife) * (S.flakes / R.drops);
    for (; this.rainAcc >= 1; this.rainAcc--) {
      const x = cam.x + (Math.random() * 2 - 1) * R.radius, z = cam.z + (Math.random() * 2 - 1) * R.radius;
      const ground = this.world.surfaceY(x, z);
      const y0 = cam.y + R.height * (0.35 + Math.random() * 0.65);
      if (y0 <= ground + 0.2) continue; // над головой крыша / гора — здесь не капает
      const winter = this.biomeAt?.(x, z, ground) === "winter";
      if (winter) {
        if (Math.random() >= flakeShare) continue;
        const life = Math.min(flakeLife * 1.5, (y0 - ground) / S.speed);
        const sway = (Math.random() * 2 - 1) * S.sway;
        fx.emit({ at: { x, y: y0, z }, vel: { x: sway, y: -S.speed, z: (Math.random() * 2 - 1) * S.sway }, life, size: S.size, color: S.color, alpha: S.alpha, fade: false });
        continue;
      }
      const life = (y0 - ground) / R.speed;
      for (const dy of [0, 0.16]) fx.emit({ at: { x, y: y0 + dy, z }, vel: { x: 0, y: -R.speed, z: 0 }, life, size: R.size, color: R.color, alpha: R.alpha, fade: false });
    }
  }

  // Ветер мира: направление (рад) медленно гуляет
  windAngle() {
    this.windA ??= Math.random() * Math.PI * 2;
    return this.windA + Math.sin((this.combatClock || 0) * 0.02) * 0.6;
  }

  // Осень: герой в осеннем пятне — раз в every с порыв: светлые полосы по ветру и листья
  updateGusts(dt, q) {
    const p = this.player;
    if (this.biomeAt?.(p.position.x, p.position.z, p.position.y) !== "autumn") return;
    this.gustIn ??= rnd(WEATHER.gusts.every);
    this.gustIn -= dt;
    if (this.gustIn > 0) return;
    this.gustIn = rnd(WEATHER.gusts.every);
    const G = WEATHER.gusts, a = this.windAngle(), wx = Math.sin(a), wz = Math.cos(a);
    const n = Math.max(2, Math.round(G.streaks * q));
    for (let i = 0; i < n; i++) {
      const along = (Math.random() * 2 - 1) * 10, side = (Math.random() * 2 - 1) * 10;
      const x = p.position.x + wx * along - wz * side, z = p.position.z + wz * along + wx * side;
      const y = this.world.surfaceY(x, z) + 0.3 + Math.random() * 2.5;
      const len = rnd(G.length);
      this.beams?.add({ from: { x, y, z }, to: { x: x + wx * len, y: y + (Math.random() - 0.5) * 0.3, z: z + wz * len }, color: G.color, core: [255, 255, 255], life: rnd(G.life), width: G.width, local: true });
    }
    const leaves = BIOMES.autumn.leaves, m = Math.max(1, Math.round(G.leaves * q));
    for (let i = 0; i < m; i++) {
      const x = p.position.x - wx * 8 + (Math.random() * 2 - 1) * 8, z = p.position.z - wz * 8 + (Math.random() * 2 - 1) * 8;
      const y = this.world.surfaceY(x, z) + 0.5 + Math.random() * 2;
      this.fx?.emit?.({ at: { x, y, z }, vel: { x: wx * G.speed * (0.7 + Math.random() * 0.6), y: 0.6 + Math.random(), z: wz * G.speed * (0.7 + Math.random() * 0.6) }, life: 1.6 + Math.random(), size: 0.07, color: leaves[Math.floor(Math.random() * leaves.length)], gravity: 1.2, drag: 0.3 });
    }
  }

  // ---------- Перекати-поле (пустыня) ----------

  updateTumbleweeds(dt) {
    const T = TUMBLEWEED, p = this.player;
    const list = (this.tumbles ||= []);
    // новое — если герой в пустыне (или рядом с ней) и их мало
    this.tumbleIn ??= rnd(T.every);
    this.tumbleIn -= dt;
    if (this.tumbleIn <= 0 && list.length < T.max) {
      this.tumbleIn = rnd(T.every);
      const a = this.windAngle(), d = rnd(T.spawn);
      // с подветренной стороны (катится к герою и мимо), в сторону — немного
      const off = (Math.random() * 2 - 1) * 12;
      const x = p.position.x - Math.sin(a) * d + Math.cos(a) * off, z = p.position.z - Math.cos(a) * d - Math.sin(a) * off;
      const y = this.world.surfaceY(x, z);
      if (this.biomeAt?.(x, z, y) === "desert" && this.world.topBlock(Math.floor(x), Math.floor(z))) this.spawnTumbleweed(x, y, z, a);
    }
    for (const e of [...list]) this.moveTumbleweed(e, dt);
  }

  spawnTumbleweed(x, y, z, angle) {
    const T = TUMBLEWEED;
    const e = new Entity({ type: "tumbleweed", name: "TUMBLEWEED", position: new Vec3(x, y, z), maxHp: 1e6, radius: T.size / 2, height: T.size });
    e.kind = "critter";
    e.faction = "neutral";
    const sp = rnd(T.speed), a = angle + (Math.random() - 0.5) * 0.5;
    Object.assign(e, { tumble: { vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: 0, spin: Math.random() * 6, alpha: 1, fade: false }, noBar: true, noMap: true, xp: 0 });
    // получило урон — тает
    e.onDamage = () => void (e.tumble.fade = true);
    this.entities.add(e);
    this.tumbles.push(e);
  }

  moveTumbleweed(e, dt) {
    const T = TUMBLEWEED, t = e.tumble, P = e.position;
    e.stats.hp = e.stats.maxHp; // не умирает — только тает
    const me = this.player.position;
    if (!t.fade && (Math.hypot(P.x - me.x, P.z - me.z) > T.far || this.biomeAt?.(P.x, P.z, P.y) !== "desert")) t.fade = true;
    if (t.fade) {
      t.alpha -= dt / T.fade;
      if (t.alpha <= 0 || !this.entities.list.includes(e)) {
        this.removeEntity(e);
        this.tumbles.splice(this.tumbles.indexOf(e), 1);
        return;
      }
    }
    // катится по земле, подпрыгивая; стена выше блока впереди — отскакивает назад
    const nx = P.x + t.vx * dt, nz = P.z + t.vz * dt;
    const ground = this.world.surfaceY(nx, nz);
    if (ground > P.y + 1.1) {
      t.vx = -t.vx * 0.6;
      t.vz = -t.vz * 0.6;
    } else {
      P.x = nx;
      P.z = nz;
    }
    t.vy -= 14 * dt;
    P.y += t.vy * dt;
    const g = this.world.surfaceY(P.x, P.z);
    if (P.y <= g) {
      P.y = g;
      t.vy = rnd(T.hop) * (0.5 + Math.random() * 0.5);
    }
    t.spin += Math.hypot(t.vx, t.vz) * dt * 2;
  }

  // Вид: шар из веточек — кубики по сфере, крутится по ходу; тает — прозрачнее
  tumbleSprites() {
    const out = [], T = TUMBLEWEED;
    for (const e of this.tumbles || []) {
      const t = e.tumble, r = T.size / 2, c = { x: e.position.x, y: e.position.y + r, z: e.position.z };
      const dir = Math.atan2(t.vx, t.vz);
      for (let i = 0; i < 14; i++) {
        // точки на сфере (золотой угол), повёрнутые на spin вокруг оси поперёк движения
        const yy = 1 - ((i + 0.5) / 14) * 2, rr = Math.sqrt(1 - yy * yy), th = i * 2.39996;
        const lx = Math.cos(th) * rr, lz = Math.sin(th) * rr;
        const cy = Math.cos(t.spin), sy = Math.sin(t.spin);
        const fz = lz * cy - yy * sy, fy = lz * sy + yy * cy; // качение: вращение в плоскости движения
        const wx = lx * Math.cos(dir) + fz * Math.sin(dir), wz = -lx * Math.sin(dir) + fz * Math.cos(dir);
        out.push({ x: c.x + wx * r, y: c.y + fy * r, z: c.z + wz * r, size: 0.09, color: i % 3 ? T.color : T.color.map((v) => v * 0.75), alpha: Math.max(0, t.alpha) });
      }
    }
    return out;
  }
}
