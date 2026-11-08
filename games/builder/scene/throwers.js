// ============================================================
//  Сцена «мир», часть: Метатели: мобы, которые бросают и стреляют издалека.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { ATTACKS, MOB_RANGED, BULLET } from "../config.js";
import { Vec3, aimArc } from "../../../engine/index.js";

export class ThrowersPart {
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
    const dir = e.ranged.straight ? (() => { const v = new Vec3(to.x - from.x, to.y - from.y, to.z - from.z); return v.scale(r.speed / (Math.hypot(v.x, v.y, v.z) || 1)); })() : null;
    this.projectiles.launch({
      owner: e, position: from, velocity: dir || aimArc(from, to, r.speed, MOB_RANGED.gravity), attack, damage, item: e.ranged.item, scale: e.ranged.scale || 1, // валун тролля — крупный
      gravity: dir ? 0 : MOB_RANGED.gravity, spin: dir ? 0 : 2,
      onHit: (p, hit) => {
        if (!e.isHostileTo(hit.entity)) return; // своих не бьёт (пролетело сквозь)
        // shot — что летит: блок может отразить снаряд обратно (combat.js → reflectShot)
        const res = attack.hit(e, hit.entity, { part: hit.part, baseDamage: p.damage, shot: { projectile: { item: e.ranged.item, speed: r.speed, gravity: dir ? 0 : MOB_RANGED.gravity, spin: dir ? 0 : 2, scale: e.ranged.scale || 1 } } });
        this.engine.sound.play(hit.entity === this.player ? "hurt" : "hit", { at: hit.entity.position });
        this.engine.log(`${e.name} → ${hit.entity.name}: ${r.name} -${res?.dealt ?? 0} HP`);
      },
      onLand: () => {},
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
    if (tr) this.beams.add({ from, to, color: BULLET.color, core: BULLET.core, life: tr.life, width: tr.width });
  }

  // Чёрная точка там, где пуля ударила в блок (чуть ближе к стрелку — чтобы её не закрывала сама грань)
  bulletHole(origin, dir, t) {
    const p = { x: origin.x + dir.x * (t - 0.02), y: origin.y + dir.y * (t - 0.02), z: origin.z + dir.z * (t - 0.02) };
    this.beams.mark(p, { color: BULLET.hole, life: BULLET.holeLife, size: BULLET.holeSize });
    this.sparkFx(p); // искры и пыль (scene/effects.js)
  }

  // Моб стреляет из пистолета: мгновенный луч из руки в грудь цели с разбросом spread; первым на пути —
  // блок (пуля в стену) или существо (урон — только врагу). След пули — жёлтый луч
  mobGunshot(e, target, attack) {
    const w = e.ranged;
    const from = new Vec3(e.position.x + Math.sin(e.yaw) * 0.3, e.position.y + e.height * 0.75, e.position.z + Math.cos(e.yaw) * 0.3);
    const to = { x: target.position.x, y: target.position.y + target.height * 0.6, z: target.position.z };
    let dir = new Vec3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir = new Vec3(dir.x / len + (Math.random() * 2 - 1) * w.spread, dir.y / len + (Math.random() * 2 - 1) * w.spread * 0.5, dir.z / len + (Math.random() * 2 - 1) * w.spread);
    const k = Math.hypot(dir.x, dir.y, dir.z);
    dir = new Vec3(dir.x / k, dir.y / k, dir.z / k);
    const max = w.range + 6;
    const hit = this.entities.raycast(from, dir, max, [e]);
    const wall = this.world.raycast(from, dir, max);
    const t = hit && (!wall || hit.t <= wall.t) ? hit.t : wall ? wall.t : max;
    if (hit && t === hit.t && e.isHostileTo(hit.entity)) {
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
