@echo off
REM Launcher for setup.bat - ensures window stays open even on errors
title Mini Survivors - Setup Launcher

echo ========================================
echo Mini Survivors - Environment Setup
echo ========================================
echo.
echo Launching setup script...
echo This window will stay open even if there are errors.
echo.

cd /d "%~dp0"
if errorlevel 1 (
    echo ERROR: Cannot change to script directory.
    echo Current directory: %CD%
    echo.
    echo Press any key to close this window...
    pause
    exit /b 1
)

REM Run setup.bat and capture exit code
call setup.bat
set EXIT_CODE=%errorlevel%

REM Always pause at the end - use multiple attempts
echo.
echo ========================================
if %EXIT_CODE% neq 0 (
    echo Setup script ended with errors. Exit code: %EXIT_CODE%
) else (
    echo Setup script completed successfully.
)
echo ========================================
echo.
echo Press any key to close this window...
pause >nul 2>&1
if errorlevel 1 (
    echo.
    echo If you see this message, the script has completed.
    echo You can now close this window manually.
    timeout /t 10 >nul 2>&1
)
timeout /t 1 >nul 2>&1
exit /b %EXIT_CODE%

