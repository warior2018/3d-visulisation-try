// ============================================================
//  Заметность цели для мобов (engine/ai/hostile.js → nearestEnemy): радиус, с которого моб замечает цель,
//  умножается на entity.noticeScale. Множители — по причинам, складываются произведением:
//
//    setNotice(hero, "crouch", 0.55); // присед — замечают с 55 % радиуса
//    setNotice(hero, "cloak", 0.3);   // (например, талант или броня)
//    setNotice(hero, "crouch", null); // встал — причины больше нет
// ============================================================

export function setNotice(e, key, mult) {
  e.noticeMods ||= {};
  if (mult === null || mult === undefined || mult === 1) delete e.noticeMods[key];
  else e.noticeMods[key] = mult;
  e.noticeScale = Object.values(e.noticeMods).reduce((k, m) => k * m, 1);
}
