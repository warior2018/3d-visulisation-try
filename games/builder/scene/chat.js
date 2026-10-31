// ============================================================
//  Чат (клавиша Enter): сообщения игроков сетевой игры и системные (подключился, вышел). Строка,
//  начинающаяся с «/», — команда консоли (как в Minecraft): /give stone 10.
//  В одиночной игре — тоже работает (себе и для команд). Сообщения видны внизу слева ~12 с (hud.js: chat).
// ============================================================

import { LineInputScene } from "../../../engine/index.js";

const SHOW = 12; // секунд видно сообщение

export class Chat {
  constructor(g) {
    this.g = g;
    this.messages = []; // { from, text, color, at }
    this.history = [];
  }

  open() {
    this.g.engine.push(new LineInputScene({ prompt: "SAY:", history: this.history, onDone: (t) => this.send(t) }));
  }

  // Своё сообщение: «/команда» — в консоль; иначе — всем (сеть) и себе
  send(text) {
    text = String(text || "").slice(0, 120);
    if (!text) return;
    const g = this.g;
    if (text.startsWith("/")) {
      const con = g.engine.console;
      const before = con.lines.length;
      con.exec(text.slice(1));
      for (const l of con.lines.slice(before + 1)) this.add("", l.text, l.color || [180, 200, 230]);
      return;
    }
    const name = g.net?.myName || "YOU";
    this.add(name, text);
    g.net?.sendChat(text);
  }

  add(from, text, color = null) {
    this.messages.push({ from, text: String(text).slice(0, 160), color, at: performance.now() });
    if (this.messages.length > 50) this.messages.shift();
    this.g.engine.log(`чат: ${from ? from + ": " : ""}${text}`);
  }

  system(text) {
    this.add("", text, [240, 210, 130]);
  }

  // Что видно сейчас (последние 6 за SHOW секунд; пока чат открыт — последние 10 без срока)
  visible() {
    const now = performance.now();
    const open = this.g.engine.scene instanceof LineInputScene;
    const list = open ? this.messages.slice(-10) : this.messages.filter((m) => now - m.at < SHOW * 1000).slice(-6);
    return list;
  }
}
