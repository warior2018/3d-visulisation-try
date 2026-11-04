// Звук: микшер (голоса, отмотка, долив), каналы громкости, музыка с плавной сменой, стены глушат, эхо;
// в игре — музыка боя при враге рядом
import path from "node:path";
export default async function (t, g) {
  const { E, scene, root } = g;
  // поддельное устройство: считаем, что в очереди всё, что положили, минус «проигранное»
  const dev = { q: 0, puts: [], play() {}, clear() { this.q = 0; }, put(b) { this.q += b.length; this.puts.push(b); }, queued() { return this.q; }, close() {} };
  const s = new E.Sound({ device: dev });
  s.define("beep", E.tone(800, 800, 100, 1));
  s.play("beep");
  const first = new Float32Array(dev.puts.at(-1).buffer.slice(0));
  t.check("звук сразу в очереди (смесь на LEAD вперёд)", dev.q === Math.round(E.LEAD * 48000) * 8);
  t.check("звук звучит с первого сэмпла", Math.abs(first[2]) > 0 || Math.abs(first[3]) > 0 || Math.abs(first[20]) > 0);
  // половина «проиграна» → второй звук: очередь пересобрана с ним, первый не потерян
  dev.q = Math.round(dev.q / 2);
  s.play("beep", { volume: 0.5 });
  t.check("два голоса", s.voices.length === 2);
  t.check("первый отмотан, а не начат заново", s.voices[0].pos > 0 && s.voices[0].pos < s.sounds.beep.length + 48000);
  // каналы
  s.setChannels({ effects: 0 });
  const before = dev.puts.length;
  s.play("beep");
  t.check("канал эффектов на 0 — не играет", dev.puts.length === before);
  s.setChannels({ effects: 1 });
  // музыка: петля, плавная смена
  s.defineMusic("a", new Float32Array(48000).fill(0.3));
  s.defineMusic("b", new Float32Array(48000).fill(-0.3));
  s.music("a", { fade: 0.1 });
  dev.q = 0; s.update();
  const musA = s.voices.find((v) => v.name === "a");
  t.check("музыка играет и громкость нарастает", musA && musA.gain > 0.5, musA?.gain);
  for (let i = 0; i < 10; i++) { dev.q = 0; s.update(); }
  t.check("петля не кончается", s.voices.some((v) => v.name === "a"));
  s.music("b", { fade: 0.1 });
  for (let i = 0; i < 4; i++) { dev.q = 0; s.update(); }
  t.check("сменили трек: старый затих и убран, новый играет", !s.voices.some((v) => v.name === "a") && s.voices.some((v) => v.name === "b" && v.gain > 0.9));
  s.music("b");
  t.check("тот же трек — без перезапуска", s.voices.filter((v) => v.name === "b").length === 1);
  s.setChannels({ music: 0 });
  dev.q = 0; s.update();
  const silent = new Float32Array(dev.puts.at(-1).buffer.slice(0));
  t.check("громкость музыки 0 — тишина", silent.every((v) => v === 0));
  // окно не в фокусе (Alt+Tab) — тишина: очередь пуста, новые звуки не идут; вернулись — музыка дальше
  s.setChannels({ music: 1 });
  dev.q = 0; s.update();
  s.setFocused(false);
  const putsBefore = dev.puts.length;
  t.check("без фокуса очередь очищена", dev.q === 0);
  s.play("beep"); dev.q = 0; s.update();
  t.check("без фокуса ничего не играет", dev.puts.length === putsBefore);
  s.setFocused(true);
  t.check("в фокусе — музыка снова в очереди", dev.q > 0 && s.voices.some((v) => v.name === "b"));
  // окружение: стены глушат (тише и без высоких), эхо длиннее
  const src = E.noise(200, 1, 0);
  const m = E.processSamples(src, { muffle: 1 }), e = E.processSamples(src, { echo: 1 });
  const energy = (a) => a.reduce((x, v) => x + v * v, 0);
  t.check("сквозь стену тише", energy(m) < energy(src) * 0.5);
  t.check("эхо — звук длиннее", e.length > src.length);
  // WAV туда и обратно
  const W = await import(path.join(root, "games", "builder", "music.js"));
  t.check("треки музыки есть", ["calm", "battle", "invasion"].every((k) => typeof W.MUSIC[k] === "function"));
  // игра: стена между ушами и звуком — глуше; рядом враг на героя — музыка боя
  const o = scene.look.position;
  const at = { x: o.x + 6, y: o.y, z: o.z };
  for (let y = -2; y < 3; y++) for (let z = -2; z < 3; z++) scene.world.place(Math.floor(o.x) + 3, Math.floor(o.y) + y, Math.floor(o.z) + z, [90, 90, 90]);
  const env = scene.soundEnvironment(at);
  t.check("стена между — звук глуше", env && env.muffle > 0, JSON.stringify(env));
  for (let y = -2; y < 3; y++) for (let z = -2; z < 3; z++) scene.world.remove(Math.floor(o.x) + 3, Math.floor(o.y) + y, Math.floor(o.z) + z);
  const mob = scene.spawn("skeleton", { x: g.player.position.x + 5, y: g.player.position.y, z: g.player.position.z });
  mob.aggro = g.player;
  scene.audioIn = 0;
  scene.updateAudio(0.01);
  t.check("враг охотится рядом — музыка боя", scene.engine.sound.current === "battle", scene.engine.sound.current);
  scene.removeEntity(mob);
}
