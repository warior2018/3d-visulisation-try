@echo off
chcp 65001 >nul
title VOID
setlocal
rem ============================================================
rem  VOID для Windows — ОДИН файл: положи куда угодно (например, на рабочий стол) и запускай двойным кликом.
rem  Каждый запуск:
rem   1) если нет Node.js 22+ — сам скачивает его (в %LOCALAPPDATA%\VOID\node, ничего не устанавливая в систему);
rem   2) скачивает свежую версию игры с GitHub (zip) в %LOCALAPPDATA%\VOID\game —
rem      сохранения (saves) и библиотеки (node_modules) при этом не трогаются;
rem   3) если библиотеки не для этой системы или поменялся package.json — ставит их (npm install);
rem   4) запускает игру.
rem  Нет интернета — запускает то, что уже скачано.
rem ============================================================

set "REPO=warior2018/3d-visulisation-try"
set "BRANCH=main"
set "ROOT=%LOCALAPPDATA%\VOID"
set "GAME=%ROOT%\game"
set "NODE_DIR=%ROOT%\node"
if not exist "%ROOT%" mkdir "%ROOT%"

rem ---------- 1. Node.js ----------
rem нужен Node.js 22 или новее; старый в системе — берём свой
where node >nul 2>nul
if errorlevel 1 goto :need_node
node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if not errorlevel 1 goto :have_node
:need_node
if exist "%NODE_DIR%\node.exe" goto :use_local_node
echo Скачиваю Node.js (один раз, ~30 МБ)...
curl -fsSL -o "%TEMP%\void-node-sums.txt" "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt"
if errorlevel 1 goto :no_internet_node
set "NODE_ZIP="
for /f "tokens=2" %%N in ('findstr /c:"win-x64.zip" "%TEMP%\void-node-sums.txt"') do set "NODE_ZIP=%%N"
if not defined NODE_ZIP goto :fail
curl -fL -o "%TEMP%\void-node.zip" "https://nodejs.org/dist/latest-v22.x/%NODE_ZIP%"
if errorlevel 1 goto :no_internet_node
if exist "%ROOT%\node-tmp" rmdir /s /q "%ROOT%\node-tmp"
mkdir "%ROOT%\node-tmp"
tar -xf "%TEMP%\void-node.zip" -C "%ROOT%\node-tmp"
if errorlevel 1 goto :fail
for /d %%D in ("%ROOT%\node-tmp\*") do move "%%D" "%NODE_DIR%" >nul
rmdir /s /q "%ROOT%\node-tmp"
del "%TEMP%\void-node.zip" "%TEMP%\void-node-sums.txt" >nul 2>nul
:use_local_node
set "PATH=%NODE_DIR%;%PATH%"
:have_node

rem ---------- 2. Свежая версия игры с GitHub ----------
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
goto :deps

:offline
if not exist "%GAME%\package.json" goto :no_internet_game
echo Не удалось скачать обновление — запускаю уже скачанную версию.

rem ---------- 3. Библиотеки ----------
:deps
cd /d "%GAME%"
rem метка: система + содержимое package.json; не совпала — ставим библиотеки заново
node -e "const fs=require('fs'),c=require('crypto');const k=process.platform+'-'+process.arch+'-'+c.createHash('md5').update(fs.readFileSync('package.json')).digest('hex');const f='node_modules/.void-platform';process.exit(fs.existsSync(f)&&fs.readFileSync(f,'utf8')===k?0:1)"
if not errorlevel 1 goto :run
echo Ставлю библиотеки игры (1-2 минуты, нужен интернет)...
if exist node_modules rmdir /s /q node_modules
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync('node_modules/.void-platform',process.platform+'-'+process.arch+'-'+c.createHash('md5').update(fs.readFileSync('package.json')).digest('hex'))"

rem ---------- 4. Игра ----------
:run
echo Запускаю VOID... (это окно не закрывай, пока играешь)
node games\builder\main.js
if errorlevel 1 goto :crashed
exit /b 0

:crashed
echo.
echo Игра закрылась с ошибкой. Журнал: %GAME%\games\builder\saves\log.txt
pause
exit /b 1

:no_internet_node
echo Не получилось скачать Node.js — проверь интернет и запусти снова.
pause
exit /b 1

:no_internet_game
echo Не получилось скачать игру — проверь интернет и запусти снова.
pause
exit /b 1

:fail
echo.
echo Что-то пошло не так. Сфотографируй это окно и пришли.
pause
exit /b 1
