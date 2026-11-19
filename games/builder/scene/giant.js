// ============================================================
//  Гигант-скример (GIANT): безвредный (здоровье не трогает). Случайно раз в GIANT.every секунд — если герой
//  в главном мире на острове радиусом не меньше GIANT.minIsland (главном или дополнительном) — со спины,
//  из слепой зоны, к нему бежит великан в 10 блоков: снося всё перед собой, тяжёлые шаги — чем ближе, тем
//  громче и сильнее трясёт экран. Добежал — останавливается вплотную и стоит, пока на него не посмотрят:
//  посмотрел — исчез. Герой в пещере — гигант бежит к точке над ним, потом к ближайшему выходу из пещер
//  и садится лицом к выходу (ждёт). Видят все (существо «giant» идёт по сети как обычное: позу — флагами).
//  Двигает его хост (соло — сам): без физики, по земле острова; эффекты (шаги, тряска) — у каждого свои.
// ============================================================

import { GIANT } from "../config.js";

const rnd = ([a, b]) => a + Math.random() * (b - a);
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class GiantPart {
  // ---------- Хост / соло: таймер, появление, бег ----------
  updateGiant(dt) {
    if (this.net?.role === "client" || this.duel || this.dedicated && !this.allHeroes().length) return;
    const g = this.giant;
    if (g) return this.moveGiant(g, dt);
    if (this.inMain && !this.inMain()) return; // пока герой в комнате портала — таймер стоит
    this.giantIn ??= rnd(GIANT.every);
    this.giantIn -= dt;
    if (this.giantIn > 0) return;
    this.giantIn = GIANT.retry; // не вышло (не тот остров, некуда поставить) — попробуем чуть позже
    const heroes = this.allHeroes().filter((h) => h.alive && this.giantIsland(h));
    if (!heroes.length) return;
    this.spawnGiant(heroes[Math.floor(Math.random() * heroes.length)]);
  }

  // Остров под героем — радиусом не меньше GIANT.minIsland (главный или дополнительный, небесный тоже)
  giantIsland(h) {
    const T = this.terrain;
    if (!T) return null;
    return T.discs.find((d) => d.r >= GIANT.minIsland && Math.hypot(h.position.x - d.x, h.position.z - d.z) < d.r - (d.edge || 0) * 0.5) || null;
  }

  // Куда смотрит герой (свой — взгляд камеры; гость — его yaw из сети)
  heroYaw(h) {
    return h === this.player ? this.look.yaw : h.yaw || 0;
  }

  // Под землёй ли герой (в пещере): над ним толща земли
  inCave(h) {
    return this.groundHeight(h.position.x, h.position.z) > h.position.y + 3;
  }

  // Высота земли под гигантом: рельеф острова (постройки и деревья он сносит); над пустотой — прежняя
  giantGround(x, z, was) {
    return this.groundRel(x, z) >= 1 ? this.groundHeight(x, z) : was;
  }

  spawnGiant(h) {
    const disc = this.giantIsland(h);
    // со спины: направление «назад» от взгляда героя ± GIANT.spread; ближе, пока точка не на этом острове
    const back = this.heroYaw(h) + Math.PI + (Math.random() * 2 - 1) * GIANT.spread;
    let at = null;
    for (let d = GIANT.from; d >= GIANT.minFrom && !at; d -= 5) {
      const x = h.position.x + Math.sin(back) * d, z = h.position.z + Math.cos(back) * d;
      if (Math.hypot(x - disc.x, z - disc.z) < disc.r - (disc.edge || 0) && this.groundRel(x, z) >= 1) at = { x, z };
    }
    if (!at) return;
    const e = this.spawn("giant", { x: at.x, y: this.groundHeight(at.x, at.z), z: at.z, yaw: angleTo(at, h.position) });
    if (!e) return;
    this.entities.add(e);
    e.noSave = true;
    e.target = h;
    e.cave = this.inCave(h);
    e.state = "run";
    e.life = GIANT.life;
    this.giant = e;
    this.engine.log(`гигант: появился в ${Math.round(Math.hypot(at.x - h.position.x, at.z - h.position.z))} м за спиной у ${h.name}${e.cave ? " (герой в пещере)" : ""}`);
  }

  // Ближайший выход из пещер к точке p: проходы наверх (room.exit) и выходы логов
  caveExitNear(p) {
    const list = [
      ...(this.caves?.rooms || []).filter((r) => r.exit).map((r) => r.exit),
      ...(this.terrain?.lairs || []).filter((l) => l.tunnel).map((l) => ({ x: l.tunnel.x1, z: l.tunnel.z1 })),
    ];
    return list.reduce((a, b) => (!a || Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a), null);
  }

  moveGiant(e, dt) {
    const h = e.target;
    e.life -= dt;
    if (!h?.alive || e.life <= 0 || !this.entities.list.includes(e)) return this.removeGiant(e);
    // куда бежать: к герою (в пещере — к точке над ним), потом — к выходу из пещеры
    let goal = null;
    if (e.state === "run") goal = h.position;
    else if (e.state === "exit") goal = e.seat;
    if (goal) {
      const dx = goal.x - e.position.x, dz = goal.z - e.position.z, d = Math.hypot(dx, dz);
      const stop = e.state === "run" && !e.cave ? GIANT.stop : 1;
      if (d <= stop) this.giantArrived(e);
      else {
        const step = Math.min(d - stop, GIANT.speed * dt);
        e.position.x += (dx / d) * step;
        e.position.z += (dz / d) * step;
        e.yaw = Math.atan2(dx, dz);
        this.giantSmash(e, dx / d, dz / d);
      }
    }
    e.position.y = this.giantGround(e.position.x, e.position.z, e.position.y);
    e.velocity.x = e.velocity.y = e.velocity.z = 0;
    e.netWalk = e.state === "run" || e.state === "exit"; //  гостям — бежит
    e.diving = e.state === "sit"; //                          гостям — сидит (флаг 64)
    if (e.state === "stand") e.yaw = angleTo(e.position, h.position); // стоит — смотрит на героя
    // стоит / сидит — исчезает, когда на него посмотрел кто-то из героев
    if ((e.state === "stand" || e.state === "sit") && this.allHeroes().some((x) => x.alive && this.seesGiant(x, e))) this.removeGiant(e, true);
  }

  giantArrived(e) {
    if (e.state === "run" && e.cave) {
      const exit = this.caveExitNear(e.position);
      if (!exit) return void (e.state = "stand");
      // садится перед выходом, лицом к нему (со стороны, откуда прибежал)
      const away = Math.atan2(e.position.x - exit.x, e.position.z - exit.z);
      const a = Number.isFinite(away) ? away : Math.random() * Math.PI * 2;
      e.seat = { x: exit.x + Math.sin(a) * GIANT.seat, z: exit.z + Math.cos(a) * GIANT.seat, face: exit };
      e.state = "exit";
      return;
    }
    if (e.state === "exit") {
      e.state = "sit";
      e.yaw = angleTo(e.position, e.seat.face);
      return;
    }
    e.state = "stand";
  }

  // Посмотрел ли герой x на гиганта: гигант в пределах GIANT.look° от взгляда и его видно (без стен между)
  seesGiant(x, e) {
    const eye = { x: x.position.x, y: x.position.y + (x.height || 1.8) * 0.9, z: x.position.z };
    const body = { x: e.position.x, y: e.position.y + (e.state === "sit" ? 3 : 6), z: e.position.z };
    if (Math.abs(wrap(angleTo(eye, body) - this.heroYaw(x))) > (GIANT.look * Math.PI) / 180) return false;
    const dx = body.x - eye.x, dy = body.y - eye.y, dz = body.z - eye.z, d = Math.hypot(dx, dy, dz);
    const hit = this.world.raycast(eye, { x: dx / d, y: dy / d, z: dz / d }, d);
    return !hit || hit.t >= d - GIANT.radius - 1;
  }

  // Сносит всё перед собой выше земли острова (постройки, деревья, блоки героев): полоса шириной с него
  giantSmash(e, fx, fz) {
    const cells = [], r = GIANT.radius, ground = Math.floor(e.position.y);
    for (const ahead of [r, r + 1]) for (let side = -r; side <= r; side += 0.8) {
      const x = Math.floor(e.position.x + fx * ahead - fz * side), z = Math.floor(e.position.z + fz * ahead + fx * side);
      const floor = Math.max(ground, Math.ceil(this.groundHeight(x, z)));
      for (let y = floor; y < ground + GIANT.height; y++) if (this.world.has(x, y, z)) cells.push([x, y, z]);
    }
    if (cells.length) this.bossBreak(cells);
  }

  removeGiant(e, seen = false) {
    if (this.entities.list.includes(e)) {
      if (seen) this.fx?.burst({ x: e.position.x, y: e.position.y + 5, z: e.position.z }, { count: 30, speed: 3, color: [40, 36, 40], size: 0.35, life: 0.8, gravity: -1, drag: 2 });
      this.removeEntity(e);
    }
    this.giant = null;
    this.giantIn = rnd(GIANT.every);
    this.engine.log(seen ? "гигант: на него посмотрели — исчез" : "гигант: исчез");
  }

  // ---------- У каждого (хост, гость, соло): шаги, тряска, поза ----------
  giantFx(dt) {
    const me = this.player;
    for (const e of this.entities.list) {
      if (e.type !== "giant") continue;
      const running = e.remote ? !!e.net?.walk : !!e.netWalk;
      e.view?.animator.setBase(e.diving ? "Sit" : running ? "Run" : "Idle", 1);
      if (!me) continue;
      // шаг — каждые GIANT.stride м пройденного пути
      const last = (e.fxLast ||= { x: e.position.x, z: e.position.z });
      e.fxWalked = (e.fxWalked || 0) + Math.hypot(e.position.x - last.x, e.position.z - last.z);
      last.x = e.position.x;
      last.z = e.position.z;
      if (e.fxWalked < GIANT.stride) continue;
      e.fxWalked = 0;
      const dx = e.position.x - me.position.x, dz = e.position.z - me.position.z, d = Math.hypot(dx, dz) || 1;
      const k = Math.max(0, 1 - d / GIANT.hear) ** 1.5; // ближе — громче и сильнее
      if (k <= 0) continue;
      // звук — с его стороны (точка на пути к нему, чтобы громкость задавали мы, а не затухание движка)
      const at = { x: me.position.x + (dx / d) * 4, y: me.position.y + 1, z: me.position.z + (dz / d) * 4 };
      this.engine.sound.play("giantStep", { at, volume: 0.4 + 0.9 * k }); // громче — до клиппинга (пик звука ~0.9)
      this.shake.add(GIANT.shake * k);
      this.engine.pad?.rumble(Math.min(1, k), 160);
      this.fx?.burst({ x: e.position.x, y: e.position.y + 0.2, z: e.position.z }, { count: 10, speed: 2.5, color: [120, 104, 86], size: 0.25, life: 0.7, gravity: 3, drag: 2 });
    }
  }
}
