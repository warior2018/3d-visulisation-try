// ============================================================
//  Команды консоли «Стройки» (консоль — движок: engine/core/console.js, клавиша `).
//  Читы (выдать, призвать, бессмертие...) — в одиночной игре и у хоста; у гостя сетевой игры — нельзя.
//  Список — команда help; подробно — help <имя>.
// ============================================================

import { num } from "../../../engine/index.js";
import { CREATURES } from "../creatures.js";
import { ITEMS, isWeapon, isArmor } from "../items.js";
import { CLASSES } from "../config.js";
import { rarityData } from "./loot.js";
import { SKIN_TARGETS, skinTarget, skinOf } from "../skins.js";

export function registerCommands(g) {
  const c = g.engine.console;
  // Читы — только в мире, где их включили при создании (info.cheats; в старых мирах — включены), и не у гостя
  c.allowCheats = () => g.role !== "client" && g.cheats !== false;
  c.cheatsOff = () => (g.role === "client" ? "not for a guest of a network game" : "cheats are off in this world (a checkbox when you create a world)");
  const ahead = (dist) => {
    const p = g.player.position, y = g.look.yaw;
    const x = p.x + Math.sin(y) * dist, z = p.z + Math.cos(y) * dist;
    return { x, y: g.world.surfaceY(x, z), z };
  };

  c.command("god", { help: "god - invulnerability on/off", cheat: true, run: () => `GOD ${(g.god = !g.god) ? "ON" : "OFF"}` });
  c.command("heal", { help: "heal - full health and mana", cheat: true, run: () => {
    g.player.stats.hp = g.player.stats.maxHp;
    if (g.player.stats.maxMana) g.player.stats.mana = g.player.stats.maxMana;
    return "HEALED";
  } });
  c.cvar("luck", { help: "luck <0..10> - extra luck (gear drops: chance and rarity), on top of talents", cheat: true, get: () => +(g.luckBonus || 0).toFixed(2), set: (v) => { g.luckBonus = Math.max(0, Math.min(10, num(v))); } });
  c.command("give", { help: "give <item> [count] [rare|epic|legendary] - item to inventory (no item - list)", cheat: true, run: ([id, n, rarity]) => {
    if (!id) return "ITEMS: " + Object.keys(ITEMS).join(", ");
    if (!ITEMS[id]) throw new Error(`no item "${id}" (give - list)`);
    const count = n ? Math.max(1, Math.round(num(n, "count"))) : 1;
    const left = isWeapon(id) || isArmor(id) ? g.giveItem(id, count, rarityData(rarity)) : g.giveResource(id, count);
    return `GIVEN ${count - left} ${id}${left ? ` (NO ROOM FOR ${left})` : ""}`;
  } });
  c.command("spawn", { help: "spawn <creature> [count] - in front of you (no name - list)", cheat: true, run: ([type, n]) => {
    if (!type) return "CREATURES: " + Object.keys(CREATURES).filter((t) => t !== "player").join(", ");
    if (!CREATURES[type] || type === "player") throw new Error(`no creature "${type}"`);
    const count = Math.min(50, n ? Math.max(1, Math.round(num(n, "count"))) : 1);
    for (let i = 0; i < count; i++) {
      const at = ahead(5 + (i % 5));
      g.spawn(type, { x: at.x + ((i / 5) | 0) * 1.2, y: at.y, z: at.z, yaw: g.look.yaw + Math.PI });
    }
    return `SPAWNED ${count} ${type}`;
  } });
  c.command("killall", { help: "killall [creature] - kill all mobs (or one kind)", cheat: true, run: ([type]) => {
    let n = 0;
    for (const e of g.entities.list) if (e.alive && e.kind === "mob" && !e.remote && (!type || e.type === type)) { e.damage(e.stats.hp); n++; }
    return `KILLED ${n}`;
  } });
  c.command("xp", { help: "xp <amount> - gain experience", cheat: true, run: ([n]) => { g.gainXp(num(n, "amount")); return `LEVEL ${g.experience.level}`; } });
  c.command("points", { help: "points <n> - add talent points", cheat: true, run: ([n]) => { g.talents.points += Math.round(num(n, "n")); return `TALENT POINTS ${g.talents.points}`; } });
  c.command("class", { help: "class <id> - choose class (no id - list)", cheat: true, run: ([id]) => {
    if (!id) return "CLASSES: " + Object.keys(CLASSES).join(", ");
    if (!CLASSES[id]) throw new Error(`no class "${id}"`);
    g.chooseClass(id);
    return `CLASS ${CLASSES[id].name}`;
  } });
  c.command("tp", { help: "tp <x> <z> | tp <x> <y> <z> - teleport (no y - onto the ground)", cheat: true, run: (a) => {
    const [x, y, z] = a.length >= 3 ? a.map((v) => num(v)) : [num(a[0], "x"), null, num(a[1], "z")];
    const p = g.player.position;
    p.x = x; p.z = z;
    p.y = y ?? g.world.surfaceY(x, z);
    g.player.velocity.x = g.player.velocity.y = g.player.velocity.z = 0;
    g.groundY = undefined; // перенос — не прыжок: урона от падения за него нет
    return `AT ${x.toFixed(1)} ${p.y.toFixed(1)} ${z.toFixed(1)}`;
  } });
  // Разгон героя (MOVEMENT) — подбор ощущения: move_ground 0.2, move_air 0.3... (0 — мгновенно). Не чит:
  // только «как ощущается», скорость та же
  for (const [k, what] of [["ground", "reach walk speed on the ground"], ["stop", "stop on the ground"], ["air", "change direction in the air"], ["airStop", "stop in the air"], ["over", "lose extra speed after a dash"]]) {
    c.cvar(`move_${k.toLowerCase()}`, { help: `move_${k.toLowerCase()} <seconds> - time to ${what} (0 - instant)`, get: () => g.controller?.accel?.[k] ?? 0, set: (v) => {
      const n = Math.max(0, Math.min(3, num(v)));
      g.controller.accel ||= {};
      g.controller.accel[k] = n || 0.001;
    } });
  }
  c.cvar("daytime", { help: "daytime <0..1> - time of day (0 midnight, 0.5 noon)", cheat: true, get: () => +(g.dayTime ?? 0).toFixed(3), set: (v) => { g.dayTime = ((num(v) % 1) + 1) % 1; } });
  c.cvar("daynight", { help: "daynight 0/1 - day and night cycle", get: () => (g.engine.settings.data.general.dayNight !== false ? 1 : 0), set: (v) => { g.engine.settings.data.general.dayNight = v !== "0"; g.engine.settings.save(); } });
  // Скины — не чит (только внешний вид)
  c.command("skin", { help: "skin <target> [skin] - change a skin (no target - list, no skin - choices)", run: ([id, sk]) => {
    const S = g.engine.settings.data;
    if (!id) return SKIN_TARGETS.map((t) => `${t.id}: ${skinOf(S, t).id} (${t.skins.map((s) => s.id).join(", ")})`);
    const t = skinTarget(id);
    if (!t) throw new Error(`no such target: ${id} (skin - list)`);
    if (!sk) return `${t.id}: ${skinOf(S, t).id} (${t.skins.map((s) => s.id).join(", ")})`;
    const s = t.skins.find((x) => x.id === sk.toLowerCase());
    if (!s) throw new Error(`no such skin for ${t.id}: ${sk}`);
    S.skins[t.id] = s.id;
    g.engine.settings.save();
    g.refreshSkins();
    return `${t.id}: ${s.id}`;
  } });
  c.command("pos", { help: "pos - where you are", run: () => { const p = g.player.position; return `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}, YAW ${Math.round((g.look.yaw * 180) / Math.PI)}`; } });
  c.command("invasion", { help: "invasion start [seconds] | stop", cheat: true, run: ([what, s]) => {
    if (what === "stop") { g.invasion.stop(); return "INVASION STOPPED"; }
    g.invasion.start(s ? num(s, "seconds") : undefined);
    return "INVASION STARTED";
  } });
  c.command("save", { help: "save - save the game", run: () => { g.save(false); return "SAVED"; } });
  c.command("mobs", { help: "mobs - how many creatures and of which kind", run: () => {
    const by = {};
    for (const e of g.entities.list) if (e.alive && e !== g.player) by[e.type] = (by[e.type] || 0) + 1;
    return Object.entries(by).map(([t, n]) => `${t} ${n}`).join(", ") || "NONE";
  } });
  c.command("net", { help: "net - network game status", run: () => g.netStatus?.() ?? "SOLO GAME" });
  c.command("say", { help: "say <text> - chat message", run: (a) => { g.chat?.send(a.join(" ")); } });
}

