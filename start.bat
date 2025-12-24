@echo off
echo Starting Mini Survivors...
echo.

REM Check Java
java -version
if errorlevel 1 (
    echo Java not found. Opening game in browser...
    if exist "index.html" start "" "index.html"
    timeout /t 3
    pause
    exit /b 1
)

REM Check JAR
if not exist "target\mini-survivors-server-1.0.0.jar" (
    echo JAR not found. Building...
    if exist "mvnw.cmd" (
        call mvnw.cmd clean package -DskipTests
    ) else (
        call mvn clean package -DskipTests
    )
    if errorlevel 1 (
        echo Build failed!
        pause
        exit /b 1
    )
)

echo Starting server...
java -jar target\mini-survivors-server-1.0.0.jar

REM 서버가 종료되면 창도 자동으로 닫힘
exit
