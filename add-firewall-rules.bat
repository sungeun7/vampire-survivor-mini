@echo off
echo ========================================
echo Adding Firewall Rules for Mini Survivors
echo ========================================
echo.
echo This script must be run as Administrator.
echo.
pause

REM Add firewall rule for port 5173
echo Adding firewall rule for port 5173...
netsh advfirewall firewall add rule name="Mini Survivors Server Port 5173" dir=in action=allow protocol=TCP localport=5173
if errorlevel 1 (
    echo ERROR: Failed to add firewall rule for port 5173.
) else (
    echo [OK] Firewall rule added for port 5173.
)

echo.

REM Add firewall rule for port 8080
echo Adding firewall rule for port 8080...
netsh advfirewall firewall add rule name="Mini Survivors Server Port 8080" dir=in action=allow protocol=TCP localport=8080
if errorlevel 1 (
    echo ERROR: Failed to add firewall rule for port 8080.
) else (
    echo [OK] Firewall rule added for port 8080.
)

echo.
echo ========================================
echo Firewall rules configuration completed.
echo ========================================
echo.
pause

