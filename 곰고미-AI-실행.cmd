@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-ai\run.ps1"
if errorlevel 1 echo 실행 중 오류가 발생했습니다. 위 내용을 확인해 주세요.
pause
