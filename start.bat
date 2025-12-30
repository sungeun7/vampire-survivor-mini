@echo off
setlocal enabledelayedexpansion

REM Change to script directory
cd /d "%~dp0" 2>nul
if errorlevel 1 (
    echo ERROR: Cannot change to script directory.
    pause
    exit /b 1
)

echo ========================================
echo Mini Survivors - Server Startup
echo ========================================
echo.
echo NOTE: For best results, run this script as Administrator
echo       (Right-click -^> Run as administrator)
echo       This allows automatic firewall rule configuration.
echo.

REM Step 1: Check Java
echo Checking Java...
where java >nul 2>&1
if errorlevel 1 (
    echo.
    echo ========================================
    echo ERROR: Java is not installed or not in PATH.
    echo ========================================
    echo.
    echo Please run setup.bat first to install Java and Maven.
    echo.
    goto :error_exit
)

java -version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ========================================
    echo ERROR: Java is not working properly.
    echo ========================================
    echo.
    echo Please run setup.bat first to install Java and Maven.
    echo.
    goto :error_exit
)

echo Java found.
java -version
echo.

REM Step 2: Build JAR if needed
if not exist "target\mini-survivors-server-1.0.0.jar" (
    echo JAR file not found. Starting build...
    echo.
    
    set BUILD_SUCCESS=0
    
    REM Try Maven Wrapper first if available and properly configured
    if exist "mvnw.cmd" (
        if exist ".mvn\wrapper\maven-wrapper.properties" (
            echo Using Maven Wrapper to build...
            call mvnw.cmd clean package -DskipTests
            if not errorlevel 1 (
                set BUILD_SUCCESS=1
            ) else (
                echo Maven Wrapper failed, trying system Maven...
            )
        )
    )
    
    REM Use system Maven if wrapper failed, not available, or not configured
    if !BUILD_SUCCESS! equ 0 (
        REM Check if portable Maven exists
        set "MAVEN_CMD="
        if exist "maven\bin\mvn.cmd" (
            set "MAVEN_CMD=%~dp0maven\bin\mvn.cmd"
            echo Using portable Maven from project directory...
        ) else (
            REM Check if system Maven is available
            where mvn.cmd >nul 2>&1
            if not errorlevel 1 (
                set "MAVEN_CMD=mvn.cmd"
                echo Using system Maven...
            )
        )
        
        if not defined MAVEN_CMD (
            echo.
            echo ========================================
            echo ERROR: Maven is not installed or not in PATH.
            echo ========================================
            echo.
            echo Please run setup.bat first to install Java and Maven.
            echo.
            goto :error_exit
        )
        
        echo Building with Maven...
        call "!MAVEN_CMD!" clean package -DskipTests
        if not errorlevel 1 (
            set BUILD_SUCCESS=1
        )
    )
    
    REM Check if build succeeded
    if !BUILD_SUCCESS! equ 0 (
        echo.
        echo ========================================
        echo Build failed!
        echo ========================================
        echo.
        goto :error_exit
    )
    
    echo.
    echo Build completed successfully!
    echo.
)

REM Verify JAR file exists
if not exist "target\mini-survivors-server-1.0.0.jar" (
    echo.
    echo ========================================
    echo ERROR: JAR file not found!
    echo ========================================
    echo Path: target\mini-survivors-server-1.0.0.jar
    echo.
    goto :error_exit
)

REM Try to add firewall rules for the server ports
echo Checking Windows Firewall rules...
set FIREWALL_RULES_ADDED=0
netsh advfirewall firewall show rule name="Mini Survivors Server Port 5173" >nul 2>&1
if errorlevel 1 (
    echo Adding firewall rule for port 5173...
    netsh advfirewall firewall add rule name="Mini Survivors Server Port 5173" dir=in action=allow protocol=TCP localport=5173 >nul 2>&1
    if not errorlevel 1 (
        echo Firewall rule added for port 5173.
        set FIREWALL_RULES_ADDED=1
    ) else (
        echo Warning: Could not add firewall rule for port 5173 (admin rights required)
    )
) else (
    echo Firewall rule for port 5173 already exists.
)

netsh advfirewall firewall show rule name="Mini Survivors Server Port 8080" >nul 2>&1
if errorlevel 1 (
    echo Adding firewall rule for port 8080...
    netsh advfirewall firewall add rule name="Mini Survivors Server Port 8080" dir=in action=allow protocol=TCP localport=8080 >nul 2>&1
    if not errorlevel 1 (
        echo Firewall rule added for port 8080.
        set FIREWALL_RULES_ADDED=1
    ) else (
        echo Warning: Could not add firewall rule for port 8080 (admin rights required)
    )
) else (
    echo Firewall rule for port 8080 already exists.
)

if !FIREWALL_RULES_ADDED! equ 0 (
    echo.
    echo Note: If you get "Connection Refused" with Tailscale IP, run as Administrator.
    echo.
)

REM Get Tailscale IP
set "TAILSCALE_IP="
set "GAME_URL="
where tailscale >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%i in ('tailscale ip 2^>nul') do (
        set "TAILSCALE_IP=%%i"
        if "!TAILSCALE_IP!" neq "" (
            REM Skip localhost and 127.x.x.x - only accept valid Tailscale IP
            echo !TAILSCALE_IP! | findstr /i /c:"localhost" >nul 2>&1
            if errorlevel 1 (
                echo !TAILSCALE_IP! | findstr /c:"127\." >nul 2>&1
                if errorlevel 1 (
                    REM Set GAME_URL only if it's not localhost or 127.x.x.x
                    set "GAME_URL=http://!TAILSCALE_IP!:5173"
                    echo Tailscale IP detected: !TAILSCALE_IP!
                ) else (
                    echo Skipping 127.x.x.x IP address.
                )
            ) else (
                echo Skipping localhost IP address.
            )
        )
        goto :tailscale_found
    )
)
:tailscale_found

REM Display detected IP info
if defined GAME_URL (
    echo Detected IP: !GAME_URL!
) else (
    echo No IP detected - browser will not open automatically.
)

REM Do NOT use local IP as fallback - only Tailscale IP
REM (Removed to prevent localhost/127.x.x.x connections)
:ip_found

echo ========================================
echo Starting server...
echo ========================================
echo.
echo Server will start in a separate window.
echo.
if defined TAILSCALE_IP (
    if "!TAILSCALE_IP!" neq "" (
        REM Ensure GAME_URL is set if TAILSCALE_IP is available (skip localhost/127.x.x.x)
        if not defined GAME_URL (
            echo !TAILSCALE_IP! | findstr /i /c:"localhost" >nul 2>&1
            if errorlevel 1 (
                echo !TAILSCALE_IP! | findstr /c:"127\." >nul 2>&1
                if errorlevel 1 (
                    set "GAME_URL=http://!TAILSCALE_IP!:5173"
                )
            )
        )
        echo Host will connect using Tailscale IP: http://!TAILSCALE_IP!:5173
        echo Browser will open automatically when server is ready.
        echo.
    ) else (
        echo ERROR: Tailscale IP not found.
        echo Please make sure Tailscale is installed and running.
        echo.
        echo You can still start the server, but you need to manually connect.
        echo.
    )
) else (
    echo ERROR: Tailscale is not installed or not in PATH.
    echo Please install Tailscale first.
    echo.
    echo You can still start the server, but you need to manually connect.
    echo.
)
echo To stop the server, close the server window.
echo.

REM Start server in a separate window
echo Starting Java server...
start "Mini Survivors Server" java -jar target\mini-survivors-server-1.0.0.jar

REM Wait for server to start
echo Waiting for server to start...
set SERVER_READY=0
for /l %%i in (1,1,30) do (
    timeout /t 1 >nul 2>&1
    netstat -an | findstr ":5173" | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo Server is ready!
        set SERVER_READY=1
        goto :server_ready
    )
)
:server_ready

REM Open browser ONCE if server is ready and URL is available
echo.
echo ========================================
echo Browser Opening Check
echo ========================================
echo SERVER_READY: !SERVER_READY!
echo GAME_URL: !GAME_URL!
echo TAILSCALE_IP: !TAILSCALE_IP!
echo.
set "BROWSER_OPENED=0"
if !SERVER_READY! equ 1 (
    if defined GAME_URL (
        if "!GAME_URL!" neq "" (
            echo Checking URL: !GAME_URL!
            REM Check for localhost or 127.x.x.x - reject these
            echo !GAME_URL! | findstr /i /c:"localhost" >nul 2>&1
            if not errorlevel 1 (
                echo REJECTED: localhost detected
            ) else (
                echo !GAME_URL! | findstr /c:"127\." >nul 2>&1
                if not errorlevel 1 (
                    echo REJECTED: 127.x.x.x detected
                ) else (
                    REM Check if it contains http://100. (Tailscale IP)
                    echo !GAME_URL! | findstr /c:"http://100." >nul 2>&1
                    if not errorlevel 1 (
                        echo APPROVED: Valid Tailscale IP URL
                        echo Opening browser: !GAME_URL!
                        start "" "!GAME_URL!"
                        set "BROWSER_OPENED=1"
                        timeout /t 2 >nul 2>&1
                        echo Browser command executed.
                    ) else (
                        echo REJECTED: URL does not contain http://100.x.x.x
                    )
                )
            )
        ) else (
            echo Browser NOT opened - GAME_URL is empty.
        )
    ) else (
        echo Browser NOT opened - GAME_URL not defined.
    )
) else (
    echo Browser NOT opened - Server not ready.
)
) else (
    echo.
    echo WARNING: Server may not be fully started yet.
    if defined GAME_URL (
        if "!GAME_URL!" neq "" (
            echo Please wait a moment and open manually: !GAME_URL!
        ) else (
            echo Please check the server window for errors.
        )
    ) else (
        echo Please check the server window for errors.
    )
    echo.
)

echo.
echo Server is running in a separate window.
if defined GAME_URL (
    if "!GAME_URL!" neq "" (
        echo Browser should open automatically: !GAME_URL!
    ) else (
        echo Please connect manually using your Tailscale IP.
    )
) else (
    echo Please connect manually using your Tailscale IP.
)
echo.
echo ========================================
echo Server startup script completed.
echo ========================================
echo.
echo To stop the server, close the server window.
echo Press any key to close this window (server will continue running)...
goto :end

:error_exit
echo.
echo Press any key to exit...
goto :end

:end
pause
endlocal
exit /b 0
