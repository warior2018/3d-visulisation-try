@echo off
setlocal
rem ============================================================
rem  VOID dedicated server for Windows (the host without its own hero; all players JOIN this computer).
rem  Double-click: CLASSIC mode. Or: run-server.cmd duel   (and optionally a port: run-server.cmd duel 27015)
rem  Needs Node.js: the one the game downloaded into %LOCALAPPDATA%\VOID\node is used if there is no other.
rem  ASCII only on purpose (cmd misreads UTF-8).
rem ============================================================
for %%G in ("%~dp0..") do set "GAME=%%~fG"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=classic"
set "PORT=%~2"
if "%PORT%"=="" set "PORT=27015"
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=%LOCALAPPDATA%\VOID\node\node.exe"
if not exist "%NODE%" if not "%NODE%"=="node" (
  echo Node.js not found. Start the game once with VOID-windows.cmd - it downloads Node.js.
  pause
  exit /b 1
)
cd /d "%GAME%"
chcp 65001 >nul
echo Starting VOID server: mode %MODE%, port %PORT%
echo If Windows Firewall asks about Node.js - allow it (private networks).
"%NODE%" --import ./tools/sim/register.mjs tools/server.mjs --mode %MODE% --port %PORT%
echo Server stopped.
pause
