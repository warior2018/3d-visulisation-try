// ============================================================
//  Маунт героя (как в Heroes of the Storm; config.js → MOUNT). Езда — движок: engine/world/riding.js.
//  Купил в магазине — клавиша Z зовёт скакуна (мгновенно) и сажает в седло; Z ещё раз — слезть.
//  Любой урон по герою или по скакуну — скакун исчезает (талант STEADY SADDLE: мелкие удары не в счёт),
//  потом перезарядка MOUNT.cooldown с. Двуручное в руках — медленно и без галопа.
// ============================================================

import { mount, dismount, updateRider } from "../../../engine/index.js";
import { MOUNT } from "../config.js";

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
    if (!p.onGround || this.spearRun?.active) return this.engine.toast("CAN'T CALL THE MOUNT RIGHT NOW", 900);
    const steed = this.spawn("steed", { x: p.position.x, y: p.position.y, z: p.position.z, yaw: this.look.yaw });
    if (!steed) return;
    steed.rideable = { seat: MOUNT.seat, speed: MOUNT.speed, runMultiplier: MOUNT.runMultiplier, jumpHeight: MOUNT.jumpHeight };
    steed.mountOf = p;
    this.rideController = mount(p, steed, { input: this.engine.input, physics: this.physics });
    if (!this.rideController) return this.removeEntity(steed);
    this.aiming = false;
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
    if (!p?.mount || (e !== p && e !== p.mount)) return;
    const guard = (this.talentStats?.mountGuard || 0) * p.stats.maxHp;
    if (dealt > guard) this.dismountSteed("THROWN FROM THE SADDLE");
  }

  // Скорость скакуна сейчас: таланты, двуручное в руках — тяжелее и без галопа
  updateMountSpeed() {
    const c = this.rideController;
    if (!c) return;
    const heavy = MOUNT.twoHanded.includes(this.abilities.current?.id);
    c.speed = MOUNT.speed * (1 + (this.talentStats?.mountSpeed || 0)) * (heavy ? MOUNT.heavy : 1);
    c.runMultiplier = heavy ? 1 : MOUNT.runMultiplier;
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
