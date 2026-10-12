// ============================================================
//  Отдача (recoil) — возможность движка. После выстрела ствол (а с ним взгляд)
//  подбрасывает вверх и чуть вбок; потом прицел сам частично возвращается.
//
//  У каждого оружия — своя «схема» (как в CS): список бросков для 1-го, 2-го, 3-го...
//  выстрела подряд. Дальше последнего — повторяем последний. Пауза между выстрелами
//  дольше resetTime — схема начинается сначала.
//
//    weapon.recoil = {
//      pattern: [[1.2, 0.2], [1.4, -0.3], ...], // [вверх, вбок] в градусах (вбок: + вправо)
//      scale: 1,          // общий уровень отдачи оружия
//      random: 0.15,      // разброс вбок ± (градусы) — каждый раз немного по-разному
//      recovery: 0.8,     // какая доля броска потом вернётся сама (0 — ничего, 1 — всё)
//      recoverSpeed: 12,  // как быстро возвращается (градусов в секунду)
//      aim: 0.6,          // в прицеле отдача × aim (держим крепче)
//      resetTime: 0.45,   // через столько секунд без выстрелов схема — заново
//    };
//
//    recoil.kick(weapon.recoil, aimT);           // выстрелили
//    const d = recoil.update(dt);                // каждый кадр: { yaw, pitch } в радианах
//    camera.yaw += d.yaw; camera.pitch += d.pitch;
// ============================================================

const DEG = Math.PI / 180;

export class Recoil {
  constructor({ kickTime = 0.06, recoverDelay = 0.12, random = Math.random } = {}) {
    this.kickTime = kickTime; //         за сколько секунд взгляд «доезжает» до броска
    this.recoverDelay = recoverDelay; // пауза перед возвратом
    this.random = random;
    this.pending = { pitch: 0, yaw: 0 }; //     ещё не применённая часть броска (градусы)
    this.recoverable = { pitch: 0, yaw: 0 }; // сколько вернём сами
    this.cfg = null;
    this.shot = 0; //       номер выстрела в схеме
    this.sinceShot = Infinity;
  }

  // Выстрел оружием с настройками cfg; aimT — 0..1, насколько прицелились
  kick(cfg, aimT = 0) {
    if (!cfg?.pattern?.length) return;
    if (this.sinceShot > (cfg.resetTime ?? 0.45)) this.shot = 0;
    const p = cfg.pattern[Math.min(this.shot, cfg.pattern.length - 1)];
    const k = (cfg.scale ?? 1) * (1 + ((cfg.aim ?? 1) - 1) * aimT);
    const r = cfg.random ?? 0;
    const up = p[0] * k;
    const side = (p[1] + (this.random() * 2 - 1) * r) * k;
    this.pending.pitch += up;
    this.pending.yaw += side;
    const rec = cfg.recovery ?? 0.7;
    this.recoverable.pitch += up * rec;
    this.recoverable.yaw += side * rec;
    this.cfg = cfg;
    this.shot++;
    this.sinceShot = 0;
  }

  // Сколько повернуть взгляд в этом кадре (радианы): быстро — бросок, потом плавно — возврат
  update(dt) {
    this.sinceShot += dt;
    let pitch = 0;
    let yaw = 0;
    // 1. Бросок: доезжаем до него за kickTime
    const f = Math.min(1, dt / this.kickTime);
    pitch += this.pending.pitch * f;
    yaw += this.pending.yaw * f;
    this.pending.pitch -= this.pending.pitch * f;
    this.pending.yaw -= this.pending.yaw * f;
    // 2. Возврат: после паузы, со скоростью recoverSpeed
    if (this.sinceShot > this.recoverDelay && this.cfg) {
      const speed = (this.cfg.recoverSpeed ?? 12) * dt;
      const len = Math.hypot(this.recoverable.pitch, this.recoverable.yaw);
      if (len > 0) {
        const step = Math.min(len, speed);
        const bp = (this.recoverable.pitch / len) * step;
        const by = (this.recoverable.yaw / len) * step;
        pitch -= bp;
        yaw -= by;
        this.recoverable.pitch -= bp;
        this.recoverable.yaw -= by;
      }
    }
    return { pitch: pitch * DEG, yaw: yaw * DEG };
  }

  // Сбросить (сменили оружие, умерли)
  reset() {
    this.pending = { pitch: 0, yaw: 0 };
    this.recoverable = { pitch: 0, yaw: 0 };
    this.shot = 0;
  }
}
