@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
set "STUDIO=%~dp0local-ai\own\studio.py"
if exist "%~dp0.venv\Scripts\python.exe" (
    "%~dp0.venv\Scripts\python.exe" "%STUDIO%"
) else (
    where py >nul 2>nul
    if errorlevel 1 (
        python "%STUDIO%"
    ) else (
        py -3 "%STUDIO%"
    )
)
if errorlevel 1 (
    echo 실행에 실패했습니다. Python 3.11 이상과 PC 학습실 실행 안내를 확인해 주세요.
    pause
)
