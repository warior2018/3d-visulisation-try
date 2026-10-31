// ============================================================
//  Ультимейт — слот «сильного приёма» в стиле Overwatch: заряд 0…1 копится от нанесённого урона,
//  убийств и просто со временем; полный — можно применить, и заряд обнуляется.
//
//    const ult = new UltimateCharge({ perDamage: 1 / 3000, perKill: 0.015, perSecond: 1 / 240 });
//    ult.attach(player);           // слушать журнал боя: урон и убийства, засчитанные герою
//    ult.update(dt);               // каждый кадр (заряд со временем)
//    if (ult.use(ctx)) ...         // нажали клавишу: применил (true) или ещё не готов / нет ульты
//    ult.ability = { id, name, text, activate(ctx) } // сама ульта — у игры (пока может не быть: null)
//
//  Урон считается по журналу боя (engine/combat/combat-log.js): засчитанный владельцу (credit — значит,
//  и урон его питомцев и турелей), только по врагам (не по себе и не по своим).
//  perDamage — заряд за 1 HP урона, perKill — за убийство, perSecond — в секунду (доли от полного).
// ============================================================

import { combatLog } from "./combat-log.js";

export class UltimateCharge {
  constructor({ perDamage = 0, perKill = 0, perSecond = 0, log = combatLog } = {}) {
    this.perDamage = perDamage;
    this.perKill = perKill;
    this.perSecond = perSecond;
    this.log = log;
    this.charge = 0; //     0…1
    this.owner = null;
    this.ability = null; // сама ульта (игра): { id, name, text, activate(ctx) }
    this.off = null; //     отписка от журнала боя
  }

  get ready() {
    return this.charge >= 1;
  }

  // Проценты для экрана (как в Overwatch: 99 % — ещё не готов)
  get percent() {
    return this.ready ? 100 : Math.min(99, Math.floor(this.charge * 100));
  }

  attach(owner) {
    this.detach();
    this.owner = owner;
    this.off = this.log.on((ev) => this.onHit(ev));
  }

  detach() {
    this.off?.();
    this.off = null;
    this.owner = null;
  }

  onHit(ev) {
    const o = this.owner;
    if (!o || ev.credit !== o || !ev.victim || ev.victim === o) return;
    if (o.isHostileTo && !o.isHostileTo(ev.victim)) return; // своих не считаем
    this.add(ev.dealt * this.perDamage + (ev.killed ? this.perKill : 0));
  }

  add(amount) {
    if (amount > 0) this.charge = Math.min(1, this.charge + amount);
  }

  update(dt) {
    this.add(this.perSecond * dt);
  }

  // Применить: готов и есть ульта — activate(ctx), заряд в ноль. Возвращает true, если применили
  use(ctx) {
    if (!this.ready || !this.ability) return false;
    this.charge = 0;
    this.ability.activate?.(ctx);
    return true;
  }
}
