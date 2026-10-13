@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js, then reopen this window.
  pause
  exit /b 1
)
call npm.cmd run dev
if errorlevel 1 (
  echo Command failed. Read the error above.
  pause
  exit /b 1
)
pause
