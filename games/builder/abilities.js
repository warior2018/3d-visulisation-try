// ============================================================
//  Способности «Стройки». Как устроены способности и панель ячеек —
//  решает движок (engine/world/abilities.js), а здесь — что делают именно наши.
//  Оружие и инструмент — это ПРЕДМЕТЫ (items.js): что лежит в хотбаре (3 ячейки: оружие и два предмета —
//  стройка, аптечка, ловушки), то и в панели способностей. Пустая ячейка оружия — рука (кулак).
//
//  g — игровая сцена (game-scene.js): через неё способности бьют, стреляют, строят.
// ============================================================

import { Ability, MeleeAttack, SlamAttack, RangedAttack, MagicAttack, buff, dash, stun, withStatus, bleed } from "../../engine/index.js";
import { skinFx } from "./skins.js";
import { lighter } from "./scene/throwers.js";
import { PALETTE, ATTACKS, WEAPON_SPEED, AIM_PISTOL, AIM_RIFLE, AIM_AUTO, RECOIL_PISTOL, RECOIL_RIFLE, RECOIL_AUTO, KATANA_IAI, MACHETE_LEAP, BOW, EQUIP_TIME, SHOTGUN_BLAST, DEMO, MEDKIT, DASH_SLIDE } from "./config.js";

// Вид от 3-го лица: модель оружия крепится к правому предплечью героя (кость forearm_R скелета) —
// в кулак (0.31 м ниже локтя), повёрнутая так, чтобы ствол / клинок шёл вдоль руки от кулака.
// pose — поза рук (слой поверх ходьбы, tools/make-skeleton.js → HERO_CLIPS)
export const IN_HAND = { bone: "forearm_R", position: [0, -0.31, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
const held = (model, pose) => ({ model, pose, ...IN_HAND });

const BONE = [220, 214, 194];

const METAL = [160, 166, 178]; // светлый металл — чтобы значок был виден на тёмной ячейке

export class HandAbility extends Ability {
  constructor() {
    // empty — ячейка с рукой выглядит пустой (рука — это «ничего в руке»); зажал ЛКМ — бьёт снова по готовности
    super({ id: "hand", name: "FIST", viewModel: "fp-arm", autoRepeat: true, empty: true });
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
      id: "pistol", name: "PISTOL", viewModel: "fp-pistol", moveSpeed: WEAPON_SPEED.pistol, autoRepeat: true, // зажал — стреляет по кулдауну
      aim: AIM_PISTOL, recoil: RECOIL_PISTOL, held: held("w-pistol", "HoldPistol"), equipTime: EQUIP_TIME.pistol,
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
    // тяжёлый выстрел: свой звук и встряска картинки (прицел не сдвигается; отдача ствола — RECOIL_PISTOL)
    if (g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "Shoot", sound: "shotHeavy" })) g.shake?.add(ATTACKS.pistol.shake || 0);
  }
  action(name, g) {
    return name === "reload" && g.reloadWeapon(this); // R — перезарядить
  }
  // Значок — «пустынный орёл»: длинный массивный затвор, тёмная рукоять, квадратная скоба
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.12, y + s * 0.28, s * 0.72, s * 0.2, METAL); //        затвор
    ui.rect(x + s * 0.14, y + s * 0.24, s * 0.66, s * 0.05, [120, 126, 138]); // ребро сверху
    ui.rect(x + s * 0.2, y + s * 0.47, s * 0.2, s * 0.34, [70, 52, 42]); //  рукоять
    ui.rect(x + s * 0.4, y + s * 0.47, s * 0.16, s * 0.04, METAL); //        скоба: низ
    ui.rect(x + s * 0.54, y + s * 0.47, s * 0.04, s * 0.12, METAL); //       и перед
    ui.rect(x + s * 0.12, y + s * 0.2, s * 0.06, s * 0.08, METAL); //        курок
    ui.rect(x + s * 0.78, y + s * 0.2, s * 0.04, s * 0.05, METAL); //        мушка
  }
}

export class BuildAbility extends Ability {
  constructor() {
    // Молот: покупается в магазине; блоки ставит из камней (1 камень — 1 блок), цвет — на G
    super({ id: "build", name: "HAMMER", viewModel: "fp-hammer", held: held("w-hammer", "HoldBlock"), equipTime: EQUIP_TIME.item });
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
    // Сколько блоков осталось; ноль — красным
    const n = g?.blockCount?.();
    if (n !== undefined) ui.text(String(n), x + s - 5, y + s - 18, 2, n > 0 ? [255, 255, 255] : [255, 90, 80], "right");
  }
}

// Снайперская винтовка: покупается в магазине (B).
// ПКМ — оптика: сильное приближение (aimFov), экран закрывает круг прицела (scope)
export class RifleAbility extends Ability {
  constructor() {
    super({
      id: "rifle", name: "SNIPER RIFLE", viewModel: "fp-rifle", moveSpeed: WEAPON_SPEED.rifle, autoRepeat: true,
      aim: AIM_RIFLE, recoil: RECOIL_RIFLE, held: held("w-rifle", "HoldSniper"), equipTime: EQUIP_TIME.rifle,
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
    g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootSniper", sound: "shot" });
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

// Арбалет: болт насквозь (до 3 врагов на линии, ATTACKS.crossbow pierce), после каждого выстрела — взвод.
// ПКМ — прицел (небольшое приближение)
export class CrossbowAbility extends Ability {
  constructor() {
    super({
      id: "crossbow", name: "CROSSBOW", viewModel: "fp-crossbow", moveSpeed: WEAPON_SPEED.crossbow, autoRepeat: true,
      aim: AIM_AUTO, recoil: RECOIL_PISTOL, held: held("w-crossbow", "HoldRifle"), equipTime: EQUIP_TIME.crossbow,
    });
    this.attack = new RangedAttack(ATTACKS.crossbow);
  }
  update(dt, g) {
    g.aiming = g.aimWanted() && !this.attack.reloading;
  }
  unequip(g) {
    g.aiming = false;
  }
  primary(g) {
    g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootSniper", sound: "snap" });
  }
  action(name, g) {
    return name === "reload" && g.reloadWeapon(this);
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.1, y + s * 0.47, s * 0.78, s * 0.08, [150, 100, 60]); // ложа
    ui.rect(x + s * 0.68, y + s * 0.2, s * 0.07, s * 0.6, METAL); //           плечи лука
    ui.rect(x + s * 0.58, y + s * 0.22, s * 0.04, s * 0.56, [220, 220, 210]); // тетива
    ui.rect(x + s * 0.3, y + s * 0.44, s * 0.62, s * 0.03, [200, 205, 215]); // болт
  }
}

// Лук (СТРЕЛОК, второе оружие): зажал ЛКМ — тетива натягивается (до BOW.draw с, талант QUICK DRAW — быстрее),
// отпустил — стрела: урон и скорость растут с натяжением (BOW). Стрелы бесконечные, после выстрела — пауза
// ATTACKS.bow.cooldown. ПКМ — прицел. Q — залп: 3 стрелы веером, сразу полное натяжение (BOW.volley).
// Таланты: пробивание, урон за натяжение, взрывная стрела (game-scene → shootArrow)
export class BowAbility extends Ability {
  constructor() {
    super({
      id: "bow", name: "BOW", viewModel: "fp-bow", moveSpeed: WEAPON_SPEED.bow,
      aim: AIM_AUTO, held: held("w-bow", "HoldPistol"), equipTime: EQUIP_TIME.bow,
      skills: { skill1: { id: "volley", name: "VOLLEY", press: (g, a) => a.volley(g), cooldown: (a) => ({ left: a.volleyLeft, total: BOW.volley.cooldown }) } },
    });
    this.attack = new RangedAttack(ATTACKS.bow);
    this.blast = blastAttack(ATTACKS.bowBlast);
    this.draw = -1; //         сколько уже тянем (с); -1 — не тянем
    this.readyAt = 0; //       когда можно снова (после выстрела — пауза)
    this.volleyReadyAt = 0;
  }
  get drawing() {
    return this.draw >= 0;
  }
  get volleyLeft() {
    return Math.max(0, this.volleyReadyAt - performance.now() / 1000);
  }
  // 0…1 — натяжение (для прицела / HUD)
  drawShare(g) {
    return this.drawing ? Math.min(1, this.draw / this.bowStats(g).draw) : 0;
  }
  bowStats(g) {
    const s = g.talentStats || {};
    return { draw: s.bowDraw || BOW.draw, power: s.bowPower || 0, pierce: s.bowPierce || 0, blast: !!s.bowBlast };
  }
  primary(g) {
    if (this.drawing || performance.now() / 1000 < this.readyAt || g.abilities.equipping) return;
    this.draw = 0;
    g.engine.sound.play("boltOpen");
  }
  update(dt, g) {
    g.aiming = g.aimWanted();
    if (!this.drawing) return;
    if (!g.background && g.engine.input.isDown("primary")) this.draw = Math.min(this.bowStats(g).draw, this.draw + dt);
    else this.release(g);
  }
  unequip(g) {
    this.draw = -1;
    g.aiming = false;
  }
  release(g) {
    const k = this.drawShare(g);
    this.draw = -1;
    this.shoot(g, k, [0]);
  }
  // Q: залп веером, сразу полное натяжение
  volley(g) {
    if (this.volleyLeft > 0 || g.abilities.equipping) return;
    const V = BOW.volley;
    this.volleyReadyAt = performance.now() / 1000 + V.cooldown;
    this.draw = -1;
    this.shoot(g, 1, Array.from({ length: V.count }, (_, i) => ((i - (V.count - 1) / 2) * V.spread * Math.PI) / 180));
  }
  shoot(g, k, offsets) {
    const S = this.bowStats(g);
    const damage = (BOW.minDamage + (ATTACKS.bow.damage - BOW.minDamage) * k) * (1 + S.power * k);
    const speed = BOW.minSpeed + (BOW.maxSpeed - BOW.minSpeed) * k;
    for (const yawOffset of offsets) g.shootArrow(this, { damage, speed, yawOffset, pierce: S.pierce, blast: S.blast });
    this.readyAt = performance.now() / 1000 + ATTACKS.bow.cooldown;
    g.viewModel()?.play("Shoot");
    g.player.view?.animator.playOnce("ShootSniper");
    g.engine.sound.play("snap");
    g.engine.log(`лук: выстрел, натяжение ${Math.round(k * 100)}%, урон ${Math.round(damage)}${offsets.length > 1 ? `, залп ×${offsets.length}` : ""}`);
  }
  drawIcon(ui, x, y, s) {
    const W = [150, 100, 60];
    ui.rect(x + s * 0.4, y + s * 0.42, s * 0.08, s * 0.16, [90, 60, 36]); //  рукоять
    ui.rect(x + s * 0.44, y + s * 0.22, s * 0.07, s * 0.22, W); //           верхнее плечо
    ui.rect(x + s * 0.52, y + s * 0.1, s * 0.06, s * 0.14, W);
    ui.rect(x + s * 0.44, y + s * 0.56, s * 0.07, s * 0.22, W); //           нижнее плечо
    ui.rect(x + s * 0.52, y + s * 0.76, s * 0.06, s * 0.14, W);
    ui.rect(x + s * 0.6, y + s * 0.12, s * 0.02, s * 0.76, [225, 225, 215]); // тетива
    ui.rect(x + s * 0.12, y + s * 0.49, s * 0.62, s * 0.03, [200, 205, 215]); // стрела
  }
}

// Автомат: очереди (зажал ЛКМ), обойма 30, отдача растёт с каждым выстрелом очереди
export class AutoAbility extends Ability {
  constructor() {
    super({
      id: "auto", name: "ASSAULT RIFLE", viewModel: "fp-auto", moveSpeed: WEAPON_SPEED.auto, autoRepeat: true,
      aim: AIM_AUTO, recoil: RECOIL_AUTO, held: held("w-auto", "HoldRifle"), equipTime: EQUIP_TIME.auto,
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
    if (g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootRifle", sound: "shotAuto" })) g.onRifleShot(this.attack); // талант GRENADE
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
// Мачете: ЛКМ — взмах, ПКМ — блок. Q — прыжок (MACHETE_LEAP): нож обратным хватом (лезвием вниз), прыжок вперёд
// с замахом; хитбокс — у самого клинка (чуть больше): кого коснулся — тому удар ×damage (одному), не коснулся — урона нет.
// Таланты (вкладка БОЕЦ, MACHETE): урон прыжка, дальность, кровотечение — scene/progression.js → leapStats
const MACHETE_HELD = held("w-machete", "HoldMachete");
const MACHETE_REVERSE = { ...MACHETE_HELD, rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] }; // обратный хват: клинок вдоль предплечья

export class MacheteAbility extends Ability {
  constructor() {
    super({
      id: "machete", name: "MACHETE", viewModel: "fp-machete", autoRepeat: true, held: MACHETE_HELD, equipTime: EQUIP_TIME.machete,
      skills: { skill1: { id: "leap", name: "LEAP", press: (g, a) => a.leap(g), cooldown: (a) => ({ left: a.leapCooldown, total: MACHETE_LEAP.cooldown }) } },
    });
    this.attack = new MeleeAttack(ATTACKS.machete);
    this.leapAttack = new MeleeAttack({ ...ATTACKS.machete, id: "machete-leap", name: "MACHETE LEAP" });
    this.leapReadyAt = 0; // когда прыжок снова готов (секунды часов): перезарядка идёт, даже если мачете не в руках
    this.leapLeft = 0; //    идёт прыжок: сколько ещё секунд
    this.blocks = true;
  }
  get leapCooldown() {
    return Math.max(0, this.leapReadyAt - performance.now() / 1000);
  }
  get busy() {
    return this.leapLeft > 0;
  }
  secondary(g) {
    if (this.busy) return;
    g.tryBlock(this); // ПКМ — блок
  }
  // Q: прыжок вперёд (куда смотрим, по земле) с подскоком; нож — обратным хватом
  leap(g) {
    if (this.busy || this.leapCooldown > 0 || g.abilities.equipping) return;
    g.beforeMovementSkill?.(); // верхом — сначала слезть (MOUNT)
    const L = g.leapStats();
    const dir = g.look.lookDirection();
    const len = Math.hypot(dir.x, dir.z) || 1;
    this.leapReadyAt = performance.now() / 1000 + MACHETE_LEAP.cooldown;
    this.leapLeft = L.distance / MACHETE_LEAP.speed;
    this.leapDir = { x: dir.x / len, z: dir.z / len };
    dash(g.player, this.leapDir.x, this.leapDir.z, MACHETE_LEAP.speed, this.leapLeft, null, { slide: DASH_SLIDE });
    g.player.velocity.y = MACHETE_LEAP.lift;
    this.held = MACHETE_REVERSE;
    // урон прыжка: сила оружия (редкость, улучшения) — как у взмаха; кровотечение — с талантом
    this.leapAttack.power = this.attack.power;
    this.leapAttack.modifiers = L.bleed ? [withStatus(bleed(L.bleed))] : [];
    g.viewModel()?.play("Leap");
    g.player.view?.animator.playOnce("MacheteSlash");
    g.engine.sound.play("swing");
  }
  update(dt, g) {
    if (this.leapLeft <= 0) return;
    if (this.leapHit(g)) return this.endLeap(g);
    this.leapLeft -= dt;
    if (this.leapLeft <= 0) this.endLeap(g);
  }
  // Хитбокс у клинка: шар впереди героя; первый враг, чьё тело (отрезок от ног до макушки) его касается — удар
  leapHit(g) {
    const H = MACHETE_LEAP.hitbox;
    const p = g.player;
    const bx = p.position.x + this.leapDir.x * H.forward, by = p.position.y + H.height, bz = p.position.z + this.leapDir.z * H.forward;
    let target = null, best = Infinity;
    for (const e of g.entities.list) {
      if (e === p || !e.alive || !p.isHostileTo(e)) continue;
      const up = Math.max(0, e.position.y - by, by - (e.position.y + e.height)); // по высоте — до ближайшей точки тела
      const d = Math.hypot(Math.hypot(e.position.x - bx, e.position.z - bz), up);
      if (d <= H.radius + (e.radius || 0) && d < best) { best = d; target = e; }
    }
    if (!target) return false;
    this.leapAttack.hit(p, target, g.combatContext({ baseDamage: this.leapAttack.roll() * g.leapStats().mult, onHit: (h) => g.onPlayerHit(h) }));
    g.engine.sound.play("hit", { at: target.position });
    return true;
  }
  endLeap(g) {
    this.leapLeft = 0;
    g.player.dash = null;
    g.player.velocity.x = g.player.velocity.z = 0; // по инерции дальше не летим — прыжок ровно на свою длину
    this.held = MACHETE_HELD;
  }
  unequip(g) {
    if (this.leapLeft > 0) this.endLeap(g);
  }
  primary(g) {
    if (this.busy) return;
    const used = g.useAttack(this.attack, { anim: "Attack", bodyAnim: "MacheteSlash", sound: "swing", hitSound: "hit" });
    // След, как у катаны (плоский и сразу, по хитбоксу), только уже — сектор мачете 80° — и чуть наискось
    if (used) g.slashCrescent(this.attack, "machete", -1); // разрез-серп по хитбоксу, справа налево, как взмах
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.44, y + s * 0.12, s * 0.12, s * 0.5, [190, 194, 204]); // клинок
    ui.rect(x + s * 0.53, y + s * 0.12, s * 0.04, s * 0.5, [235, 238, 244]); // кромка
    ui.rect(x + s * 0.34, y + s * 0.6, s * 0.32, s * 0.06, METAL); //         гарда
    ui.rect(x + s * 0.45, y + s * 0.66, s * 0.1, s * 0.22, [120, 80, 50]); //  рукоять
  }
}

// Копьё (БОЕЦ): ЛКМ — укол далеко вперёд (двоих на линии), блока нет; ПКМ (держать) — разбег с копьём
// наперевес: game-scene.js → startSpearCharge / spearControl (движок: Charge)
export class SpearAbility extends Ability {
  constructor() {
    super({ id: "spear", name: "SPEAR", viewModel: "fp-spear", autoRepeat: true, held: held("w-spear", "HoldMelee"), equipTime: EQUIP_TIME.spear });
    this.attack = new MeleeAttack(ATTACKS.spear);
  }
  primary(g) {
    if (g.spearRun?.active) return; // на бегу не колем — копьё и так впереди
    g.useAttack(this.attack, { anim: "Attack", sound: "swing", hitSound: "hit" });
  }
  secondary(g) {
    g.startSpearCharge(this);
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.47, y + s * 0.3, s * 0.06, s * 0.6, [140, 95, 60]); //   древко
    ui.rect(x + s * 0.42, y + s * 0.12, s * 0.16, s * 0.2, [200, 205, 215]); // наконечник
    ui.rect(x + s * 0.47, y + s * 0.06, s * 0.06, s * 0.08, [235, 238, 244]);
  }
}

// Катана: в ножнах у левого бедра. Удар (ЛКМ) — выхватить и разрезать всё перед собой (хитбокс — почти
// весь экран), стряхнуть кровь и вернуть в ножны. От 3-го лица: в ножнах — на бедре, при ударе — в руке.
// ИАЙ — скилл на Q (skill1), как «Стремительный удар» Гэндзи: сильный рывок туда, куда смотришь (в 3D: и вверх,
// и вниз, и наискось), разрез всех врагов на пути (урон ×KATANA_IAI.damage). Всё время рывка камера стоит
// (движок: ActionLock); в конце пути — замираем на pause с (и в воздухе), камера отпускается чуть раньше —
// через lockShare этой паузы. Перезарядка — KATANA_IAI.cooldown.
// Пока ИАЙ готов (и катана в руках) — прибавка к бегу с талантом IAI SPEED (без значка: готовность видна на ячейке Q).
// В ножнах — левая рука лежит на ножнах, правая наготове (поза HoldKatana); выхвачена — HoldKatanaDrawn
const KATANA_SHEATHED = { model: "w-katana-sheathed", pose: "HoldKatana", bone: "hips", position: [0.17, -0.02, 0.06], rotation: [-0.1736, 0, 0, 0.9848] }; // на левом бедре, рукоять чуть вверх
// Выхвачена: клинок в правой руке, а на бедре остаются пустые ножны (второй предмет — extra) там же, где висели
const KATANA_DRAWN = { ...held("w-katana", "HoldKatanaDrawn"), extra: { ...KATANA_SHEATHED, model: "w-katana-saya" } };

export class KatanaAbility extends Ability {
  constructor() {
    super({
      id: "katana", name: "KATANA", viewModel: "fp-katana", autoRepeat: true, held: KATANA_SHEATHED, equipTime: EQUIP_TIME.katana,
      // cooldown — для ячейки скилла на панели: { left, total } (часики)
      skills: { skill1: { id: "iai", name: "IAI", press: (g, a) => a.iai(g), cooldown: (a) => ({ left: a.iaiLeft, total: KATANA_IAI.cooldown }) } },
    });
    this.attack = new MeleeAttack(ATTACKS.katana);
    this.saddle = new MeleeAttack(ATTACKS.katanaSaddle); // верхом (MOUNT)
    this.drawn = 0; //      сколько ещё клинок вне ножен (идёт удар)
    this.iaiReadyAt = 0; // когда ИАЙ снова готов (секунды часов): перезарядка идёт, даже если катана не в руках
    this.dashLeft = 0; //   идёт рывок ИАЙ: сколько ещё секунд
    this.pauseLeft = 0; //  остановка после рывка
    this.dashFrom = null; // где герой был в прошлом кадре рывка (режем всех между)
    this.wasReady = true; // ИАЙ был готов в прошлом кадре (звук — только когда стал готов)
    this.cut = new Set(); // кого этот рывок уже разрезал (каждого — один раз)
    this.blocks = true;
  }
  get busy() {
    return this.dashLeft > 0 || this.pauseLeft > 0;
  }
  secondary(g) {
    if (this.busy) return;
    g.tryBlock(this); // ПКМ — блок рукоятью и ножнами
  }
  // Сколько секунд ещё перезаряжается ИАЙ (0 — готов)
  get iaiLeft() {
    return Math.max(0, this.iaiReadyAt - performance.now() / 1000);
  }
  // 0…1 — сколько прошло перезарядки ИАЙ (для подсказки на экране)
  get iaiProgress() {
    return 1 - this.iaiLeft / KATANA_IAI.cooldown;
  }
  update(dt, g) {
    this.drawn = Math.max(0, this.drawn - dt);
    this.held = this.drawn > 0 || this.busy ? KATANA_DRAWN : KATANA_SHEATHED;
    if (this.dashLeft > 0) {
      this.cutAlong(g); // режем всех, мимо кого пролетели за этот кадр
      this.dashTime += dt;
      if (this.dashTime >= this.dashTotal * 0.5) this.cutVisual(g); // половина пути — взмах и серп
      this.dashLeft -= dt;
      if (this.dashLeft <= 0) this.endDash(g);
      return;
    }
    if (this.pauseLeft > 0) {
      this.pauseLeft -= dt;
      return;
    }
    // ИАЙ снова готов — звук (готовность видна на ячейке Q); с талантом IAI SPEED — быстрее бег, пока готов
    const ready = this.iaiLeft === 0;
    if (ready && !this.wasReady) g.engine.sound.play("learn");
    this.wasReady = ready;
    g.player.speedBonuses.iai = ready ? g.iaiStats().speed : 0;
  }
  unequip(g) {
    delete g.player.speedBonuses.iai; // убрал катану — прибавки к бегу нет (перезарядка идёт дальше)
    if (this.dashLeft > 0 || this.pauseLeft > 0) g.player.dash = null; // рывок обрывается
    g.player.tilt = 0;
    if (this.dashLeft > 0) g.actionLock.clear();
    this.dashLeft = 0;
    this.pauseLeft = 0;
    this.drawn = 0;
    this.held = KATANA_SHEATHED;
  }
  primary(g) {
    if (this.busy) return;
    // верхом — широкий взмах в сторону (не по скакуну), иначе обычный удар
    if (g.player.mount) {
      if (g.useAttack(this.saddle, { anim: "Iai", bodyAnim: "MacheteSlash", sound: "slash", hitSound: "hit", animSpeed: 1.5 })) this.drawn = 0.5;
      return;
    }
    this.strike(g); // ЛКМ — всегда обычный удар
  }
  // Q: рывок туда, куда смотрим (в 3D) — режет всех на пути
  iai(g) {
    if (this.busy || this.iaiLeft > 0 || g.abilities.equipping) return;
    g.beforeMovementSkill?.(); // верхом — сначала слезть (MOUNT)
    const I = KATANA_IAI;
    g.player.speedBonuses.iai = 0;
    this.iaiReadyAt = performance.now() / 1000 + I.cooldown;
    const dir = g.look.lookDirection();
    this.dashLeft = I.distance / I.dashSpeed;
    this.dashTotal = this.dashLeft;
    dash(g.player, dir.x, dir.z, I.dashSpeed, this.dashLeft, dir.y, { shape: I.shape, slide: DASH_SLIDE }); // в рывке — «плоская» коробка; по стенам — скользит
    // Камера стоит весь рывок и ещё lockShare паузы в конце (рывок может оборваться о стену — тогда раньше)
    g.actionLock.lock(this.dashLeft + I.pause * I.lockShare, { look: true });
    this.dashFrom = { ...g.player.position };
    this.cut.clear();
    this.drawn = 1;
    g.player.view?.animator.playOnce("IaiDash"); // от 3-го лица: вытянулся в рывке, разрез, потом — снова стойка
    this.dashTime = 0; //                          сколько уже летим: разрез — на половине пути (cut)
    this.cutDone = false;
    g.player.tilt = -Math.asin(Math.max(-1, Math.min(1, dir.y))) * 0.8; // рывок вверх / вниз — всё тело по вектору
    g.engine.sound.play("swing");
  }
  // Враги рядом с отрезком «где был → где сейчас» (в 3D, ширина разреза — I.width) получают удар ×mult,
  // каждый один раз. Расстояние — от отрезка до оси врага (от ног до макушки)
  cutAlong(g) {
    const I = KATANA_IAI;
    const p = g.player;
    const a = this.dashFrom, b = p.position;
    const mid = p.height / 2; // режем на уровне пояса героя
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len2 = dx * dx + dy * dy + dz * dz || 1e-6;
    for (const e of g.entities.list) {
      if (e === p || !e.alive || this.cut.has(e) || !p.isHostileTo(e)) continue;
      const ey = e.position.y + e.height / 2 - mid; // середина врага в «координатах ног героя»
      const t = Math.max(0, Math.min(1, ((e.position.x - a.x) * dx + (ey - a.y) * dy + (e.position.z - a.z) * dz) / len2));
      const cx = a.x + dx * t, cy = a.y + dy * t, cz = a.z + dz * t;
      const flat = Math.hypot(e.position.x - cx, e.position.z - cz);
      const up = Math.max(0, Math.abs(ey - cy) - e.height / 2); // по высоте — от ближайшей точки тела
      if (Math.hypot(flat, up) > I.width + (e.radius || 0)) continue;
      this.cut.add(e);
      const r = this.attack.hit(p, e, g.combatContext({ baseDamage: this.attack.roll() * g.iaiStats().mult, onHit: (h) => g.onPlayerHit(h) }));
      // Талант IAI RESET: убил самим рывком — перезарядка ИАЙ сброшена (снова можно, как только кончится этот рывок)
      if (r.killed && g.talentStats?.iaiReset && this.iaiReadyAt > 0) {
        this.iaiReadyAt = 0;
        g.engine.toast("IAI RESET", 700);
      }
      g.engine.sound.play("hit");
    }
    this.dashFrom = { ...b };
  }
  // Взмах ИАЙ: клинок от 1-го лица (удар Iai вдвое быстрее) и пиксельный серп на весь экран — один раз за рывок
  cutVisual(g) {
    if (this.cutDone) return;
    this.cutDone = true;
    g.viewModel()?.play("Iai", 2);
    // серп — вдоль пореза: перед героем, поперёк взгляда, едет вместе с ним
    const fx = skinFx(g.settings, "katana");
    g.crescents.add({ anchor: () => g.look.position, yaw: g.look.yaw, pitch: g.look.pitch, dir: 1, ...(fx ? { color: lighter(fx), edge: fx } : {}) });
    g.engine.sound.play("slash");
  }

  // Конец пути: замираем на месте (и в воздухе) на pause с; камера отпустится чуть раньше (lock — в iai)
  endDash(g) {
    const I = KATANA_IAI;
    this.cutAlong(g);
    this.cutVisual(g); // рывок короткий (упёрлись) — взмах сейчас, пока камера стоит
    this.dashLeft = 0;
    this.pauseLeft = I.pause;
    g.player.tilt = 0;
    dash(g.player, 0, 0, 0, I.pause, 0); // рывок со скоростью 0 — стоим, не падаем, клавиши не двигают
    g.actionLock.lock(I.pause * I.lockShare, { look: true }); // рывок оборвался раньше (стена) — всё равно до 70 % паузы
    this.drawn = 0.5;
  }
  strike(g) {
    // Удар — вдвое быстрее анимации Iai; урон по хитбоксу — сразу (у катаны нет замаха)
    const used = g.useAttack(this.attack, { anim: "Iai", bodyAnim: "Iai", sound: "slash", hitSound: "hit", animSpeed: 2 });
    if (!used) return;
    this.drawn = 0.35; //  клинок вне ножен, пока идёт Iai (×2 — вдвое короче)
    g.slashCrescent(this.attack, "katana", 1); // разрез-серп (как у ИАЙ) по хитбоксу
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

// ============================================================
//  Оружие классов — у каждого базовое и покупное:
//   БОЕЦ — мачете → боевой молот, катана; СТРЕЛОК — пистолет → автомат, дробовик, снайперка;
//   МАГ — жезл льда → магма-камень, посох метеора; ЗАСАДНИК — капкан, шипы; ПРИЗЫВАТЕЛЬ — кабаны, турели.
// ============================================================

// Число в правом нижнем углу ячейки (сколько штук осталось); ноль — красным
const drawCount = (ui, x, y, s, n) => {
  if (n !== undefined) ui.text(String(n), x + s - 5, y + s - 18, 2, n > 0 ? [255, 255, 255] : [255, 90, 80], "right");
};

// Ловушка в руке (капкан или шипы — стопка в ячейке): ЛКМ — поставить на землю под прицелом
export class TrapAbility extends Ability {
  constructor(type, name, model, drawIcon) {
    super({ id: type, name, viewModel: "fp-" + type, held: held("w-" + type, "HoldBlock"), equipTime: EQUIP_TIME.trap });
    this.type = type;
    this.paint = drawIcon;
  }
  primary(g) {
    g.placeTrap(this.type);
  }
  drawIcon(ui, x, y, s, g) {
    this.paint(ui, x, y, s);
    drawCount(ui, x, y, s, g?.itemCount?.(this.type));
  }
}

// Боевой молот (БОЕЦ): двуручный, бьёт ПО ЗЕМЛЕ перед собой (как ульта Райнхардта, только всегда) —
// движок: SlamAttack; урон всем в круге (1 блок, талант SPLASH SLAM — больше), оглушение — талант STUN.
// Тряска и круг на земле — game-scene.js → hammerSlam
export class WarHammerAbility extends Ability {
  constructor() {
    super({ id: "war-hammer", name: "WAR HAMMER", viewModel: "fp-war-hammer", moveSpeed: WEAPON_SPEED.warHammer, autoRepeat: true, held: held("w-war-hammer", "HoldHammer"), equipTime: EQUIP_TIME.warHammer });
    this.attack = new SlamAttack(ATTACKS.warHammer);
    this.swing = new MeleeAttack(ATTACKS.hammerSwing); // верхом: под себя не бьём — медленный взмах в сторону
    this.blocks = true;
  }
  secondary(g) {
    g.tryBlock(this);
  }
  primary(g) {
    if (g.player.mount) return void g.useAttack(this.swing, { anim: "Attack", bodyAnim: "MacheteSlash", sound: "swing", hitSound: "hit" });
    g.useAttack(this.attack, { anim: "Attack", bodyAnim: "HammerSlam", sound: "swing", ctx: { radius: g.talentStats?.hammerSlam || ATTACKS.warHammer.radius, fallMultiplier: (fall) => g.slamFallMultiplier(fall), onSlam: (c, r, hits, info) => g.hammerSlam(c, r, hits, info) } });
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.46, y + s * 0.3, s * 0.08, s * 0.58, [120, 80, 50]); // рукоять
    ui.rect(x + s * 0.22, y + s * 0.14, s * 0.56, s * 0.22, [120, 124, 134]); // тяжёлый боёк
    ui.rect(x + s * 0.22, y + s * 0.14, s * 0.56, s * 0.06, [180, 184, 194]);
  }
}

// Дробовик (СТРЕЛОК): 8 дробин с разбросом за выстрел, обойма 6
export class ShotgunAbility extends Ability {
  constructor() {
    super({
      id: "shotgun", name: "SHOTGUN", viewModel: "fp-shotgun", moveSpeed: WEAPON_SPEED.shotgun, autoRepeat: true,
      aim: AIM_AUTO, recoil: RECOIL_RIFLE, held: held("w-shotgun", "HoldRifle"), equipTime: EQUIP_TIME.shotgun,
      skills: { skill1: { id: "blast", name: "BLAST JUMP", press: (g, a) => a.blast(g), cooldown: (a) => ({ left: a.blastLeft, total: SHOTGUN_BLAST.cooldown }) } },
    });
    this.attack = new RangedAttack(ATTACKS.shotgun);
    this.reloadPose = "ReloadRifle";
    // Залп Q — конус перед собой (как удар по сектору), но это выстрел: вид «ranged» (таланты стрелка)
    this.blastAttack = new MeleeAttack(ATTACKS.shotgunBlast);
    this.blastAttack.kind = "ranged";
    this.blastReadyAt = 0; // когда залп снова готов (секунды часов): перезарядка идёт и без дробовика в руках
  }
  get blastLeft() {
    return Math.max(0, this.blastReadyAt - performance.now() / 1000);
  }
  // Q — ОТСКОК: залп в упор по конусу (оглушает) и отброс героя против взгляда
  blast(g) {
    const B = SHOTGUN_BLAST;
    if (this.blastLeft > 0 || g.abilities.equipping) return;
    g.beforeMovementSkill?.(); // верхом — сначала слезть (MOUNT)
    const used = g.useAttack(this.blastAttack, {
      anim: "Shoot", bodyAnim: "ShootShotgun", sound: "shot",
      onHit: (hit) => hit.target.alive && hit.target.addStatus?.(stun(B.stun)()),
    });
    if (!used) return;
    this.blastReadyAt = performance.now() / 1000 + B.cooldown;
    const d = g.look.lookDirection();
    dash(g.player, -d.x, -d.z, B.push, B.pushTime, -d.y + B.lift, { slide: DASH_SLIDE }); // отдача: назад (и вверх, если стрелял вниз); по стенам — скользит
    // Дробь веером — несколько ярких полос из ствола по конусу залпа
    const eye = g.look.position, R = ATTACKS.shotgunBlast.reach;
    for (let i = 0; i < 9; i++) {
      const a = ((i / 8) - 0.5) * (ATTACKS.shotgunBlast.arc * Math.PI) / 180, up = (Math.random() - 0.5) * 0.25;
      const c = Math.cos(a), sn = Math.sin(a);
      const dir = { x: d.x * c + d.z * sn, y: d.y + up, z: d.z * c - d.x * sn };
      const from = { x: eye.x + dir.x * 0.6, y: eye.y - 0.15 + dir.y * 0.6, z: eye.z + dir.z * 0.6 };
      const k = R * (0.6 + Math.random() * 0.4);
      g.beams.add({ from, to: { x: eye.x + dir.x * k, y: eye.y - 0.15 + dir.y * k, z: eye.z + dir.z * k }, color: [255, 200, 110], core: [255, 245, 220], life: 0.1, width: 4 });
    }
  }
  update(dt, g) {
    g.aiming = g.aimWanted() && !this.attack.reloading;
  }
  unequip(g) {
    g.aiming = false;
  }
  primary(g) {
    g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootShotgun", sound: "shot" });
  }
  action(name, g) {
    return name === "reload" && g.reloadWeapon(this);
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.1, y + s * 0.42, s * 0.8, s * 0.1, METAL); //            два ствола
    ui.rect(x + s * 0.1, y + s * 0.52, s * 0.5, s * 0.06, METAL);
    ui.rect(x + s * 0.1, y + s * 0.44, s * 0.28, s * 0.22, [130, 90, 55]); // приклад
    ui.rect(x + s * 0.5, y + s * 0.56, s * 0.14, s * 0.08, [130, 90, 55]); // цевьё
  }
}

// ---------- ПОДРЫВНИК ----------
// Взрывная атака: снаряд летит сам (MagicAttack projectile), долетел — взрыв по площади (game-scene → throwBomb).
// Вид "blast" — таланты вкладки подрывника действуют только на неё
const blastAttack = (cfg) => {
  const a = new MagicAttack(cfg);
  a.kind = "blast";
  return a;
};

// Гранаты (базовое): ЛКМ — бросок по дуге, взрыв от удара о что угодно. Бесконечные, раз в cooldown
export class GrenadesAbility extends Ability {
  constructor() {
    super({ id: "grenades", name: "GRENADES", viewModel: "fp-grenade", autoRepeat: true, held: held("w-grenade", "HoldGrenade"), equipTime: EQUIP_TIME.item });
    this.attack = blastAttack(ATTACKS.handGrenade);
  }
  primary(g) {
    if (g.useAttack(this.attack, { anim: "Throw", bodyAnim: "ThrowGrenade", sound: "swing" })) g.throwBomb(this.attack, { item: "grenade", speed: ATTACKS.handGrenade.speed, gravity: DEMO.gravity });
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.3, y + s * 0.34, s * 0.4, s * 0.46, [80, 98, 52]); //   корпус
    ui.rect(x + s * 0.3, y + s * 0.5, s * 0.4, s * 0.04, [55, 68, 36]); //     насечка
    ui.rect(x + s * 0.42, y + s * 0.22, s * 0.16, s * 0.12, METAL); //         запал
    ui.rect(x + s * 0.58, y + s * 0.24, s * 0.06, s * 0.28, METAL); //         скоба
    ui.rect(x + s * 0.24, y + s * 0.18, s * 0.12, s * 0.06, [200, 200, 205]); // кольцо
  }
}

// Динамит: бросок, падает и горит фитиль DEMO.fuse с (SHORT FUSE — короче) — потом большой взрыв
export class DynamiteAbility extends Ability {
  constructor() {
    super({ id: "dynamite", name: "DYNAMITE", viewModel: "fp-dynamite", autoRepeat: true, held: held("w-dynamite", "HoldDynamite"), equipTime: EQUIP_TIME.item });
    this.attack = blastAttack(ATTACKS.dynamite);
  }
  primary(g) {
    if (!g.useAttack(this.attack, { anim: "Throw", bodyAnim: "ThrowDynamite", sound: "swing" })) return;
    g.throwBomb(this.attack, { item: "dynamite-lit", speed: ATTACKS.dynamite.speed, gravity: DEMO.gravity, fuse: g.talentStats?.shortFuse || DEMO.fuse });
  }
  drawIcon(ui, x, y, s) {
    for (const k of [0.28, 0.42, 0.56]) ui.rect(x + s * k, y + s * 0.3, s * 0.13, s * 0.5, [190, 40, 34]); // шашки
    ui.rect(x + s * 0.26, y + s * 0.48, s * 0.46, s * 0.07, [220, 205, 150]); //  перевязка
    ui.rect(x + s * 0.47, y + s * 0.16, s * 0.04, s * 0.14, [60, 50, 40]); //    фитиль
    ui.rect(x + s * 0.44, y + s * 0.1, s * 0.1, s * 0.08, [255, 190, 80]); //    искра
  }
}

// Гранатомёт: ЛКМ — снаряд летит быстро и почти прямо, взрыв от удара. Скилл Q — КАССЕТА: снаряд рвётся
// и разбрасывает бомбочки вокруг (DEMO.cluster; талант BIG CLUSTER — больше)
export class LauncherAbility extends Ability {
  constructor() {
    super({
      id: "launcher", name: "GRENADE LAUNCHER", viewModel: "fp-launcher", moveSpeed: WEAPON_SPEED.launcher, autoRepeat: true,
      aim: AIM_AUTO, recoil: RECOIL_RIFLE, held: held("w-launcher", "HoldLauncher"), equipTime: EQUIP_TIME.launcher,
      skills: { skill1: { id: "cluster", name: "CLUSTER", press: (g, a) => a.cluster(g), cooldown: (a) => ({ left: a.clusterLeft, total: DEMO.cluster.cooldown }) } },
    });
    this.attack = blastAttack(ATTACKS.launcher);
    this.clusterAttack = blastAttack(ATTACKS.launcher); // залп Q — своя перезарядка (не сбивает обычный выстрел)
    this.clusterAttack.cooldown = 0;
    this.bomblet = blastAttack(ATTACKS.clusterBomb);
    this.clusterReadyAt = 0;
  }
  get clusterLeft() {
    return Math.max(0, this.clusterReadyAt - performance.now() / 1000);
  }
  update(dt, g) {
    g.aiming = g.aimWanted();
  }
  unequip(g) {
    g.aiming = false;
  }
  primary(g) {
    if (g.useAttack(this.attack, { anim: "Shoot", bodyAnim: "ShootLauncher", sound: "cast" })) g.throwBomb(this.attack, { item: "grenade", speed: ATTACKS.launcher.speed, gravity: DEMO.launcherGravity });
  }
  cluster(g) {
    const C = DEMO.cluster;
    if (this.clusterLeft > 0 || g.abilities.equipping) return;
    if (!g.useAttack(this.clusterAttack, { anim: "Shoot", bodyAnim: "ShootLauncher", sound: "cast" })) return;
    this.clusterReadyAt = performance.now() / 1000 + C.cooldown;
    const count = C.count + (g.talentStats?.clusterExtra || 0);
    g.throwBomb(this.clusterAttack, {
      item: "grenade", speed: ATTACKS.launcher.speed, gravity: DEMO.launcherGravity,
      // Разорвался — бомбочки веером вверх и в стороны, каждая рвётся, где упадёт
      then: (at) => {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + Math.random() * 0.5, h = C.spread * (0.5 + Math.random() * 0.5);
          g.throwBomb(this.bomblet, { item: "grenade", from: { x: at.x, y: at.y + 0.3, z: at.z }, velocity: { x: Math.sin(a) * h, y: C.up * (0.8 + Math.random() * 0.4), z: Math.cos(a) * h }, gravity: DEMO.gravity, quiet: true });
        }
      },
    });
  }
  drawIcon(ui, x, y, s) {
    ui.rect(x + s * 0.12, y + s * 0.4, s * 0.62, s * 0.16, [80, 98, 52]); //   ствол
    ui.rect(x + s * 0.7, y + s * 0.38, s * 0.08, s * 0.2, METAL); //           дульце
    ui.rect(x + s * 0.18, y + s * 0.36, s * 0.22, s * 0.24, [60, 62, 68]); //  барабан
    ui.rect(x + s * 0.24, y + s * 0.58, s * 0.08, s * 0.2, [60, 62, 68]); //   рукоять
  }
}

// Аптечка в ячейке предмета: взял (клавиша ячейки) — держишь двумя руками перед собой. Зажал ЛКМ — лечишься:
// вокруг прицела заполняется круг за MEDKIT.useTime с (идти можно, но медленнее), заполнился — +HP и снова
// оружие в руках. Отпустил раньше — аптечка цела, круг сначала
// От 3-го лица — коробка у груди (кость chest), руки держат её с боков (поза HoldBox)
const MEDKIT_HELD = { model: "w-medkit", pose: "HoldBox", bone: "chest", position: [0, -0.04, 0.42], rotation: [0, 0, 0, 1] };
export class MedkitAbility extends Ability {
  constructor() {
    super({ id: "medkit", name: "MEDKIT", viewModel: "fp-medkit", held: MEDKIT_HELD, equipTime: EQUIP_TIME.item });
    this.progress = 0; // 0…1 — сколько заполнился круг
  }
  get using() {
    return this.progress > 0;
  }
  update(dt, g) {
    const p = g.player;
    const holding = !g.background && !g.abilities.equipping && g.engine.input.isDown("primary") && g.itemCount("medkit") > 0;
    if (!holding) return this.stop(g);
    if (this.progress === 0 && p.stats.hp >= p.stats.maxHp) {
      if (!this.fullWarned) g.engine.toast("HEALTH IS FULL", 800);
      this.fullWarned = true;
      return;
    }
    this.progress = Math.min(1, this.progress + dt / MEDKIT.useTime);
    p.speedBonuses.medkit = MEDKIT.slow;
    if (this.progress >= 1) {
      this.stop(g);
      g.useMedkit();
    }
  }
  stop(g) {
    this.progress = 0;
    this.fullWarned = false;
    delete g.player.speedBonuses.medkit;
  }
  unequip(g) {
    this.stop(g);
  }
  primary() {} // лечение — пока ЛКМ зажата (update)
  drawIcon(ui, x, y, s, g) {
    drawMedkit(ui, x + s * 0.2, y + s * 0.2, s * 0.6);
    drawCount(ui, x, y, s, g?.itemCount?.("medkit"));
  }
}

export const drawMedkit = (ui, x, y, s) => {
  ui.rect(x + s * 0.1, y + s * 0.2, s * 0.8, s * 0.64, [235, 235, 235]);
  ui.rect(x + s * 0.42, y + s * 0.3, s * 0.16, s * 0.44, [220, 50, 50]); // крест
  ui.rect(x + s * 0.28, y + s * 0.44, s * 0.44, s * 0.16, [220, 50, 50]);
};
export const drawBearTrap = (ui, x, y, s) => {
  ui.rect(x + s * 0.18, y + s * 0.58, s * 0.64, s * 0.1, [90, 86, 80]); //  основание
  ui.rect(x + s * 0.44, y + s * 0.5, s * 0.12, s * 0.08, [150, 136, 110]); // нажимка
  for (let i = 0; i < 5; i++) ui.rect(x + s * (0.2 + i * 0.13), y + s * 0.4, s * 0.06, s * 0.16, [190, 192, 196]); // зубья
};
export const drawSpikes = (ui, x, y, s) => {
  ui.rect(x + s * 0.16, y + s * 0.62, s * 0.68, s * 0.12, [120, 88, 56]); // доска
  for (let i = 0; i < 4; i++) ui.rect(x + s * (0.22 + i * 0.16), y + s * 0.34, s * 0.07, s * 0.28, [190, 192, 200]); // шипы
};

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
  crossbow: () => new CrossbowAbility(),
  bow: () => new BowAbility(),
  auto: () => new AutoAbility(),
  shotgun: () => new ShotgunAbility(),
  machete: () => new MacheteAbility(),
  "war-hammer": () => new WarHammerAbility(),
  spear: () => new SpearAbility(),
  katana: () => new KatanaAbility(),
  grenades: () => new GrenadesAbility(),
  launcher: () => new LauncherAbility(),
  dynamite: () => new DynamiteAbility(),
  builder: () => new BuildAbility(),
  medkit: () => new MedkitAbility(),
  "bear-trap": () => new TrapAbility("bear-trap", "BEAR TRAP", "bear-trap", drawBearTrap),
  spikes: () => new TrapAbility("spikes", "SPIKES", "spikes", drawSpikes),
};
