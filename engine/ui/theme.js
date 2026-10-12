// ============================================================
//  Тема интерфейса: все цвета и размеры окон, кнопок, текста — в одном месте.
//  Движок рисует всё по теме, а игра может поменять любую часть:
//
//    Engine.create({ ..., theme: { accent: [228, 200, 140], window: { border: [150, 120, 80] } } })
//
//  Указывать нужно только то, что меняешь: остальное возьмётся из DEFAULT_THEME.
// ============================================================

export const DEFAULT_THEME = {
  text: [235, 240, 250], //   основной текст
  muted: [140, 155, 180], //  подсказки
  warn: [240, 200, 110], //   внимание
  accent: [240, 196, 80], //  выделение (выбранная вкладка, очки, опыт)

  // Затемнение поверх мира (пауза, инвентарь) и фон экранов без мира (главное меню)
  overlay: { color: [10, 14, 22], alpha: 170 },
  backdrop: { top: [24, 32, 50], bottom: [12, 16, 26] },

  // Окно: рамка, полоса заголовка, отступы
  window: {
    fill: [16, 20, 31],
    alpha: 250,
    border: [78, 94, 128],
    borderWidth: 2,
    titleBar: [28, 35, 54],
    titleText: [235, 240, 250],
    titleHeight: 42,
    titleScale: 3,
    padding: 20,
    shadow: 110, // тень под окном (0 — без тени)
  },

  // Кнопки
  button: {
    fill: [28, 36, 52],
    hover: [62, 98, 180],
    active: [150, 110, 30], //       нажатая / выбранная (вкладка)
    border: [90, 110, 150],
    hoverBorder: [170, 200, 255],
    activeBorder: [240, 200, 110],
    text: [235, 240, 250],
    alpha: 235,
  },
};

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

// Тема = значения по умолчанию + то, что поменяла игра
export function makeTheme(overrides = {}, base = DEFAULT_THEME) {
  const out = {};
  for (const [k, v] of Object.entries(base)) out[k] = isObject(v) ? makeTheme(overrides[k] || {}, v) : overrides[k] ?? v;
  return out;
}
