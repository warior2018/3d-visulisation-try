// ============================================================
//  Справка «что умеют мои атаки и скиллы» — держишь F1 (движок: Ability.help, abilityHelp, widgets.drawHelpOverlay).
//  По id способности: { действие: { name, text } }. Действия: primary (ЛКМ), secondary (ПКМ), skill1 / skill2 (Q / E),
//  reload, palette... Числа — из config.js, поэтому справка сама следует за балансом.
// ============================================================

import { ATTACKS as A, BLOCK, SPEAR, KATANA_IAI as IAI, MACHETE_LEAP as ML, SHOP, SHOTGUN_BLAST as SB, DEMO, MEDKIT, BOW } from "./config.js";

const block = { name: "BLOCK", text: `FOR ${BLOCK.window} S HITS AND SHOTS FROM THE FRONT DEAL ${Math.round((1 - BLOCK.share) * 100)}% DMG. COOLDOWN ${BLOCK.cooldown} S (DUEL: X${BLOCK.duel}). TALENT REFLECT - SHOTS FLY BACK` };
const aim = { name: "AIM", text: "HOLD TO AIM: ZOOM IN, LESS SPREAD" };
const reload = { name: "RELOAD", text: "PUT IN A NEW CLIP FROM THE BAG. THE REST OF THE OLD ONE GOES BACK AS A PARTIAL CLIP" };
const punch = { name: "PUNCH", text: `${A.punch.damage} DMG, UP TO ${A.punch.maxTargets} ENEMIES IN FRONT` };

// Пассивка подрывника: свой взрыв рядом подкидывает (ROCKET_JUMP), урона себе нет
const rocket = { name: "ROCKET JUMP", text: "YOUR OWN BLAST NEARBY THROWS YOU AWAY FROM IT AND UP. NO DMG TO YOU" };
export const HELP = {
  hand: { primary: punch, secondary: block },
  pistol: { primary: { name: "SHOOT", text: `${A.pistol.damage} DMG. CLIP ${A.pistol.magazine}` }, secondary: aim, reload },
  bow: {
    primary: { name: "DRAW", text: `HOLD TO DRAW, RELEASE TO SHOOT: ${BOW.minDamage}-${A.bow.damage} DMG, THE LONGER THE DRAW - THE STRONGER AND FASTER THE ARROW (FULL IN ${BOW.draw} S). ENDLESS ARROWS, ${A.bow.cooldown} S BETWEEN SHOTS` },
    secondary: aim,
    skill1: { text: `VOLLEY: ${BOW.volley.count} FULLY DRAWN ARROWS IN A FAN. COOLDOWN ${BOW.volley.cooldown} S` },
  },
  rifle: { primary: { name: "SHOOT", text: `${A.rifle.damage} DMG, ONE SHOT EVERY ${A.rifle.cooldown} S. CLIP ${A.rifle.magazine}` }, secondary: { name: "SCOPE", text: "HOLD TO LOOK THROUGH THE SCOPE" }, reload },
  auto: { primary: { name: "FIRE", text: `HOLD TO FIRE: ${A.auto.damage} DMG PER BULLET. CLIP ${A.auto.magazine}` }, secondary: aim, reload },
  shotgun: {
    primary: { name: "SHOOT", text: `${A.shotgun.pellets} PELLETS OF ${A.shotgun.damage} DMG. CLIP ${A.shotgun.magazine}` }, secondary: aim, reload,
    skill1: { text: `POINT-BLANK BLAST: ${A.shotgunBlast.damage} DMG TO UP TO ${A.shotgunBlast.maxTargets} ENEMIES AHEAD, STUNS ${SB.stun} S. THE KICK THROWS YOU BACK (SHOOT DOWN - FLY UP). NO AMMO. COOLDOWN ${SB.cooldown} S` },
  },
  machete: {
    primary: { name: "SWING", text: `${A.machete.damage} DMG, UP TO ${A.machete.maxTargets} ENEMIES IN FRONT` }, secondary: block,
    skill1: { text: `LEAP: REVERSE GRIP, JUMP ${ML.distance} M FORWARD WITH A SWING. THE BLADE HITS THE FIRST ENEMY IT TOUCHES: X${ML.damage} DMG. NO TOUCH - NO DMG. COOLDOWN ${ML.cooldown} S` },
  },
  "war-hammer": {
    primary: { name: "SLAM", text: `${A.warHammer.damage} DMG TO ALL IN A CIRCLE. IN THE AIR: FALL FAST AND HIT ON LANDING, HIGHER = MORE DMG` },
    secondary: block,
  },
  spear: {
    primary: { name: "THRUST", text: `${A.spear.damage} DMG, LONG REACH, UP TO ${A.spear.maxTargets} ENEMIES IN A LINE. NO BLOCK` },
    secondary: { name: "CHARGE", text: `HOLD: RUN WITH THE SPEAR, FASTER = MORE DMG. PIERCES UP TO ${SPEAR.maxHits} ENEMIES` },
  },
  katana: {
    primary: { name: "SLASH", text: `${A.katana.damage} DMG TO ALL AHEAD (UP TO ${A.katana.maxTargets})` },
    secondary: block,
    skill1: { text: `DASH ${IAI.distance} M WHERE YOU LOOK (UP AND DOWN TOO), X${IAI.damage} DMG TO ALL ON THE PATH. COOLDOWN ${IAI.cooldown} S` },
  },
  grenades: { primary: { name: "THROW", text: `${A.handGrenade.damage} DMG TO ALL WITHIN ${A.handGrenade.radius} BLOCKS WHERE IT HITS. ENDLESS` }, passive: rocket },
  launcher: {
    primary: { name: "FIRE", text: `FAST FLAT SHELL: ${A.launcher.damage} DMG TO ALL WITHIN ${A.launcher.radius} BLOCKS` }, secondary: aim,
    passive: rocket,
    skill1: { text: `THE SHELL BURSTS AND SCATTERS ${DEMO.cluster.count} BOMBLETS: ${A.clusterBomb.damage} DMG EACH IN ${A.clusterBomb.radius} BLOCKS. COOLDOWN ${DEMO.cluster.cooldown} S` },
  },
  dynamite: { primary: { name: "THROW", text: `LIES ${DEMO.fuse} S WITH A BURNING FUSE, THEN ${A.dynamite.damage} DMG TO ALL WITHIN ${A.dynamite.radius} BLOCKS` }, passive: rocket },
  build: {
    primary: { name: "BREAK", text: "REMOVE THE BLOCK UNDER THE CROSSHAIR" },
    secondary: { name: "PLACE", text: "PUT A BLOCK. ONE STONE = ONE BLOCK" },
    palette: { name: "COLOR", text: "CHOOSE THE BLOCK COLOR" },
  },
  medkit: { primary: { name: "HEAL", text: `HOLD ${MEDKIT.useTime} S: +${SHOP.medkitHeal} HP. RELEASE EARLY - NOT USED UP` } },
  "bear-trap": { primary: { name: "PLACE", text: "PUT THE TRAP ON THE BLOCK UNDER THE CROSSHAIR" } },
  spikes: { primary: { name: "PLACE", text: "PUT THE SPIKES ON THE BLOCK UNDER THE CROSSHAIR" } },
};

// Скиллы класса (не оружия) — по классу: { skill1: { name, text } }. Сейчас у классов своих скиллов нет
export const CLASS_HELP = {};

// Справка для способности: своя по id, у предмета «в руке» (кость, монета) — как у кулака
export const helpFor = (ability) => HELP[ability.id] || (ability.id?.startsWith("item:") ? HELP.hand : null);
