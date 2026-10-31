// ============================================================
//  HUD из частей — возможность движка. Интерфейс поверх мира рисуется на процессоре, и каждый кадр
//  перерисовывать его дорого. Поэтому HUD делится на ЧАСТИ (полоска здоровья, патроны, миникарта...),
//  и у каждой части рядом с рисованием записано, ОТ ЧЕГО она зависит:
//
//    const hud = new HudParts([
//      {
//        id: "hp",
//        watch: (g) => ({ hp: g.player.stats.hp, max: g.player.stats.maxHp }), // данные части
//        draw: (ui, g, d, layout) => ui.text(`HP ${d.hp}/${d.max}`, 20, 20, 2),  // рисует ИЗ этих данных
//      },
//    ]);
//    // каждый кадр (в update сцены):
//    if (hud.update(game)) engine.redraw();      // хоть одна часть изменилась — перерисовать
//    // при перерисовке (drawUI сцены):
//    hud.draw(ui, game);
//
//  watch(ctx) — данные, которые часть показывает (число, строка, массив, объект). Каждый кадр они
//    сравниваются с прошлыми (через JSON): изменились — HUD перерисовывается. Ничего не показывает —
//    верни null. Часть, которая должна двигаться каждый кадр (анимация), возвращает, например, время.
//  draw(ui, ctx, data, layout) — нарисовать. data — то, что вернул watch в этом кадре (второй раз не
//    считаем). layout — общий объект на весь кадр: часть может записать туда, где она стоит
//    (например, панель хотбара — layout.bar), а части после неё — расположиться относительно.
//    Части рисуются по порядку списка: ниже по списку — поверх.
//  Без watch часть рисуется, но сама перерисовку не вызывает (например, если её данные меняются вместе с другой).
//
//  Главное: новая надпись живёт в своей части вместе со своим watch — «забыть» сказать, что её надо
//  обновлять, нельзя (раньше игра склеивала всё, что на экране, в одну огромную строку-ключ).
// ============================================================

export class HudParts {
  constructor(parts = []) {
    this.parts = [];
    this.keys = new Map(); // id части → её данные прошлого кадра (строкой JSON)
    this.data = new Map(); // id части → её данные этого кадра
    this.changed = []; //     какие части изменились в последнем update (для отладки)
    for (const p of parts) this.add(p);
  }

  add(part) {
    if (!part.id || typeof part.draw !== "function") throw new Error("HudParts: у части нужны id и draw");
    this.parts.push(part);
    return part;
  }

  // Собрать данные всех частей. true — хоть одна изменилась (пора перерисовать)
  update(ctx) {
    this.changed = [];
    for (const p of this.parts) {
      if (!p.watch) continue;
      const d = p.watch(ctx) ?? null;
      this.data.set(p.id, d);
      const key = JSON.stringify(d);
      if (key !== this.keys.get(p.id)) {
        this.keys.set(p.id, key);
        this.changed.push(p.id);
      }
    }
    return this.changed.length > 0;
  }

  // Нарисовать все части по порядку (данные — из последнего update; если его ещё не было — посчитаем)
  draw(ui, ctx) {
    const layout = {};
    for (const p of this.parts) {
      let d = this.data.get(p.id);
      if (d === undefined && p.watch) d = p.watch(ctx) ?? null;
      p.draw(ui, ctx, d ?? null, layout);
    }
  }
}
