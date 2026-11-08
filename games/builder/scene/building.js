// ============================================================
//  Сцена «мир», часть: Стройка: ставить и ломать блоки, палитра.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { BUILD, PALETTE, PALETTE_SURFACE, REACH } from "../config.js";
import { itemName, maxStack, ITEMS } from "../items.js";

export class BuildingPart {
  // ---------- Стройка (способность 3) ----------

  // Нельзя ставить в занятую клетку и туда, где стоит хоть одна сущность (её «коробка»)
  canPlace(c) {
    return c.y >= 0 && !this.world.has(c.x, c.y, c.z) && !this.entities.overlapsCell(c);
  }

  // Мост (стройка к островам): смотришь вниз и вперёд за край, а прицел — в пустоту или в верх блока, на котором
  // стоишь, — блок ставится продолжением ряда под ногами: первая пустая клетка на уровне ног − 1 по направлению
  // взгляда (по главной оси), если перед ней есть блок. Не надо вставать на самый край и ловить грань
  bridgeTarget() {
    if (this.look.pitch > -0.35) return null; // только когда смотрим вниз
    const p = this.player.position;
    const dir = this.look.lookDirection();
    const ax = Math.abs(dir.x) >= Math.abs(dir.z);
    const sx = ax ? Math.sign(dir.x) : 0, sz = ax ? 0 : Math.sign(dir.z);
    const x0 = Math.floor(p.x), y = Math.floor(p.y + 1e-3) - 1, z0 = Math.floor(p.z);
    if (!this.world.has(x0, y, z0)) return null; // стоим не на блоке (в воздухе, на краю чужого) — не мост
    for (let k = 1; k <= REACH; k++) {
      const c = { x: x0 + sx * k, y, z: z0 + sz * k };
      if (this.world.has(c.x, c.y, c.z)) continue;
      return this.canPlace(c) ? { place: c, block: null, bridge: true } : null;
    }
    return null;
  }

  placeBlock() {
    if (!this.target || !this.canPlace(this.target.place)) return;
    // Ставим блоки из сумки (предмет BUILD.item). Нет блоков — не строим (купить в магазине или сломать блок)
    if (this.blockCount() < BUILD.perBlock) {
      this.engine.toast(`NO ${itemName(BUILD.item)}S: BREAK BLOCKS OR BUY IN THE SHOP`, 2000);
      return;
    }
    const c = this.target.place;
    this.takeItem(BUILD.item, BUILD.perBlock);
    this.world.place(c.x, c.y, c.z, PALETTE[this.colorIndex], PALETTE_SURFACE[this.colorIndex] || null); // лёд — скользкий
    this.viewModel()?.play("Use");
    this.engine.sound.play("place", { at: { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 } });
  }

  removeBlock() {
    if (!this.building || !this.target?.block) return;
    const b = this.target.block;
    const color = this.world.get?.(b.x, b.y, b.z)?.color;
    if (!this.world.remove(b.x, b.y, b.z)) return; // неразрушимый (стены арены дуэли)
    this.blockFx(b.x, b.y, b.z, color); // крошка блока (scene/effects.js)
    // Блок возвращается в сумку (не влез — падает на землю на месте блока). Дуэль — не возвращается
    if (BUILD.refundOnBreak && !this.duel) {
      const left = this.giveResource(BUILD.item, BUILD.perBlock);
      if (left > 0) this.pickups.add(BUILD.item, left, { x: b.x + 0.5, y: b.y, z: b.z + 0.5 });
    }
    this.viewModel()?.play("Attack");
    this.engine.sound.play("remove", { at: { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 } });
  }

  // Сколько блоков для стройки у героя
  blockCount() {
    return this.itemCount(BUILD.item);
  }

  // Сколько штук предмета у героя (сумка + хотбар) и забрать n штук (сначала из сумки)
  itemCount(id) {
    const p = this.player;
    return p.inventory.count(id) + p.hotbar.count(id);
  }

  takeItem(id, n = 1) {
    const p = this.player;
    let taken = p.inventory.remove(id, n);
    if (taken < n) {
      taken += p.hotbar.remove(id, n - taken);
      this.syncAbilities(); // в хотбаре ячейка могла опустеть
    }
    return taken;
  }

  // Влезет ли count штук предмета (в начатые стопки и пустые ячейки хотбара и сумки)
  canTake(id, count) {
    const max = maxStack(id);
    let room = 0;
    const hb = this.player.hotbar;
    for (const inv of [hb, this.player.armor]) inv.slots.forEach((s, i) => (room += !s ? (inv.accepts(i, id) ? max : 0) : s.item === id ? max - s.count : 0));
    for (const s of this.player.inventory.slots) room += !s ? max : s.item === id ? max - s.count : 0;
    return room >= count;
  }

  // Сохранения — без миграций: грузим то, что есть сейчас в игре. Чего в игре больше нет (предмет убрали),
  // при загрузке просто пропадает — из хотбара, сумки, с земли и у существ. Предмет есть, но в эту ячейку
  // хотбара больше не кладётся — переезжает в сумку (не влезло — под ноги)
  loadHotbar(saved, savedArmor) {
    const p = this.player;
    const known = (s) => s && typeof s.item === "string" && s.item in ITEMS && s.count > 0;
    const extra = [];
    const load = (inv, list) => (Array.isArray(list) ? list : []).forEach((s, i) => {
      if (!known(s)) return; //                                       убрали из игры — пропадает
      if (i < inv.size && inv.accepts(i, s.item)) inv.slots[i] = { ...s };
      else extra.push(s);
    });
    load(p.hotbar, saved);
    load(p.armor, savedArmor);
    for (const s of extra) {
      const left = p.inventory.add(s.item, s.count, { data: s.data });
      if (left > 0) this.pickups.add(s.item, left, { x: p.position.x, y: p.position.y + 0.5, z: p.position.z }, { data: s.data });
    }
    this.dropUnknownItems();
  }

  // Убрать всё, чего больше нет в игре: из сумки, с земли, из инвентарей существ (их добыча)
  dropUnknownItems() {
    let gone = 0;
    const clean = (inv) => inv?.slots.forEach((s, i) => {
      if (s && !(s.item in ITEMS)) {
        inv.slots[i] = null;
        gone++;
      }
    });
    clean(this.player.inventory);
    for (const e of this.entities.list) if (e !== this.player) clean(e.inventory);
    for (const pk of this.pickups.list.filter((pk) => !(pk.item in ITEMS))) {
      this.pickups.remove(pk);
      gone++;
    }
    if (gone) this.engine.log(`загрузка: ${gone} предметов, которых больше нет в игре, — убраны`);
  }
}
