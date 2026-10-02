@echo off
rem Double-click to play Dragonbound. Always updates to the latest merged version first.
title Dragonbound
cd /d "%~dp0"

where npm >nul 2>nul || goto :nonode

rem Update to the newest version of main when this folder is a clean checkout of main.
where git >nul 2>nul || goto :install
set "BRANCH="
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "BRANCH=%%b"
if /i not "%BRANCH%"=="main" (
  echo This folder is on branch "%BRANCH%", not main, so it was not updated.
  goto :install
)
echo Getting the latest version...
git pull --ff-only --quiet origin main || echo Could not update, starting the version already on this PC.

:install
rem The launcher only installs or builds when its inputs changed.
call npm run play || goto :fail
exit /b 0

:nonode
echo Node.js is not installed. Get the LTS version from https://nodejs.org, then run this again.
pause
exit /b 1

:fail
echo.
echo Dragonbound could not start. Scroll up for the error.
pause
exit /b 1
