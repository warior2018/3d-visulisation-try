// ============================================================
//  Сцена «мир», часть: Ввод: клавиши, пауза, окна, прицел.
//  Методы GameScene (this — сцена), вынесены из game-scene.js по темам; подмешиваются в класс там же
//  (mixParts). Вызываются как раньше: this.метод().
// ============================================================

import { MapScene, MenuScene, parry } from "../../../engine/index.js";
import { ProfileScene } from "../profile-view.js";
import { DIGIT_KEYS } from "./shared.js";
import { PALETTE, BLOCK } from "../config.js";
import { deleteSave, deleteWorld, currentWorld } from "../save.js";

export class InputPart {
  // ---------- Ввод ----------

  onPress(actions, event) {
    const has = (a) => actions.includes(a);
    if (has("pause")) return this.pause();
    if (has("chat")) return this.chat.open(); // чат; «/команда» — консоль
    if (has("inventory")) return this.openInventory();
    if (has("talents")) return this.openTalents();
    if (has("map")) this.hints?.event("map");
    if (has("map")) return this.pushLive(new MapScene({ map: () => this.mapData(), radius: 60, info: () => this.coordsText(), legend: "RED CROSS - WORLD CENTER (0, 0). PURPLE SKULL - BOSS" }));
    if (has("save")) this.save();
    if (has("autoLoot")) this.toggleAutoLoot(); // V — автоподбор вкл/выкл (вид камеры — только в настройках)
    if (has("interact")) this.interact();
    if (has("shop")) return this.openShop();
    if (has("tune")) return this.openTune(); // F6 — окно баланса (tune.js)
    if (has("record")) return this.toggleReplay(); // F7 — запись повтора (scene/shop.js → toggleReplay)
    if (has("ultimate")) this.useUltimate();
    if (has("mount")) this.toggleMount(); // Z — маунт (scene/mount.js)
    if (has("mountMode")) this.toggleMountMode(); // Alt — верхом: поводья / оружие

    // Панель цветов открыта: цифра — это цвет, а не смена способности
    const digit = DIGIT_KEYS.indexOf(event.scancode);
    if (this.paletteOpen && digit !== -1 && digit < PALETTE.length) {
      this.colorIndex = digit;
      this.paletteOpen = false;
      this.engine.redraw();
      return;
    }

    // Присед в режиме «переключать»: Ctrl — сел / встал (режим «держать» — pets.js → updateStance)
    if (has("crouch") && this.settings.general.crouchMode === "toggle") this.crouchToggle = !this.crouchToggle;

    // Прицел в режиме «переключать»: ПКМ включает и выключает (у оружия с прицелом)
    if (has("secondary") && this.settings.general.aimMode === "toggle" && this.abilities.current?.aim && !this.abilities.equipping) {
      this.aimToggle = !this.aimToggle;
    }

    // Остальное — панели способностей (движок): выбор ячейки, ЛКМ/ПКМ. Q / E — оружие слева / справа
    const before = this.abilities.index;
    // Предметы: клавиша ячейки — взять предмет; ещё раз — обратно оружие. Q / E с предметом в руках — ничего
    if (has("item1")) this.toggleItem(1);
    if (has("item2")) this.toggleItem(2);
    // Q / E — скиллы оружия в руках (Ability.skills: ИАЙ катаны), их вызывает панель способностей.
    // Верхом на поводьях — ни ударов, ни выстрелов, ни скиллов (выбирать ячейки можно)
    if (this.onReins) actions = actions.filter((a) => !["primary", "secondary", "skill1", "skill2", "reload"].includes(a));
    this.abilities.handle(actions, this);
    if (this.abilities.index !== before) {
      this.onWeaponSwitch();
      this.engine.sound.play("equip");
      this.engine.redraw();
    }
  }

  onBlur() {
    if (this.engine.scene === this) this.pause(); // переключились в другое окно — пауза
  }

  pause() {
    const { engine, game } = this;
    engine.push(new MenuScene({
      title: "PAUSE",
      overlay: true,
      items: [
        { id: "resume", label: "RESUME" },
        ...(this.match ? [] : [{ id: "save", label: "SAVE" }]), // матч не сохраняется
        { id: "settings", label: "SETTINGS" },
        { id: "profile", label: "PROFILE" }, // ачивки и счётчики (profile-view.js)
        { id: "menu", label: this.match ? "LEAVE MATCH" : "MAIN MENU" },
      ],
      onBack: () => engine.pop(),
      onSelect: (id) => {
        if (id === "resume") engine.pop();
        if (id === "save") this.save();
        if (id === "settings") game.openSettings();
        if (id === "profile") engine.push(new ProfileScene({ nick: this.settings.net?.name || "PLAYER" }));
        if (id === "menu") {
          this.save(false);
          game.toMenu();
        }
      },
    }));
  }

  // Игрок погиб: сохранение удаляем (следующая игра — с чистого мира), показываем экран гибели
  die() {
    if (this.dead) return;
    if (this.duel) { // дуэль: до конца раунда — призраком (scene/duel.js)
      if (!this.downed) this.duelDown();
      return;
    }
    if (this.match) { // матч: не конец — урна, ждём, пока оживят (scene/coop.js)
      if (!this.downed) this.goDown();
      return;
    }
    this.dismountSteed(null);
    if (this.role === "client") return this.guestRespawn(); // гость: мир не наш — не стираем, встаём рядом с хостом
    this.dead = true;
    while (this.engine.scene !== this && this.engine.scenes.includes(this)) this.engine.pop(); // погибли под открытым окном — закрыть его
    const archived = deleteSave();
    this.engine.log(`игрок погиб (уровень ${this.experience.level}, ${this.talentsSummary()}) — мир начнётся заново; старое сохранение: ${archived || "не было"}`);
    this.engine.sound.play("death");
    this.showDeathSummary(); // окно итогов и рекорды мира (scene/run-stats.js); в пылу боя не прокликать — lock
    // Погиб — мира больше нет: слот целиком убираем (в saves/deleted/, не насовсем), иначе в меню висел бы «пустой» мир
    if (currentWorld) deleteWorld(currentWorld);
  }

  toggleAutoLoot() {
    const g = this.settings.general;
    g.autoLoot = g.autoLoot === false;
    this.engine.settings.save();
    this.engine.toast("AUTO LOOT: " + (g.autoLoot ? "ON" : "OFF"));
  }

  toggleCamera() {
    const g = this.settings.general;
    g.cameraMode = g.cameraMode === "third" ? "first" : "third";
    this.engine.settings.save();
    this.engine.toast("VIEW: " + (g.cameraMode === "third" ? "THIRD PERSON" : "FIRST PERSON"));
  }

  // Блок (ПКМ с оружием ближнего боя): на BLOCK.window секунд отбиваем удары спереди
  // (движок: статус parry), потом перезарядка BLOCK.cooldown
  tryBlock(ability) {
    if (this.blockCooldown > 0) return false;
    // Снимает долю урона оружия в руке: удары — BLOCK.weapon, выстрелы и взрывы — BLOCK.ranged (своя доля — BLOCK.weapons[id])
    const a = ability?.attack, base = a ? (Array.isArray(a.damage) ? (a.damage[0] + a.damage[1]) / 2 : a.damage) : 0;
    const own = BLOCK.weapons[ability?.id] ?? BLOCK.weapon;
    const absorb = (d) => base * (d.kind === "melee" ? own : BLOCK.ranged);
    this.player.addStatus(parry({ duration: BLOCK.window, kinds: ["melee", "blast"], shots: true, absorb })); // отражение — талант REFLECT (combat.js → reflectShot)
    this.blockCooldown = this.duel ? BLOCK.duelCooldown : BLOCK.cooldown;
    this.viewModel()?.play("Block");
    this.player.view?.animator.playOnce("Block");
    this.engine.sound.play("guard");
    return true;
  }

  // Хочет ли игрок целиться (ПКМ): «удерживать» — пока зажата, «переключать» — нажал / нажал ещё раз.
  // После смены оружия зажатая ПКМ не считается: прицел прошлого оружия не переносится на новое
  aimWanted() {
    if (this.background) return false; // открыто окно (магазин, карта...) — не целимся
    if (this.settings.general.aimMode === "toggle") return this.aimToggle;
    const down = this.engine.input.isDown("secondary");
    if (!down) this.aimBlocked = false;
    return down && !this.aimBlocked;
  }

  // Не хватает выносливости: шкала мигает (hud.js), звук — не чаще раза в секунду
  noStamina() {
    this.staminaFlash = 0.5;
    const now = performance.now();
    if (now - (this.noStaminaAt || 0) < 1000) return;
    this.noStaminaAt = now;
    this.engine.sound.play("place", { volume: 0.4 });
  }

  // Взять предмет из ячейки i (1 или 2); он уже в руках — обратно оружие. Пустую ячейку не берём
  toggleItem(i) {
    if (this.abilities.index === i) return this.backToWeapon();
    if (!this.abilities.slots[i]) return;
    this.abilities.select(i, this);
  }

  // Обратно оружие в руки (предмет использован или клавишу нажали ещё раз)
  // (звук смены — в onPress: туда приходят и клавиши, и ЛКМ, которой предмет использовали)
  backToWeapon() {
    if (this.abilities.index === 0) return;
    this.abilities.select(0, this);
    this.onWeaponSwitch();
  }

  // Ячейки скиллов на панели (Q / E): скиллы оружия в ячейке оружия — { name, short, cooldown: { left, total } } или null
  skillSlots() {
    const w = this.abilities.slots[0];
    return ["skill1", "skill2"].map((a) => {
      const k = w?.skills?.[a];
      return k ? { name: k.name, short: k.short, cooldown: k.cooldown?.(w) || null } : null;
    });
  }

  // Сменили оружие в руках: из прицела выходим сразу, режим «переключать» сбрасываем
  onWeaponSwitch() {
    this.aimToggle = false;
    this.aimBlocked = this.engine.input.isDown("secondary");
    this.aiming = false;
    this.aim.reset();
    this.aimT = 0;
  }
}
