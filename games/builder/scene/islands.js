// ============================================================
//  Острова (ISLANDS): мосты с главного острова на маленькие и сундук-награда на самом дальнем (до него моста
//  нет — добираться самому: стройкой, прыжками). Строится один раз, в новом мире (generateWorld); сундук и
//  открыт ли он — в сохранении мира (worldgen.treasure). Сундук — на карте; F рядом — открыть.
// ============================================================

import { ISLANDS, LIGHTS, LOOT, FALL_DAMAGE } from "../config.js";
import { Vec3, Inventory, InventoryScene, Input } from "../../../engine/index.js";
import { rarityData, tierOf, rollRarities } from "./loot.js";
import { ITEMS, isWeapon, isArmor, maxStack, itemInfo } from "../items.js";
import { describeSlot } from "../item-info.js";

export class IslandsPart {
  // Новый мир: мосты и сундук. rnd — случайность генерации
  buildIslands(rnd = Math.random) {
    const T = this.terrain;
    const main = T?.discs.find((d) => d.main);
    const small = T?.discs.filter((d) => !d.main) || [];
    if (!main || !small.length || this.world.floor) return; // острова на полу мира — мосты не нужны
    const dist = (d) => Math.hypot(d.x - main.x, d.z - main.z) - d.r;
    const far = small.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    let bridges = 0;
    for (const d of small) {
      if (d === far || rnd() >= ISLANDS.bridge.chance) continue;
      this.buildBridge(main, d);
      bridges++;
    }
    // логово на маленьком острове: проход выходит к обрыву — от выхода низкий мост на главный остров
    for (const lair of T.lairs || []) {
      const disc = small.find((d) => Math.hypot(d.x - lair.x, d.z - lair.z) < d.r);
      if (disc && lair.tunnel && this.buildLairBridge(lair, main)) bridges++;
    }
    this.treasure = this.placeChest(far);
    this.engine.log(`мосты: ${bridges}, сундук на острове (${Math.round(far.x)}, ${Math.round(far.z)})`);
  }

  // Мост: прямая доска шириной width от ровной части главного до ровной части маленького; высота — плавно
  // от одного края к другому (подъём — ступенькой в блок: впрыгнуть)
  buildBridge(a, b) {
    const B = ISLANDS.bridge;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
    const t0 = a.r - a.edge * 0.6, t1 = len - (b.r - b.edge * 0.6); // от суши до суши (у края — склон вниз)
    const at = (t) => ({ x: a.x + ux * t, z: a.z + uz * t });
    const h0 = this.groundHeight(Math.floor(at(t0).x), Math.floor(at(t0).z));
    const h1 = this.groundHeight(Math.floor(at(t1).x), Math.floor(at(t1).z));
    const half = (B.width - 1) / 2;
    let step = 0;
    const deck = []; // клетки над настилом — потом подъёмы полублоками
    for (let t = t0; t <= t1; t += 0.4, step++) {
      const c = at(t), k = (t - t0) / Math.max(1, t1 - t0);
      const v = Math.round(h0 + (h1 - h0) * k);
      const y = this.world.floor ? Math.max(1, v) : v; // верх настила (летающие острова — бывает и ниже 0)
      for (let w = -half - 1; w <= half + 1; w += 0.5) {
        const x = Math.floor(c.x + px * w), z = Math.floor(c.z + pz * w);
        if (this.groundHeight(x, z) >= y) continue; // там уже суша
        if (Math.abs(w) <= half) {
          if (!this.world.get?.(x, y - 1, z)) this.world.place(x, y - 1, z, B.deck);
          deck.push([x, y, z]);
        } else if (step % Math.round(B.post / 0.4) === 0) {
          this.world.place(x, y - 1, z, B.rail);
          this.world.place(x, y, z, B.rail); // перила — столбик в блок над настилом
          // через столбик — факел сверху (LIGHTS.torch): ночью мост видно
          if ((step / Math.round(B.post / 0.4)) % 2 === 0) this.world.place(x, y + 1, z, LIGHTS.torch.color);
        }
      }
    }
    for (const [x, y, z] of deck) this.world.halfStep?.(x, y, z); // ступеньки настила — полублоками
  }

  // Мост от выхода логова (маленький остров) к краю главного: низкий — спрыгнуть на него с главного острова
  // без урона нельзя (ниже края на FALL_DAMAGE.from + ISLANDS.lairBridge.below блоков). От выхода — спуск,
  // дальше ровно, у главного острова — подъём на край (1 блок на 2 клетки, полублоками). Пересечения со
  // скалой — просто пропускаем (там и так твёрдо). Вернёт, построен ли
  buildLairBridge(lair, main) {
    const B = ISLANDS.bridge, L = ISLANDS.lairBridge, T = this.terrain;
    const sx = lair.tunnel.x1, sz = lair.tunnel.z1, y0 = lair.y;
    const dx = main.x - sx, dz = main.z - sz, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
    let end = -1, t0 = 0; // где кончилась суша у выхода и где начинается главный остров
    while (t0 < len && this.groundHeight(sx + ux * t0, sz + uz * t0) >= y0) t0 += 0.5;
    for (let t = t0; t < len; t += 0.5) if (T.discHeight(main, sx + ux * t, sz + uz * t) > 0) { end = t; break; }
    if (end < 0) return false;
    const h1 = this.groundHeight(Math.floor(sx + ux * end), Math.floor(sz + uz * end)); // край главного
    const low = Math.min(y0, h1 - FALL_DAMAGE.from - L.below);
    const down = (y0 - low) * L.run, up = Math.max(0, h1 - low) * L.run; // длина спуска и подъёма (клеток)
    const span = end - t0;
    const yAt = (t) => {
      t = Math.max(0, t - t0); // до обрыва — на уровне выхода
      if (down + up > span) return Math.round(y0 + ((h1 - y0) * t) / Math.max(1, span)); // коротко — просто наклон
      if (t < down) return Math.round(y0 - t / L.run);
      if (t > span - up) return Math.round(low + (t - (span - up)) / L.run);
      return low;
    };
    const half = (B.width - 1) / 2, deck = [];
    let step = 0;
    for (let t = 0; t <= end + 1; t += 0.4, step++) {
      const cx = sx + ux * t, cz = sz + uz * t, y = yAt(Math.min(t, end));
      for (let w = -half - 1; w <= half + 1; w += 0.5) {
        const x = Math.floor(cx + px * w), z = Math.floor(cz + pz * w);
        if (this.world.get?.(x, y - 1, z) || this.groundHeight(x, z) >= y) continue; // скала / суша — отсекаем
        if (Math.abs(w) <= half) {
          this.world.place(x, y - 1, z, B.deck);
          for (let j = 0; j < 3; j++) this.world.remove(x, y + j, z); // над настилом — проход
          deck.push([x, y, z]);
        } else if (step % Math.round(B.post / 0.4) === 0) {
          this.world.place(x, y - 1, z, B.rail);
          this.world.place(x, y, z, B.rail);
          if ((step / Math.round(B.post / 0.4)) % 2 === 0) this.world.place(x, y + 1, z, LIGHTS.torch.color);
        }
      }
    }
    for (const [x, y, z] of deck) this.world.halfStep?.(x, y, z);
    this.engine.log(`мост логова (${lair.x}, ${lair.z}): ${y0} → ${low} → ${h1}, длина ${Math.round(end)}`);
    return true;
  }

  // Новый мир: четыре столба с факелами вокруг места появления (ночью видно, где дом)
  buildSpawnLights(r = 6) {
    for (const [dx, dz] of [[r, r], [-r, r], [r, -r], [-r, -r]]) {
      if (this.onStructure(dx, dz)) continue;
      const y = Math.ceil(this.world.surfaceY(dx, dz)); // на полублоке — над ним
      this.world.place(dx, y, dz, ISLANDS.bridge.rail);
      this.world.place(dx, y + 1, dz, ISLANDS.bridge.rail);
      this.world.place(dx, y + 2, dz, LIGHTS.torch.color);
    }
  }

  // Сундук: посередине ровной части острова (не на горке). Вернёт { x, y, z, opened }
  placeChest(d) {
    let best = null;
    for (let r = 0; r <= d.r - d.edge && !best; r += 1) {
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(d.x + Math.sin((a / 16) * Math.PI * 2) * r), z = Math.floor(d.z + Math.cos((a / 16) * Math.PI * 2) * r);
        const h = this.groundHeight(x, z), h2 = this.groundHeight(x + 1, z);
        if (this.groundRel(x, z) >= 1 && h === h2 && !this.onStructure(x, z) && !this.onStructure(x + 1, z)) { best = { x, y: h, z }; break; }
        if (r === 0) break;
      }
    }
    if (!best) return null;
    // Модель сундука (tools/make-chest.js) на 2 × 1 клетки; блоков в мире нет (model: true — старые сундуки были блоками)
    return { ...best, opened: false, model: true };
  }

  // F рядом с сундуком: открыть хранилище (ISLANDS.chest.slots ячеек)
  tryChest() {
    const c = this.treasure;
    if (!c || c.gone) return false;
    const p = this.player.position;
    if (Math.hypot(c.x + 1 - p.x, c.z + 0.5 - p.z) > ISLANDS.chest.reach + 0.5 || Math.abs(p.y - c.y) > 3) return false;
    // вещь: самого высокого тира, что есть сейчас
    this.openChestStore(c, { coins: ISLANDS.chest.coins + ISLANDS.chest.perLevel * this.experience.level, tier: (tiers) => tiers[tiers.length - 1], view: () => this.chestEntity()?.view });
    return true;
  }

  // Содержимое сундука (при первом открытии): вещь по LOOT.rarity (5 % — две), монеты стопкой и немного
  // костей / черепов (ISLANDS.chest.junk). Раскидано по случайным ячейкам, часть — пустые
  rollChest({ coins, tier }) {
    const J = ISLANDS.chest;
    const pool = Object.keys(ITEMS).filter((id) => isWeapon(id) || isArmor(id));
    const tiers = [...new Set(pool.map(tierOf))].sort((a, b) => a - b);
    const t = tier(tiers), list = pool.filter((id) => tierOf(id) === t);
    const stacks = [];
    for (const r of rollRarities(LOOT.rarity)) {
      const item = list[Math.floor(Math.random() * list.length)], data = rarityData(r);
      if (item) stacks.push({ item, count: 1, ...(data ? { data } : {}) });
    }
    stacks.push({ item: "coin", count: coins });
    for (const [item, j] of Object.entries(J.junk)) {
      if (Math.random() >= j.chance) continue;
      stacks.push({ item, count: j.count[0] + Math.floor(Math.random() * (j.count[1] - j.count[0] + 1)) });
    }
    const slots = new Array(J.slots).fill(null), free = slots.map((_, i) => i);
    for (const st of stacks.slice(0, J.slots)) slots[free.splice(Math.floor(Math.random() * free.length), 1)[0]] = st;
    return slots;
  }

  // Окно сундука: его ячейки сверху, сумка героя снизу; перекладывать мышью. Опустел и закрыли — сундук пропадает
  openChestStore(c, { coins, tier, view }) {
    if (c.opened && !c.items) return void (c.gone = true); // открыт ещё до хранилищ (старое сохранение) — пропал
    if (!c.items) {
      c.items = this.rollChest({ coins, tier });
      c.opened = true;
      view()?.animator.playOnce("Open");
      this.engine.sound.play("levelup");
      this.engine.log(`сундук открыт: ${c.items.filter(Boolean).map((s) => s.item + "×" + s.count).join(", ")}`);
    }
    const inv = new Inventory(ISLANDS.chest.slots, maxStack);
    inv.loadFrom(c.items);
    const at = { x: c.x + 1, y: c.y + 1, z: c.z + 0.5 };
    this.pushLive(new InventoryScene({
      entity: this.player,
      itemInfo,
      title: "TREASURE CHEST",
      describe: (slot) => describeSlot(this, slot),
      dropKey: Input.label(this.settings.controls.bindings.drop),
      equipKey: Input.label(this.settings.controls.bindings.skill2),
      sections: [
        { inventory: inv, title: "TREASURE CHEST", cols: ISLANDS.chest.slots, group: "chest" },
        { inventory: this.player.inventory, title: "BAG", cols: 8 },
      ],
      onChange: () => {
        c.items = inv.toJSON();
        this.syncAbilities();
      },
      canDrop: () => "TAKE IT INTO THE BAG",
      onClose: () => {
        c.items = inv.toJSON();
        if (inv.isEmpty()) {
          c.gone = true; // пустой — пропадает
          this.fx?.burst(at, { count: 24, speed: 2.5, up: 1.5, color: ISLANDS.chest.color, size: 0.08, life: 0.8, gravity: 4, drag: 1 });
          this.engine.sound.play("swing", { at });
        }
        this.save?.(false);
      },
    }));
  }

  // Сундук-модель как «сущность» для рисования (game-scene → drawList); открыт — крышка откинута
  chestEntity() {
    const c = this.treasure;
    if (c?.opened && !c.items) c.gone = true; // открыт до хранилищ (старое сохранение)
    if (!c?.model || c.gone) return null;
    if (!this.chestEnt) {
      this.chestEnt = { position: new Vec3(c.x + 1, c.y, c.z + 0.5), yaw: 0, roll: 0, alive: true, hurtTime: Infinity, deadTime: 0, view: null };
      this.game.models.attach(this.chestEnt, "chest");
    }
    this.chestEnt.view?.animator.setBase(c.opened ? "Opened" : "Closed");
    return this.chestEnt;
  }

  // Для карты: сундук — золотой значок (открыт — серый). Сейчас на карте не показываем (ISLANDS.chest.onMap) —
  // оставлено на будущее (например, по заданию)
  chestMarker() {
    const c = this.treasure;
    if (!c || c.gone) return [];
    return [{ x: c.x + 1, z: c.z + 0.5, icon: "chest", color: c.opened ? [110, 110, 110] : [240, 196, 80], label: c.opened ? "" : "CHEST", clamp: !c.opened, always: true }];
  }
}
