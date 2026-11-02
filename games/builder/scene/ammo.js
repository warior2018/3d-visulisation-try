// ============================================================
//  Сцена «мир», часть: Стрелковое оружие: обоймы, патроны, перезарядка.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { CLIPS } from "../config.js";
import { markerFor } from "./shared.js";

export class AmmoPart {
  // ---------- Стрелковое оружие: обойма и перезарядка (движок: RangedAttack magazine) ----------

  // R — перезарядить оружие в руках
  reloadWeapon(ability) {
    return ability.attack.reload({ onReload: () => this.onReloadStart(ability), onMiss: () => this.noAmmo() });
  }

  // Стрелку — стартовые обоймы пистолета (один раз: и новому, и выбравшему класс)
  giveAmmoOnce() {
    if (this.ammoGiven || !CLIPS.enabled) return;
    this.ammoGiven = true;
    this.giveResource(CLIPS.items.pistol, CLIPS.start);
  }

  // Запас обойм ствола weapon (движок: RangedAttack.reserve): count — сколько обойм в сумке (полных и неполных),
  // swap(ammo, magazine) — перезарядка: вынимаем самую полную обойму (полная — magazine патронов, неполная — сколько
  // в ней), а недострелянную старую (если в ней что-то осталось) кладём в сумку неполной обоймой
  clipReserve(weapon) {
    const item = CLIPS.items[weapon];
    const bags = () => [this.player.inventory, this.player.hotbar];
    return {
      count: () => this.itemCount(item),
      swap: (ammo, magazine) => {
        // Самая полная: сначала полные (без данных), иначе неполная с наибольшим числом патронов
        let best = null;
        for (const inv of bags()) inv.slots.forEach((s, i) => {
          if (!s || s.item !== item) return;
          const rounds = s.data ? Math.min(magazine, s.data.rounds) : magazine;
          if (!best || rounds > best.rounds) best = { inv, i, rounds };
        });
        if (!best || best.rounds <= ammo) return ammo; // нечем или в сумке обоймы не лучше вставленной
        const s = best.inv.slots[best.i];
        if (--s.count <= 0) best.inv.slots[best.i] = null;
        if (ammo > 0) this.returnClip(item, ammo, magazine);
        this.syncAbilities();
        return best.rounds;
      },
    };
  }

  // Недострелянная обойма — в сумку (неполной: на ячейке — патроны); полная — обычной; некуда — под ноги
  returnClip(item, rounds, magazine) {
    const data = rounds >= magazine ? null : { rounds, label: String(rounds) };
    let left = this.player.inventory.add(item, 1, { data });
    if (left > 0) left = this.player.hotbar.add(item, 1, { data });
    if (left > 0) this.pickups.add(item, 1, { x: this.player.position.x, y: this.player.position.y + 0.5, z: this.player.position.z }, { data });
  }

  // Патронов нет ни в обойме, ни в сумке — подсказка (не чаще раза в секунду)
  noAmmo() {
    const now = performance.now();
    if (now - (this.noAmmoAt || 0) < 1000) return;
    this.noAmmoAt = now;
    this.engine.sound.play("reload");
    this.engine.toast("NO CLIPS FOR THIS GUN: BUY THEM IN THE SHOP", 1200);
  }

  // Перезарядка началась: рука «для экрана» и тело от 3-го лица — анимация, звук
  onReloadStart(ability) {
    this.viewModel()?.play("Reload");
    if (ability?.reloadPose) this.player.view?.animator.playOnce(ability.reloadPose);
    this.engine.sound.play("reload");
    this.engine.log(`перезарядка: ${ability?.name}`);
  }

  // Для HUD: что показывать про оружие в руках (патроны, перезарядка, ИАЙ) — меняется → перерисовать
  hudWeaponKey() {
    const a = this.abilities.current;
    const atk = a?.attack;
    const ammo = atk?.magazine ? `${atk.ammo}:${atk.reserveCount}:${atk.reloading ? Math.ceil(atk.reloadProgress * 30) : ""}` : "";
    return ammo + (a?.iaiProgress !== undefined ? `:${Math.ceil(a.iaiProgress * 14)}` : "") + (a?.chargePower != null ? `:c${Math.ceil(a.chargePower * 20)}` : "");
  }

  // Белый след удара — по хитбоксу атаки (сектор arc в плоскости камеры длиной reach): слева направо,
  // чуть поднимаясь; delay/sweep — в такт анимации Iai (клинок проходит экран с 0.07 по 0.23 с)
  // instant — след сразу целиком и плоский (катана): без пробега и без «вылета» из угла камеры
  // roll — крен плоскости следа (радианы): π/2 — след вертикальный, сверху вниз (удар молотом о землю);
  // arc / reach — свои, если след не совпадает с хитбоксом атаки (у молота хитбокс — круг на земле)
  slashTrail(attack, { from = -0.55, to = -0.25, dir = 1, delay = 0.06, sweep = 0.17, instant = false, roll = 0, arc = attack.arc, reach = attack.reachFor(this.player) } = {}) {
    const eye = this.look.position; // глаза (с выглядыванием) — след в плоскости камеры, как и хитбокс
    // straight — на экране прямая линия слева снизу направо, чуть поднимаясь (как рез клинка)
    // От 1-го лица след вылетает из левого нижнего угла камеры (как будто клинок выхвачен у самых глаз),
    // от 3-го лица — только по сектору хитбокса. Сам хитбокс одинаковый
    const corner = this.settings.general.cameraMode === "third" || instant ? null : [-0.5 * dir, -0.4, 0.3];
    this.slashes.add({ origin: eye, yaw: this.player.yaw, pitch: this.look.pitch, roll: (this.look.roll || 0) + roll, arc, reach, from, to, dir, delay, sweep, straight: true, corner, instant });
  }

  // Что показать на карте (миникарта и большая на M): мир, где игрок, метки
  // Координаты героя — блок, в котором стоят ноги (под миникартой и картой)
  coordsText() {
    const p = this.player.position;
    return `X ${Math.floor(p.x)}  Y ${Math.floor(p.y + 0.01)}  Z ${Math.floor(p.z)}`;
  }

  mapData() {
    return {
      world: this.world,
      center: this.player.position,
      yaw: this.look.yaw,
      fog: this.fog, // туман войны: не разведано — темно, далеко — серым, враги видны только рядом
      markers: [
        ...this.entities.list
          .filter((e) => e !== this.player && e.alive)
          .map((e) => ({ x: e.position.x, z: e.position.z, ...markerFor(e) })),
        // Камни и прочее на земле — маленькие серые точки
        ...this.pickups.list.map((p) => ({ x: p.position.x, z: p.position.z, icon: "pebble", color: [150, 150, 158] })),
        // Боссы: где живут (логово / площадка) — видно всегда, за краем карты — прижато к краю;
        // мёртв — рядом таймер, через сколько новый
        ...this.bossSites().map((site, i) => {
          const alive = this.entities.list.some((e) => e.boss && e.lair === i && e.alive);
          const t = Math.ceil(this.lairTimers[i] || 0);
          return { x: site.x + 0.5, z: site.z + 0.5, icon: "skull", color: alive ? [190, 90, 255] : [120, 100, 140], label: alive ? "BOSS" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, clamp: true, always: true };
        }),
        // Временная метка: центр мира (0, 0). Если за краем карты — прижата к краю
        { x: 0, z: 0, icon: "cross", color: [255, 80, 80], label: "0,0", clamp: true, always: true },
      ],
    };
  }
}
