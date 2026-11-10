// ============================================================
//  Чувство боя (HIT_FEEL, DAMAGE_DIR):
//   — сильный удар героя или хедшот: встряска картинки, звук хедшота;
//   — молот, дробовик, залп, разбег копья, динамит отбрасывают задетых мобов (knock);
//   — по герою попали — красная дуга у прицела в сторону того, кто бил (hud.js → «damage-dir»), гаснет.
// ============================================================

import { HIT_FEEL, DAMAGE_DIR } from "../config.js";
import { viewBasis } from "../../../engine/index.js";

export class FeelPart {
  // Зовёт onDamage сущности (game-scene.js → spawn)
  hitFeel(e, d, dealt) {
    if (dealt <= 0 || !d) return;
    if (e === this.player) return this.markDamageDir(d);
    if (d.source !== this.player || d.tags?.has("dot")) return;
    const F = HIT_FEEL, head = d.part === "head";
    if (head || dealt >= F.kick.from) this.shake?.add(head ? F.kick.head : F.kick.amount);
    if (head) this.engine.sound.play(F.headSound, { volume: 0.9 });
    const k = F.knock.attacks[d.attack?.id];
    if (k && e.alive !== false) this.knockBack(e, k * (e.boss ? F.knock.boss : 1));
  }

  // Отбросить e от героя со скоростью v (м/с): толчки складываются (дробины), но не больше max
  knockBack(e, v) {
    const p = this.player, K = HIT_FEEL.knock;
    let dx = e.position.x - p.position.x, dz = e.position.z - p.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const was = e.knock && e.knock.left > 0 ? Math.hypot(e.knock.x, e.knock.z) : 0;
    const speed = Math.min(K.max, was + v);
    e.knock = { x: dx * speed, z: dz * speed, left: K.time };
    if (e.onGround !== false && e.velocity) e.velocity.y = Math.max(e.velocity.y || 0, K.up * Math.min(1, speed / K.max + 0.3));
  }

  // Каждый тик до физики моба: отлёт сильнее его ходьбы
  applyKnock(e, dt) {
    const k = e.knock;
    if (!k || k.left <= 0) return;
    k.left -= dt;
    e.velocity.x = k.x;
    e.velocity.z = k.z;
    if (k.left <= 0) e.knock = null;
  }

  // ---------- Откуда бьют ----------

  markDamageDir(d) {
    const src = d.source?.position ? d.source : d.source?.owner?.position ? d.source.owner : null;
    if (!src || src === this.player) return;
    const list = (this.damageDirs ||= []);
    const same = list.find((m) => m.source === src);
    if (same) same.left = DAMAGE_DIR.time;
    else list.push({ source: src, at: { x: src.position.x, z: src.position.z }, left: DAMAGE_DIR.time });
    if (list.length > DAMAGE_DIR.max) list.shift();
  }

  updateDamageDirs(dt) {
    const list = this.damageDirs;
    if (!list?.length) return;
    for (const m of list) {
      m.left -= dt;
      if (m.source.alive !== false && m.source.position) m.at = { x: m.source.position.x, z: m.source.position.z }; // моб ходит — дуга за ним
    }
    this.damageDirs = list.filter((m) => m.left > 0);
  }

  // Для HUD: [{ angle (рад, 0 — вверху экрана, по часовой), k (0…1 — яркость) }]
  damageArcs() {
    const list = this.damageDirs;
    if (!list?.length) return [];
    const cam = this.rig?.camera, p = this.player;
    const { right, forward } = viewBasis(cam?.yaw ?? p.yaw ?? 0, 0);
    return list.map((m) => {
      const dx = m.at.x - p.position.x, dz = m.at.z - p.position.z;
      return { angle: Math.atan2(dx * right.x + dz * right.z, dx * forward.x + dz * forward.z), k: Math.max(0, Math.min(1, m.left / DAMAGE_DIR.time)) };
    });
  }
}
