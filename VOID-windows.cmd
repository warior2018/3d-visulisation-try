@echo off
title VOID
setlocal
rem ============================================================
rem  VOID for Windows - ONE file: put it anywhere (e.g. Desktop), double-click to run.
rem  Downloads the latest game from GitHub (zip) into %LOCALAPPDATA%\VOID\game
rem  (saves and libraries are kept) and runs it via tools\run-windows.cmd from the game,
rem  so launcher fixes arrive with game updates and this file never needs changing.
rem  No internet - runs the already downloaded version.
rem  ASCII only on purpose: cmd misreads UTF-8 text in .cmd files (esp. with LF line ends).
rem ============================================================

set "REPO=warior2018/3d-visulisation-try"
set "BRANCH=main"
set "ROOT=%LOCALAPPDATA%\VOID"
set "GAME=%ROOT%\game"
if not exist "%ROOT%" mkdir "%ROOT%"

echo Checking for game updates...
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
rem the project may sit in the repo root or in a VOIDitself folder (earlier: nodejs_visual)
if exist "%SRC%\nodejs_visual\package.json" set "SRC=%SRC%\nodejs_visual"
if exist "%SRC%\VOIDitself\package.json" set "SRC=%SRC%\VOIDitself"
if not exist "%SRC%\package.json" goto :offline
rem copy everything except saves and libraries; old extra files are removed (/MIR)
robocopy "%SRC%" "%GAME%" /MIR /XD node_modules saves /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
rmdir /s /q "%UNZIP%"
del "%ZIP%" >nul 2>nul
goto :run

:offline
if not exist "%GAME%\package.json" goto :no_game
echo Could not download the update - starting the version already downloaded.

:run
if not exist "%GAME%\tools\run-windows.cmd" goto :old_game
call "%GAME%\tools\run-windows.cmd" "%ROOT%"
exit /b %errorlevel%

:old_game
echo The downloaded game has no tools\run-windows.cmd - ask the author to update the game on GitHub.
pause
exit /b 1

:no_game
echo Could not download the game - check the internet and run again.
pause
exit /b 1

:fail
echo.
echo Something went wrong. Take a photo of this window and send it.
pause
exit /b 1
