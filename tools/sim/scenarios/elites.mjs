// Элитные мобы: крупнее и крепче, гарантированная вещь не ниже RARE; ауры — шипы возвращают ближний урон,
// лекарь лечит соседей, бешенство усиливает удары соседей, быстрый — быстрее; элита не сохраняется
export default async function (t, g) {
  const { scene, C, E } = g;
  const p = g.player;
  for (const e of [...scene.entities.list]) if (e !== p && e.kind === "mob") scene.removeEntity(e);
  const at = (dx, dz) => ({ x: p.position.x + dx, y: p.position.y, z: p.position.z + dz });
  const base = scene.spawn("skeleton", at(30, 0));
  const el = scene.spawn("skeleton", at(30, 3));
  scene.makeElite(el, "healer");
  t.check("элита крепче и больше", el.stats.maxHp === Math.round(base.stats.maxHp * C.ELITE.hp) && el.scale > (base.scale ?? 1));
  t.check("гарантированная вещь не ниже RARE", (() => { for (let i = 0; i < 20; i++) { const r = scene.rollGear(el); if (!r || r.rarity === "common") return false; } return true; })());
  // лекарь лечит соседа
  base.stats.hp = 10;
  await g.frames(80);
  t.check("лекарь лечит соседа", base.stats.hp > 10, base.stats.hp);
  // шипы
  const th = scene.spawn("skeleton", at(30, -3));
  scene.makeElite(th, "thorns");
  const hp0 = p.stats.hp;
  th.receive(new E.Damage({ amount: 40, source: p, kind: "melee" }));
  t.check("шипы: ближний урон частью вернулся герою", p.stats.hp < hp0, `${hp0} → ${p.stats.hp}`);
  // быстрый
  const sw = scene.spawn("skeleton", at(30, 6));
  scene.makeElite(sw, "swift");
  t.check("быстрый — бонус скорости", sw.speedBonuses.elite === C.ELITE.auras.swift.speed);
  // бешенство
  const fr = scene.spawn("skeleton", at(-30, 0));
  const near = scene.spawn("skeleton", at(-30, 2));
  scene.makeElite(fr, "frenzy");
  await g.frames(3);
  t.check("бешенство: сосед бьёт сильнее", near.statuses.some((s) => s.id === "frenzy"));
  // сохранение без элиты
  const saved = scene.entities.list.filter((e) => e !== p && e.alive && !e.boss && !e.elite && e.type !== "steed");
  t.check("элита не в сохранении", !saved.includes(el) && saved.includes(base));
}
