// ============================================================
//  Езда верхом — возможность движка. Существу можно дать Rideable:
//  на нём сидят (seat — высота седла), а управляет им всадник —
//  тем же CharacterController, что и героем, но со скоростью скакуна.
//
//    boar.rideable = new Rideable({ seat: 0.75, speed: 6.5, jumpHeight: 1.1 });
//    mount(player, boar, { input, physics }); // сесть: вернёт контроллер скакуна
//    updateRider(player);                      // каждый кадр: всадник — в седле
//    dismount(player, physics);                // слезть рядом
//
//  Пока на существе сидят, его «мозги» не думают (игра пропускает brain у steed.rider).
// ============================================================

import { CharacterController } from "./character-controller.js";

export class Rideable {
  constructor({ seat = 0.75, speed = 6, runMultiplier = 1.4, jumpHeight = 1.1 } = {}) {
    this.seat = seat; //               на какой высоте сидит всадник (от ног скакуна)
    this.speed = speed; //             скорость под седлом
    this.runMultiplier = runMultiplier;
    this.jumpHeight = jumpHeight;
  }
}

// Сесть на steed. Вернёт CharacterController для скакуна (им рулит всадник)
export function mount(rider, steed, { input, physics }) {
  const r = steed.rideable;
  if (!r || steed.rider) return null;
  steed.rider = rider;
  rider.mount = steed;
  steed.velocity.x = steed.velocity.z = 0;
  updateRider(rider);
  return new CharacterController(steed, input, physics, { speed: r.speed, runMultiplier: r.runMultiplier, jumpHeight: r.jumpHeight });
}

// Всадник — в седле: там, где скакун, на высоте седла; своя скорость — ноль
export function updateRider(rider) {
  const s = rider.mount;
  if (!s) return;
  rider.position.x = s.position.x;
  rider.position.y = s.position.y + s.rideable.seat;
  rider.position.z = s.position.z;
  rider.velocity.x = rider.velocity.y = rider.velocity.z = 0;
  rider.onGround = true;
}

// Слезть: встаём рядом со скакуном (справа, слева, сзади, спереди — где свободно), иначе — сверху
export function dismount(rider, physics) {
  const s = rider.mount;
  if (!s) return;
  s.rider = null;
  rider.mount = null;
  const side = s.radius + rider.radius + 0.15;
  const right = { x: -Math.cos(s.yaw), z: Math.sin(s.yaw) };
  const back = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
  const tries = [right, { x: -right.x, z: -right.z }, back, { x: -back.x, z: -back.z }];
  for (const d of tries) {
    rider.position.x = s.position.x + d.x * side;
    rider.position.y = s.position.y;
    rider.position.z = s.position.z + d.z * side;
    if (!physics.collides(rider)) return;
  }
  rider.position.x = s.position.x;
  rider.position.y = s.position.y + s.height + 0.05;
  rider.position.z = s.position.z;
}
