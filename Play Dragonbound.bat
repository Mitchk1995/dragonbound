@echo off
rem Double-click to play Dragonbound with the latest code in this folder.
title Dragonbound
cd /d "%~dp0"

where npm >/dev/null 2>/dev/null || goto :nonode

if not exist node_modules (
  echo First launch: installing game files. This takes a minute or two...
  call npm install || goto :fail
)

echo Building and starting Dragonbound...
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
