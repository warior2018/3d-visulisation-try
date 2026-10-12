// ============================================================
//  Способности «Стройки». Как устроены способности и панель из 5 ячеек —
//  решает движок (engine/world/abilities.js), а здесь — что делают именно наши.
//  Оружие и инструмент — это ПРЕДМЕТЫ (items.js): что лежит в хотбаре (5 ячеек внизу
//  инвентаря), то и в панели способностей. Пустая ячейка — рука (кулак).
//
//  g — игровая сцена (game-scene.js): через неё способности бьют, стреляют, строят.
// ============================================================

import { Ability, MeleeAttack, RangedAttack, ThrowAttack, buff, damageMultiplier, dash } from "../../engine/index.js";
import { PALETTE, ATTACKS, WEAPON_SPEED, AIM_PISTOL, AIM_RIFLE, AIM_AUTO, RECOIL_PISTOL, RECOIL_RIFLE, RECOIL_AUTO, KATANA_IAI, EQUIP_TIME } from "./config.js";

// Вид от 3-го лица: модель оружия крепится к правому предплечью героя (кость forearm_R скелета) —
// в кулак (0.31 м ниже локтя), повёрнутая так, чтобы ствол / клинок шёл вдоль руки от кулака.
// pose — поза рук (слой поверх ходьбы, tools/make-skeleton.js → HERO_CLIPS)
const IN_HAND = { bone: "forearm_R", position: [0, -0.31, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
const held = (model, pose) => ({ model, pose, ...IN_HAND });

const BONE = [220, 214, 194];

// Навыки оружия дальнего боя на Q/E — наклоны (движок: Ability.skills; сам наклон — engine/graphics/lean.js).
// У оружия других типов на этих клавишах будут свои навыки.
const leanSkill = (dir) => ({
  id: dir < 0 ? "lean-left" : "lean-right",
  name: dir < 0 ? "НАКЛОН ВЛЕВО" : "НАКЛОН ВПРАВО",
  short: "НАКЛОН", // подпись в подсказке у панели (Q/E: НАКЛОН)
  press: (g) => g.pressLean(dir),
  hold: (dt, g, down) => {
    g.leanHeld[dir < 0 ? 0 : 1] = down;
  },
});
// skill1 / skill2 — действия движка «навык оружия 1 / 2» (по умолчанию Q / E)
export const LEAN_SKILLS = { skill1: leanSkill(-1), skill2: leanSkill(1) };
const METAL = [160, 166, 178]; // светлый металл — чтобы значок был виден на тёмной ячейке

export class HandAbility extends Ability {
  constructor() {
    // empty — ячейка с рукой выглядит пустой (рука — это «ничего в руке»); зажал ЛКМ — бьёт снова по готовности
    super({ id: "hand", name: "РУКА", viewModel: "fp-arm", autoRepeat: true, empty: true });
    this.attack = new MeleeAttack(ATTACKS.punch); // атака — класс движка, параметры — из config.js
    this.blocks = true; // ПКМ — блок (game-scene.js → tryBlock)
  }
  secondary(g) {
    g.tryBlock(this);
  }
  primary(g) {
    g.useAttack(this.attack, { anim: "Attack", sound: "swing", hitSound: "hit" });
  }
  drawIcon(ui, x, y, s) {
    // Кулак: ладонь и четыре пальца
    ui.rect(x + s * 0.3, y + s * 0.42, s * 0.42, s * 0.3, BONE);
    for (let i = 0; i < 4; i++) ui.rect(x + s * 0.3 + i * s * 0.105, y + s * 0.3, s * 0.08, s * 0.14, BONE);
    ui.rect(x + s * 0.22, y + s * 0.48, s * 0.1, s * 0.14, BONE); // большой палец
  }
}

export class PistolAbility extends Ability {
  constructor() {
    super({
      id: "pistol", name: "ПИСТОЛЕТ", viewModel: "fp-pistol", moveSpeed: WEAPON_SPEED.pistol, autoRepeat: true, // зажал — стреляет по кулдауну
      aim: AIM_PISTOL, recoil: RECOIL_PISTOL, skills: LEAN_SKILLS, held: held("w-pistol", "HoldPistol"), equipTime: EQUIP_TIME.pistol,
    });
    this.attack = new RangedAttack(ATTACKS.pistol);
    this.reloadPose = "Reload"; // перезарядка от 3-го лица (поза героя)
  }
  // Прицеливание — пока зажата ПКМ (дополнительное действие); на перезарядке — не целимся
  update(dt, g) {
    g.aiming = g.aimWanted() && !this.attack.reloading;
  }
  unequip(g) {
    g.aiming = false;
  }
  primary(g) {
    g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "Shoot", sound: "shot" });
  }
  action(name, g) {
    return name === "reload" && g.reloadWeapon(this); // R — перезарядить
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.2, y + s * 0.34, s * 0.6, s * 0.16, METAL); //  ствол
    ui.rect(x + s * 0.24, y + s * 0.48, s * 0.17, s * 0.28, METAL); // рукоять
    ui.rect(x + s * 0.74, y + s * 0.3, s * 0.05, s * 0.06, METAL); //  мушка
  }
}

export class BuildAbility extends Ability {
  constructor() {
    // Молот: покупается в магазине; блоки ставит из камней (1 камень — 1 блок), цвет — на G
    super({ id: "build", name: "МОЛОТ", viewModel: "fp-hammer", held: held("w-hammer", "HoldBlock") });
  }
  unequip(g) {
    g.paletteOpen = false; // убрали стройку — панель цветов закрываем
  }
  // Как в Minecraft: ЛКМ — сломать (убрать) блок, ПКМ — поставить
  primary(g) {
    g.removeBlock();
  }
  secondary(g) {
    g.placeBlock();
  }
  action(name, g) {
    if (name !== "palette") return false;
    g.paletteOpen = !g.paletteOpen; // E — открыть/закрыть панель цветов
    g.engine.redraw();
    return true;
  }
  drawIcon(ui, x, y, s, g) {
    const c = PALETTE[g?.colorIndex ?? 0];
    drawHammer(ui, x, y, s);
    ui.rect(x + s * 0.12, y + s * 0.62, s * 0.22, s * 0.22, c); // квадратик — текущий цвет блока
    // Сколько камней (= блоков) осталось; ноль — красным
    const n = g?.stoneCount?.();
    if (n !== undefined) ui.text(String(n), x + s - 5, y + s - 18, 2, n > 0 ? [255, 255, 255] : [255, 90, 80], "right");
  }
}

// Снайперская винтовка: покупается в магазине (B).
// ПКМ — оптика: сильное приближение (aimFov), экран закрывает круг прицела (scope)
export class RifleAbility extends Ability {
  constructor() {
    super({
      id: "rifle", name: "СНАЙПЕРКА", viewModel: "fp-rifle", moveSpeed: WEAPON_SPEED.rifle, autoRepeat: true,
      aim: AIM_RIFLE, recoil: RECOIL_RIFLE, skills: LEAN_SKILLS, held: held("w-rifle", "HoldRifle"), equipTime: EQUIP_TIME.rifle,
    });
    this.attack = new RangedAttack(ATTACKS.rifle);
    this.reloadPose = "ReloadRifle";
    this.scope = true; // при полном прицеливании — круг оптики вместо модели
    this.bolt = null; // передёргивание затвора после выстрела: { t } — секунд с выстрела
  }
  // Пока перезаряжаемся (затвор), из оптики выходим; готово — снова в оптику, если ПКМ ещё зажата
  update(dt, g) {
    g.aiming = g.aimWanted() && this.attack.ready && !g.abilities.equipping; // оптика — только когда винтовка в руках и готова
    if (this.attack.reloading) this.bolt = null; // перезарядка — затвор крутит она сама (анимация Reload)
    const b = this.bolt;
    if (!b) return;
    const before = b.t;
    b.t += dt;
    const at = (time) => before < time && b.t >= time; // момент time наступил в этом кадре
    if (at(0.3)) {
      g.viewModel()?.play("Bolt"); // рука дёргает рукоятку затвора
      g.engine.sound.play("boltOpen");
    }
    if (at(0.82)) g.engine.sound.play("boltClose");
    if (b.t > 1.3) this.bolt = null;
  }
  unequip(g) {
    g.aiming = false;
    this.bolt = null;
  }
  primary(g) {
    const ready = this.attack.ready;
    g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootRifle", sound: "shot" });
    if (ready && !this.attack.ready && !this.attack.reloading) this.bolt = { t: 0 }; // выстрелили — пора передёрнуть затвор
  }
  action(name, g) {
    return name === "reload" && g.reloadWeapon(this);
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.08, y + s * 0.46, s * 0.84, s * 0.08, METAL); // ствол
    ui.rect(x + s * 0.08, y + s * 0.46, s * 0.3, s * 0.2, [150, 100, 60]); // приклад
    ui.rect(x + s * 0.38, y + s * 0.32, s * 0.28, s * 0.1, METAL); //  оптика
    ui.rect(x + s * 0.44, y + s * 0.54, s * 0.08, s * 0.16, METAL); // рукоять
  }
}

// Автомат: очереди (зажал ЛКМ), обойма 30, отдача растёт с каждым выстрелом очереди
export class AutoAbility extends Ability {
  constructor() {
    super({
      id: "auto", name: "АВТОМАТ", viewModel: "fp-auto", moveSpeed: WEAPON_SPEED.auto, autoRepeat: true,
      aim: AIM_AUTO, recoil: RECOIL_AUTO, skills: LEAN_SKILLS, held: held("w-auto", "HoldRifle"), equipTime: EQUIP_TIME.auto,
    });
    this.attack = new RangedAttack(ATTACKS.auto);
    this.reloadPose = "ReloadRifle";
  }
  update(dt, g) {
    g.aiming = g.aimWanted() && !this.attack.reloading;
  }
  unequip(g) {
    g.aiming = false;
  }
  primary(g) {
    g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootRifle", sound: "shotAuto" });
  }
  action(name, g) {
    return name === "reload" && g.reloadWeapon(this);
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.12, y + s * 0.4, s * 0.66, s * 0.13, METAL); //  коробка и ствол
    ui.rect(x + s * 0.78, y + s * 0.43, s * 0.12, s * 0.06, METAL);
    ui.rect(x + s * 0.12, y + s * 0.4, s * 0.12, s * 0.22, METAL); //  приклад
    ui.rect(x + s * 0.48, y + s * 0.52, s * 0.1, s * 0.24, METAL); //  магазин
    ui.rect(x + s * 0.34, y + s * 0.52, s * 0.07, s * 0.15, METAL); // рукоять
  }
}

// Мачете: ближний бой — бьёт сильнее и дальше кулака
export class MacheteAbility extends Ability {
  constructor() {
    super({ id: "machete", name: "МАЧЕТЕ", viewModel: "fp-machete", autoRepeat: true, held: held("w-machete", "HoldMelee"), equipTime: EQUIP_TIME.machete });
    this.attack = new MeleeAttack(ATTACKS.machete);
    this.blocks = true;
  }
  secondary(g) {
    g.tryBlock(this); // ПКМ — блок
  }
  primary(g) {
    g.useAttack(this.attack, { anim: "Attack", sound: "swing", hitSound: "hit" });
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.44, y + s * 0.12, s * 0.12, s * 0.5, [190, 194, 204]); // клинок
    ui.rect(x + s * 0.53, y + s * 0.12, s * 0.04, s * 0.5, [235, 238, 244]); // кромка
    ui.rect(x + s * 0.34, y + s * 0.6, s * 0.32, s * 0.06, METAL); //         гарда
    ui.rect(x + s * 0.45, y + s * 0.66, s * 0.1, s * 0.22, [120, 80, 50]); //  рукоять
  }
}

// Катана: в ножнах у левого бедра. Удар (Iai) — выхватить и разрезать всё перед собой (хитбокс — почти
// весь экран), стряхнуть кровь и вернуть в ножны. От 3-го лица: в ножнах — на бедре, при ударе — в руке.
// ИАЙ (пассивный навык): продержал катану в ножнах KATANA_IAI.sheathTime секунд — бафф «ИАЙ»
// (движок: статус-бафф на 1 заряд): следующий удар — ×2 урона и выпад вперёд.
const KATANA_SHEATHED = { model: "w-katana-sheathed", pose: null, bone: "hips", position: [0.17, -0.02, 0.06], rotation: [-0.1736, 0, 0, 0.9848] }; // на левом бедре, рукоять чуть вверх
const KATANA_DRAWN = held("w-katana", "HoldMelee");
export const iaiBuff = () => buff({
  id: "iai", name: "ИАЙ", icon: "X" + KATANA_IAI.damage, color: [240, 196, 80],
  modifiers: [damageMultiplier(KATANA_IAI.damage)], charges: 1, duration: Infinity, speed: KATANA_IAI.speed,
});

export class KatanaAbility extends Ability {
  constructor() {
    super({ id: "katana", name: "КАТАНА", viewModel: "fp-katana", autoRepeat: true, held: KATANA_SHEATHED, equipTime: EQUIP_TIME.katana });
    this.attack = new MeleeAttack(ATTACKS.katana);
    this.drawn = 0; //    сколько ещё клинок вне ножен (идёт удар)
    this.sheathed = 0; // сколько секунд подряд в ножнах (копится к ИАЙ)
    this.lunge = 0; //    идёт выпад: удар — когда он кончится
    this.blocks = true;
  }
  secondary(g) {
    if (this.lunge > 0) return;
    g.tryBlock(this); // ПКМ — блок рукоятью и ножнами
  }
  // 0…1 — сколько накоплено к ИАЙ (для подсказки на экране)
  get iaiProgress() {
    return Math.min(1, this.sheathed / KATANA_IAI.sheathTime);
  }
  update(dt, g) {
    this.drawn = Math.max(0, this.drawn - dt);
    this.held = this.drawn > 0 ? KATANA_DRAWN : KATANA_SHEATHED;
    // Выпад закончился — режем
    if (this.lunge > 0) {
      this.lunge -= dt;
      if (this.lunge <= 0) this.strike(g);
      return;
    }
    // В ножнах — копим ИАЙ
    if (this.drawn === 0 && !g.player.hasStatus("iai")) {
      this.sheathed += dt;
      if (this.sheathed >= KATANA_IAI.sheathTime) {
        g.player.addStatus(iaiBuff());
        g.engine.sound.play("learn");
        g.engine.toast(`ИАЙ: СЛЕДУЮЩИЙ УДАР X${KATANA_IAI.damage} И ВЫПАД, БЕГ +${Math.round(KATANA_IAI.speed * 100)}%`, 1800);
      }
    }
  }
  unequip(g) {
    g.player.removeStatus("iai"); // убрал катану — готовность пропала
    this.sheathed = 0;
    this.lunge = 0;
    this.drawn = 0;
    this.held = KATANA_SHEATHED;
  }
  primary(g) {
    if (this.lunge > 0 || !this.attack.ready) return;
    // С ИАЙ — сначала выпад вперёд, удар — в конце рывка
    if (g.player.hasStatus("iai") && !g.player.mount) {
      const dir = g.look.lookDirection();
      // Рывок — не дальше ближайшего врага впереди: останавливаемся в ~1.2 м от него, а не пролетаем
      // насквозь (иначе враг оказывается за спиной и разрез мимо)
      const time = this.lungeTimeTo(g, dir);
      if (time <= 0.01) return this.strike(g); // враг уже вплотную — режем сразу
      dash(g.player, dir.x, dir.z, KATANA_IAI.lungeSpeed, time);
      this.lunge = time;
      this.drawn = 0.9;
      g.engine.sound.play("swing");
      return;
    }
    this.strike(g);
  }
  // Сколько секунд рваться вперёд: полный выпад или до ближайшего врага в секторе ±45° перед собой
  lungeTimeTo(g, dir) {
    const p = g.player.position;
    const len = Math.hypot(dir.x, dir.z) || 1;
    const fx = dir.x / len, fz = dir.z / len;
    let stop = KATANA_IAI.lungeSpeed * KATANA_IAI.lungeTime; // полный рывок, м
    for (const e of g.entities.list) {
      if (e === g.player || !e.alive || !g.player.isHostileTo(e)) continue;
      const dx = e.position.x - p.x, dz = e.position.z - p.z;
      const ahead = dx * fx + dz * fz; //            насколько впереди
      const side = Math.abs(dx * fz - dz * fx); //    насколько в стороне
      if (ahead <= 0 || side > ahead) continue; //    позади или дальше 45° вбок
      stop = Math.min(stop, Math.max(0, ahead - 1.2));
    }
    return stop / KATANA_IAI.lungeSpeed;
  }
  strike(g) {
    const used = g.useAttack(this.attack, { anim: "Iai", bodyAnim: "Iai", sound: "slash", hitSound: "hit" });
    if (!used) return;
    this.drawn = 0.7; //   клинок вне ножен, пока идёт Iai
    this.sheathed = 0; //  ИАЙ копится заново
    g.slashTrail(this.attack); // белый след — ровно по хитбоксу удара
  }
  drawIcon(ui, x, y, s) {
    // Клинок по диагонали: снизу слева вверх вправо, цуба и рукоять
    for (let i = 0; i < 7; i++) ui.rect(x + s * (0.3 + i * 0.075), y + s * (0.62 - i * 0.075), s * 0.09, s * 0.07, [215, 220, 230]);
    ui.rect(x + s * 0.22, y + s * 0.6, s * 0.16, s * 0.08, [180, 150, 70]); // цуба
    ui.rect(x + s * 0.12, y + s * 0.68, s * 0.14, s * 0.12, [40, 34, 40]); //  рукоять
  }
}

// Значок молота (и в панели, и в магазине)
export function drawHammer(ui, x, y, s) {
  ui.rect(x + s * 0.47, y + s * 0.32, s * 0.08, s * 0.52, [140, 95, 55]); // рукоять
  ui.rect(x + s * 0.3, y + s * 0.18, s * 0.42, s * 0.17, METAL); //       боёк
  ui.rect(x + s * 0.3, y + s * 0.18, s * 0.42, s * 0.05, [200, 205, 215]);
}

// Камень в руке: ЛКМ — удар рукой, ПКМ — блок, Q — бросок (держи — сильнее, отпусти — бросил).
// Q здесь — навык этого предмета (как наклоны у оружия дальнего боя)
const throwSkill = {
  id: "throw", name: "БРОСОК", short: "БРОСОК (ДЕРЖИ)",
  press: (g, a) => a.startCharge(g),
  hold: (dt, g, down, a) => a.holdCharge(dt, g, down),
};

export class StoneAbility extends HandAbility {
  constructor() {
    super();
    this.id = "stone";
    this.name = "КАМЕНЬ";
    this.viewModel = "fp-stone";
    this.empty = false;
    this.held = held("w-stone", null);
    this.skills = { skill1: throwSkill };
    this.throwAttack = new ThrowAttack(ATTACKS.stone);
    this.charge = null; // секунд держим Q (null — не замахиваемся)
  }
  // 0…1 — сила замаха (для полоски у прицела)
  get chargePower() {
    return this.charge === null ? null : this.throwAttack.powerFor(this.charge);
  }
  update(dt, g) {
    this.throwAttack.update(dt);
  }
  unequip(g) {
    this.charge = null;
  }
  startCharge(g) {
    if (this.charge !== null || !this.throwAttack.ready || g.stoneCount() <= 0) return;
    this.charge = 0;
    g.viewModel()?.play("Charge");
  }
  holdCharge(dt, g, down) {
    if (this.charge === null) return;
    if (down) {
      this.charge += dt;
      return;
    }
    const power = this.throwAttack.powerFor(this.charge); // отпустили — бросок
    this.charge = null;
    g.throwStone(this.throwAttack, power);
  }
  drawIcon(ui, x, y, s, g) {
    const icon = s * 0.6;
    ITEM_ICONS.stone?.(ui, x + (s - icon) / 2, y + (s - icon) / 2, icon);
    const n = g?.stoneCount?.();
    if (n !== undefined) ui.text(String(n), x + s - 5, y + s - 18, 2, n > 0 ? [255, 255, 255] : [255, 90, 80], "right");
  }
}
// Значки предметов (items.js кладёт сюда свои — чтобы не было кругового импорта)
export const ITEM_ICONS = {};

// Обычный предмет в хотбаре (кость, монета): в руке он, а бьём — как рукой. Значок — предмета
export class HeldItemAbility extends HandAbility {
  constructor(item, info) {
    super();
    this.id = "item:" + item;
    this.item = item;
    this.info = info; // { name, color, drawIcon? } — из items.js
    this.name = info.name;
    this.empty = false;
  }
  drawIcon(ui, x, y, s, g) {
    const icon = s * 0.6;
    const ix = x + (s - icon) / 2;
    const iy = y + (s - icon) / 2;
    if (this.info.drawIcon) this.info.drawIcon(ui, ix, iy, icon);
    else ui.rect(ix, iy, icon, icon, this.info.color || [255, 0, 255]);
    const n = g?.player?.hotbar?.count(this.item);
    if (n > 1) ui.text(String(n), x + s - 5, y + s - 18, 2, [255, 255, 255], "right");
  }
}

// Какая способность у предмета из хотбара (items.js → ability)
export const ABILITY_FOR_ITEM = {
  pistol: () => new PistolAbility(),
  rifle: () => new RifleAbility(),
  auto: () => new AutoAbility(),
  machete: () => new MacheteAbility(),
  katana: () => new KatanaAbility(),
  stone: () => new StoneAbility(),
  builder: () => new BuildAbility(),
};
