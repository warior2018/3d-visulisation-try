// Консоль: help — все команды с кратким описанием (по строке); help <имя> — подробный гайд: что делает,
// как писать, аргументы (обязательные / нет), примеры. У каждой команды и переменной гайд есть
export default async function (t, g) {
  const c = g.engine.console;
  c.lines.length = 0;
  c.exec("help");
  const text = c.lines.map((l) => l.text);
  t.check("help: каждая команда и переменная — своей строкой", [...c.commands.keys(), ...c.cvars.keys()].every((n) => text.some((l) => l.trim().replace(/^\*/, "").startsWith(n + " "))), text.slice(0, 5).join(" | "));
  c.lines.length = 0;
  c.exec("help give");
  const gv = c.lines.map((l) => l.text).join("\n");
  t.check("help give: как писать, аргументы, примеры", /USAGE: give <item>/.test(gv) && /ARGUMENTS:/.test(gv) && /\[count\] - OPTIONAL/.test(gv) && /EXAMPLES:/.test(gv) && /give katana 1 legendary/.test(gv), gv);
  c.lines.length = 0;
  c.exec("help timescale");
  const ts = c.lines.map((l) => l.text).join("\n");
  t.check("help переменной: значение сейчас", /NOW: timescale = /.test(ts));
  const missing = [...c.commands.keys(), ...c.cvars.keys()].filter((n) => !c.details.has(n));
  t.check("у каждой команды и переменной есть подробный гайд", !missing.length, missing.join(", "));
  c.lines.length = 0;
  c.exec("help gve");
  t.check("help с опечаткой — подсказка", c.lines.some((l) => /unknown: gve/.test(l.text)));
}
