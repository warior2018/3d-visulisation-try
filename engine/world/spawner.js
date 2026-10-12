// ============================================================
//  Спавнер: раз в interval секунд создаёт что-то в случайной точке области.
//  ЧТО создавать, решает игра — функцией spawn(x, z). Спавнер только считает
//  время, выбирает место и следит, чтобы их не стало больше max.
//
//    const spawner = new Spawner({ interval: 30, area: [-25, -25, 25, 25], max: 20,
//      count: () => skeletons.length, spawn: (x, z) => createSkeleton(x, z) });
//    spawner.update(dt); // каждый кадр
//
//  Вместо области — круг вокруг точки (например, героя): around: () => player.position,
//  radius — до какого расстояния (дальность прорисовки), minRadius — не ближе этого.
//    new Spawner({ around: () => hero.position, radius: 60, minRadius: 12, ... })
//  interval и max можно менять на ходу (нашествие: чаще и больше).
//
//  spawner.spawned — сколько уже создал за всю игру (сохраняй и восстанавливай).
//  spawn получает и номер появления: spawn(x, z, index) — index 0, 1, 2...
//  Так игра может делать каждого следующего врага сильнее.
// ============================================================

export class Spawner {
  constructor({ interval = 30, chance = 1, area = [-25, -25, 25, 25], around = null, radius = 30, minRadius = 0, max = Infinity, count = () => 0, spawn, avoid = null, random = Math.random }) {
    this.interval = interval; // секунд между появлениями
    this.chance = chance; //     шанс, что появится (0.25 — редко: в среднем раз в 4 интервала)
    this.area = area; //         [minX, minZ, maxX, maxZ]
    this.around = around; //     () => { x, z } — центр круга (если задан, area не нужна)
    this.radius = radius; //     радиус круга
    this.minRadius = minRadius; // и «дырка» в середине
    this.max = max; //           больше этого не создаём
    this.count = count; //       сколько уже есть
    this.spawn = spawn; //       (x, z) => создать
    this.avoid = avoid; //       (x, z) => true, если это место не подходит (например, слишком близко к игроку)
    this.random = random;
    this.timer = 0;
    this.spawned = 0; //      сколько создано за всё время
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < this.interval) return;
    this.timer -= this.interval;
    if (this.count() >= this.max) return;
    if (this.random() >= this.chance) return; // не повезло — ждём следующего раза

    // Несколько попыток найти подходящее место
    for (let i = 0; i < 10; i++) {
      const { x, z } = this.pickPoint();
      if (this.avoid?.(x, z)) continue;
      this.spawn(x, z, this.spawned++);
      return;
    }
  }

  // Случайная точка: в круге вокруг around() (равномерно по площади кольца) или в области area
  pickPoint() {
    if (this.around) {
      const c = this.around();
      const a = this.random() * Math.PI * 2;
      const r0 = this.minRadius * this.minRadius;
      const r = Math.sqrt(r0 + this.random() * (this.radius * this.radius - r0)); // корень — чтобы не густело у центра
      return { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r };
    }
    const [x0, z0, x1, z1] = this.area;
    return { x: x0 + this.random() * (x1 - x0), z: z0 + this.random() * (z1 - z0) };
  }
}
