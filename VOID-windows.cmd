@echo off
chcp 65001 >nul
title VOID
setlocal
rem ============================================================
rem  VOID для Windows — ОДИН файл: положи куда угодно (например, на рабочий стол), запускай двойным кликом.
rem  Скачивает свежую игру с GitHub (zip) в %LOCALAPPDATA%\VOID\game (сохранения и библиотеки не трогает)
rem  и запускает её через tools\run-windows.cmd из самой игры — так исправления запуска
rem  приходят вместе с обновлением, а этот файл менять больше не нужно.
rem  Нет интернета — запускает уже скачанную версию.
rem ============================================================

set "REPO=warior2018/3d-visulisation-try"
set "BRANCH=main"
set "ROOT=%LOCALAPPDATA%\VOID"
set "GAME=%ROOT%\game"
if not exist "%ROOT%" mkdir "%ROOT%"

echo Проверяю обновления игры...
set "ZIP=%TEMP%\void-game.zip"
set "UNZIP=%TEMP%\void-game"
curl -fsSL -o "%ZIP%" "https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
if errorlevel 1 goto :offline
if exist "%UNZIP%" rmdir /s /q "%UNZIP%"
mkdir "%UNZIP%"
tar -xf "%ZIP%" -C "%UNZIP%"
if errorlevel 1 goto :offline
set "SRC="
for /d %%D in ("%UNZIP%\*") do set "SRC=%%D"
rem проект может лежать в корне репозитория или в папке nodejs_visual
if exist "%SRC%\nodejs_visual\package.json" set "SRC=%SRC%\nodejs_visual"
if not exist "%SRC%\package.json" goto :offline
rem копируем всё, кроме сохранений и библиотек; лишние старые файлы убираем (/MIR)
robocopy "%SRC%" "%GAME%" /MIR /XD node_modules saves /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
rmdir /s /q "%UNZIP%"
del "%ZIP%" >nul 2>nul
goto :run

:offline
if not exist "%GAME%\package.json" goto :no_game
echo Не удалось скачать обновление — запускаю уже скачанную версию.

:run
if not exist "%GAME%\tools\run-windows.cmd" goto :old_game
call "%GAME%\tools\run-windows.cmd" "%ROOT%"
exit /b %errorlevel%

:old_game
echo В скачанной версии игры нет tools\run-windows.cmd — попроси автора обновить игру на GitHub.
pause
exit /b 1

:no_game
echo Не получилось скачать игру — проверь интернет и запусти снова.
pause
exit /b 1

:fail
echo.
echo Что-то пошло не так. Сфотографируй это окно и пришли.
pause
exit /b 1
