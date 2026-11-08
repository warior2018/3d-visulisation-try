#!/bin/bash
# Выделенный сервер «Стройки» на Mac (хост без своего героя; игроки подключаются через JOIN GAME).
# Двойной клик в Finder — обычный режим (против мобов). Из Терминала: tools/run-server.command duel [порт]
cd "$(dirname "$0")/.." || exit 1
MODE="${1:-classic}"
PORT="${2:-27015}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" # Node.js из Homebrew / установщика
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Поставь его (nodejs.org или brew install node) и запусти снова."
  read -r -p "Enter — закрыть"
  exit 1
fi
echo "Сервер VOID: режим $MODE, порт $PORT (остановить — Ctrl+C или закрыть окно)"
node --import ./tools/sim/register.mjs tools/server.mjs --mode "$MODE" --port "$PORT"
read -r -p "Сервер остановлен. Enter — закрыть"
