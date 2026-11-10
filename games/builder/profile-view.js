// ============================================================
//  Профиль: сетка ачивок (меню → ПРОФИЛЬ → АЧИВКИ) и окно профиля в паузе (Esc → ПРОФИЛЬ):
//  вкладки ИГРОК (ник, матчи, дуэли) и АЧИВКИ. Данные — профиль аккаунта (engine.profile).
// ============================================================

import { Scene, widgets } from "../../engine/index.js";
import { ACHIEVEMENTS, isUnlocked, progressOf } from "./achievements.js";
import { SKIN_TARGETS } from "./skins.js";

const TIER_COLORS = [[170, 170, 170], [120, 200, 120], [110, 170, 255], [230, 150, 255]];

// Сетка ачивок от top вниз: открытые — яркие, закрытые — тёмные (текст и прогресс видны).
// scroll — первая видимая строка; вернёт поправленный scroll
export function drawAchievementGrid(ui, P, scroll, top) {
  const th = ui.theme;
  const done = ACHIEVEMENTS.filter((a) => isUnlocked(P, a)).length;
  ui.text(`${done}/${ACHIEVEMENTS.length}`, ui.width / 2, top - 26, 2, th.accent, "center");
  const cw = 360, chh = 86, gap = 12;
  const cols = Math.max(1, Math.floor((ui.width - 40) / (cw + gap)));
  const rows = Math.ceil(ACHIEVEMENTS.length / cols);
  const visible = Math.max(1, Math.floor((ui.height - top - 30) / (chh + gap)));
  scroll = Math.max(0, Math.min(scroll, rows - visible));
  const x0 = Math.round(ui.width / 2 - (cols * (cw + gap) - gap) / 2);
  ACHIEVEMENTS.forEach((a, i) => {
    const r = Math.floor(i / cols) - scroll;
    if (r < 0 || r >= visible) return;
    const x = x0 + (i % cols) * (cw + gap), y = top + r * (chh + gap);
    const open = isUnlocked(P, a), k = progressOf(P, a);
    const tc = TIER_COLORS[a.tier] || th.text;
    ui.rect(x, y, cw, chh, open ? th.window.fill : [14, 15, 19], open ? 245 : 235);
    ui.frame(x, y, cw, chh, open ? tc : th.window.border, open ? 3 : 2);
    ui.text(a.name, x + 12, y + 10, 2, open ? tc : th.muted, "left", 255, cw - 24);
    ui.text(a.text, x + 12, y + 36, 1, open ? th.text : [90, 92, 100], "left", 255, cw - 24);
    const [target, skin] = a.skin.split("/");
    const t = SKIN_TARGETS.find((x) => x.id === target), s = t?.skins.find((x) => x.id === skin);
    ui.text(`SKIN: ${t?.name || target} - ${s?.name || skin}`, x + 12, y + 52, 1, open ? th.accent : [80, 82, 90], "left", 255, cw - 24);
    ui.rect(x + 12, y + chh - 16, cw - 24, 6, [20, 22, 28], 255);
    ui.rect(x + 12, y + chh - 16, Math.round((cw - 24) * k), 6, open ? tc : [70, 72, 80], 255);
    if (!open) ui.text(`${Math.min(a.goal, P?.get?.(a.stat) || 0)}/${a.goal}`, x + cw - 12, y + 10, 1, [110, 112, 120], "right");
  });
  if (rows > visible) ui.text("WHEEL - SCROLL", ui.width / 2, ui.height - 18, 1, th.muted, "center");
  return scroll;
}

// Окно профиля поверх игры (пауза → ПРОФИЛЬ)
export class ProfileScene extends Scene {
  constructor({ nick = "PLAYER" } = {}) {
    super();
    this.nick = nick;
    this.tab = "achievements";
    this.scroll = 0;
    this.transparent = true;
  }

  get label() {
    return "профиль";
  }

  drawUI(ui) {
    const th = ui.theme, P = this.engine.profile;
    widgets.drawDim(ui, 215);
    ui.text("PROFILE", ui.width / 2, 30, 4, th.text, "center");
    [["stats", "PLAYER"], ["achievements", "ACHIEVEMENTS"]].forEach(([id, label], i) => ui.button("tab:" + id, label, ui.width / 2 + (i - 0.5) * 230, 92, 220, 38, 2, this.tab === id));
    ui.button("close", "BACK", ui.width - 90, 40, 140, 40, 2, false);
    if (this.tab === "achievements") {
      this.scroll = drawAchievementGrid(ui, P, this.scroll, 150);
      return;
    }
    let y = 170;
    ui.text(this.nick, ui.width / 2, y, 4, th.accent, "center");
    y += 70;
    for (const [label, key] of [["MATCHES", "matches"], ["DUEL WINS", "duelWins"], ["DUEL LOSSES", "duelLosses"], ["MONSTERS KILLED", "kills"]]) {
      ui.text(label, ui.width / 2 - 10, y, 2, th.muted, "right");
      ui.text(String(P?.get?.(key) || 0), ui.width / 2 + 10, y, 2, th.text);
      y += 30;
    }
  }

  onButton(id) {
    if (id === "close") return this.engine.pop();
    const [kind, arg] = id.split(":");
    if (kind === "tab") {
      this.tab = arg;
      this.scroll = 0;
    }
    this.engine.redraw?.();
  }

  onWheel({ dy }) {
    if (this.tab !== "achievements") return false;
    this.scroll = Math.max(0, this.scroll + (dy > 0 ? -1 : 1));
    return true;
  }

  onPress(actions) {
    if (actions.includes("pause")) this.engine.pop();
  }
}
