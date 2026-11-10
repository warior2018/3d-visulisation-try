// ============================================================
//  Консоль разработчика — как в играх на Source (Dota 2, Deadlock) и в Minecraft: строка команд поверх игры
//  (клавиша ` / ~). Команды регистрирует движок (общие) и игра (свои): give, spawn, god...
//
//    engine.console.command("give", { help: "give <item> [count]", run: (args, con) => "OK" });
//    engine.console.cvar("timescale", { help: "...", get: () => x, set: (v) => {...} }); // переменная: имя — узнать, имя число — задать
//    engine.console.exec("give stone 10; spawn skeleton 3");      // несколько — через ;
//    engine.console.lines                                          // что напечатано (последние maxLines)
//
//  run возвращает строку / массив строк (напечатать) или ничего; бросил ошибку — она печатается красным.
//  Подробная справка (help <имя>): engine.console.describe("give", { what, args: [[имя, "required"|"optional", что]],
//  examples: [...], notes: [...] }) — для команды или переменной. help без имени — все команды с кратким описанием
//  cheat: true — команда меняет игру (выдать, призвать, бессмертие): игра может их запретить (allowCheats)
// ============================================================

export class DevConsole {
  constructor({ maxLines = 300, log = null } = {}) {
    this.commands = new Map(); // имя -> { help, run, cheat }
    this.cvars = new Map(); //    имя -> { help, get, set, cheat }
    this.details = new Map(); //  имя -> { what, args, examples, notes } — подробная справка (describe)
    this.lines = []; //           { text, color }
    this.history = []; //         введённые строки (стрелки вверх / вниз)
    this.maxLines = maxLines;
    this.log = log; //            куда ещё писать (журнал игры)
    this.allowCheats = () => true; // игра решает (например, гость сетевой игры — нельзя)
    this.version = 0; //          растёт при каждой новой строке (окну — перерисоваться)
    this.command("help", {
      help: "help [name] - all commands with a short description / a detailed guide to one",
      run: (args) => (args[0] ? this.guide(args[0]) : this.list()),
    });
    this.describe("help", {
      what: "Shows the console commands. Without a name - every command and variable, one per line, with a short description. With a name - a detailed guide: what it does, its arguments, examples.",
      args: [["name", "optional", "a command or variable to explain"]],
      examples: ["help", "help give", "help timescale"],
    });
    this.command("clear", { help: "clear - clear the console", run: () => { this.lines.length = 0; this.version++; } });
    this.command("echo", { help: "echo <text>", run: (args) => args.join(" ") });
  }

  // Подробная справка к команде / переменной (help <имя>)
  describe(name, info) {
    this.details.set(name.toLowerCase(), info);
  }

  // help: все команды и переменные — по строке: имя и краткое описание (из help: часть после « - »)
  list() {
    const short = (n, x) => {
      const h = String(x.help || "");
      const i = h.indexOf(" - ");
      return `${x.cheat ? "*" : " "}${n}${" ".repeat(Math.max(1, 16 - n.length))}${i >= 0 ? h.slice(i + 3) : h}`;
    };
    const sort = (m) => [...m].sort(([a], [b]) => a.localeCompare(b));
    const out = ["COMMANDS:", ...sort(this.commands).map(([n, x]) => short(n, x)), "VARIABLES (NAME - SHOW, NAME VALUE - SET):", ...sort(this.cvars).map(([n, x]) => short(n, x))];
    out.push("HELP <NAME> - DETAILED GUIDE. TAB - COMPLETE, UP/DOWN - HISTORY");
    if ([...this.commands.values(), ...this.cvars.values()].some((x) => x.cheat)) out.push(`* - CHEAT${this.allowCheats() ? "" : ": " + (this.cheatsOff?.() || "NOT ALLOWED HERE")}`);
    return out;
  }

  // help <имя>: что делает, как писать, аргументы (обязательные / нет), примеры
  guide(name) {
    const key = String(name).toLowerCase();
    const c = this.commands.get(key), v = this.cvars.get(key);
    if (!c && !v) {
      const near = this.complete(key);
      return [`unknown: ${name}`, ...(near.length ? [`maybe: ${near.slice(0, 8).join(", ")}`] : [])];
    }
    const x = c || v, d = this.details.get(key) || {};
    const h = String(x.help || key);
    const i = h.indexOf(" - ");
    const out = [`${key.toUpperCase()}${v ? " (VARIABLE)" : ""}${x.cheat ? " - CHEAT" : ""}`];
    out.push(`USAGE: ${i >= 0 ? h.slice(0, i) : h}`);
    out.push(d.what || (i >= 0 ? h.slice(i + 3) : ""));
    if (v) out.push(`NOW: ${key} = ${v.get()}${v.set ? "" : " (read-only)"}`);
    if (d.args?.length) {
      out.push("ARGUMENTS:");
      for (const [a, need, text] of d.args) out.push(`  ${need === "required" ? `<${a}>` : `[${a}]`} - ${need === "required" ? "REQUIRED" : "OPTIONAL"}: ${text}`);
    } else if (!v) out.push("ARGUMENTS: none");
    if (d.examples?.length) out.push("EXAMPLES:", ...d.examples.map((e) => `  ${e}`));
    for (const n of d.notes || []) out.push(`NOTE: ${n}`);
    if (x.cheat) out.push(`CHEAT: works only where cheats are allowed${this.allowCheats() ? "" : " - " + (this.cheatsOff?.() || "not allowed here")}`);
    return out.filter((l) => l !== "");
  }

  command(name, { help = "", run, cheat = false }) {
    this.commands.set(name.toLowerCase(), { help, run, cheat });
  }

  cvar(name, { help = "", get, set = null, cheat = false }) {
    this.cvars.set(name.toLowerCase(), { help, get, set, cheat });
  }

  print(text, color = null) {
    for (const t of String(text).split("\n")) this.lines.push({ text: t, color });
    if (this.lines.length > this.maxLines) this.lines.splice(0, this.lines.length - this.maxLines);
    this.version++;
  }

  error(text) {
    this.print(text, [255, 110, 100]);
  }

  // Строка -> слова; "в кавычках" — одно слово
  static split(line) {
    const out = [];
    for (const m of line.matchAll(/"([^"]*)"|(\S+)/g)) out.push(m[1] ?? m[2]);
    return out;
  }

  exec(line, { echo = true } = {}) {
    line = String(line).trim();
    if (!line) return;
    if (echo) {
      this.print("> " + line, [150, 170, 200]);
      if (this.history.at(-1) !== line) this.history.push(line);
      if (this.history.length > 100) this.history.shift();
    }
    for (const part of line.split(";")) {
      const [name, ...args] = DevConsole.split(part.trim());
      if (!name) continue;
      const key = name.toLowerCase();
      const c = this.commands.get(key);
      const v = this.cvars.get(key);
      if (!c && !v) {
        this.error(`unknown command: ${name} (help - list)`);
        continue;
      }
      if ((c || v).cheat && !this.allowCheats() && !(v && !args.length)) {
        this.error(`${name}: cheat - ${this.cheatsOff?.() || "not allowed here"}`);
        continue;
      }
      try {
        let out;
        if (c) out = c.run(args, this);
        else if (!args.length) out = `${key} = ${v.get()}`;
        else if (!v.set) out = `${key} is read-only`;
        else {
          v.set(args[0], args);
          out = `${key} = ${v.get()}`;
        }
        if (Array.isArray(out)) out.forEach((t) => this.print(t));
        else if (out !== undefined && out !== null && out !== "") this.print(out);
        this.log?.(`консоль: ${part.trim()}`);
      } catch (e) {
        this.error(`${name}: ${e.message}`);
      }
    }
  }

  // Подсказка по Tab: имена, начинающиеся с prefix
  complete(prefix) {
    const p = prefix.toLowerCase();
    return [...this.commands.keys(), ...this.cvars.keys()].filter((n) => n.startsWith(p)).sort();
  }
}

// Число из аргумента: не число — ошибка с понятным текстом
export function num(v, name = "value") {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}
