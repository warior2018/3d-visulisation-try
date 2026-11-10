// ============================================================
//  Счётчики ачивок в игре (achievements.js): убийства по оружию / хедшотом / по видам мобов, боссы,
//  аптечки, блоки, задания, уровень класса. Пишутся в профиль аккаунта; открылась ачивка — надпись и звук.
//  В матче (гость) и на сервере без героя — тоже считаем за своего героя.
// ============================================================

import { WEAPON_OF_ATTACK, checkAchievements } from "../achievements.js";

export class AchievementsPart {
  // +n к счётчику stat (профиль копит в памяти, пишет файл раз в несколько секунд — achSave) и проверить ачивки
  achStat(stat, n = 1) {
    const P = this.engine.profile;
    if (!P || this.dedicated) return;
    P.data[stat] = (Number(P.data[stat]) || 0) + n;
    this.achDirty = true;
    this.achCheck(stat);
  }

  // Счётчик-рекорд: только если больше (уровень класса)
  achMax(stat, v) {
    const P = this.engine.profile;
    if (!P || this.dedicated || (Number(P.data[stat]) || 0) >= v) return;
    P.data[stat] = v;
    this.achDirty = true;
    this.achCheck(stat);
  }

  achCheck(stat) {
    for (const a of checkAchievements(this.engine.profile, stat)) {
      this.engine.toast(`${this.tr("ACHIEVEMENT")}: ${this.tr(a.name)} - ${this.tr("NEW SKIN UNLOCKED")}`, 4000);
      this.engine.sound.play("levelup", { volume: 0.8 });
      this.engine.log(`ачивка: ${a.id} → скин ${a.skin}`);
    }
  }

  // Раз в 5 с — записать профиль, если менялся
  achSave(dt) {
    this.achTimer = (this.achTimer || 0) + dt;
    if (!this.achDirty || this.achTimer < 5) return;
    this.achTimer = 0;
    this.achDirty = false;
    this.engine.profile?.save();
  }

  // Моб погиб, герой добил (interact.js → onDeath): счётчики убийств
  achKill(e) {
    if (e.kind !== "mob" || e.raisedBy) return;
    const weapon = WEAPON_OF_ATTACK[e.lastHitAttack];
    this.achStat("kills");
    this.achStat("mob:" + e.type);
    if (weapon === "bear-trap" || weapon === "spikes") this.achStat("trapKills:" + weapon);
    else if (weapon) {
      this.achStat("kill:" + weapon);
      if (e.lastHitHead) this.achStat("head:" + weapon);
    }
    if (e.boss) {
      this.achStat("boss:" + e.type);
      if (weapon) this.achStat("bossWith:" + weapon);
    }
  }
}
