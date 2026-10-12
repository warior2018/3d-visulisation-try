@echo off
chcp 65001 >nul
rem ============================================================
rem  VOID — запуск на Windows: двойной клик по этому файлу.
rem  1) проверяет, что установлен Node.js;
rem  2) при первом запуске (или если папку скопировали с Мака) ставит библиотеки под Windows;
rem  3) запускает игру. Ярлык на рабочий стол: правый клик по файлу -> Отправить -> Рабочий стол.
rem ============================================================
title VOID
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js.
  echo Скачай и установи версию LTS с https://nodejs.org ^(галочки по умолчанию^), потом запусти этот файл снова.
  pause
  exit /b 1
)

rem Библиотеки окна и видеокарты (@kmamal/sdl, @kmamal/gpu) свои для каждой системы.
rem Папка node_modules с Мака на Windows не работает — ставим заново, если она не для этой системы.
node -e "const f='node_modules/.void-platform';process.exit(require('fs').existsSync(f)&&require('fs').readFileSync(f,'utf8')===process.platform+'-'+process.arch?0:1)"
if errorlevel 1 (
  echo Первый запуск на этом компьютере: ставлю библиотеки ^(нужен интернет, 1-2 минуты^)...
  if exist node_modules rmdir /s /q node_modules
  call npm install
  if errorlevel 1 (
    echo Не получилось установить библиотеки. Пришли текст ошибки выше.
    pause
    exit /b 1
  )
  node -e "require('fs').writeFileSync('node_modules/.void-platform',process.platform+'-'+process.arch)"
)

node games\builder\main.js
if errorlevel 1 (
  echo.
  echo Игра закрылась с ошибкой. Журнал: games\builder\saves\log.txt
  pause
)
