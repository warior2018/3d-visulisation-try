// ============================================================
//  HostileBrain — мозги врага (моба).
//   1. Ударили — злится на обидчика (с любого расстояния). Заметил врага ближе
//      aggroRadius — тоже злится. Со стадом (herd) — поднимает соседей по цепочке (social.js).
//   2. Злой — идёт к цели по найденному пути (pursue + Navigator), пока цель не дальше leash.
//   3. Не толпится с остальными (separate). Подошёл — бьёт своей атакой (melee).
//   4. Злиться не на кого — бродит вокруг места, где появилось (wander — как WanderBrain).
//  Аура провокации (у сущности tauntRadius, например у стража): зашёл в зону — злится на неё (social.js).
//  Охота (ctx.hunt — сущность или список): все злятся на неё (на ближайшую из списка — сетевая игра:
//  каждый моб на ближайшего героя), где бы она ни была (нашествие), leash не действует.
//  Злится на героя (type "player"), а другой герой намного ближе (на SWITCH м) — переключается на него
//  (раз в RETARGET с, без «дёрганья»). Провокация и аура стража сильнее этого.
//  Своя территория (territory: { x, z, radius }) — для боссов в логове: из неё не выходит. Цель внутри — гонится;
//  снаружи — только стреляет (если стрелок и достаёт), дальше radius + дальность выстрела — успокаивается.
//  Без цели — возвращается домой (в центр территории). Нашествие таких не зовёт.
//  Цели — те, с кем существо враждует (entity.isHostileTo), а не «игрок» жёстко:
//  так же можно сделать мобов, которые воюют друг с другом.
//  Стрелок (ranged: { range, minRange, advance }) и у сущности e.rangedAttack (атака с перезарядкой): цель ближе
//  range, дальше minRange и её видно — стоит и стреляет: e.rangedAttack.use(), а сам снаряд запускает игра
//  (ctx.shoot(e, target, attack)). Цель вплотную (ближе minRange) — бьёт, как обычный моб. Не видно или
//  далеко — подходит. advance — на перезарядке не стоит, а подходит ближе (метатель: бросил — идёт на тебя);
//  без advance — держит дистанцию и ждёт перезарядку на месте (стрелок с пистолетом).
// ============================================================

import { Brain } from "./brain.js";
import { WanderBrain } from "./wander.js";
import { Navigator } from "./pathfinder.js";
import { alertHerd, tauntTarget, busy, auraTarget } from "./social.js";
import { pursue, separate, neighbors, melee, turnTowards } from "../world/behaviors.js";

// Застрял: раз в every с проверяем, стал ли ближе к цели хотя бы на gain м
const STUCK = { every: 0.8, gain: 0.5 };
const dist2d = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
// Настоящее расстояние между серединами тел (с высотой) — для «заметил»
const dist3d = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y + (a.height || 1.8) / 2 - b.position.y - (b.height || 1.8) / 2, a.position.z - b.position.z);
const NONE = Object.freeze([]); // «никто не разозлился» — один общий пустой список, а не новый каждый кадр
const SWITCH = 3; //    другой герой ближе на столько метров — переключиться на него
const RETARGET = 0.5; // как часто проверять (с)

export class HostileBrain extends Brain {
  // herd: { radius, alertOnSight } или null — без стада
  // wander: { radius, pause } — бродить без цели (null — стоять на месте); huntRadius — докуда идти на охоту
  // chase — с территорией: цель ушла из логова — не стоит, а идёт за ней (быстрее на chase.speed, прыгает
  // chase.jump м/с), по пути игра ломает блоки перед ним (ctx.dig); успокаивается, только если цель дальше leash
  constructor({ aggroRadius = 12, leash = 45, stopDistance = 1.1, turnSpeed = 4, jumpSpeed = 7.5, herd = null, wander = null, huntRadius = 150, ranged = null, territory = null, sightHeight = Infinity, chase = null, windupSlow = 0.3, breakAura = 0 } = {}) {
    super();
    // зол на стража (аура провокации, фракция town), а герой подошёл ближе breakAura м — бросает стража и идёт на героя
    this.breakAura = breakAura;
    this.windupSlow = windupSlow; // во время замаха удара идёт с этой долей скорости (0 — стоит, 1 — как обычно)
    this.chase = chase;
    this.sightHeight = sightHeight; // замечает врага, только если тот не выше / ниже этого (тролль в пещере не видит тех, кто ходит по горе)
    this.territory = territory; // { x, z, radius } — не выходит из круга (логово босса) или null
    this.ranged = ranged; // { range, minRange } — стреляет издалека (см. выше) или null
    this.aggroRadius = aggroRadius; // замечает врага ближе этого
    this.leash = leash; //             дальше этого — отстаёт и успокаивается
    this.stopDistance = stopDistance;
    this.turnSpeed = turnSpeed;
    this.jumpSpeed = jumpSpeed;
    this.herd = herd;
    this.idle = wander ? new WanderBrain({ lookRadius: 0, ...wander }) : null; // мобы на героя не «засматриваются»
    this.huntRadius = huntRadius;
  }

  // Ближайший враг ближе radius (only — ещё условие: например, только герои).
  // o.noticeScale — насколько заметна цель: радиус, с которого её замечают, умножается на него (присед — 0.55;
  // игра собирает его из множителей: notice.js → setNotice)
  nearestEnemy(e, entities, radius, only = null) {
    let best = null;
    let bestD = Infinity;
    // есть сетка соседей (ctx.nearR) — только ближние кандидаты (заметность до ×1.5), иначе — все
    const list = this.ctx?.nearR ? this.ctx.nearR(e, radius * 1.5) : entities;
    for (const o of list) {
      if (!o.alive || !e.isHostileTo(o) || (only && !only(o))) continue;
      if (Math.abs(o.position.y - e.position.y) > this.sightHeight) continue;
      const d = dist3d(e, o); // радиус замечания — по прямой между телами (высота тоже считается)
      if (d > radius * (o.noticeScale ?? 1) || d >= bestD) continue;
      if (this.ctx?.combatFor?.(e)?.blocked?.(e, o)) continue; // за стеной / блоками — не видит
      best = o;
      bestD = d;
    }
    return best;
  }

  // Застрял ли по пути к цели: каждые STUCK.every с — приблизился меньше чем на STUCK.gain м (и ещё не дошёл)
  stuck(e, target, dt) {
    const c = (e.stuckCheck ||= { t: 0, d: Infinity, stuck: false });
    c.t += dt;
    if (c.t >= STUCK.every) {
      const d = dist3d(e, target);
      c.stuck = d > this.stopDistance + 1 && d > c.d - STUCK.gain;
      c.t = 0;
      c.d = d;
    }
    return c.stuck;
  }

  // Пора ли снова выбрать цель (раз в RETARGET с — у каждого моба свои часы)
  retargetDue(e, dt) {
    e.retargetIn = (e.retargetIn ?? Math.random() * RETARGET) - dt;
    if (e.retargetIn > 0) return false;
    e.retargetIn = RETARGET;
    return true;
  }

  // Цель охоты: ctx.hunt — сущность или список (герои); из списка — ближайший живой, с «прилипанием»:
  // текущий остаётся, пока другой не ближе на SWITCH м (проверка раз в RETARGET с)
  huntTarget(e, hunt, dt) {
    if (!hunt) return null;
    if (!Array.isArray(hunt)) return hunt.alive && e.isHostileTo(hunt) ? hunt : null;
    const cur = hunt.includes(e.aggro) && e.aggro.alive ? e.aggro : null;
    if (cur && !this.retargetDue(e, dt)) return cur;
    let best = cur, bestD = cur ? dist2d(e, cur) - SWITCH : Infinity;
    for (const o of hunt) {
      if (!o?.alive || !e.isHostileTo(o)) continue;
      const d = dist2d(e, o);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  // Разозлиться на target (со стадом — и соседи)
  anger(e, target, entities) {
    if (this.herd) return alertHerd(e, target, entities, { ...this.herd, near: this.ctx?.nearR, sees: (a, b) => !this.ctx?.combatFor?.(a)?.blocked?.(a, b) });
    if (e.aggro === target) return [];
    e.aggro = target;
    return [e];
  }

  update(e, ctx, dt) {
    this.ctx = ctx; // для проверки «видит ли» (nearestEnemy)
    const entities = ctx.entities;
    // свой «штурман» у каждого, под рост существа; широкий (радиус больше полклетки — тролль) ищет путь как
    // «толстый»: клетка занята, если занята хоть одна соседняя (проход шириной 1 — не для него)
    if (!e.nav) {
      const base = ctx.navWorld.isSolid;
      const wide = (e.radius || 0.3) > 0.5;
      const isSolid = wide ? (x, y, z) => {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (base(x + dx, y, z + dz)) return true;
        return false;
      } : base;
      // вода: обходит (клетка с водой — как стена), пока цель сама не в воде (e.avoidWater)
      const wet = ctx.navWorld.isWater;
      const solid = wet ? (x, y, z) => isSolid(x, y, z) || (e.avoidWater && wet(x, y, z)) : isSolid;
      e.nav = new Navigator({ ...ctx.navWorld, isSolid: solid, height: Math.ceil(e.height - 1e-6) });
    }
    const avoid = !e.aggro?.inWater;
    if (avoid !== e.avoidWater) {
      e.avoidWater = avoid;
      e.nav.reset();
    }
    let alerted = NONE;

    // 1. Злость. Цель «прилипает»: ударили — злимся на обидчика, только если своей цели ещё нет
    const hurtBy = e.attackedBy;
    e.attackedBy = null;
    // e.returning — возвращается в логово (решает игра): не замечает никого, пока не дома или пока не ранят
    if (hurtBy) e.returning = false;
    if (e.returning && this.territory && Math.hypot(e.position.x - this.territory.x, e.position.z - this.territory.z) <= this.territory.radius) e.returning = false;
    if (e.returning) e.aggro = null;
    if (hurtBy?.alive && e.isHostileTo(hurtBy) && !busy(e)) alerted = this.anger(e, hurtBy, entities);
    // Силой цель меняют (по возрастанию силы): аура стража → нашествие → провокация (навык)
    const force = (t) => {
      if (t && e.aggro !== t) {
        e.aggro = t;
        alerted = [e];
      }
    };
    const taunted = tauntTarget(e, dt); //                                   провокация — сильнее всего
    const T = this.territory;
    const fromHome = (o) => Math.hypot(o.position.x - T.x, o.position.z - T.z);
    const hunt = T ? null : this.huntTarget(e, ctx.hunt, dt); // нашествие: ближайший герой (кроме сидящих в логове)
    const aura0 = !hunt && !taunted ? auraTarget(e, entities) : null; //     зашёл в зону стража — злится на него
    const onWarden = aura0 || (e.aggro?.alive && e.aggro.faction === "town");
    const close = this.breakAura && onWarden ? this.nearestEnemy(e, entities, this.breakAura, (o) => o.type === "player") : null;
    const aura = close ? null : aura0;
    force(taunted || hunt || aura || close);
    if (e.aggro && e.aggro !== hunt && e.aggro !== taunted && e.aggro !== aura && (!e.aggro.alive || dist2d(e, e.aggro) > this.leash)) e.aggro = null;
    // Злится на героя, а рядом другой герой гораздо ближе — на него (сетевая игра: не все мобы на одного)
    if (e.aggro?.type === "player" && e.aggro !== hunt && e.aggro !== taunted && e.aggro !== aura && this.retargetDue(e, dt)) {
      const near = this.nearestEnemy(e, entities, this.aggroRadius, (o) => o.type === "player");
      if (near && near !== e.aggro && dist2d(e, near) + SWITCH < dist2d(e, e.aggro)) e.aggro = near;
    }
    if (!e.aggro && !e.returning && (!this.herd || this.herd.alertOnSight !== false)) {
      const seen = this.nearestEnemy(e, entities, this.aggroRadius);
      if (seen) alerted = this.anger(e, seen, entities);
    }
    // Территория: цель ушла далеко от логова (дальше, чем достанет бросок) — успокаивается
    if (T && !this.chase && e.aggro && fromHome(e.aggro) > T.radius + (this.ranged?.range ?? 0)) e.aggro = null;

    // 2. Преследование (или стоим, если злиться не на кого)
    const target = e.aggro;
    let walking = false;
    // Сменили занятие (бродили — погнались или наоборот) — старый путь не нужен;
    // успокоились — бродим уже там, где оказались (а не тащимся к месту появления)
    if (!!target !== !!e.hunting) {
      e.nav.reset();
      if (!target) e.wander = null;
    }
    e.hunting = !!target;
    // Стрелок: цель в пределах выстрела и видна — стоим, поворачиваемся и стреляем
    const r = this.ranged;
    const shooting = !!(target && r && e.rangedAttack && dist2d(e, target) <= r.range && dist2d(e, target) >= (r.minRange ?? 3) &&
      (!r.advance || e.rangedAttack.ready) && !ctx.combatFor?.(e)?.blocked?.(e, target));
    if (shooting) {
      e.velocity.x = 0;
      e.velocity.z = 0;
      turnTowards(e, Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z), this.turnSpeed * 1.5, dt);
      if (e.rangedAttack.ready && e.rangedAttack.use(e, {})) ctx.shoot?.(e, target, e.rangedAttack);
    } else if (target && T && !this.chase && fromHome(target) > T.radius) {
      // Цель вне логова: не выходим — стоим и смотрим на неё (бросок — когда перезарядится)
      e.velocity.x = 0;
      e.velocity.z = 0;
      turnTowards(e, Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z), this.turnSpeed, dt);
    } else if (target) {
      // Настройки погони — один объект на существо (каждый кадр только обновляем числа, без нового объекта)
      const opts = (e.pursueOpts ||= { navigator: e.nav, stopDistance: this.stopDistance, turnSpeed: this.turnSpeed, jumpSpeed: this.jumpSpeed });
      opts.navigator = e.nav;
      opts.radius = target === hunt ? this.huntRadius : this.leash;
      // за пределами логова — погоня: быстрее, прыжок выше. Блоки ломает (ctx.dig) только если застрял:
      // сначала ищет путь сам, не приближается chase-проверку — тогда пробивает себе ход
      const out = this.chase && T && fromHome(target) > T.radius;
      opts.speed = e.speed * (out ? 1 + (this.chase.speed || 0) : 1);
      opts.jumpSpeed = out ? this.chase.jump || this.jumpSpeed : this.jumpSpeed;
      if (this.chase && this.stuck(e, target, dt)) ctx.dig?.(e, target, dt);
      // e.detour — временная точка от игры (босс прорыл лестницу вверх к цели над головой): идём к ней
      if (e.detour && (e.detour.t -= dt) <= 0) e.detour = null;
      walking = pursue(e, e.detour || target, dt, opts);
    } else if (T && fromHome(e) > 1) {
      // Без цели и не дома — идём в центр логова (далеко — с погоней: ломает блоки на пути домой)
      const home = { position: { x: T.x, y: e.position.y, z: T.z } };
      if (this.chase && this.stuck(e, home, dt)) ctx.dig?.(e, home, dt);
      walking = pursue(e, { position: { x: T.x, y: e.position.y, z: T.z } }, dt, {
        navigator: e.nav, radius: Infinity, speed: e.speed, stopDistance: 0.6, turnSpeed: this.turnSpeed, jumpSpeed: this.jumpSpeed,
      });
    } else if (this.idle) {
      walking = this.idle.update(e, ctx, dt).walking; // бродит (и сам не толпится)
    } else {
      e.velocity.x = 0;
      e.velocity.z = 0;
    }

    // 3. Не толпиться и бить
    if (target || !this.idle) separate(e, neighbors(e, ctx));
    if (e.attack) {
      if (target && !shooting) melee(e, target, dt, e.attack, ctx.combatFor?.(e) || {});
      else e.attack.update(dt); // кулдаун идёт и без цели
      // замахивается — почти не идёт (от удара можно отойти)
      if (e.attack.pending) {
        e.velocity.x *= this.windupSlow;
        e.velocity.z *= this.windupSlow;
        // во время замаха — лицом к цели (зашёл за спину — доворачивается); вплотную не крутится (угол скачет)
        if (target && dist2d(e, target) > 0.35) turnTowards(e, Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z), this.turnSpeed * 2, dt);
      }
    }
    e.rangedAttack?.update(dt);
    return { walking, alerted };
  }
}
