// ============================================================
//  Журнал боя — каждое попадание в мире одним событием. Основа для счётчика урона (DPS-метр),
//  статистики, логов. Сущность сама сообщает сюда, когда получает пакет урона (entity.receive),
//  поэтому сюда попадает ВСЁ: удары, выстрелы, горение, взрывы, ловушки, урон по герою.
//
//    import { combatLog } from "engine";
//    const off = combatLog.on((ev) => { if (ev.credit === player) meter.add(ev.dealt); });
//    off(); // отписаться
//
//  Событие:
//    attacker — кто ударил (null — «мир»);  victim — кого;  credit — кому засчитать (хозяин питомца)
//    dealt    — сколько HP сняли на самом деле (после сопротивлений);  amount — сколько было в пакете
//    overkill — сколько ушло «в пустоту» сверх оставшегося HP;  killed, blocked
//    attack   — атака (Attack) или null (статус, взрыв без атаки);  kind, element, crit, tags
//    applied  — модификаторы, поменявшие урон: [{ id, delta }];  damage — сам пакет;  time — секунды
//
//  Слушатели вызываются сразу, внутри удара: тяжёлое не делать, урон в ответ — тем более.
// ============================================================

export class CombatLog {
  constructor() {
    this.listeners = new Set();
  }

  // Подписаться. Возвращает функцию отписки
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(ev) {
    if (this.listeners.size === 0) return;
    for (const fn of this.listeners) fn(ev);
  }
}

// Один общий журнал на весь движок
export const combatLog = new CombatLog();
