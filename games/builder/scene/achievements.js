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
      // табличка сверху экрана (hud.js → achievement) и звук награды; несколько сразу — по очереди
      (this.achQueue ||= []).push(a);
      this.engine.sound.play("achievement", { volume: 0.9 });
      this.levelFlash = Math.max(this.levelFlash || 0, 0.7); // золотая вспышка по краям
      this.engine.log(`ачивка: ${a.id} → скин ${a.skin}`);
    }
  }

  // Табличка ачивки: 5 с на каждую, по очереди
  achBannerTick(dt) {
    if (!this.achBanner && this.achQueue?.length) this.achBanner = { a: this.achQueue.shift(), left: 5 };
    if (!this.achBanner) return;
    this.achBanner.left -= dt;
    if (this.achBanner.left <= 0) this.achBanner = null;
  }

  // Раз в 5 с — записать профиль, если менялся
  achSave(dt) {
    this.achBannerTick(dt);
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
