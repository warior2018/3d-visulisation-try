// ============================================================
//  Маунт героя (как в Heroes of the Storm; config.js → MOUNT). Езда — движок: engine/world/riding.js.
//  Купил в магазине — клавиша Z зовёт скакуна (мгновенно) и сажает в седло; Z ещё раз — слезть.
//  Любой урон по герою или по скакуну — скакун исчезает (талант STEADY SADDLE: мелкие удары не в счёт),
//  потом перезарядка MOUNT.cooldown с. Двуручное в руках — медленно и без галопа.
// ============================================================

import { mount, dismount, updateRider } from "../../../engine/index.js";
import { MOUNT, MOUNT_MOVEMENT } from "../config.js";

export class MountPart {
  get mounted() {
    return !!this.player?.mount;
  }

  // Перезарядка маунта с талантом QUICK CALL
  mountCooldown() {
    return Math.max(1, MOUNT.cooldown - (this.talentStats?.mountCooldown || 0));
  }

  toggleMount() {
    if (this.mounted) return this.dismountSteed("DISMOUNTED");
    this.callMount();
  }

  // Позвать скакуна и сесть. Нельзя: не куплен, перезарядка, в воздухе, в разбеге
  callMount() {
    const p = this.player;
    if (!this.hasMount) return this.engine.toast(`BUY A MOUNT IN THE SHOP FIRST (${MOUNT.price} COINS)`, 2000);
    if (!p.alive || p.mount) return;
    if (this.mountCd > 0) return this.engine.toast(`MOUNT READY IN ${Math.ceil(this.mountCd)} S`, 900);
    if (!p.onGround) return this.engine.toast("CAN'T CALL THE MOUNT RIGHT NOW", 900);
    // Садимся MOUNT.castTime с (ещё раз Z — отмена); урон или прыжок сбивают (updateMountCast)
    if (this.mountCast > 0) return this.cancelMountCast();
    this.mountCast = MOUNT.castTime;
    this.engine.sound.play("equip", { volume: 0.5 });
  }

  cancelMountCast(why = null) {
    if (!(this.mountCast > 0)) return;
    this.mountCast = 0;
    if (why) this.engine.toast(why, 900);
  }

  // Каждый тик: идёт посадка — догорела, садимся
  updateMountCast(dt) {
    if (!(this.mountCast > 0)) return;
    const p = this.player;
    if (!p.alive || p.mount || !p.onGround) return this.cancelMountCast();
    this.mountCast -= dt;
    if (this.mountCast <= 0) this.mountNow();
  }

  mountNow() {
    this.mountCast = 0;
    const p = this.player;
    const steed = this.spawn("steed", { x: p.position.x, y: p.position.y, z: p.position.z, yaw: this.look.yaw });
    if (!steed) return;
    steed.rideable = { seat: MOUNT.seat, speed: MOUNT.speed, runMultiplier: MOUNT.runMultiplier, jumpHeight: MOUNT.jumpHeight };
    steed.mountOf = p;
    this.rideController = mount(p, steed, { input: this.engine.input, physics: this.physics });
    if (!this.rideController) return this.removeEntity(steed);
    this.rideController.accel = { ...MOUNT_MOVEMENT }; // скакун разгоняется дольше героя
    this.aiming = false;
    this.mountArmed = false; // сели — руки на поводьях (Alt — оружие)
    this.engine.sound.play("equip");
    this.syncEye();
    this.engine.log("маунт: в седле");
  }

  // Слезть (сам, урон, скилл движения, гибель): скакун исчезает, перезарядка
  dismountSteed(why = null) {
    const p = this.player;
    const steed = p?.mount;
    if (!steed) return;
    dismount(p, this.physics);
    this.removeEntity(steed);
    this.rideController = null;
    this.mountCd = this.mountCooldown();
    this.syncEye();
    if (why) this.engine.toast(why, 1200);
    this.engine.log(`маунт: слезли (${why || "-"})`);
  }

  // Урон по герою или скакуну: больше порога (талант) — скакун исчезает
  mountHurt(e, dealt) {
    const p = this.player;
    if (e === p && dealt > 0) this.cancelMountCast("MOUNTING INTERRUPTED");
    if (!p?.mount || (e !== p && e !== p.mount)) return;
    const guard = (this.talentStats?.mountGuard || 0) * p.stats.maxHp;
    if (dealt > guard) this.dismountSteed("THROWN FROM THE SADDLE");
  }

  // Верхом: Alt — поводья (не атакуешь, полная скорость) / оружие в руках
  toggleMountMode() {
    if (!this.mounted) return;
    this.mountArmed = !this.mountArmed;
    this.aiming = false;
    this.engine.sound.play("equip");
    this.engine.toast(this.mountArmed ? "WEAPON IN HAND" : "BOTH HANDS ON THE REINS", 900);
  }

  // Атаковать сейчас нельзя: верхом и руки на поводьях
  get onReins() {
    return this.mounted && !this.mountArmed;
  }

  // Замедление скакуна от оружия в руках (0 — нет): поводья и одноручное — нет, двуручное дальнее и ближнее — своё
  mountSlow(id = this.abilities.current?.id) {
    if (!this.mountArmed) return 0;
    if (MOUNT.twoHandedRanged.includes(id)) return MOUNT.slowRanged;
    if (MOUNT.twoHandedMelee.includes(id)) return MOUNT.slowMelee;
    return 0;
  }

  // Скорость скакуна сейчас: таланты и оружие в руках
  updateMountSpeed() {
    const c = this.rideController;
    if (!c) return;
    c.speed = MOUNT.speed * (1 + (this.talentStats?.mountSpeed || 0)) * (1 - this.mountSlow());
    c.runMultiplier = MOUNT.runMultiplier; // галопа нет (Shift — способность)
  }

  // Тик верхом: клавиши ведут скакуна, герой сидит в седле. Вернёт move (как у CharacterController)
  rideTick(dt) {
    const p = this.player, steed = p.mount;
    if (!steed.alive) {
      this.dismountSteed("THROWN FROM THE SADDLE");
      return this.controller.update(dt, this.look.yaw);
    }
    this.rideController.input = this.controller.input;
    this.updateMountSpeed();
    const move = this.rideController.update(dt, this.look.yaw);
    steed.yaw = this.look.yaw;
    updateRider(p);
    steed.view?.animator.setBase(move.moving ? "Walk" : "Idle", move.moving ? move.speed / 3 : 1);
    return move;
  }

  // Скилл движения оружия (ИАЙ, отскок, разбег): верхом — сначала слезть
  beforeMovementSkill() {
    if (this.mounted) this.dismountSteed(null);
  }
}
