// ============================================================
//  Острова (ISLANDS): мосты с главного острова на маленькие и сундук-награда на самом дальнем (до него моста
//  нет — добираться самому: стройкой, прыжками). Строится один раз, в новом мире (generateWorld); сундук и
//  открыт ли он — в сохранении мира (worldgen.treasure). Сундук — на карте; F рядом — открыть.
// ============================================================

import { ISLANDS, LIGHTS } from "../config.js";
import { rarityOf, RARITIES } from "../../../engine/index.js";
import { rarityData, tierOf } from "./loot.js";
import { ITEMS, isWeapon, isArmor } from "../items.js";

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
    for (let t = t0; t <= t1; t += 0.4, step++) {
      const c = at(t), k = (t - t0) / Math.max(1, t1 - t0);
      const y = Math.max(1, Math.round(h0 + (h1 - h0) * k)); // верх настила
      for (let w = -half - 1; w <= half + 1; w += 0.5) {
        const x = Math.floor(c.x + px * w), z = Math.floor(c.z + pz * w);
        if (this.groundHeight(x, z) >= y) continue; // там уже суша
        if (Math.abs(w) <= half) {
          if (!this.world.get?.(x, y - 1, z)) this.world.place(x, y - 1, z, B.deck);
        } else if (step % Math.round(B.post / 0.4) === 0) {
          this.world.place(x, y - 1, z, B.rail);
          this.world.place(x, y, z, B.rail); // перила — столбик в блок над настилом
          // через столбик — факел сверху (LIGHTS.torch): ночью мост видно
          if ((step / Math.round(B.post / 0.4)) % 2 === 0) this.world.place(x, y + 1, z, LIGHTS.torch.color);
        }
      }
    }
  }

  // Новый мир: четыре столба с факелами вокруг места появления (ночью видно, где дом)
  buildSpawnLights(r = 6) {
    for (const [dx, dz] of [[r, r], [-r, r], [r, -r], [-r, -r]]) {
      if (this.onStructure(dx, dz)) continue;
      const y = this.world.surfaceY(dx, dz);
      this.world.place(dx, y, dz, ISLANDS.bridge.rail);
      this.world.place(dx, y + 1, dz, ISLANDS.bridge.rail);
      this.world.place(dx, y + 2, dz, LIGHTS.torch.color);
    }
  }

  // Сундук: посередине ровной части острова (не на горке). Вернёт { x, y, z, opened }
  placeChest(d) {
    const C = ISLANDS.chest;
    let best = null;
    for (let r = 0; r <= d.r - d.edge && !best; r += 1) {
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(d.x + Math.sin((a / 16) * Math.PI * 2) * r), z = Math.floor(d.z + Math.cos((a / 16) * Math.PI * 2) * r);
        const h = this.groundHeight(x, z), h2 = this.groundHeight(x + 1, z);
        if (h >= 1 && h === h2 && !this.onStructure(x, z) && !this.onStructure(x + 1, z)) { best = { x, y: h, z }; break; }
        if (r === 0) break;
      }
    }
    if (!best) return null;
    // 2 × 1 блока, сверху — «крышка» другим цветом
    for (const ox of [0, 1]) {
      this.world.place(best.x + ox, best.y, best.z, C.band);
      this.world.place(best.x + ox, best.y + 1, best.z, C.color);
    }
    return { ...best, opened: false };
  }

  // F рядом с сундуком: награда (один раз)
  tryChest() {
    const c = this.treasure;
    if (!c || c.opened) return false;
    const p = this.player.position;
    if (Math.hypot(c.x + 1 - p.x, c.z + 0.5 - p.z) > ISLANDS.chest.reach + 0.5 || Math.abs(p.y - c.y) > 3) return false;
    this.openChest();
    return true;
  }

  openChest() {
    const c = this.treasure, C = ISLANDS.chest;
    c.opened = true;
    const coins = C.coins + C.perLevel * this.experience.level;
    const left = this.giveResource("coin", coins);
    const at = { x: c.x + 1, y: c.y + 2.2, z: c.z + 0.5 };
    if (left > 0) this.pickups.add("coin", left, at);
    // вещь: самого высокого тира, что есть сейчас; редкость — не ниже C.rarity
    const pool = Object.keys(ITEMS).filter((id) => isWeapon(id) || isArmor(id));
    const top = Math.max(...pool.map(tierOf));
    const list = pool.filter((id) => tierOf(id) === top);
    const item = list[Math.floor(Math.random() * list.length)];
    const min = RARITIES.findIndex((r) => r.id === C.rarity);
    const rarity = RARITIES[Math.min(RARITIES.length - 1, min + (Math.random() < 0.25 ? 1 : 0))].id;
    const data = rarityData(rarity);
    if (item) this.pickups.add(item, 1, at, data ? { data } : {});
    // крышка «открылась»: верх сундука убираем
    for (const ox of [0, 1]) this.world.remove?.(c.x + ox, c.y + 1, c.z);
    this.engine.sound.play("levelup");
    const tr = (x) => this.engine.locale?.translate?.(x) ?? x;
    this.engine.toast(tr("CHEST") + ": +" + coins + " " + tr("COINS") + ", " + tr(rarityOf(rarity).name) + "!", 3000);
    this.engine.log(`сундук открыт: ${coins} монет, ${item} (${rarity})`);
    this.fx?.burst(at, { count: 30, speed: 3, up: 2, color: C.color, size: 0.08, life: 1, gravity: 6, drag: 1 });
    this.save?.(false);
  }

  // Для карты: сундук — золотой значок (открыт — серый)
  chestMarker() {
    const c = this.treasure;
    if (!c) return [];
    return [{ x: c.x + 1, z: c.z + 0.5, icon: "chest", color: c.opened ? [110, 110, 110] : [240, 196, 80], label: c.opened ? "" : "CHEST", clamp: !c.opened, always: true }];
  }
}
