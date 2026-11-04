// ============================================================
//  Подсказки для новичка с триггерами начала и конца. Каждая подсказка:
//    { id, text, start(ctx), done(ctx, info), max }
//      start — когда показать (нет — сразу, как дошла очередь); done — когда выполнена (info: { time } —
//      сколько секунд она на экране, events — что случилось с её показа: hints.event("shop"));
//      max — через сколько секунд погаснуть самой (не выполнил — не мешаем вечно); after — после какой
//      (по умолчанию — после предыдущей в списке).
//  Показывается одна — первая по списку, у которой дошла очередь и выполнилось start. Выполненные (done) —
//  в списке done: игра сохраняет его (onChange) — второй раз подсказка не появится.
//
//    const hints = new Hints({ list: HINTS, done: settings.hintsDone, onChange: (ids) => save(ids) });
//    hints.update(ctx, dt); hints.current → { id, text, k (0…1: появление / угасание), finished }
//    hints.event("shop") — открыли магазин (для done); hints.reset() — показать всё заново
// ============================================================

const FADE = 0.4; // с: появление и угасание
const SHOW_DONE = 1.2; // с: выполненная подсказка ещё видна с галочкой

export class Hints {
  constructor({ list = [], done = [], onChange = () => {}, enabled = true } = {}) {
    this.list = list;
    this.done = new Set(done);
    this.onChange = onChange;
    this.enabled = enabled;
    this.active = null; // { hint, time, events: Set, finished: секунд с выполнения или null }
  }

  // Событие (открыли окно, сделали действие) — засчитывается активной подсказке
  event(name) {
    this.active?.events.add(name);
  }

  reset() {
    this.done.clear();
    this.active = null;
    this.onChange([]);
  }

  // Дошла ли очередь подсказки i: та, после которой она идёт, выполнена
  ready(i) {
    const h = this.list[i];
    const after = h.after !== undefined ? h.after : i > 0 ? this.list[i - 1].id : null;
    return !after || this.done.has(after);
  }

  update(ctx, dt) {
    if (!this.enabled) return (this.active = null);
    const a = this.active;
    if (a) {
      a.time += dt;
      if (a.finished !== null) {
        a.finished += dt;
        if (a.finished >= SHOW_DONE) this.active = null;
        return;
      }
      const h = a.hint;
      let ok = false;
      try {
        ok = !!h.done?.(ctx, { time: a.time, events: a.events });
      } catch {}
      if (ok || (h.max && a.time >= h.max)) {
        this.done.add(h.id);
        a.finished = ok ? 0 : SHOW_DONE - FADE; // погасла по времени — без галочки, сразу угасает
        a.success = ok;
        this.onChange([...this.done]);
      }
      return;
    }
    for (let i = 0; i < this.list.length; i++) {
      const h = this.list[i];
      if (this.done.has(h.id) || !this.ready(i)) continue;
      let go = true;
      try {
        go = h.start ? !!h.start(ctx) : true;
      } catch {
        go = false;
      }
      if (!go) continue;
      // уже выполнена к моменту показа (опытный игрок) — молча засчитать
      let already = false;
      try {
        already = !!h.done?.(ctx, { time: 0, events: new Set() }) && h.skipIfDone !== false;
      } catch {}
      if (already) {
        this.done.add(h.id);
        this.onChange([...this.done]);
        continue;
      }
      this.active = { hint: h, time: 0, events: new Set(), finished: null, success: false };
      return;
    }
  }

  // Что показать: { id, text, k, finished } или null
  get current() {
    const a = this.active;
    if (!a) return null;
    const k = a.finished !== null ? Math.max(0, Math.min(1, (SHOW_DONE - a.finished) / FADE)) : Math.min(1, a.time / FADE);
    return { id: a.hint.id, text: a.hint.text, k, finished: a.finished !== null && a.success };
  }
}
