@echo off
chcp 65001 >nul
setlocal
rem ============================================================
rem  Запуск игры на Windows (его вызывает VOID-windows.cmd или start-windows.cmd).
rem  Лежит в репозитории — значит, исправления запуска приходят вместе с обновлением игры.
rem  1) Node.js 22+ (нет — скачивает свой в %LOCALAPPDATA%\VOID\node);
rem  2) библиотеки под эту систему (npm install, если надо);
rem  3) игра под присмотром tools\windows-launch.js: упала — окно не закрывается, видно почему.
rem  Аргумент 1 (необязательный) — папка для своего Node.js (по умолчанию %LOCALAPPDATA%\VOID).
rem ============================================================
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%LOCALAPPDATA%\VOID"
set "NODE_DIR=%ROOT%\node"
for %%G in ("%~dp0..") do set "GAME=%%~fG"
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

rem ---------- 2. Библиотеки ----------
cd /d "%GAME%"
rem метка: система + содержимое package.json; не совпала — ставим библиотеки заново
node -e "const fs=require('fs'),c=require('crypto');const k=process.platform+'-'+process.arch+'-'+c.createHash('md5').update(fs.readFileSync('package.json')).digest('hex');const f='node_modules/.void-platform';process.exit(fs.existsSync(f)&&fs.readFileSync(f,'utf8')===k?0:1)"
if not errorlevel 1 goto :run
echo Ставлю библиотеки игры (1-2 минуты, нужен интернет)...
if exist node_modules rmdir /s /q node_modules
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync('node_modules/.void-platform',process.platform+'-'+process.arch+'-'+c.createHash('md5').update(fs.readFileSync('package.json')).digest('hex'))"

rem ---------- 3. Игра ----------
:run
echo Запускаю VOID... (это окно не закрывай, пока играешь)
node tools\windows-launch.js
exit /b %errorlevel%

:no_internet_node
echo Не получилось скачать Node.js — проверь интернет и запусти снова.
pause
exit /b 1

:fail
echo.
echo Что-то пошло не так. Сфотографируй это окно и пришли.
pause
exit /b 1
