// ============================================================
//  Сцена «мир», часть: Магия, ножи, ловушки, взрывы.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { toWorld, viewBasis, Vec3, Slow, TrapAttack, withStatus } from "../../../engine/index.js";
import { SHAKE, DEMO, FALL_DAMAGE, TRAPS, ATTACKS } from "../config.js";

export class MagicPart {
  // ---------- Магия, ножи, ловушки ----------

  // Точка у правой руки (откуда вылетают заклинания): чуть правее, ниже и впереди глаз — в осях взгляда
  // В прицеле оружие уходит к центру экрана (ViewModel aim) — и ствол тоже: трассер летит из центра, а не справа
  handPoint() {
    const cam = this.look;
    const k = 1 - Math.min(1, Math.max(0, this.aimT || 0)); // 1 — от бедра, 0 — прицелился до конца
    return toWorld(cam.position, viewBasis(cam.yaw, cam.pitch, cam.roll || 0), 0.22 * k, -0.06 - 0.14 * k, 0.6);
  }

  // Куда смотрит прицел: первая сущность или блок на луче (не дальше range) — { point, entity }
  lookPoint(range) {
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const max = range + this.rig.behind;
    const hit = this.entities.raycast(cam.position, dir, max, [this.player, this.player.mount]);
    const wall = this.world.raycast(cam.position, dir, max);
    const t = Math.min(hit?.t ?? max, wall?.t ?? max);
    return { point: cam.position.add(dir.scale(t)), entity: hit && (!wall || hit.t <= wall.t) ? hit.entity : null };
  }

  // include — кого задеть, даже если он не враг (в кого целились / попали прямо)
  // radius / damage — радиус и множитель урона этого взрыва (таланты, EMPOWER)
  explode(attack, point, include = [], { radius = attack.radius, damage = 1 } = {}) {
    const extra = damage !== 1 ? { baseDamage: attack.roll() * damage } : {};
    const r = attack.burst(this.player, point, this.combatContext({ ...extra, onHit: (h) => this.onPlayerHit(h) }), { include, radius });
    this.engine.sound.play("boom", { at: point });
    this.boomFx(point, radius); // огонь и дым (scene/effects.js)
    this.shakeNear(point, SHAKE.explosion); // взрыв рядом — тряхнуло
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const up = ((i % 3) - 1) * 0.6;
      const k = radius * (0.7 + 0.3 * Math.random());
      this.beams.add({ from: point, to: { x: point.x + Math.sin(a) * k, y: point.y + up * k * 0.6, z: point.z + Math.cos(a) * k }, color: [255, 130, 40], core: [255, 230, 140], life: 0.3, width: 12 });
    }
    if (r.hits.length) this.engine.log(`взрыв ${attack.id}: задел ${r.hits.length}, урон ${r.hits.map((h) => h.dealt).join(", ")}`);
    return r;
  }

  // ПОДРЫВНИК: бросок / выстрел взрывчатки. Снаряд летит из руки по взгляду (или from / velocity — бомбочки
  // кассеты), задел что угодно — взрыв (радиус × талант BLAST RADIUS). fuse > 0 — не взрывается сразу: ложится
  // и горит фитиль (динамит), потом взрыв. then(точка) — что ещё сделать после взрыва (кассета разбрасывает бомбочки)
  throwBomb(attack, { item, speed = 15, gravity = DEMO.gravity, fuse = 0, from = this.handPoint(), velocity = null, then = null }) {
    const radius = attack.radius * (1 + (this.talentStats.blastRadius || 0));
    const boom = (at) => {
      this.explode(attack, at, [], { radius });
      then?.(at);
    };
    const lie = (p) => {
      // Лежит, где упал (у существа — у его ног), горит фитиль: «снаряд» без скорости — его рисуют, но он не летит
      const at = { x: p.position.x, y: p.position.y, z: p.position.z };
      const lit = this.projectiles.launch({ owner: this.player, position: at, velocity: { x: 0, y: 0, z: 0 }, item, gravity: 0, spin: 0 });
      this.fuses.push({ left: fuse, at, lit, boom });
    };
    const v = velocity || this.rig.camera.lookDirection().scale(speed);
    this.projectiles.launch({
      owner: this.player, position: from, velocity: v, item, gravity, spin: 2, maxLife: 5,
      onHit: (p, hit) => (fuse > 0 ? lie({ position: { ...p.position, y: hit.entity.position.y } }) : boom(p.position)),
      onLand: (p) => (fuse > 0 ? lie(p) : boom(p.position)),
      onExpire: (p) => boom(p.position),
    });
  }

  // Горящие фитили (динамит): искрит, догорел — взрыв
  updateFuses(dt) {
    for (const f of [...this.fuses]) {
      f.left -= dt;
      if (Math.random() < 0.5) this.beams.add({ from: { x: f.at.x, y: f.at.y + 0.2, z: f.at.z }, to: { x: f.at.x + (Math.random() - 0.5) * 0.4, y: f.at.y + 0.35 + Math.random() * 0.3, z: f.at.z + (Math.random() - 0.5) * 0.4 }, color: [255, 180, 60], core: [255, 240, 180], life: 0.06, width: 3 });
      if (f.left > 0) continue;
      this.fuses.splice(this.fuses.indexOf(f), 1);
      this.projectiles.remove(f.lit);
      f.boom(f.at);
    }
  }

  // Тряхнуть камеру от удара в точке at: { amount, radius } — вплотную в полную силу, к radius — на нет
  shakeNear(at, { amount, radius }) {
    const p = this.player.position;
    const d = Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z);
    if (d < radius) this.shake.add(amount * (1 - d / radius));
  }

  // Приземлился (движок: CharacterController.onLand): fall — с какой высоты (м), speed — скорость удара (м/с).
  // Толчок камеры — с высоты от SHAKE.land.from блоков
  onLand({ fall }) {
    const L = SHAKE.land;
    if (fall >= L.from) this.shake.add(Math.min(L.max, (fall - L.from + 1) * L.perBlock));
    // Урон — от того, на сколько блоков ниже места, откуда оторвались от земли (прыжок на ровном месте — 0,
    // спрыгнул с 5 блоков — 5, как бы высоко ни прыгал: таланты на прыжок не наказывают)
    const drop = Math.max(0, (this.groundY ?? this.player.position.y) - this.player.position.y);
    this.fallDamage(drop);
  }

  // Порог урона от падения (блоков) и множитель — с талантами на прыжок (FALL_DAMAGE)
  fallRules() {
    const F = FALL_DAMAGE;
    let from = F.from, mult = 1;
    if (this.talents.rank("sniper-jump") > 0) { from += F.highGround.from; mult *= F.highGround.mult; }
    if (this.talentStats?.hammerLeap && this.abilities.current?.id === "war-hammer") { from += F.jumpSlam.from; mult *= F.jumpSlam.mult; }
    return { from, mult };
  }

  // Урон от падения: выше порога — доля макс. HP за каждый блок (FALL_DAMAGE). Удар молотом с прыжка
  // (молот ждёт земли — slamJumpLock / pending) — не ранит: это и есть приземление удара
  fallDamage(fall) {
    const p = this.player;
    if (!p.alive || this.dead) return;
    const slamming = this.slamJumpLock > 0 || !!this.abilityCache.get("war-hammer")?.attack.pending;
    if (slamming || this.fallGrace > 0) return; // первую секунду в мире (загрузка, появление) — не считаем
    const { from, mult } = this.fallRules();
    if (fall <= from) return;
    // физический урон: THICK SKIN, IRON WILL и броня его режут, как удар
    const resist = Math.min(0.9, p.stats.resist?.physical || 0);
    const dmg = Math.round((fall - from) * FALL_DAMAGE.perBlock * p.stats.maxHp * mult * (1 - resist));
    if (dmg <= 0) return;
    p.damage(dmg);
    this.engine.sound.play("hurt");
    this.engine.log(`падение с ${fall.toFixed(1)} блоков (порог ${from}): -${dmg} HP`);
  }

  // Видна ли точка мира из камеры (между ними нет блока) — лучи и круги не рисуем сквозь стены
  seenFromCamera(p) {
    const o = this.rig.camera.position;
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.3) return true;
    const hit = this.world.raycast(o, new Vec3(dx / d, dy / d, dz / d), d);
    return !hit || hit.t >= d - 0.15;
  }

  // Поставить ловушку под прицелом (не дальше TRAPS.reach) на пол или верх блока — «приклеивается» к блоку:
  // ровно в центр клетки, поворот по сетке (не по диагонали). Сверх лимита — самая старая исчезает
  placeTrap(type) {
    if (this.itemCount(type) <= 0) return false;
    const cam = this.rig.camera;
    const dir = cam.lookDirection();
    const reach = TRAPS.reach * (1 + (this.talentStats.placeRange || 0)); // талант PLACE RANGE
    const hit = this.world.raycast(cam.position, dir, reach + this.rig.behind);
    const pos = hit && cam.position.add(dir.scale(hit.t));
    const far = !pos || Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z) > reach;
    if (far) {
      this.engine.toast("AIM AT THE GROUND NEARBY", 1200);
      return false;
    }
    // Ставим только сверху (на пол или верх блока) — и ровно по сетке: в центр клетки, поворот кратен 90°
    const onTop = !hit.block || hit.place.y === hit.block.y + 1;
    if (!onTop) {
      this.engine.toast("AIM AT THE TOP OF A BLOCK OR THE GROUND", 1200);
      return false;
    }
    const cell = hit.block ? { x: hit.block.x, z: hit.block.z } : { x: Math.floor(pos.x), z: Math.floor(pos.z) };
    if (this.traps.list.some((t) => Math.floor(t.position.x) === cell.x && Math.floor(t.position.z) === cell.z && Math.abs(t.position.y - hit.place.y) < 0.5)) {
      this.engine.toast("THIS BLOCK ALREADY HAS A TRAP", 1000);
      return false;
    }
    const at = { x: cell.x + 0.5, y: hit.place.y, z: cell.z + 0.5 };
    const yaw = Math.round(this.player.yaw / (Math.PI / 2)) * (Math.PI / 2), tilt = 0;
    const def = TRAPS[type];
    while (this.traps.count(this.player, type) >= def.max) this.traps.remove(this.traps.oldest(this.player, type));
    this.placeTrapAt(type, at, { yaw, tilt });
    this.takeItem(type, 1);
    this.viewModel()?.play("Use");
    this.player.view?.animator.playOnce("Attack");
    this.engine.sound.play("trapSet");
    this.engine.log(`поставлена ловушка ${type}: ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}`);
    this.backToWeapon(); // поставил — снова оружие
    return true;
  }

  // Ловушка по виду: атака движка TrapAttack (параметры — ATTACKS): врагов героя и самого героя (ему — selfDamage)
  // safe — своя ловушка-рефлекс: героя не ранит
  placeTrapAt(type, position, { yaw = 0, tilt = 0, age = 0, safe = false } = {}) {
    const def = TRAPS[type];
    const p = this.player;
    const root = () => new Slow({ id: "trapped", name: "TRAPPED", duration: def.root, factor: 0.05, icon: "TRP", color: [190, 190, 196] });
    const base = ATTACKS[def.attack];
    const attack = new TrapAttack({
      ...base,
      radius: base.radius * (1 + (this.talentStats?.trapRadius || 0)), // талант RADIUS
      filter: (e) => e.alive && (p.isHostileTo(e) || (e === p && !safe)),
      percentHp: def.percentHp || 0,
      selfDamage: def.selfDamage || 0,
      modifiers: def.root ? [withStatus(root, 1)] : [],
    });
    return this.traps.place({ type, attack, position, owner: p, yaw, tilt, age }); // стоят, пока не сработают
  }
}
