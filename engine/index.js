// ============================================================
//  VOID — движок. Всё, что умеет движок, — из одного места:
//    import { Engine, Scene, VoxelWorld, ... } from "../../engine/index.js";
//
//  Игры лежат отдельно (папка games/) и движок не меняют — только пользуются им.
// ============================================================

// Ядро: движок, сцены, настройки, файлы
export { Engine, ENGINE_DEFAULTS, ENGINE_ACTION_LABELS } from "./core/engine.js";
export { Scene } from "./core/scene.js";
export { SettingsStore, deepMerge } from "./core/settings.js";
export { readJSON, writeJSON } from "./core/json-file.js";
export { Journal, Watchdog } from "./core/watchdog.js";

// Математика
export { Vec3, clamp } from "./math/vec3.js";
export * as mat4 from "./math/mat4.js";
export { viewBasis, toWorld, toLocal } from "./math/basis.js";

// Графика
export { GPURenderer } from "./graphics/gpu-renderer.js";
export { Camera } from "./graphics/camera.js";
export { CameraRig } from "./graphics/camera-rig.js";
export { ModelLibrary } from "./graphics/models.js";
export { ViewModel } from "./graphics/view-model.js";
export { loadGLB } from "./graphics/gltf.js";
export { Animator } from "./graphics/animator.js";

// Интерфейс
export { UI } from "./ui/ui.js";
export * as widgets from "./ui/widgets.js";
export { drawMinimap } from "./ui/minimap.js";
export { drawWindow } from "./ui/window.js";
export { DEFAULT_THEME, makeTheme } from "./ui/theme.js";
export { drawPortrait } from "./ui/portrait.js";

// Готовые сцены
export { MenuScene } from "./scenes/menu-scene.js";
export { SettingsScene, RESOLUTIONS } from "./scenes/settings-scene.js";
export { InventoryScene } from "./scenes/inventory-scene.js";
export { TalentScene } from "./scenes/talent-scene.js";
export { MapScene } from "./scenes/map-scene.js";

// Ввод и звук
export { Input, KEYS } from "./input/input.js";
export { MouseLook } from "./input/mouse.js";
export { Sound, tone, noise, mix } from "./audio/sound.js";

// Мир: сущности, инвентарь, физика, управление, кубики
export { Entity, EntityManager } from "./world/entity.js";
export { Inventory } from "./world/inventory.js";
export { Physics } from "./world/physics.js";
export { CharacterController, dash } from "./world/character-controller.js";
export { VoxelWorld } from "./world/voxel-world.js";
export { Pickup, Pickups } from "./world/pickups.js";
export { Projectiles } from "./world/projectiles.js";
export { buildBox, buildHouse, buildCratePile, buildTower, scatter, seededRandom, randomInt } from "./world/structures.js";
export { Terrain, flattenArea, buildTree } from "./world/terrain.js";
export { valueNoise2D, fbm, smoothstep } from "./math/noise.js";
export { chase, pursue, turnTowards, separate, melee } from "./world/behaviors.js";
export { Navigator, findPath, smoothPath, canStand, standY } from "./ai/pathfinder.js";
export { alertHerd, taunt, auraTarget } from "./ai/social.js";
export { Brain } from "./ai/brain.js";
export { HostileBrain } from "./ai/hostile.js";
export { WanderBrain } from "./ai/wander.js";
export { GuardBrain } from "./ai/guard.js";
export { FollowBrain } from "./ai/follow.js";
export { Player, Mob, NPC } from "./world/creatures.js";
export { Taming } from "./world/taming.js";
export { Rideable, mount, dismount, updateRider } from "./world/riding.js";
export { Ability, AbilityBar } from "./world/abilities.js";

// Бой: атаки (ближний, дальний, магия, предметы, ловушки), урон, стихии, модификаторы, статусы
export * from "./combat/index.js";
export { Spawner } from "./world/spawner.js";
export { RandomEvent } from "./world/events.js";

// Развитие героя: опыт, уровни, дерево талантов
export { Experience } from "./progression/experience.js";
export { Talents } from "./progression/talents.js";
export { Shop } from "./economy/shop.js";
export { ShopScene } from "./scenes/shop-scene.js";
export { Updater, compareVersions, readChangelog } from "./core/updates.js";
export { ChangelogScene } from "./scenes/changelog-scene.js";
export { Aim } from "./input/aim.js";
export { Recoil } from "./input/recoil.js";
export { Lean } from "./graphics/lean.js";
export { DamageNumbers } from "./ui/damage-numbers.js";
export { SlashEffects } from "./ui/slash-effects.js";
