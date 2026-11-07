@echo off
setlocal
rem ============================================================
rem  Starts the game on Windows (called by VOID-windows.cmd or start-windows.cmd).
rem  Lives in the repo, so launcher fixes arrive together with game updates.
rem  1) Node.js 22+ (missing - downloads its own into %LOCALAPPDATA%\VOID\node);
rem  2) libraries for this system (npm install when needed);
rem  3) the game under tools\windows-launch.js: if it crashes the window stays open and shows why.
rem  Argument 1 (optional) - folder for the own Node.js (default %LOCALAPPDATA%\VOID).
rem  ASCII only on purpose: cmd misreads UTF-8 text in .cmd files (esp. with LF line ends).
rem ============================================================
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%LOCALAPPDATA%\VOID"
set "NODE_DIR=%ROOT%\node"
for %%G in ("%~dp0..") do set "GAME=%%~fG"
if not exist "%ROOT%" mkdir "%ROOT%"

rem ---------- 1. Node.js ----------
rem needs Node.js 22 or newer; an older system one - use our own
where node >nul 2>nul
if errorlevel 1 goto :need_node
node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if not errorlevel 1 goto :have_node
:need_node
if exist "%NODE_DIR%\node.exe" goto :use_local_node
echo Downloading Node.js (once, ~30 MB)...
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

rem ---------- 2. Libraries ----------
:libs
cd /d "%GAME%"
rem legacy-libs.txt (written by windows-launch.js when the new window/GPU libraries crash on this PC):
rem use the older stable pair @kmamal/sdl 0.11 (SDL2) + @kmamal/gpu 0.2 - the engine supports both
set "VOID_LEGACY="
if exist "%ROOT%\legacy-libs.txt" set "VOID_LEGACY=1"
set "VOID_ROOT=%ROOT%"
rem stamp: system + package.json contents; mismatch - reinstall libraries
node -e "const fs=require('fs'),c=require('crypto');const k=process.platform+'-'+process.arch+(process.env.VOID_LEGACY?'-legacy':'')+'-'+c.createHash('md5').update(fs.readFileSync('package.json')).digest('hex');const f='node_modules/.void-platform';process.exit(fs.existsSync(f)&&fs.readFileSync(f,'utf8')===k?0:1)"
if not errorlevel 1 goto :run
echo Installing game libraries (1-2 minutes, needs internet)...
if exist node_modules rmdir /s /q node_modules
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
if not defined VOID_LEGACY goto :stamp
echo Installing older window/GPU libraries...
call npm install --no-save --no-audit --no-fund @kmamal/sdl@0.11.13 @kmamal/gpu@0.2.0
if errorlevel 1 goto :fail
:stamp
node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync('node_modules/.void-platform',process.platform+'-'+process.arch+(process.env.VOID_LEGACY?'-legacy':'')+'-'+c.createHash('md5').update(fs.readFileSync('package.json')).digest('hex'))"

rem ---------- 3. Game ----------
:run
echo Starting VOID... (keep this window open while playing)
node tools\windows-launch.js
rem 42 = "try the older libraries" (windows-launch.js wrote legacy-libs.txt) - reinstall and run again
if errorlevel 42 if not errorlevel 43 goto :libs
exit /b %errorlevel%

:no_internet_node
echo Could not download Node.js - check the internet and run again.
pause
exit /b 1

:fail
echo.
echo Something went wrong. Take a photo of this window and send it.
pause
exit /b 1
