@echo off
setlocal
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" -Task check
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1" -Task "%~1"
)
set "taskExit=%ERRORLEVEL%"
if not "%taskExit%"=="0" echo Development task failed. See the output above.
if "%~1"=="" pause
exit /b %taskExit%
