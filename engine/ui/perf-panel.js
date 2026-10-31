// ============================================================
//  Страница «ПРОИЗВОДИТЕЛЬНОСТЬ» тех. панели (F3 второй раз) — что показывает профайлер движка
//  (engine/core/profiler.js): время кадра, дерево систем (UPDATE → CREATURES → AI → PATHFINDING...),
//  график последних кадров, сборщик мусора, память и последний рывок.
//
//    drawPerfPanel(ui, profiler, { x, y, fps });
//
//  Текст собирается заново, только когда профайлер пересчитал статистику (stats.version: раз в statsEvery),
//  график — каждый кадр (он маленький): так панель сама почти не тратит время.
// ============================================================

import { TEXT, WARN, MUTED } from "./widgets.js";
import { measureText } from "./font.js";

const GOOD = [110, 210, 120]; //  кадр уложился в 60 FPS
const SLOW = [240, 196, 80]; //   в 30 FPS
const BAD = [255, 90, 80]; //     дольше — рывок
const BG = [8, 10, 16];
const ms = (v) => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3));

// Строки текста — по статистике (кэш на профайлере: пересобираем только при новой статистике)
function buildLines(p, fps) {
  const st = p.stats;
  const lines = [];
  const add = (text, color = TEXT, indent = 0) => lines.push({ text, color, indent });
  add(`VOID PROFILER  FPS ${fps ?? "-"}`, WARN);
  add(`FRAME ${ms(st.frame.avg)} MS AVG  ${ms(st.frame.p95)} P95  ${ms(st.frame.max)} MAX  (${st.frames} FRAMES)`);
  add("");
  add("SYSTEM                     AVG MS   MAX MS    FRAME   CALLS", MUTED);
  // Дерево: дети под родителем, внутри — по убыванию среднего; пустые (ни разу не работали) — не показываем
  const kids = (parent) => {
    const out = [];
    for (let id = 0; id < p.count; id++) if (p.parent[id] === parent && st.max[id] > 0) out.push(id);
    return out.sort((a, b) => st.avg[b] - st.avg[a]);
  };
  const walk = (parent, depth) => {
    for (const id of kids(parent)) {
      const name = ("  ".repeat(depth) + p.names[id]).padEnd(24);
      const share = `${(st.share[id] * 100).toFixed(1)}%`.padStart(7);
      const calls = st.calls[id] >= 1.5 ? st.calls[id].toFixed(0).padStart(6) : "".padStart(6);
      const color = st.share[id] > 0.3 ? BAD : st.share[id] > 0.1 ? SLOW : TEXT;
      add(`${name} ${ms(st.avg[id]).padStart(7)}  ${ms(st.max[id]).padStart(7)}  ${share}  ${calls}`, color);
      walk(id, depth + 1);
    }
  };
  walk(-1, 0);
  add(`${"OTHER (NOT MEASURED)".padEnd(24)} ${ms(st.other.avg).padStart(7)}  ${ms(st.other.max).padStart(7)}`, MUTED);
  add("");
  const g = st.gc;
  add(`GC ${ms(g.ms)} MS/S  MAX PAUSE ${ms(g.max)} MS  ${g.count} SWEEPS (MINOR ${ms(g.minor)} / MAJOR ${ms(g.major)} MS)`, g.max > 16 ? BAD : TEXT);
  add(`GC BETWEEN FRAMES ${ms(g.between)} MS  FRAMES HIT ${g.frames}`);
  const m = st.memory;
  // выделение — оценка снизу (что сборщик убрал между замерами, не видно), отсюда «+»
  add(`HEAP ${m.heap.toFixed(0)} MB  RSS ${m.rss.toFixed(0)} MB  ALLOC ${m.alloc.toFixed(0)}+ MB/S`);
  add("");
  const perMin = p.hitchesPerMinute();
  const last = p.hitches(1)[0];
  add(`HITCHES (> ${p.hitchMs} MS) PER MINUTE ${perMin}`, perMin ? SLOW : TEXT);
  if (last) {
    const ago = ((p.now() - last.at) / 1000).toFixed(0);
    add(`LAST ${ago} S AGO: WORK ${ms(last.frame)} MS  GAP ${ms(last.gap)} MS  GC ${ms(last.gc)} MS`, BAD);
    add(`  TOP: ${last.top.filter((t) => t.ms >= 0.05).map((t) => `${t.name} ${ms(t.ms)}`).join("  ") || "-"}`);
    if (last.context) add(`  ${last.context}`, MUTED);
  }
  if (p.mismatches) add(`MARKUP ERRORS ${p.mismatches}`, BAD);
  return lines;
}

export function drawPerfPanel(ui, p, { x = 6, y = 6, scale = 2, fps = null, graphW = 300, graphH = 64 } = {}) {
  const cache = (p.panelCache ||= { version: -1, lines: [], fps: null });
  if (cache.version !== p.stats.version || cache.fps !== fps) {
    cache.lines = buildLines(p, fps);
    cache.version = p.stats.version;
    cache.fps = fps;
  }
  const lh = 8 * scale + 4;
  const w = Math.max(graphW + 16, ...cache.lines.map((l) => measureText(l.text, scale))) + 16;
  const h = cache.lines.length * lh + graphH + 30;
  ui.rect(x, y, w, h, BG, 200);
  cache.lines.forEach((l, i) => l.text && ui.text(l.text, x + 8, y + 6 + i * lh, scale, l.color));

  // График: столбик на кадр (новые справа), высота — промежуток кадра (то, что видел глаз; нет — работа),
  // линии 60 и 30 FPS; цвет — уложился ли кадр
  const gx = x + 8, gy = y + 12 + cache.lines.length * lh, top = 50; // по высоте — до 50 мс
  ui.rect(gx, gy, graphW, graphH, [20, 24, 32], 220);
  const n = Math.min(p.filled, graphW);
  for (let i = 0; i < n; i++) {
    const v = p.frameGap(i) || p.frameAgo(i);
    const bh = Math.max(1, Math.min(graphH, Math.round((v / top) * graphH)));
    const color = v <= 16.7 ? GOOD : v <= 33.4 ? SLOW : BAD;
    ui.rect(gx + graphW - 1 - i, gy + graphH - bh, 1, bh, color, 230);
    if (p.frameGc(i) > 0) ui.rect(gx + graphW - 1 - i, gy + graphH - 3, 1, 3, [180, 120, 255]); // сборщик в кадре — фиолетовая метка
  }
  for (const [v, c] of [[16.7, GOOD], [33.3, SLOW]]) ui.rect(gx, gy + graphH - Math.round((v / top) * graphH), graphW, 1, c, 150);
  ui.text("60", gx + graphW + 4, gy + graphH - Math.round((16.7 / top) * graphH) - 6, 1, GOOD);
  ui.text("30", gx + graphW + 4, gy + graphH - Math.round((33.3 / top) * graphH) - 6, 1, SLOW);
}
