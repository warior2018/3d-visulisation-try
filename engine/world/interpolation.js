// ============================================================
//  Сглаживание между тиками. Мир считается тиками (60 в секунду, engine.fixed), а кадров может быть больше
//  (144 Гц) или они идут не в такт тикам. Если рисовать тело там, где оно стоит по последнему тику, оно
//  сдвигается рывками раз в 2–3 кадра — мелкая дрожь при ходьбе. Поэтому рисуем «между»: от места до
//  последнего тика к месту после него, на долю alpha (сколько времени прошло к следующему тику).
//  Картинка отстаёт от мира не больше чем на один тик (1/60 с), зато движется ровно.
//
//    capture(list)        — в начале каждого тика: запомнить, где все стоят (prevPosition, prevYaw)
//    blend(list, alpha)   — раз в кадр после тиков: renderPosition / renderYaw — где рисовать
//
//  Рисуют по renderPosition / renderYaw (models.drawList; нет их — по position / yaw). Сама игра (удары,
//  физика, мозги) по-прежнему смотрит на position. Перенеслись далеко за тик (телепорт, появление) — не тянем
//  через весь мир, а сразу рисуем на новом месте (snap, метров).
// ============================================================

import { Vec3 } from "../math/vec3.js";

const TAU = Math.PI * 2;

export function capture(list) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i], p = e.position;
    const q = (e.prevPosition ||= new Vec3(0, 0, 0));
    q.x = p.x;
    q.y = p.y;
    q.z = p.z;
    e.prevYaw = e.yaw;
  }
}

export function blend(list, alpha, snap = 3) {
  const s2 = snap * snap;
  for (let i = 0; i < list.length; i++) {
    const e = list[i], p = e.position, q = e.prevPosition;
    const r = (e.renderPosition ||= new Vec3(0, 0, 0));
    if (!q) {
      // появился внутри тика — пока рисуем как есть
      r.x = p.x;
      r.y = p.y;
      r.z = p.z;
      e.renderYaw = e.yaw;
      continue;
    }
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const k = dx * dx + dy * dy + dz * dz > s2 ? 1 : alpha;
    r.x = q.x + dx * k;
    r.y = q.y + dy * k;
    r.z = q.z + dz * k;
    // поворот — коротким путём (с 179° на −179° — через 180°, а не через 0°)
    if (e.yaw === undefined || e.prevYaw === undefined) e.renderYaw = e.yaw;
    else {
      let d = (e.yaw - e.prevYaw) % TAU;
      if (d > Math.PI) d -= TAU;
      else if (d < -Math.PI) d += TAU;
      e.renderYaw = e.prevYaw + d * k;
    }
  }
}
