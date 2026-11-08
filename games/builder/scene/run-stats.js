// ============================================================
//  Итоги забега: сколько прожил, кого убил, чем больше всего навредил, кто добил. Копится с начала мира
//  (сохраняется в progression.run), при гибели — окно итогов (SummaryScene) и рекорды мира (info.json → records:
//  лучший уровень, больше всего убийств, дольше всего прожил, сколько было забегов).
// ============================================================

import { SummaryScene, translate } from "../../../engine/index.js";
import { itemName } from "../items.js";
import { worldInfo, updateWorld, currentWorld } from "../save.js";

const fresh = () => ({ time: 0, kills: 0, bosses: 0, dealt: 0, taken: 0, by: {}, killedBy: null });
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
export const clock = (t) => {
  const s = Math.floor(t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

export class RunStatsPart {
  loadRunStats(saved) {
    const r = fresh();
    if (saved && typeof saved === "object") {
      for (const k of ["time", "kills", "bosses", "dealt", "taken"]) r[k] = num(saved[k]);
      for (const [k, v] of Object.entries(saved.by || {})) if (num(v)) r.by[k] = num(v);
    }
    this.run = r;
  }

  runStatsJSON() {
    return this.run || fresh();
  }

  // Каждый тик, пока герой жив
  tickRunStats(dt) {
    if (this.run && this.player.alive && !this.dead) this.run.time += dt;
  }

  // Урон: героем — чем (оружие в руках), по герою — кто (для «добил»)
  statDamage(e, d, dealt) {
    const r = this.run;
    if (!r || dealt <= 0) return;
    if (e === this.player) {
      r.taken += dealt;
      const src = d?.source?.owner || d?.source;
      if (src && src !== this.player) r.killedBy = src.name || null;
      return;
    }
    if (d?.source !== this.player) return;
    r.dealt += dealt;
    const item = this.player.hotbar.slots[Math.max(0, this.abilities?.index ?? 0)]?.item || "hand";
    r.by[item] = (r.by[item] || 0) + dealt;
  }

  countKill(e) {
    if (e.kind === "mob") this.questKill?.(e); // задание стража (scene/quests.js)
    if (!this.run || e.kind !== "mob") return;
    this.run.kills++;
    if (e.boss) this.run.bosses++;
  }

  // Итоги + рекорды мира. Вернёт { rows, records }
  runSummary() {
    const r = this.run || fresh();
    const best = Object.entries(r.by).sort((a, b) => b[1] - a[1])[0];
    const level = this.experience.level;
    const info = this.match ? {} : worldInfo(); // матч — мир на один раз: рекордов мира нет
    const was = info.records || {};
    const rec = {
      runs: num(was.runs) + 1,
      level: Math.max(num(was.level), level),
      kills: Math.max(num(was.kills), r.kills),
      time: Math.max(num(was.time), Math.floor(r.time)),
    };
    const isBest = (k, v) => v > num(was[k]) && num(was.runs) > 0; // первый забег — рекордов «бить» нечем
    if (currentWorld && !this.match) updateWorld(currentWorld, { records: rec });
    const rows = [
      { label: "LEVEL", value: level, best: isBest("level", level) },
      { label: "KILLS", value: r.kills, best: isBest("kills", r.kills) },
      { label: "BOSSES", value: r.bosses },
      { label: "TIME ALIVE", value: clock(r.time), best: isBest("time", Math.floor(r.time)) },
      { label: "DAMAGE DEALT", value: Math.round(r.dealt) },
      { label: "BEST WEAPON", value: best ? (best[0] === "hand" ? "FISTS" : itemName(best[0])) : "-" },
    ];
    const records = [
      { label: "RUNS", value: rec.runs },
      { label: "BEST LEVEL", value: rec.level },
      { label: "MOST KILLS", value: rec.kills },
      { label: "LONGEST RUN", value: clock(rec.time) },
    ];
    return { rows, records: this.match ? [] : records, killedBy: r.killedBy };
  }

  // Окно гибели (scene/input.js → die)
  showDeathSummary() {
    const { rows, records, killedBy } = this.runSummary();
    this.engine.log(`итоги: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`);
    this.engine.push(new SummaryScene({
      title: this.match ? "MATCH OVER" : "YOU DIED", // матч: погибли все
      subtitle: this.match ? "THE WHOLE TEAM IS DOWN" : killedBy ? translate("KILLED BY ") + translate(killedBy) : "", // по частям: так переводится
      rows, records, recordsTitle: "WORLD RECORDS",
      footer: this.match ? "THE MATCH WORLD IS GONE - HOST A NEW LOBBY TO PLAY AGAIN" : "WORLD, LEVEL AND TALENTS ARE LOST - A NEW RUN STARTS",
      buttons: [{ id: "menu", label: "MAIN MENU" }],
      lock: 1.5,
      onButton: () => this.game.toMenu(),
    }));
  }
}
