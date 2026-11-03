// Частицы в 3D: летят, падают, гаснут; удар — брызги цвета существа; взрыв — огонь и дым; лучи (трассеры)
// при 3D-частицах идут частицами, а не плоским слоем
export default async function (t, g) {
  const { scene, E } = g;
  const fx = new E.Particles();
  fx.burst({ x: 0, y: 5, z: 0 }, { count: 20, speed: 3, life: 0.5, gravity: 10, color: [200, 0, 0] });
  fx.update(0.016);
  t.check("брызги: 20 частиц, по 8 чисел", fx.count === 20 && fx.data.length >= 160);
  for (let i = 0; i < 20; i++) fx.update(0.016);
  t.check("падают (тяжесть)", fx.list.every((p) => p.vy < 3));
  t.check("гаснут к концу жизни", fx.data[7] < 1, fx.data[7].toFixed(2));
  for (let i = 0; i < 40; i++) fx.update(0.016);
  t.check("отжили — пропали", fx.count === 0);
  fx.line({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { step: 0.5 });
  t.check("линия: кубики через каждые step", fx.list.length === 21);
  // в игре
  scene.fx.clear();
  scene.beams.particles = scene.fx;
  const mob = scene.spawn("skeleton", { x: g.player.position.x + 3, y: g.player.position.y, z: g.player.position.z });
  mob.receive(new E.Damage({ amount: 10, source: g.player }));
  t.check("удар по скелету — костяная крошка", scene.fx.list.length > 0 && scene.fx.list[0].color[0] > 200, scene.fx.list[0]?.color.join(","));
  scene.fx.clear();
  scene.boomFx({ x: 0, y: 5, z: 0 }, 2);
  t.check("взрыв — огонь и дым", scene.fx.list.some((p) => p.color === g.C.FX.smoke) && scene.fx.list.some((p) => p.color === g.C.FX.fire));
  scene.fx.clear();
  scene.beams.add({ from: { x: 0, y: 5, z: 0 }, to: { x: 5, y: 5, z: 0 }, life: 0.3 });
  t.check("луч при 3D-частицах — частицами (не плоско)", scene.fx.list.length > 5 && scene.beams.list.length === 0);
  scene.removeEntity(mob);
  scene.fx.clear();
}
