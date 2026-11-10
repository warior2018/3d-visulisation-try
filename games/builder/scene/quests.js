// ============================================================
//  Задания стража (QUESTS): подошёл к стражу (F) — окно: задание, его награда, кнопки ВЗЯТЬ / СДАТЬ / ОТКАЗАТЬСЯ
//  и ТОРГОВЛЯ. Одно задание за раз; «убей» считает убийства с момента, как взял; «принеси» — забирает из сумки
//  при сдаче. Награда — монеты и опыт, растёт с уровнем. Ход задания — строчкой под миникартой (hud.js → quest).
// ============================================================

import { QUESTS } from "../config.js";
import { WardenScene } from "../warden-scene.js";

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export class QuestsPart {
  loadQuests(saved) {
    const q = saved && typeof saved === "object" ? saved : {};
    const ok = (x) => x && QUESTS.kinds.some((k) => k.id === x.id) && Number(x.count) > 0;
    this.quest = ok(q.active) ? { ...q.active, progress: Math.max(0, Number(q.active.progress) || 0) } : null;
    this.questOffer = ok(q.offer) ? { ...q.offer } : null;
    this.questsDone = Math.max(0, Number(q.done) || 0);
    this.questWait = 0;
  }

  questsJSON() {
    return { active: this.quest, offer: this.questOffer, done: this.questsDone || 0 };
  }

  // Новое задание по уровню героя
  makeQuest() {
    const lvl = this.experience.level;
    const pool = QUESTS.kinds.filter((k) => (k.level || 0) <= lvl);
    const k = pool[Math.floor(Math.random() * pool.length)];
    const count = rnd(k.count[0], k.count[1]);
    const coins = Math.round((k.flat ?? k.perUnit * count) * (1 + QUESTS.perLevel * (lvl - 1)));
    return { id: k.id, count, progress: 0, coins, xp: Math.round(coins * QUESTS.xp) };
  }

  questKind(q) {
    return QUESTS.kinds.find((k) => k.id === q?.id) || null;
  }

  // Текст задания: «KILL 12 SKELETONS» — перевод по шаблону, потом число
  questTitle(q) {
    const k = this.questKind(q);
    return k ? this.tr(k.title).replace("{n}", String(q.count)) : "";
  }

  tr(s) {
    return this.engine.locale?.translate ? this.engine.locale.translate(s) : s;
  }

  // Сколько сделано: «принеси» — сколько уже в сумке
  questProgress(q = this.quest) {
    const k = this.questKind(q);
    if (!k) return 0;
    return Math.min(q.count, k.kind === "bring" ? this.itemCount(k.item) : q.progress);
  }

  questReady(q = this.quest) {
    return !!q && this.questProgress(q) >= q.count;
  }

  // Моб убит героем (scene/run-stats.js → countKill)
  questKill(e) {
    const q = this.quest, k = this.questKind(q);
    if (!k || k.kind !== "kill" || q.progress >= q.count) return;
    const fits = k.target === "any" ? e.kind === "mob" : k.target === "elite" ? !!e.elite : k.target === "boss" ? !!e.boss : e.type === k.target;
    if (!fits) return;
    q.progress++;
    if (q.progress >= q.count) {
      this.engine.toast("QUEST DONE - BACK TO THE WARDEN", 2500);
      this.engine.sound.play("levelup", { volume: 0.6 });
    }
    this.engine.redraw();
  }

  updateQuests(dt) {
    if (this.duel) return; // в дуэли заданий нет
    this.questWait = Math.max(0, (this.questWait || 0) - dt);
  }

  // Окно стража (F): большое, два столбца — слева продажа, справа задания (warden-scene.js)
  openWarden(npc) {
    if (!this.quest && !this.questOffer && !this.questWait) this.questOffer = this.makeQuest();
    const reward = (q) => this.tr("REWARD") + ": " + q.coins + " " + this.tr("COINS") + ", " + q.xp + " XP";
    this.pushLive(new WardenScene({
      title: npc.name || "WARDEN",
      currency: "COINS",
      money: () => this.itemCount("coin"),
      rows: () => this.tradeRows(),
      onSell: (i) => this.sellSlot(i),
      quest: () => {
        const lines = [];
        if (this.duel) lines.push(this.tr("NO JOBS RIGHT NOW. COME BACK LATER."));
        else if (this.quest) {
          lines.push(`${this.tr("QUEST")}: ${this.questTitle(this.quest)}`);
          lines.push(`${this.questProgress()} / ${this.quest.count}`);
          lines.push(reward(this.quest));
          lines.push(this.questReady() ? this.tr("DONE! TURN IT IN.") : this.tr("COME BACK WHEN IT IS DONE."));
        } else if (this.questOffer) {
          lines.push(this.tr("I HAVE A JOB FOR YOU"));
          lines.push(this.questTitle(this.questOffer));
          lines.push(reward(this.questOffer));
        } else lines.push(this.tr("NO JOBS RIGHT NOW. COME BACK LATER."));
        return {
          lines,
          note: this.questsDone ? `${this.tr("QUESTS DONE")}: ${this.questsDone}` : "",
          buttons: this.duel ? [] : [
            ...(this.quest && this.questReady() ? [{ id: "turnin", label: "TURN IN", main: true }] : []),
            ...(!this.quest && this.questOffer ? [{ id: "accept", label: "ACCEPT", main: true }] : []),
            ...(this.quest && !this.questReady() ? [{ id: "abandon", label: "ABANDON" }] : []),
          ],
        };
      },
      onQuest: (id) => {
        if (id === "accept") this.acceptQuest();
        if (id === "turnin") this.turnInQuest();
        if (id === "abandon") this.abandonQuest();
      },
    }));
  }

  acceptQuest() {
    if (this.quest || !this.questOffer) return;
    this.quest = this.questOffer;
    this.questOffer = null;
    this.engine.log(`задание взято: ${this.quest.id} x${this.quest.count}`);
    this.engine.sound.play("learn");
  }

  turnInQuest() {
    const q = this.quest, k = this.questKind(q);
    if (!q || !this.questReady()) return false;
    if (k.kind === "bring" && this.takeItem(k.item, q.count) < q.count) return false;
    this.quest = null;
    this.questsDone = (this.questsDone || 0) + 1;
    this.achStat("quests");
    const left = this.giveResource("coin", q.coins);
    if (left > 0) this.pickups.add("coin", left, { x: this.player.position.x, y: this.player.position.y + 0.5, z: this.player.position.z });
    this.gainXp(q.xp);
    this.engine.sound.play("loot");
    this.engine.toast("+" + q.coins + " " + this.tr("COINS") + ", +" + q.xp + " XP", 2500);
    this.engine.log(`задание сдано: ${q.id}, +${q.coins} монет, +${q.xp} опыта`);
    this.questOffer = this.makeQuest();
    return true;
  }

  abandonQuest() {
    if (!this.quest) return;
    this.engine.log(`задание брошено: ${this.quest.id}`);
    this.quest = null;
    this.questOffer = null;
    this.questWait = QUESTS.cooldown;
  }
}
