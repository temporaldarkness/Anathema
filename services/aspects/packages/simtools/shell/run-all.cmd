@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-metrics.ps1" -Open
set "RC=%ERRORLEVEL%"
echo %CMDCMDLINE% | find /i "/c" >nul && pause
exit /b %RC%