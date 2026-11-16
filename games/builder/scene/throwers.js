// ============================================================
//  Сцена «мир», часть: Метатели: мобы, которые бросают и стреляют издалека.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { ATTACKS, MOB_RANGED, BULLET, FLASH } from "../config.js";
import { Vec3, aimArc } from "../../../engine/index.js";
import { skinFx } from "../skins.js";

// Атака → оружие (чей скин красит эффект)
export const ITEM_OF_ATTACK = { pistol: "pistol", auto: "auto", shotgun: "shotgun", rifle: "rifle", crossbow: "crossbow", bow: "bow", "bow-blast": "bow", "hand-grenade": "grenades", launcher: "launcher", cluster: "launcher", dynamite: "dynamite", katana: "katana", machete: "machete", "war-hammer": "war-hammer" };
export const lighter = (c) => c.map((v) => Math.round(v + (255 - v) * 0.6));

export class ThrowersPart {
  // Над головой e близко потолок (пещера): блок в 1–4 клетках выше макушки
  lowCeiling(e) {
    const x = Math.floor(e.position.x), z = Math.floor(e.position.z), top = Math.floor(e.position.y + (e.height || 2));
    for (let k = 0; k < 4; k++) if (this.world.has(x, top + k, z)) return true;
    return false;
  }

  // ---------- Метатели (мобы, которые бросают издалека) ----------

  // Моб бросает в цель: снаряд по дуге (движок: aimArc) с упреждением на полшага; попал — урон (только врагу),
  // упал — пропал (камни и кости мобов на землю не падают, чтобы не засорять мир)
  mobThrow(e, target, attack) {
    const r = ATTACKS[e.ranged.attack];
    const from = { x: e.position.x, y: e.position.y + e.height * 0.85, z: e.position.z };
    const lead = Math.hypot(target.position.x - e.position.x, target.position.z - e.position.z) / r.speed; // летит ~столько секунд
    const to = {
      x: target.position.x + (target.velocity?.x || 0) * lead * 0.5,
      y: target.position.y + target.height * 0.6,
      z: target.position.z + (target.velocity?.z || 0) * lead * 0.5,
    };
    const [lo, hi] = e.rangedDamage;
    const damage = lo + Math.floor(Math.random() * (hi - lo + 1));
    // straight — летит прямо (сгусток лича), иначе — по дуге
    // низкий потолок над боссом (пещера) — бросает прямо, а не дугой в свод
    const straight = e.ranged.straight || (e.boss && this.lowCeiling(e));
    // прямой бросок — тоже падает, но легче: тяжесть от дальности (дальше — легче, MOB_RANGED.flat); разброс — spread% от spreadBase°
    const F = MOB_RANGED.flat, dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const light = e.ranged.straight ? 0 : straight ? MOB_RANGED.gravity * Math.max(F.min, Math.min(F.max, F.near / Math.max(1, dist))) : MOB_RANGED.gravity;
    let vel = light ? aimArc(from, to, r.speed, light) : new Vec3(to.x - from.x, to.y - from.y, to.z - from.z).scale(r.speed / Math.max(1e-6, dist)); // сгусток лича — прямо
    if (e.ranged.spread) { // разброс оружия: % от MOB_RANGED.spreadBase градусов, вбок и вверх-вниз
      const rad = (((MOB_RANGED.spreadBase * e.ranged.spread) / 100) * Math.PI) / 180, yaw = (Math.random() * 2 - 1) * rad, pitch = (Math.random() * 2 - 1) * rad;
      const h = Math.hypot(vel.x, vel.z), a = Math.atan2(vel.x, vel.z) + yaw, up = Math.atan2(vel.y, h) + pitch, sp = Math.hypot(h, vel.y);
      vel = new Vec3(Math.sin(a) * Math.cos(up) * sp, Math.sin(up) * sp, Math.cos(a) * Math.cos(up) * sp);
    }
    const dir = straight ? vel : null;
    this.projectiles.launch({
      owner: e, position: from, velocity: vel, attack, damage, item: e.ranged.item, scale: e.ranged.scale || 1, // валун тролля — крупный
      gravity: light, spin: dir ? 1 : 2,
      onHit: (p, hit) => {
        if (!e.isHostileTo(hit.entity) && !e.canHit?.(hit.entity)) return; // своих не бьёт (босс — бьёт и мобов)
        // shot — что летит: блок может отразить снаряд обратно (combat.js → reflectShot)
        const res = attack.hit(e, hit.entity, { part: hit.part, baseDamage: p.damage, shot: { projectile: { item: e.ranged.item, speed: r.speed, gravity: light, spin: dir ? 1 : 2, scale: e.ranged.scale || 1 } } });
        this.engine.sound.play(hit.entity === this.player ? "hurt" : "hit", { at: hit.entity.position });
        this.engine.log(`${e.name} → ${hit.entity.name}: ${r.name} -${res?.dealt ?? 0} HP`);
      },
      // снаряд босса (валун, сгусток) ломает блок, в который попал
      onLand: (p, wall) => {
        const b = wall?.block;
        if (e.boss && b) this.bossBreak?.([[b.x, b.y, b.z]]);
      },
    });
    e.view?.animator.playOnce("Throw");
    this.engine.sound.play("swing", { at: e.position });
  }

  // След выстрела героя: трассер от ствола до того, во что попал луч (последний aimedHit) — сколько висит,
  // зависит от оружия (BULLET.trace; арбалет — без трассера); в блок — чёрная точка на пару секунд
  bulletTrace(attackId) {
    const ray = this.lastRay;
    if (!ray) return;
    const { origin, dir, max } = ray;
    const hit = this.entities.raycast(origin, dir, max, [this.player, this.player.mount]);
    const wall = this.world.raycast(origin, dir, max);
    const t = hit && (!wall || hit.t <= wall.t) ? hit.t : wall ? wall.t : max;
    const end = origin.add(dir.scale(t));
    this.tracer(this.handPoint(), end, attackId);
    if (wall && t === wall.t) this.bulletHole(origin, dir, t);
  }

  // Трассер выстрела (BULLET.trace по id атаки); оружия нет в списке — ничего
  tracer(from, to, attackId) {
    const tr = BULLET.trace[attackId];
    const fx = skinFx(this.settings, ITEM_OF_ATTACK[attackId]); // скин оружия красит трассер
    const M = FLASH.muzzle;
    this.flash?.(from, { radius: M.radius, power: M.power, life: M.life, color: fx || M.color }); // вспышка у ствола
    if (tr) this.beams.add({ from, to, color: fx || BULLET.color, core: fx ? lighter(fx) : BULLET.core, life: tr.life, width: tr.width });
  }

  // Чёрная точка там, где пуля ударила в блок (чуть ближе к стрелку — чтобы её не закрывала сама грань)
  bulletHole(origin, dir, t) {
    const p = { x: origin.x + dir.x * (t - 0.02), y: origin.y + dir.y * (t - 0.02), z: origin.z + dir.z * (t - 0.02) };
    this.beams.mark(p, { color: BULLET.hole, life: BULLET.holeLife, size: BULLET.holeSize });
    this.sparkFx(p); // искры и пыль (scene/effects.js)
  }

  // Моб стреляет из пистолета: мгновенный луч из руки — чаще в голову цели (w.head), иначе в грудь, с разбросом
  // spread и отдачей recoil (вверх и чуть вбок); первым на пути — блок (пуля в стену) или существо (урон — только
  // врагу; в голову — хедшот). След пули — жёлтый луч
  mobGunshot(e, target, attack) {
    const w = e.ranged;
    const from = new Vec3(e.position.x + Math.sin(e.yaw) * 0.3, e.position.y + e.height * 0.75, e.position.z + Math.cos(e.yaw) * 0.3);
    const head = Math.random() < (w.head ?? 0);
    const to = { x: target.position.x, y: target.position.y + target.height * (head ? 0.93 : 0.6), z: target.position.z };
    let dir = new Vec3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    // отдача: вверх на 0…recoil, вбок на ±recoil/2 (вбок — поперёк линии выстрела)
    const kick = Math.random() * (w.recoil || 0), side = (Math.random() - 0.5) * (w.recoil || 0);
    const sx = -dir.z / len, sz = dir.x / len;
    dir = new Vec3(
      dir.x / len + (Math.random() * 2 - 1) * w.spread + sx * side,
      dir.y / len + (Math.random() * 2 - 1) * w.spread * 0.5 + kick,
      dir.z / len + (Math.random() * 2 - 1) * w.spread + sz * side,
    );
    const k = Math.hypot(dir.x, dir.y, dir.z);
    dir = new Vec3(dir.x / k, dir.y / k, dir.z / k);
    const max = w.range + 6;
    const hit = this.entities.raycast(from, dir, max, [e]);
    const wall = this.world.raycast(from, dir, max);
    const t = hit && (!wall || hit.t <= wall.t) ? hit.t : wall ? wall.t : max;
    if (hit && t === hit.t && (e.isHostileTo(hit.entity) || e.canHit?.(hit.entity))) {
      const [lo, hi] = e.rangedDamage;
      const res = attack.hit(e, hit.entity, { part: hit.part, baseDamage: lo + Math.floor(Math.random() * (hi - lo + 1)), shot: { hitscan: true } });
      this.engine.sound.play(hit.entity === this.player ? "hurt" : "hit", { at: hit.entity.position });
      this.engine.log(`${e.name} → ${hit.entity.name}: ${ATTACKS[w.attack].name} -${res?.dealt ?? 0} HP`);
    }
    this.tracer(from, { x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t }, ATTACKS[w.attack].id);
    if (wall && t === wall.t) this.bulletHole(from, dir, t);
    e.view?.animator.playOnce("Shoot");
    this.engine.sound.play("shot", { at: e.position });
  }
}
