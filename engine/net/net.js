// ============================================================
//  Сеть — возможность движка: один компьютер — хост (сервер), остальные подключаются к нему по TCP.
//  Сообщения — обычные объекты (JSON), по одному на строку. Что в них — решает игра.
//
//    const server = new NetServer({ port: 27015 });
//    server.onConnect = (peer) => {};             // кто-то подключился (peer.id — номер)
//    server.onMessage = (peer, msg) => {};        // прислал сообщение
//    server.onDisconnect = (peer) => {};          // отключился (или связь оборвалась)
//    await server.listen();
//    server.send(peer, { t: "hello" });  server.broadcast({ t: "snap", ... }, exceptPeer);
//
//    const client = new NetClient();
//    client.onMessage = (msg) => {};  client.onClose = (reason) => {};
//    await client.connect("192.168.1.5", 27015);
//    client.send({ t: "state", ... });
//
//  Сообщения приходят событиями между кадрами; игра складывает их и разбирает в своём тике.
//  В одной сети (Wi‑Fi) — подключение по локальному адресу хоста; через интернет — Tailscale / ZeroTier
//  (или проброс порта на роутере). Порт по умолчанию — 27015.
// ============================================================

import net from "node:net";
import os from "node:os";

export const DEFAULT_PORT = 27015;
const MAX_LINE = 64 * 1024 * 1024; // одно сообщение не больше 64 МБ (мир при входе — несколько МБ)

// Поток байтов -> сообщения по строкам (TCP режет и склеивает куски как хочет)
function reader(socket, onMessage, onError) {
  let buf = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buf += chunk;
    if (buf.length > MAX_LINE) return onError(new Error("слишком длинное сообщение"));
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return onError(new Error("испорченное сообщение"));
      }
      onMessage(msg);
    }
  });
}

const write = (socket, msg) => {
  if (!socket.destroyed) socket.write(JSON.stringify(msg) + "\n");
};

export class NetServer {
  constructor({ port = DEFAULT_PORT, host = "0.0.0.0" } = {}) {
    this.port = port;
    this.host = host;
    this.peers = new Map(); // id -> peer { id, socket, address, data }
    this.nextId = 1;
    this.onConnect = null;
    this.onMessage = null;
    this.onDisconnect = null;
    this.server = net.createServer((socket) => this.accept(socket));
    this.stats = { sent: 0, received: 0, bytesOut: 0 };
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off("error", reject);
        this.port = this.server.address().port; // port 0 — свободный, какой дала система (тесты)
        resolve(this.port);
      });
    });
  }

  accept(socket) {
    socket.setNoDelay(true); // маленькие сообщения — сразу, не копим (иначе задержка ~40 мс)
    const peer = { id: this.nextId++, socket, address: socket.remoteAddress, data: {} };
    this.peers.set(peer.id, peer);
    const drop = (reason) => {
      if (!this.peers.has(peer.id)) return;
      this.peers.delete(peer.id);
      socket.destroy();
      this.onDisconnect?.(peer, reason);
    };
    reader(socket, (msg) => {
      this.stats.received++;
      this.onMessage?.(peer, msg);
    }, (e) => drop(e.message));
    socket.on("close", () => drop("отключился"));
    socket.on("error", (e) => drop(e.message));
    this.onConnect?.(peer);
  }

  send(peer, msg) {
    this.stats.sent++;
    write(peer.socket, msg);
  }

  // Всем (кроме except). Строка собирается один раз
  broadcast(msg, except = null) {
    if (!this.peers.size) return;
    const line = JSON.stringify(msg) + "\n";
    for (const p of this.peers.values()) {
      if (p === except || p.socket.destroyed) continue;
      p.socket.write(line);
      this.stats.sent++;
      this.stats.bytesOut += line.length;
    }
  }

  kick(peer, reason = "") {
    if (reason) this.send(peer, { t: "bye", reason });
    peer.socket.end();
  }

  close() {
    for (const p of this.peers.values()) p.socket.destroy();
    this.peers.clear();
    return new Promise((r) => this.server.close(() => r()));
  }
}

export class NetClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.onMessage = null;
    this.onClose = null;
  }

  connect(host, port = DEFAULT_PORT, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        s.destroy();
        reject(new Error(`нет ответа от ${host}:${port}`));
      }, timeoutMs);
      s.once("connect", () => {
        clearTimeout(timer);
        s.setNoDelay(true);
        this.socket = s;
        this.connected = true;
        resolve();
      });
      s.once("error", (e) => {
        clearTimeout(timer);
        if (!this.connected) reject(e);
      });
      reader(s, (msg) => this.onMessage?.(msg), (e) => this.close(e.message));
      s.on("close", () => this.close("связь оборвалась"));
    });
  }

  send(msg) {
    if (this.connected) write(this.socket, msg);
  }

  close(reason = "отключились") {
    if (!this.connected && !this.socket) return;
    const was = this.connected;
    this.connected = false;
    this.socket?.destroy();
    this.socket = null;
    if (was) this.onClose?.(reason);
  }
}

// Адреса этого компьютера (показать хосту: «к тебе подключаться так»). Сначала домашняя сеть (192.168.*,
// 10.*, 172.16–31.*), потом Tailscale / ZeroTier (100.64–127.*), остальное — в конце. Без 169.254.* (адрес
// «сети нет») и без виртуальных адаптеров (VirtualBox, Hyper-V, WSL, VMware, Docker) — на Windows их много
export function localAddresses() {
  const rank = (ip, name) => {
    if (/virtualbox|vmware|vethernet|hyper-v|wsl|docker|loopback/i.test(name)) return 9;
    if (ip.startsWith("169.254.")) return 10;
    if (ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 0;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return 1;
    return 5;
  };
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push({ ip: a.address, r: rank(a.address, name) });
  }
  return out.filter((a) => a.r < 10).sort((a, b) => a.r - b.r).map((a) => a.ip);
}
