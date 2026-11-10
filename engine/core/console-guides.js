// ============================================================
//  Подробная справка к командам движка (help <имя>): что делает, аргументы, примеры. Регистрирует
//  engine.js после самих команд (console.describe). Свои команды игра описывает сама.
// ============================================================

const R = "required", O = "optional";
export const ENGINE_GUIDES = {
  clear: { what: "Clears all text in the console.", examples: ["clear"] },
  echo: { what: "Prints the text back. Handy in a chain of commands (separated by ;).", args: [["text", R, "any words"]], examples: ["echo hello", "god; echo god toggled"] },
  timescale: { what: "World speed: 1 - normal, 0.5 - twice slower (slow motion), 2 - twice faster. Without a value - shows the current one.", args: [["0.05..4", O, "new speed"]], examples: ["timescale", "timescale 0.25", "timescale 1"] },
  tickrate: { what: "How many times per second the world (physics, AI, timers) is updated. Default 60. Higher - smoother and heavier.", args: [["20..240", O, "ticks per second"]], examples: ["tickrate 120", "tickrate 60"] },
  fps_show: { what: "Shows or hides the FPS counter in the corner. Saved in the settings.", args: [["0|1", O, "1 - show, 0 - hide"]], examples: ["fps_show 1"] },
  brightness: { what: "Picture brightness in percent (as in the video settings). Saved.", args: [["30..200", O, "percent, 100 - normal"]], examples: ["brightness 120"] },
  lighting: { what: "Block lighting: sky light, shade under roofs, dark corners. 0 - flat light (faster on weak computers). Saved.", args: [["0|1", O, "1 - on, 0 - off"]], examples: ["lighting 0"] },
  sensitivity: { what: "Mouse sensitivity (as in the controls settings). Saved.", args: [["1..10", O, "higher - faster"]], examples: ["sensitivity 4"] },
  invert_y: { what: "Inverts mouse up and down. Saved.", args: [["0|1", O, "1 - inverted"]], examples: ["invert_y 1"] },
  music: { what: "Music volume. Saved.", args: [["0..100", O, "percent"]], examples: ["music 30"] },
  volume: { what: "Master volume of all sounds. Saved.", args: [["0..100", O, "percent"]], examples: ["volume 80"] },
  pad_sensitivity: { what: "How fast the gamepad stick turns the camera. Saved.", args: [["1..10", O, "higher - faster"]], examples: ["pad_sensitivity 6"] },
  padbinds: { what: "Lists every action and its gamepad button.", examples: ["padbinds"] },
  padbind: { what: "Puts an action on a gamepad button. Buttons: south, east, west, north, leftShoulder, rightShoulder, leftTrigger, rightTrigger, dpadUp, dpadDown, dpadLeft, dpadRight, start, back.", args: [["action", R, "an action name (padbinds - list)"], ["button", R, "a gamepad button"]], examples: ["padbind jump south", "padbind reload west"] },
  binds: { what: "Lists every action and its key or mouse button.", examples: ["binds"] },
  bind: { what: "Puts an action on a key or a mouse button. Keys - by name (space, b, f5, lshift, lctrl...), mouse - mouse:left, mouse:right, mouse:middle. Saved in the settings.", args: [["action", R, "an action name (binds - list)"], ["key", R, "a key or mouse:<button>"]], examples: ["bind jump space", "bind shop b", "bind crouch lctrl", "bind primary mouse:left"] },
  crashtest: { what: "Deliberately breaks the next frame to check the crash report window. For development.", examples: ["crashtest"], notes: ["the game shows the error window - it is not a real bug"] },
  stats: { what: "Frame stats: FPS, frame time (ms), world ticks per second, how many ticks ran and were dropped, world speed.", examples: ["stats"] },
  profile: { what: "Writes a profiler report (which systems take the frame time) to log.txt and opens the profiler page.", examples: ["profile"] },
  profile_dump: { what: "Writes the profiler report to log.txt only.", examples: ["profile_dump"] },
  quit: { what: "Closes the game (as the Quit button).", examples: ["quit"] },
};

export function describeEngineCommands(c) {
  for (const [name, info] of Object.entries(ENGINE_GUIDES)) c.describe(name, info);
}
