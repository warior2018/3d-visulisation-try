// ============================================================
//  Способности: что игрок держит «в руках» и что делают кнопки действия.
//  Рука, пистолет, стройка, позже — магия, фонарик, лечение...
//
//  Движок даёт две вещи:
//   - Ability — заготовка способности: игра наследует её и переопределяет
//     нужные методы (primary — основное действие, обычно ЛКМ; secondary — ПКМ);
//   - AbilityBar — панель из нескольких ячеек (по умолчанию 5). Действия
//     ability1…ability5 выбирают ячейку, primary/secondary — действуют.
//     Пустые ячейки можно оставить: их нельзя выбрать.
//
//  Навыки оружия (skills): дополнительные действия, которые есть только у ЭТОЙ способности.
//  Например, у оружия дальнего боя на Q/E — наклоны, у меча — другие приёмы:
//    skills: { skill1: { id, name, short?, press?(ctx, ability), hold?(dt, ctx, down, ability) } }
//  press — нажали клавишу действия (один раз), hold — каждый кадр, пока способность в руках
//  (down — зажата ли клавиша). Выбрали другую способность — её навыки больше не вызываются.
//
//  ctx — что игра передаёт способностям (обычно сама игровая сцена):
//  через него способность ставит блоки, стреляет и т. д.
// ============================================================

export class Ability {
  // id — внутреннее имя, name — для экрана,
  // viewModel — модель «для экрана» от 1-го лица: имя или функция (ctx) => имя
  // moveSpeed — прибавка к скорости, пока способность в руках (-0.05 — на 5 % медленнее)
  // autoRepeat — держишь основную кнопку — действие повторяется, как только снова готово (ready)
  // aim — прицеливание этим оружием: { fov, sensitivity } (engine/input/aim.js) или null — не целится
  // recoil — отдача: { pattern, scale, recovery, ... } (engine/input/recoil.js) или null — без отдачи
  // empty — «пустая» способность (например, рука в пустой ячейке): ячейка выглядит пустой
  // skills — навыки оружия на других клавишах (см. выше): { действие: навык }
  // equipTime — сколько секунд достают оружие после выбора: до этого им нельзя бить и стрелять
  // held — как способность выглядит от 3-го лица: { model — что в руке (models.hold), pose — слой-поза рук
  //        (animator.setOverlay), bone, position, rotation — куда крепить модель } или null — пустые руки
  constructor({ id, name, viewModel = null, moveSpeed = 0, autoRepeat = false, aim = null, recoil = null, empty = false, skills = {}, held = null, equipTime = 0 }) {
    this.id = id;
    this.name = name;
    this.viewModel = viewModel;
    this.moveSpeed = moveSpeed;
    this.autoRepeat = autoRepeat;
    this.aim = aim;
    this.recoil = recoil;
    this.empty = empty;
    this.skills = skills;
    this.held = held;
    this.equipTime = equipTime;
  }

  // Навык оружия на действии name (или null)
  skill(name) {
    return this.skills[name] || null;
  }

  // Готова ли к действию: по умолчанию — если у способности есть атака, её перезарядка прошла
  ready(ctx) {
    return this.attack ? this.attack.ready && !this.attack.pending : true;
  }

  viewModelName(ctx) {
    return typeof this.viewModel === "function" ? this.viewModel(ctx) : this.viewModel;
  }

  equip(ctx) {} //               способность выбрали
  unequip(ctx) {} //             выбрали другую
  update(dt, ctx) {} //          каждый кадр, пока выбрана
  primary(ctx) {} //             основное действие (ЛКМ)
  secondary(ctx) {} //           дополнительное (ПКМ)
  action(name, ctx) { return false; } // любое другое действие; true — «моё, обработала»
  drawIcon(ui, x, y, size, ctx) {} //    значок в ячейке панели
}

export class AbilityBar {
  constructor(size = 5) {
    this.slots = new Array(size).fill(null);
    this.index = -1; // выбранная ячейка (-1 — ничего)
    this.equipLeft = 0; // сколько ещё достаём оружие (equipTime) — пока > 0, не бьём и не стреляем
  }

  // Достаём оружие — ещё нельзя действовать
  get equipping() {
    return this.equipLeft > 0;
  }

  // Начать доставать текущую способность (сама зовётся при выборе ячейки; игра — если подменила её сама)
  startEquip() {
    this.equipLeft = this.current?.equipTime || 0;
  }

  get size() {
    return this.slots.length;
  }

  get current() {
    return this.slots[this.index] || null;
  }

  // Положить способность в ячейку i (с нуля)
  set(i, ability) {
    this.slots[i] = ability;
  }

  // Выбрать ячейку. Пустую выбрать нельзя. Вернёт true, если выбор поменялся.
  select(i, ctx) {
    if (i === this.index || !this.slots[i]) return false;
    this.current?.unequip(ctx);
    this.index = i;
    this.current.equip(ctx);
    this.startEquip();
    return true;
  }

  // Действия от движка: ability1…abilityN, primary, secondary, остальные — выбранной способности.
  // Вернёт true, если что-то обработали.
  handle(actions, ctx) {
    let handled = false;
    for (let i = 0; i < this.size; i++) {
      if (actions.includes("ability" + (i + 1))) handled = this.select(i, ctx) || handled;
    }
    const a = this.current;
    if (!a) return handled;
    for (const name of actions) {
      if ((name === "primary" || name === "secondary") && this.equipping) handled = true; // ещё достаём — ждём
      else if (name === "primary") { a.primary(ctx); handled = true; }
      else if (name === "secondary") { a.secondary(ctx); handled = true; }
      else if (a.skill(name)) {
        a.skill(name).press?.(ctx, a); // навык оружия (Q/E...)
        handled = true;
      } else if (!name.startsWith("ability")) handled = a.action(name, ctx) || handled;
    }
    return handled;
  }

  // input — необязательно: с ним работает autoRepeat (зажатая основная кнопка повторяет действие)
  update(dt, ctx, input = null) {
    const a = this.current;
    if (!a) return;
    this.equipLeft = Math.max(0, this.equipLeft - dt);
    a.update(dt, ctx);
    for (const [name, s] of Object.entries(a.skills)) s.hold?.(dt, ctx, !!input?.isDown(name), a);
    if (input && a.autoRepeat && !this.equipping && input.isDown("primary") && a.ready(ctx)) a.primary(ctx);
  }
}
