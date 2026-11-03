// ============================================================
//  Сцена «мир», часть: Бой: удары, выстрелы, попадания, добыча.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { Vec3, Input, abilityHelp } from "../../../engine/index.js";
import { MELEE_STAMINA } from "../config.js";
import { CLASS_HELP } from "../help.js";
import { TALENT_TREE } from "../talents.js";

export class CombatPart {
  // ---------- Бой (способности 1 и 2) ----------

  // Существо под прицелом не дальше reach от глаз героя (и не за стеной) — или null
  aimedEntity(reach) {
    return this.aimedHit(reach)?.entity || null;
  }

  // Все на линии прицела по порядку (до max, до первой стены): [{ entity, part }] — болт арбалета насквозь
  aimedLine(reach, max) {
    const cam = this.rig.camera;
    const origin = cam.position, dir = cam.lookDirection();
    const far = this.rig.behind + reach;
    this.lastRay = { origin, dir, max: far };
    const wall = this.world.raycast(origin, dir, far);
    const limit = wall ? wall.t : far;
    const out = [];
    for (const e of this.entities.list) {
      if (e === this.player || e === this.player.mount || !e.alive || e.remote) continue;
      const h = e.rayHitDetailed(origin, dir, limit);
      if (h) out.push({ entity: e, part: h.part || null, t: h.t });
    }
    out.sort((a, b) => a.t - b.t);
    return out.slice(0, max);
  }

  // То же, но подробно: { entity, part } — part — часть тела (голова — хедшот) или null
  // spread — разброс (радианы): луч чуть в сторону от прицела (дробь дробовика)
  aimedHit(reach, spread = 0) {
    const cam = this.rig.camera;
    const origin = cam.position;
    let dir = cam.lookDirection();
    if (spread > 0) {
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const right = new Vec3(Math.cos(this.look.yaw), 0, -Math.sin(this.look.yaw));
      const up = new Vec3(-right.z * dir.y, right.z * dir.x - right.x * dir.z, right.x * dir.y); // right × dir
      dir = dir.add(right.scale(Math.cos(a) * r)).add(up.scale(Math.sin(a) * r));
      const l = Math.hypot(dir.x, dir.y, dir.z);
      dir = dir.scale(1 / l);
    }
    this.lastRay = { origin, dir, max: this.rig.behind + reach }; // для следа пули (bulletTrace)
    // Себя и своего скакуна (верхом) луч не задевает
    const hit = this.entities.raycast(origin, dir, this.rig.behind + reach, [this.player, this.player.mount]);
    if (!hit) return null;
    const wall = this.world.raycast(origin, dir, hit.t);
    if (wall && wall.t < hit.t) return null; // между нами блок
    const p = origin.add(dir.scale(hit.t));
    const eye = this.look.position;
    if (Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) > reach + 0.5) return null;
    return { entity: hit.entity, part: hit.part };
  }

  // Есть ли стена между двумя сущностями: луч от «груди» одной до середины другой упёрся в блок
  // То же, но ответ помним 0.25 с на пару «кто — в кого» (стрелки спрашивают каждый кадр; луч — дорого)
  blockedCached(a, b) {
    const now = performance.now();
    const c = (a.blockedMemo ||= {});
    if (c.target === b && now - c.at < 250) return c.value;
    c.target = b;
    c.at = now;
    c.value = this.blockedBetween(a, b);
    return c.value;
  }

  blockedBetween(a, b) {
    const from = { x: a.position.x, y: a.position.y + a.height * 0.75, z: a.position.z };
    const to = { x: b.position.x - from.x, y: b.position.y + b.height / 2 - from.y, z: b.position.z - from.z };
    const len = Math.hypot(to.x, to.y, to.z) || 1;
    const hit = this.world.raycast(from, new Vec3(to.x / len, to.y / len, to.z / len), len);
    return !!hit?.block;
  }

  // Что атаки движка знают о нашем мире: кто под прицелом, кто вокруг
  combatContext(extra = {}) {
    return {
      aim: (range) => this.aimedHit(range), // { entity, part } — part: голова → хедшот
      aimSpread: (range, spread) => this.aimedHit(range, spread), // дробь: луч с разбросом
      aimLine: (range, max) => this.aimedLine(range, max), //          насквозь (арбалет): все на линии до стены
      onShot: (_, attack) => this.bulletTrace(attack?.id), // выстрел: трассер (по оружию) и след на блоке
      entities: this.entities.list,
      // Удар по хитбоксу не бьёт сквозь стены
      blocked: (owner, target) => this.blockedBetween(owner, target),
      // Хитбокс ближнего боя — в плоскости камеры: откуда и с каким наклоном смотрит герой
      view: { origin: this.look.position, pitch: this.look.pitch, roll: this.look.roll || 0 },
      ...extra,
    };
  }

  // Атака игрока (рука, пистолет...). Сама атака — класс движка (engine/combat):
  // она знает урон, кулдаун, дальность, стихию и модификаторы. Здесь — анимация и звук.
  // bodyAnim — что играет тело героя «для мира» (от 3-го лица); по умолчанию — Attack, если и для экрана Attack.
  // Вернёт true, если атака состоялась (не на перезарядке)
  // ctx — добавки к контексту удара (например, baseDamage), onHit — что ещё сделать с каждым попаданием
  // animSpeed — скорость анимации удара (2 — вдвое быстрее; и рука от 1-го лица, и тело)
  useAttack(attack, { anim, sound, hitSound = sound, bodyAnim = anim === "Attack" ? "Attack" : null, ctx = {}, onHit = null, animSpeed = 1 }) {
    // Удар ближнего боя стоит выносливости (MELEE_STAMINA по id атаки): не хватает — удара нет
    const cost = this.stamina && attack.kind === "melee" ? MELEE_STAMINA[attack.id] || 0 : 0;
    if (cost && this.stamina.value < cost) {
      if (attack.ready) this.noStamina();
      return false;
    }
    let hits = 0;
    let autoReload = false;
    let miss = null;
    const result = attack.use(this.player, this.combatContext({
      // Последний патрон — перезарядка начинается сама. Анимацию запускаем ПОСЛЕ анимации выстрела ниже,
      // иначе выстрел сразу перебьёт «Reload» (рука и тело так и не перезаряжаются)
      ...ctx,
      onReload: () => (autoReload = true),
      onMiss: (reason) => (miss = reason),
      onHit: (hit) => {
        hits++;
        this.onPlayerHit(hit);
        onHit?.(hit);
      },
    }));
    if (!result || result.used === false) {
      if (autoReload) this.onReloadStart(this.abilities.current); // нажали стрелять с пустой обоймой
      if (miss === "no-ammo") this.noAmmo();
      return false; // кулдаун ещё идёт / нечем стрелять
    }
    if (cost) this.stamina.spend(cost);
    this.recoil.kick(this.abilities.current?.recoil, this.aimT); // отдача — у оружия своя (движок: Recoil)
    this.viewModel()?.play(anim, animSpeed); //                        для экрана (от 1-го лица)
    if (bodyAnim) this.player.view?.animator.playOnce(bodyAnim, animSpeed); // для мира (от 3-го)
    this.engine.sound.play(hits ? hitSound : sound);
    if (autoReload) this.onReloadStart(this.abilities.current);
    return true;
  }

  // X — ультимейт. Готов, но самой ульты ещё нет — только подсказка (заряд не тратится)
  useUltimate() {
    if (!this.player.alive) return;
    if (this.ultimate.use(this)) return;
    if (this.ultimate.ready) this.engine.toast("ULTIMATE: NOT CHOSEN YET", 1200);
  }

  // Справка F1: колонки — оружие и предметы хотбара, скиллы класса, ультимейт (hud.js → help)
  helpColumns() {
    const b = this.settings.controls.bindings;
    const label = (action) => Input.label(b[action]) || "-";
    // 1. Оружие (в ячейке оружия; пусто — кулак): ЛКМ / ПКМ / перезарядка и его скилл
    const w = this.abilities.slots[0] || this.hand;
    const weapon = { title: w.name, rows: abilityHelp(w, label), empty: "NOTHING TO SHOW" };
    // 2. Другие скиллы: ульта и скиллы класса (позже будут ещё)
    const u = this.ultimate;
    const skills = [{ key: label("ultimate"), name: u.ability?.name || "ULTIMATE", text: `${u.ability?.text || "NOT CHOSEN YET."} CHARGE ${u.percent}%: FROM DAMAGE, KILLS AND OVER TIME` }];
    for (const [action, h] of Object.entries(CLASS_HELP[this.playerClass] || {})) skills.push({ key: label(action), name: h.name, text: h.text });
    // 3. Модификаторы: выученные таланты (ранг / предел и что дают сейчас) и навсегда полученное
    const mods = [];
    for (const tab of TALENT_TREE.tabs) {
      for (const t of tab.talents) {
        const r = this.talents.rank(t.id);
        if (r > 0) mods.push({ key: `${r}/${t.maxRank}`, name: t.name, text: t.describe?.(r) || "" });
      }
    }
    // Сначала — то, что действует сейчас (как над центром экрана), потом — вечное (как над здоровьем), потом таланты
    const now = this.buffList().filter((b) => !b.permanent).map((b) => ({ key: "NOW", name: b.name || b.icon, text: b.label || (Number.isFinite(b.left) ? `${Math.ceil(b.left)} S` : "") }));
    const forever = this.permanentBuffs().map((b) => ({ key: "PERM", name: b.name, text: b.text }));
    mods.unshift(...now, ...forever);
    return [
      weapon,
      { title: "SKILLS", rows: skills },
      { title: "MODIFIERS", rows: mods, compact: true, empty: `NO TALENTS YET: ${label("talents")}` },
    ];
  }

  // Герой попал (ударом, выстрелом, брошенным камнем): отметка у прицела, хедшот — красная
  onPlayerHit(hit) {
    const head = hit?.damage?.part === "head";
    this.hitMarker = head ? 0.35 : 0.15;
    this.headshot = head; // хедшот — красная отметка и надпись (hud.js)
    if (head) this.engine.log(`хедшот: ${hit.target.name} -${hit.dealt}`);
    this.engine.redraw();
  }
}
