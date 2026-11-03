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
//  cheat: true — команда меняет игру (выдать, призвать, бессмертие): игра может их запретить (allowCheats)
// ============================================================

export class DevConsole {
  constructor({ maxLines = 300, log = null } = {}) {
    this.commands = new Map(); // имя -> { help, run, cheat }
    this.cvars = new Map(); //    имя -> { help, get, set, cheat }
    this.lines = []; //           { text, color }
    this.history = []; //         введённые строки (стрелки вверх / вниз)
    this.maxLines = maxLines;
    this.log = log; //            куда ещё писать (журнал игры)
    this.allowCheats = () => true; // игра решает (например, гость сетевой игры — нельзя)
    this.version = 0; //          растёт при каждой новой строке (окну — перерисоваться)
    this.command("help", {
      help: "help [command] - list commands / describe one",
      run: (args) => {
        if (args[0]) {
          const c = this.commands.get(args[0].toLowerCase()) || this.cvars.get(args[0].toLowerCase());
          return c ? c.help || args[0] : `unknown: ${args[0]}`;
        }
        // * — чит: работает, только где читы разрешены (allowCheats)
        const mark = (n, x) => (x.cheat ? "*" : "") + n;
        const names = [...[...this.commands].map(([n, x]) => mark(n, x)), ...[...this.cvars].map(([n, x]) => mark(n, x) + " (var)")].sort((a, b) => a.replace("*", "").localeCompare(b.replace("*", "")));
        const out = ["COMMANDS: " + names.join(", "), "HELP <NAME> - DETAILS. TAB - COMPLETE, UP/DOWN - HISTORY"];
        if (names.some((n) => n.startsWith("*"))) out.push(`* - CHEAT${this.allowCheats() ? "" : ": " + (this.cheatsOff?.() || "NOT ALLOWED HERE")}`);
        return out;
      },
    });
    this.command("clear", { help: "clear - clear the console", run: () => { this.lines.length = 0; this.version++; } });
    this.command("echo", { help: "echo <text>", run: (args) => args.join(" ") });
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
