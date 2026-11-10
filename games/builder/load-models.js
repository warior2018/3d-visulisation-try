// ============================================================
//  Модели «Стройки»: что грузить в библиотеку моделей (ModelLibrary движка). Один список на всё —
//  его зовут и игра (main.js), и автотесты (tools/sim), чтобы набор моделей нигде не расходился.
// ============================================================

import path from "node:path";
import { ASSETS, PALETTE } from "./config.js";
import { ITEMS } from "./items.js";

export function loadModels(models) {
  // mirrorX: в файле скелета правая рука лежит на -X, а у нас «вправо» — это +X
  models.load("skeleton", path.join(ASSETS, "skeleton.glb"), { mirrorX: true });
  models.load("hero", path.join(ASSETS, "hero.glb"), { mirrorX: true }); // герой — тот же скелет в боевой юкате
  models.load("hero-ranged", path.join(ASSETS, "hero-ranged.glb"), { mirrorX: true }); // стрелок — плащ и шляпа
  models.load("hero-demo", path.join(ASSETS, "hero-demo.glb"), { mirrorX: true }); //     подрывник — комбинезон и каска
  models.load("zombie", path.join(ASSETS, "zombie.glb"), { mirrorX: true });
  models.load("boar", path.join(ASSETS, "boar.glb"), { mirrorX: true });
  models.load("troll", path.join(ASSETS, "troll.glb"), { mirrorX: true }); // босс логова (tools/make-troll.js)
  // Лич (второй босс) — скелет, перекрашенный в бледно-фиолетовый (крупнее — scale у существа);
  // раздутый — зомби с багрово-зелёной кожей
  models.load("lich", path.join(ASSETS, "skeleton.glb"), { mirrorX: true, recolor: [{ from: [0.86, 0.84, 0.76], to: [0.68, 0.58, 0.86] }] });
  models.load("mob-helmet", path.join(ASSETS, "mob-helmet.glb")); // каска зомби / раздутого (не у всех: MOB_HELMET)
  models.load("bloater", path.join(ASSETS, "zombie.glb"), { mirrorX: true, recolor: [{ from: [0.42, 0.58, 0.32], to: [0.62, 0.66, 0.3] }, { from: [0.32, 0.45, 0.24], to: [0.55, 0.3, 0.28] }, { from: [0.32, 0.4, 0.55], to: [0.45, 0.3, 0.32] }] });
  // Целебный гриб — турель-гриб с розовой шляпкой; сгусток лича — спора, перекрашенная в фиолетовый
  models.load("item-healer", path.join(ASSETS, "turret.glb"), { recolor: [{ from: [0.35, 0.78, 0.35], to: [0.92, 0.5, 0.78] }] });
  models.load("item-lichbolt", path.join(ASSETS, "spore.glb"), { recolor: [{ from: [0.45, 0.9, 0.35], to: [0.62, 0.32, 0.95] }, { from: [0.8, 1, 0.6], to: [0.92, 0.8, 1] }] });
  models.load("boar-saddle", path.join(ASSETS, "boar-saddle.glb"), { mirrorX: true });
  // НПС — тот же скелет, но кости синеватые (цвет кости из tools/make-skeleton.js)
  models.load("npc", path.join(ASSETS, "skeleton.glb"), { mirrorX: true, recolor: [{ from: [0.86, 0.84, 0.76], to: [0.55, 0.7, 0.9] }] });
  // Модели «для экрана» (от 1-го лица) — у каждой способности своя, со своими анимациями
  models.load("fp-arm", path.join(ASSETS, "fp-arm.glb"));
  models.load("fp-pistol", path.join(ASSETS, "fp-pistol.glb"));
  models.load("fp-rifle", path.join(ASSETS, "fp-rifle.glb"));
  models.load("fp-crossbow", path.join(ASSETS, "fp-crossbow.glb"));
  models.load("fp-bow", path.join(ASSETS, "fp-bow.glb"));
  models.load("fp-machete", path.join(ASSETS, "fp-machete.glb"));
  models.load("fp-katana", path.join(ASSETS, "fp-katana.glb"));
  models.load("fp-auto", path.join(ASSETS, "fp-auto.glb"));
  models.load("fp-hammer", path.join(ASSETS, "fp-hammer.glb"));
  for (const fp of ["staff", "wand", "bear-trap", "spikes", "war-hammer", "shotgun", "spear", "grenade", "dynamite", "launcher", "medkit"]) models.load(`fp-${fp}`, path.join(ASSETS, `fp-${fp}.glb`));
  // Магма-камень в руке — тот же камень, только раскалённый (серое → оранжевое)
  const HOT = [{ from: [0.5, 0.5, 0.53], to: [0.85, 0.25, 0.06] }, { from: [0.64, 0.64, 0.67], to: [1, 0.6, 0.15] }];
  models.load("fp-magma", path.join(ASSETS, "fp-stone.glb"), { recolor: HOT });
  models.load("w-magma", path.join(ASSETS, "w-stone.glb"), { recolor: HOT });
  // Летящее и стоящее (снаряды, турель): камень мобов-метателей, магма, спора, граната
  models.load("item-stone", path.join(ASSETS, "stone.glb"));
  for (const m of ["magma", "spore", "grenade", "turret"]) models.load(`item-${m}`, path.join(ASSETS, `${m}.glb`));
  // Оружие «для мира» — в руке героя от 3-го лица (tools/make-weapons.js)
  for (const w of ["pistol", "rifle", "crossbow", "bow", "auto", "shotgun", "machete", "war-hammer", "spear", "katana", "katana-sheathed", "katana-saya", "grenade", "dynamite", "launcher", "medkit", "builder", "hammer", "fire-staff", "frost-wand", "bear-trap", "spikes", "bone", "stone", "knife"]) models.load(`w-${w}`, path.join(ASSETS, `w-${w}.glb`));
  models.load("item-knife", path.join(ASSETS, "knife.glb"));
  models.load("item-bolt", path.join(ASSETS, "bolt.glb")); // болт арбалета в полёте
  models.load("urn", path.join(ASSETS, "urn.glb")); // урна погибшего (сетевая игра)
  models.load("item-dynamite-lit", path.join(ASSETS, "w-dynamite.glb")); // брошенный динамит лежит с горящим фитилём // нож, брошенный мобом-стрелком (снаряд)
  // Блок в руке — по модели на каждый цвет палитры: розовую «метку» перекрашиваем в цвет
  PALETTE.forEach((color, i) => {
    models.load(`fp-block-${i}`, path.join(ASSETS, "fp-block.glb"), { recolor: [{ from: [1, 0, 1], to: color.map((c) => c / 255) }] });
  });
  // Предметы на земле: своя модель (капкан, шипы) или ящичек с крышкой цвета предмета
  for (const [id, info] of Object.entries(ITEMS)) {
    if (info.model) models.load(`item-${id}`, path.join(ASSETS, `${info.model}.glb`)); // своя модель (нож, капкан...)
    else models.load(`item-${id}`, path.join(ASSETS, "item.glb"), { recolor: [{ from: [1, 0, 1], to: (info.color || [150, 156, 168]).map((c) => c / 255) }] });
  }
}
