// ============================================================
//  Профайлер — возможность движка: сколько времени за кадр уходит на каждую систему (ИИ, физика,
//  анимации, HUD, рендер...). Тех. панель F3 показывает это, чтобы видеть, кто «съел» кадр.
//
//    const AI = profiler.register("AI");                  // один раз: имя → номер системы
//    const PATH = profiler.register("PATHFINDING", AI);    // вложенная: часть ИИ (показывается под ним)
//    profiler.begin(AI); ...; profiler.end(AI);           // каждый кадр — по номеру, без строк
//
//  Вложенный замер (поиск пути внутри ИИ) идёт и в свою систему, и в родителя — родитель ведь ещё
//  не закончился. Чистое время системы без детей посчитает статистика (self = своё − детей).
//
//  Главное правило — профайлер сам не должен тормозить и мусорить:
//   - всё время и счётчики — в заранее выделенных типизированных массивах, новых объектов за кадр нет;
//   - выключен (enabled = false, по умолчанию) — begin/end сразу выходят: одна проверка флага.
//  Ошибки разметки (end не того, что открыли последним) не роняют игру — копятся в mismatches.
//
//  Статистика по кадрам: движок в конце кадра зовёт endFrame(мс кадра) — время систем уходит в кольцевой
//  буфер последних history кадров (для графика и разбора рывков), а раз в statsEvery мс считается stats:
//    stats.avg[id] / max[id] / p95[id] — среднее, максимум и «почти худший» (95-й процентиль) кадр системы, мс;
//    stats.share[id] — доля среднего кадра (0…1); stats.frame — { avg, max, p95 } всего кадра;
//    stats.other — { avg, max } времени кадра, которое не покрыто ни одной системой верхнего уровня
//    (большое — значит, где-то не расставлены замеры); stats.frames — по скольким кадрам посчитано;
//    stats.version растёт при каждом пересчёте (интерфейсу — понять, что пора перерисовать).
//  Запись кадра — без новых объектов вовсе; пересчёт раз в секунду — лишь несколько мелких временных.
//
//  Сборщик мусора и память (Node: perf_hooks): пока профайлер включён, он слушает паузы сборщика —
//  каждая пауза ложится на те кадры, во время которых шла (frameGc(i) — сколько мс сборки в кадре i назад),
//  и в stats.gc за секунду: ms (всего), max (самая длинная пауза), count, minor / major (мелкие и полные
//  сборки, мс), frames (в скольких кадрах была сборка), between (мс сборок между кадрами: работу кадра не задели, но промежуток между кадрами удлинили —
//  для глаза это тот же рывок).
//  stats.memory: heap / rss (МБ сейчас) и alloc — сколько примерно МБ в секунду выделяет игра («давление»
//  на сборщик: чем больше, тем чаще паузы). Замер памяти — раз в memoryEvery кадров (он сам не бесплатный).
//
//  Ловушка рывков: кадр, у которого работа ИЛИ промежуток от прошлого кадра (gapMs — то, что видит глаз:
//  сюда входят и паузы сборщика между кадрами) дольше hitchMs, — рывок. Его снимок кладётся в кольцо из
//  hitchSlots последних: когда, сколько длилась работа и промежуток, время каждой системы, сколько сборки
//  пришлось на его окно (допишет addGc — паузы приходят позже) и что творилось в игре — строка от
//  hitchContext() (игра сама решает, что важно: мобы, снаряды, нашествие). hitches(n) — последние n снимков
//  (новые первыми), hitchesPerMinute() — сколько рывков за последнюю минуту. Первые graceFrames кадров
//  после включения не ловим (разгон, загрузка).
// ============================================================

import { PerformanceObserver, constants as perfConstants } from "node:perf_hooks";

const GC_MINOR = perfConstants?.NODE_PERFORMANCE_GC_MINOR ?? 1;

export class Profiler {
  // maxSystems — сколько систем можно зарегистрировать, maxDepth — глубина вложенности замеров
  constructor({ maxSystems = 128, maxDepth = 32, history = 300, statsEvery = 1000, memoryEvery = 6, watchGc = true, hitchMs = 50, hitchSlots = 10, graceFrames = 30, now = () => performance.now() } = {}) {
    this.on = false; //    включён ли (enabled): горячие begin/end проверяют это поле
    this.watchGc = watchGc; // слушать ли паузы сборщика (тестам — false, они подают паузы сами: addGc)
    this.observer = null;
    this.now = now;
    this.max = maxSystems;
    this.names = []; //                          номер → имя
    this.ids = new Map(); //                     имя → номер (только при регистрации)
    this.parent = new Int16Array(maxSystems).fill(-1); // номер родителя (−1 — верхний уровень)
    this.time = new Float64Array(maxSystems); // мс за текущий кадр (копится, пока кадр не сброшен)
    this.calls = new Uint32Array(maxSystems); // сколько раз за кадр открывали систему
    this.stackId = new Int16Array(maxDepth); //  открытые замеры: какая система
    this.stackStart = new Float64Array(maxDepth); // и когда открыли
    this.depth = 0;
    this.mismatches = 0; //                      сколько раз end не совпал с открытым (ошибка разметки)

    // Кольцевой буфер последних кадров: строка на кадр — время каждой системы, плюс время кадра целиком
    this.history = history;
    this.ring = new Float64Array(history * maxSystems);
    this.ringFrame = new Float64Array(history);
    this.ringOther = new Float64Array(history); // непокрытое системами время кадра
    this.head = 0; //                            куда запишем следующий кадр
    this.filled = 0; //                          сколько строк уже заполнено (до history)
    this.sinceStats = 0; //                      кадров с прошлого пересчёта stats
    this.statsEvery = statsEvery;
    this.statsAt = now();
    this.scratch = new Float64Array(history); // для процентиля (сортируем копию, а не буфер)
    this.stats = {
      avg: new Float64Array(maxSystems), max: new Float64Array(maxSystems), p95: new Float64Array(maxSystems),
      share: new Float64Array(maxSystems), calls: new Float64Array(maxSystems), // calls — среднее за кадр
      frame: { avg: 0, max: 0, p95: 0 }, other: { avg: 0, max: 0 }, frames: 0, version: 0,
    };
    this.callsSum = new Float64Array(maxSystems); // вызовы с прошлого пересчёта (для stats.calls)

    // Сборщик мусора: у каждого кадра в кольце — когда начался и сколько в нём было сборки
    this.ringGap = new Float64Array(history); //   промежуток «от конца прошлого кадра до конца этого» (график F3)
    this.ringStart = new Float64Array(history);
    this.ringGc = new Float64Array(history);
    this.gcSum = { ms: 0, max: 0, count: 0, minor: 0, major: 0, between: 0 }; // с прошлого пересчёта
    this.stats.gc = { ms: 0, max: 0, count: 0, minor: 0, major: 0, between: 0, frames: 0 };
    // Память: замер раз в memoryEvery кадров; alloc — сумма приростов кучи (что сборщик успел убрать
    // между замерами, не видно — поэтому «примерно» и с запасом вниз)
    this.memoryEvery = memoryEvery;
    this.memoryTick = 0;
    this.heapPrev = -1;
    this.allocSum = 0; // байт с прошлого пересчёта
    this.stats.memory = { heap: 0, rss: 0, alloc: 0 };

    // Ловушка рывков: снимки заранее выделены (рывок не должен ещё и мусорить)
    this.hitchMs = hitchMs;
    this.graceFrames = graceFrames;
    this.framesOn = 0; // кадров с включения (первые graceFrames — разгон, не ловим)
    this.hitchContext = null; // () => строка: что было в игре (зовётся только на рывке)
    this.hitchRing = Array.from({ length: hitchSlots }, () => ({
      at: 0, frame: 0, gap: 0, gc: 0, from: 0, to: 0, context: null, times: new Float64Array(maxSystems),
    }));
    this.hitchHead = 0;
    this.hitchCount = 0; //                    сколько всего поймано с включения
    this.hitchTimes = new Float64Array(256); // когда были последние рывки (для «за минуту»)
    // Выгрузка: onDump(строки) — куда записать срез (движок ставит: в журнал); сам — если за минуту рывков
    // не меньше autoDumpHitches, но не чаще раза в autoDumpEvery мс
    this.onDump = null;
    this.autoDumpHitches = 5;
    this.autoDumpEvery = 60000;
  }

  get enabled() {
    return this.on;
  }

  // Включили — начинаем слушать сборщик; выключили — перестаём (выключенный профайлер ничего не стоит)
  set enabled(v) {
    this.on = !!v;
    if (this.on) this.framesOn = 0; // включили — снова разгон, первые кадры не ловим
    if (this.on && this.watchGc && !this.observer && typeof PerformanceObserver === "function") {
      this.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.addGc(e.startTime, e.duration, e.detail?.kind ?? e.kind);
      });
      try {
        this.observer.observe({ entryTypes: ["gc"] });
      } catch {
        this.observer = null; // нет такой возможности — живём без сборщика
      }
    } else if (!this.on && this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  // Пауза сборщика (start — время по тем же часам, что now(), мс): в итоги секунды и на кадры, которые задела
  addGc(start, duration, kind) {
    if (!this.on) return;
    const g = this.gcSum;
    g.ms += duration;
    g.count++;
    if (duration > g.max) g.max = duration;
    if (kind === GC_MINOR) g.minor += duration;
    else g.major += duration;
    // Какие кадры задела: идём от последнего назад, пока кадр не кончился раньше начала паузы
    const end = start + duration;
    let hit = 0;
    for (let i = 0; i < this.filled; i++) {
      const r = (this.head - 1 - i + this.history) % this.history;
      const fs = this.ringStart[r], fe = fs + this.ringFrame[r];
      if (fe <= start) break;
      const overlap = Math.min(fe, end) - Math.max(fs, start);
      if (overlap > 0) {
        this.ringGc[r] += overlap;
        hit += overlap;
      }
    }
    g.between += Math.max(0, duration - hit); // между кадрами (или до первого кадра) — кадр не задела
    // И на снимки рывков, чьё окно (промежуток + работа кадра) задела
    for (const h of this.hitchRing) {
      if (!h.at) continue;
      const overlap = Math.min(h.to, end) - Math.max(h.from, start);
      if (overlap > 0) h.gc += overlap;
    }
  }

  // Зарегистрировать систему (повторно с тем же именем — тот же номер). parent — номер или имя родителя
  // Уже есть, но без родителя, а теперь родителя назвали (модуль движка сослался на систему раньше, чем
  // игра её объявила) — родитель запоминается
  register(name, parent = -1) {
    if (this.ids.has(name)) {
      const id = this.ids.get(name);
      if (this.parent[id] === -1 && parent !== -1) this.parent[id] = typeof parent === "string" ? this.register(parent) : parent;
      return id;
    }
    if (this.names.length >= this.max) throw new Error(`Profiler: больше ${this.max} систем`);
    const id = this.names.length;
    this.names.push(name);
    this.ids.set(name, id);
    this.parent[id] = typeof parent === "string" ? this.register(parent) : parent;
    return id;
  }

  get count() {
    return this.names.length;
  }

  begin(id) {
    if (!this.on) return;
    if (this.depth >= this.stackId.length) {
      this.mismatches++; // слишком глубоко — замер не ведём (лучше потерять цифру, чем упасть)
      return;
    }
    this.stackId[this.depth] = id;
    this.stackStart[this.depth] = this.now();
    this.depth++;
    this.calls[id]++;
  }

  end(id) {
    if (!this.on) return;
    if (this.depth === 0) {
      this.mismatches++; // нечего закрывать — ошибка разметки, просто не считаем
      return;
    }
    // Закрываем до нужного: если внутри забыли end — внутренние закрываются тут же (и это ошибка разметки)
    let d = this.depth - 1;
    while (d >= 0 && this.stackId[d] !== id) d--;
    if (d < 0) {
      this.mismatches++; // такого не открывали — просто не считаем
      return;
    }
    const t = this.now();
    for (let i = this.depth - 1; i >= d; i--) {
      if (i > d) this.mismatches++;
      this.time[this.stackId[i]] += t - this.stackStart[i];
    }
    this.depth = d;
  }

  // Удобно для редкого (сохранение, генерация мира): замерить вызов fn. В горячем коде — begin/end
  // (здесь замыкание, а в каждом кадре его лучше не создавать)
  measure(id, fn) {
    this.begin(id);
    try {
      return fn();
    } finally {
      this.end(id);
    }
  }

  // Новый кадр: обнулить время и счётчики (статистика по кадрам забирает их до этого — пункт 0.1.2).
  // Незакрытые замеры (кадр оборвался ошибкой) — сбрасываем, чтобы не тянулись в следующий кадр
  resetFrame() {
    this.time.fill(0, 0, this.names.length);
    this.calls.fill(0, 0, this.names.length);
    this.depth = 0;
  }

  // Конец кадра (зовёт движок): frameMs — сколько длился весь кадр. Время систем — в буфер, кадр — сброс.
  // Раз в statsEvery мс — пересчёт stats по кадрам, накопившимся с прошлого раза
  // gapMs — сколько прошло от конца прошлого кадра до конца этого (простой + работа: столько глаз ждал новую
  // картинку); 0 — неизвестно (первый кадр, только что вышли из меню) — тогда рывок ловим только по работе
  endFrame(frameMs, gapMs = 0) {
    if (!this.on) return;
    this.framesOn++;
    if (this.framesOn > this.graceFrames && (frameMs > this.hitchMs || gapMs > this.hitchMs)) {
      this.catchHitch(frameMs, gapMs);
      this.maybeAutoDump();
    }
    const n = this.names.length, row = this.head * this.max;
    let top = 0;
    for (let id = 0; id < n; id++) {
      const t = this.time[id];
      this.ring[row + id] = t;
      if (this.parent[id] === -1) top += t;
      this.callsSum[id] += this.calls[id];
    }
    this.ringFrame[this.head] = frameMs;
    this.ringOther[this.head] = Math.max(0, frameMs - top);
    this.ringGap[this.head] = gapMs;
    this.ringStart[this.head] = this.now() - frameMs; // кадр шёл с этого момента и до сейчас
    this.ringGc[this.head] = 0; //                       паузы сборщика допишет addGc (приходят позже)
    if (++this.memoryTick >= this.memoryEvery) {
      this.memoryTick = 0;
      this.sampleMemory();
    }
    this.head = (this.head + 1) % this.history;
    if (this.filled < this.history) this.filled++;
    this.sinceStats++;
    this.resetFrame();
    if (this.now() - this.statsAt >= this.statsEvery) this.computeStats();
  }

  // Рывок: снимок в кольцо (до сброса кадра — время систем ещё на месте)
  catchHitch(frameMs, gapMs) {
    const h = this.hitchRing[this.hitchHead];
    this.hitchHead = (this.hitchHead + 1) % this.hitchRing.length;
    const now = this.now();
    h.at = now;
    h.frame = frameMs;
    h.gap = gapMs;
    h.to = now;
    h.from = now - Math.max(frameMs, gapMs); // окно: от конца прошлого кадра (или начала этого) до сейчас
    h.gc = 0; //                                паузы сборщика в этом окне допишет addGc
    h.times.set(this.time.subarray(0, this.names.length));
    try {
      h.context = this.hitchContext ? String(this.hitchContext() ?? "") : null;
    } catch (e) {
      h.context = "context error: " + e.message; // профайлер не должен ронять игру
    }
    this.hitchTimes[this.hitchCount % this.hitchTimes.length] = now;
    this.hitchCount++;
  }

  // Последние n рывков, новые первыми: { at, frame, gap, gc, context, top: [{ name, ms }] } — top — самые
  // тяжёлые системы этого кадра (без вложенных, по убыванию). Создаёт объекты — звать при показе, не каждый кадр
  hitches(n = this.hitchRing.length, topN = 5) {
    const out = [];
    const size = this.hitchRing.length;
    for (let i = 1; i <= Math.min(n, size); i++) {
      const h = this.hitchRing[(this.hitchHead - i + size) % size];
      if (!h.at) break;
      const top = [];
      for (let id = 0; id < this.names.length; id++) if (this.parent[id] === -1 && h.times[id] > 0) top.push({ name: this.names[id], ms: h.times[id] });
      top.sort((a, b) => b.ms - a.ms);
      out.push({ at: h.at, frame: h.frame, gap: h.gap, gc: h.gc, context: h.context, top: top.slice(0, topN) });
    }
    return out;
  }

  // Сколько рывков за последние windowMs (по умолчанию — минута)
  hitchesPerMinute(windowMs = 60000) {
    const now = this.now(), size = this.hitchTimes.length;
    let count = 0;
    for (let i = 1; i <= Math.min(this.hitchCount, size); i++) {
      if (now - this.hitchTimes[(this.hitchCount - i) % size] > windowMs) break;
      count++;
    }
    return count;
  }

  // Пересчитать stats по последним кадрам (с прошлого пересчёта, но не больше history)
  computeStats() {
    const k = Math.min(this.sinceStats, this.filled);
    this.windowFrames = this.sinceStats; // все кадры окна (k — лишь те, что ещё в кольце): для «вызовов за кадр»
    this.prevStatsAt = this.statsAt; // окно пересчёта: от прошлого раза до сейчас (для «МБ в секунду»)
    this.statsAt = this.now();
    this.sinceStats = 0;
    const st = this.stats;
    st.frames = k;
    // строки последних k кадров: head−1, head−2, ... (по кругу)
    const rowOf = (i) => ((this.head - 1 - i + this.history) % this.history);
    if (k > 0) this.systemStats(k, rowOf);
    this.gcMemoryStats(k, rowOf); // сборщик и память — даже если кадров не было (окно было на паузе)
    st.version++;
  }

  // Время систем и кадра по последним k кадрам
  systemStats(k, rowOf) {
    const st = this.stats;
    const n = this.names.length;
    const series = (get, out) => {
      let sum = 0, mx = 0;
      for (let i = 0; i < k; i++) {
        const v = get(rowOf(i));
        this.scratch[i] = v;
        sum += v;
        if (v > mx) mx = v;
      }
      const part = this.scratch.subarray(0, k).sort();
      out.avg = sum / k;
      out.max = mx;
      out.p95 = part[Math.min(k - 1, Math.floor(k * 0.95))];
      return out;
    };
    const tmp = { avg: 0, max: 0, p95: 0 };
    series((r) => this.ringFrame[r], st.frame);
    const o = series((r) => this.ringOther[r], tmp);
    st.other.avg = o.avg;
    st.other.max = o.max;
    for (let id = 0; id < n; id++) {
      series((r) => this.ring[r * this.max + id], tmp);
      st.avg[id] = tmp.avg;
      st.max[id] = tmp.max;
      st.p95[id] = tmp.p95;
      st.share[id] = st.frame.avg > 0 ? tmp.avg / st.frame.avg : 0;
      st.calls[id] = this.callsSum[id] / Math.max(1, this.windowFrames);
      this.callsSum[id] = 0;
    }
  }

  // Сборщик мусора и память за окно пересчёта
  gcMemoryStats(k, rowOf) {
    const st = this.stats;
    // Сборщик за это время: итоги и сколько кадров он задел (по кольцу — те же k кадров)
    const g = this.gcSum, sg = st.gc;
    sg.ms = g.ms; sg.max = g.max; sg.count = g.count; sg.minor = g.minor; sg.major = g.major; sg.between = g.between;
    let gcFrames = 0;
    for (let i = 0; i < k; i++) if (this.ringGc[rowOf(i)] > 0) gcFrames++;
    sg.frames = gcFrames;
    g.ms = g.max = g.count = g.minor = g.major = g.between = 0;
    // Память: МБ сейчас и сколько МБ в секунду выделялось
    const sec = Math.max(1e-3, (this.statsAt - this.prevStatsAt) / 1000);
    st.memory.alloc = this.allocSum / 1048576 / sec;
    this.allocSum = 0;
  }

  // Замер памяти: сейчас и прирост кучи с прошлого замера (уменьшилась — это поработал сборщик, не считаем)
  sampleMemory() {
    if (typeof process === "undefined" || !process.memoryUsage) return;
    const m = process.memoryUsage();
    if (this.heapPrev >= 0 && m.heapUsed > this.heapPrev) this.allocSum += m.heapUsed - this.heapPrev;
    this.heapPrev = m.heapUsed;
    this.stats.memory.heap = m.heapUsed / 1048576;
    this.stats.memory.rss = m.rss / 1048576;
  }

  // Промежуток кадра i кадров назад (что видел глаз; 0 — неизвестен, тогда только работа кадра)
  frameGap(i) {
    if (i >= this.filled) return 0;
    return this.ringGap[(this.head - 1 - i + this.history) % this.history];
  }

  // Сколько мс сборки мусора пришлось на кадр i кадров назад (0 — последний)
  frameGc(i) {
    if (i >= this.filled) return 0;
    return this.ringGc[(this.head - 1 - i + this.history) % this.history];
  }

  // Время системы id в кадре i кадров назад (0 — последний записанный): для графика и разбора рывков
  frameAgo(i, id = -1) {
    if (i >= this.filled) return 0;
    const r = (this.head - 1 - i + this.history) % this.history;
    return id < 0 ? this.ringFrame[r] : this.ring[r * this.max + id];
  }

  // Срез для журнала — короткий текст (строки), чтобы вставить в чат: кадр, системы (по всем кадрам в кольце —
  // последние ~5 с при 60 FPS), сборщик и память (последняя статистика), рывки (все снимки, новые первыми).
  // reason — почему срез: по кнопке или сам (много рывков)
  report(reason = "manual") {
    const k = this.filled;
    const f = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));
    const out = [];
    if (!k) return ["PROFILER: NO DATA (OPEN THE PROFILER PAGE: F3 TWICE)"];
    let sum = 0, mx = 0, sumGap = 0, gapN = 0, mxGap = 0;
    for (let i = 0; i < k; i++) {
      const v = this.frameAgo(i), g = this.frameGap(i);
      sum += v;
      if (v > mx) mx = v;
      if (g > 0) { sumGap += g; gapN++; if (g > mxGap) mxGap = g; }
    }
    out.push(`PROFILER REPORT (${reason}), LAST ${k} FRAMES: WORK AVG ${f(sum / k)} MAX ${f(mx)} MS; GAP AVG ${gapN ? f(sumGap / gapN) : "-"} MAX ${f(mxGap)} MS`);
    // Системы: среднее и максимум по кольцу, дерево отступами, только те, что работали
    const avg = (id) => { let s2 = 0; for (let i = 0; i < k; i++) s2 += this.frameAgo(i, id); return s2 / k; };
    const max = (id) => { let m2 = 0; for (let i = 0; i < k; i++) m2 = Math.max(m2, this.frameAgo(i, id)); return m2; };
    const walk = (parent, depth) => {
      const ids = [];
      for (let id = 0; id < this.names.length; id++) if (this.parent[id] === parent) ids.push({ id, a: avg(id), m: max(id) });
      ids.sort((p, q) => q.a - p.a);
      for (const { id, a, m } of ids) {
        if (m <= 0) continue;
        out.push(`${"  ".repeat(depth + 1)}${this.names[id]} AVG ${f(a)} MAX ${f(m)} (${((a / (sum / k)) * 100).toFixed(1)}%)`);
        walk(id, depth + 1);
      }
    };
    walk(-1, 0);
    const g = this.stats.gc, m = this.stats.memory;
    out.push(`GC: ${f(g.ms)} MS/S, MAX ${f(g.max)} MS, ${g.count} SWEEPS (MINOR ${f(g.minor)} / MAJOR ${f(g.major)}), BETWEEN FRAMES ${f(g.between)} MS; HEAP ${m.heap.toFixed(0)} MB, RSS ${m.rss.toFixed(0)} MB, ALLOC ${m.alloc.toFixed(0)}+ MB/S`);
    const hs = this.hitches();
    out.push(`HITCHES: ${this.hitchesPerMinute()} PER MINUTE, ${this.hitchCount} SINCE ON${this.mismatches ? `; MARKUP ERRORS ${this.mismatches}` : ""}`);
    for (const h of hs) {
      const ago = ((this.now() - h.at) / 1000).toFixed(1);
      out.push(`  -${ago} S: WORK ${f(h.frame)} GAP ${f(h.gap)} GC ${f(h.gc)} MS | ${h.top.filter((t) => t.ms >= 0.05).map((t) => `${t.name} ${f(t.ms)}`).join(", ") || "-"}${h.context ? ` | ${h.context}` : ""}`);
    }
    return out;
  }

  // Самому записать срез, если рывков много: не чаще раза в autoDumpEvery мс и если за минуту их ≥ autoDumpHitches.
  // Зовётся из endFrame; куда писать — решает onDump (движок: в журнал)
  maybeAutoDump() {
    if (!this.onDump || this.hitchesPerMinute() < this.autoDumpHitches) return;
    const now = this.now();
    if (now - (this.lastAutoDump ?? -Infinity) < this.autoDumpEvery) return;
    this.lastAutoDump = now;
    this.onDump(this.report("auto: many hitches"));
  }

  // Чистое время системы за кадр — без вложенных в неё (детей): «ИИ без поиска пути»
  selfTime(id) {
    let t = this.time[id];
    for (let c = 0; c < this.names.length; c++) if (this.parent[c] === id) t -= this.time[c];
    return Math.max(0, t);
  }
}

// Общий профайлер движка: один на всё приложение (движок — engine.profiler, а модули движка и игры
// импортируют его напрямую и регистрируют свои системы при загрузке). Выключен, пока не включат (F3)
export const profiler = new Profiler();
