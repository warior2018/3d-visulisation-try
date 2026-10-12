// ============================================================
//  Виды существ. Все — наследники Entity (engine/world/entity.js):
//  у всех есть здоровье, инвентарь, статусы, сопротивления... А дальше — различия.
//
//    Player — герой. Сторона "player", враждует с "monster".
//    Mob    — враждебное существо (скелет). Сторона "monster", враждует с "player".
//             Даёт опыт (xp), может бить (attack), думает сам (brain — например HostileBrain).
//    NPC    — житель. По умолчанию сторона "neutral", ни с кем не враждует, но его МОЖНО ранить.
//             Флаги: invulnerable — неуязвим совсем; protectedFrom — от чьих сторон урон не проходит
//             (страж: ["player"]); faction/hostileTo/attack — если умеет защищаться (страж бьёт мобов).
//             role и dialog — заготовка на будущее (торговец, квест, разговор).
//
//  Все параметры Entity (name, position, maxHp, inventorySize...) передаются как обычно.
// ============================================================

import { Entity } from "./entity.js";

export class Player extends Entity {
  constructor({ speed = 4, ...rest }) {
    super(rest);
    this.kind = "player";
    this.faction = "player";
    this.hostileTo = new Set(["monster"]);
    this.speed = speed;
  }
}

export class Mob extends Entity {
  // xp — опыт за победу; attack — атака (engine/combat); brain — ИИ (engine/ai)
  constructor({ speed = 2.2, xp = 0, attack = null, brain = null, faction = "monster", hostileTo = ["player"], protectedFrom = [], ...rest }) {
    super(rest);
    this.kind = "mob";
    this.faction = faction;
    this.protectedFrom = new Set(protectedFrom);
    this.hostileTo = new Set(hostileTo);
    this.speed = speed;
    this.xp = xp;
    this.attack = attack;
    this.brain = brain;
  }
}

export class NPC extends Entity {
  // role — кто он («сторож», «торговец»); dialog — разговор (пока не используется)
  constructor({ speed = 1.2, brain = null, role = "", dialog = null, invulnerable = false, protectedFrom = [],
    faction = "neutral", hostileTo = [], attack = null, ...rest }) {
    super(rest);
    this.kind = "npc";
    this.faction = faction;
    this.hostileTo = new Set(hostileTo);
    this.invulnerable = invulnerable;
    this.protectedFrom = new Set(protectedFrom);
    this.attack = attack;
    this.speed = speed;
    this.brain = brain;
    this.role = role;
    this.dialog = dialog;
  }
}
