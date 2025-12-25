@echo off
setlocal enabledelayedexpansion

REM Change to script directory
cd /d "%~dp0"

echo ========================================
echo Mini Survivors - Environment Setup
echo ========================================
echo.
echo This script will install Java and Maven if needed.
echo.

REM Step 1: Check and install Java if needed
echo [1/2] Checking Java...
java -version >nul 2>&1
if errorlevel 1 (
    echo Java is not installed or not in PATH.
    echo Attempting to install Java automatically...
    echo.
    
    REM Try winget
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo Installing Java 11 using winget...
        winget install -e --id Microsoft.OpenJDK.11 --accept-source-agreements --accept-package-agreements --silent
        if not errorlevel 1 (
            echo Java installation completed!
            echo Waiting for environment variables to update...
            timeout /t 5 >nul
            
            REM Try to find Java in common installation paths and add to PATH
            set JAVA_FOUND=0
            if exist "C:\Program Files\Microsoft" (
                for /f "delims=" %%i in ('dir /b /ad "C:\Program Files\Microsoft\jdk-11*" 2^>nul') do (
                    set "JAVA_BIN=C:\Program Files\Microsoft\%%i\bin"
                    if exist "!JAVA_BIN!\java.exe" (
                        set "PATH=!JAVA_BIN!;%PATH%"
                        set JAVA_FOUND=1
                        goto :java_path_set
                    )
                )
            )
            if exist "C:\Program Files\Eclipse Adoptium" (
                for /f "delims=" %%i in ('dir /b /ad "C:\Program Files\Eclipse Adoptium\jdk-11*" 2^>nul') do (
                    set "JAVA_BIN=C:\Program Files\Eclipse Adoptium\%%i\bin"
                    if exist "!JAVA_BIN!\java.exe" (
                        set "PATH=!JAVA_BIN!;%PATH%"
                        set JAVA_FOUND=1
                        goto :java_path_set
                    )
                )
            )
            :java_path_set
            if !JAVA_FOUND! equ 1 (
                echo Java path added to current session.
            )
        )
    )
    
    REM Try Chocolatey if winget failed
    java -version >nul 2>&1
    if errorlevel 1 (
        where choco >nul 2>&1
        if not errorlevel 1 (
            echo Installing Java 11 using Chocolatey...
            choco install openjdk11 -y
            if not errorlevel 1 (
                echo Java installation completed!
                timeout /t 3 >nul
                if exist "%ProgramData%\chocolatey\bin\refreshenv.cmd" (
                    call "%ProgramData%\chocolatey\bin\refreshenv.cmd" >nul 2>&1
                )
            )
        )
    )
    
    REM Final check
    java -version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ERROR: Java installation failed or not completed.
        echo.
        echo Please install Java manually:
        echo 1. Visit https://adoptium.net/temurin/releases/
        echo 2. Download "Java 11 (LTS)" or newer version
        echo 3. Install and restart this script
        echo.
        pause
        exit /b 1
    )
)

echo Java installation verified.
java -version
echo.

REM Step 2: Check and install Maven if needed
echo [2/2] Checking Maven...
mvn -version >nul 2>&1
if errorlevel 1 (
    echo Maven is not installed or not in PATH.
    echo Attempting to install Maven automatically...
    echo.
    
    REM Check if portable Maven already exists in project directory
    set MAVEN_INSTALLED=0
    set "MAVEN_CMD="
    if exist "maven\bin\mvn.cmd" (
        echo Using portable Maven from project directory...
        set "MAVEN_HOME=%~dp0maven"
        set "MAVEN_CMD=%~dp0maven\bin\mvn.cmd"
        REM Verify it works
        call "!MAVEN_CMD!" -version >nul 2>&1
        if not errorlevel 1 (
            set MAVEN_INSTALLED=1
            echo Portable Maven verified.
        ) else (
            echo Warning: Portable Maven found but not working, will try to reinstall...
            set MAVEN_INSTALLED=0
            set "MAVEN_CMD="
        )
    )
    
    if !MAVEN_INSTALLED! equ 0 (
        REM Try Chocolatey first (most reliable)
        where choco >nul 2>&1
        if not errorlevel 1 (
            echo Installing Maven using Chocolatey...
            choco install maven -y
            if not errorlevel 1 (
                echo Maven installation completed via Chocolatey!
                timeout /t 3 >nul
                if exist "%ProgramData%\chocolatey\bin\refreshenv.cmd" (
                    call "%ProgramData%\chocolatey\bin\refreshenv.cmd" >nul 2>&1
                )
                where mvn.cmd >nul 2>&1
                if not errorlevel 1 (
                    set MAVEN_INSTALLED=1
                    set "MAVEN_CMD=mvn.cmd"
                )
            )
        )
        
        REM Try winget if Chocolatey failed or not available
        if !MAVEN_INSTALLED! equ 0 (
            where winget >nul 2>&1
            if not errorlevel 1 (
                echo Installing Maven using winget...
                winget install --id Apache.Maven --accept-source-agreements --accept-package-agreements --silent >nul 2>&1
                set WINGET_RESULT=!errorlevel!
                if !WINGET_RESULT! neq 0 (
                    echo Trying alternative winget package...
                    winget install Maven --accept-source-agreements --accept-package-agreements --silent >nul 2>&1
                    set WINGET_RESULT=!errorlevel!
                )
                if !WINGET_RESULT! equ 0 (
                    echo Maven installation completed via winget!
                    timeout /t 5 >nul
                    if exist "%ProgramData%\chocolatey\bin\refreshenv.cmd" (
                        call "%ProgramData%\chocolatey\bin\refreshenv.cmd" >nul 2>&1
                    )
                    REM Refresh PATH in current session
                    set "PATH=%PATH%;%ProgramFiles%\Apache\Maven\bin;%ProgramFiles(x86)%\Apache\Maven\bin"
                    where mvn.cmd >nul 2>&1
                    if not errorlevel 1 (
                        set MAVEN_INSTALLED=1
                        set "MAVEN_CMD=mvn.cmd"
                    ) else (
                        echo Warning: Maven installed but not in PATH, trying direct download...
                    )
                ) else (
                    echo winget Maven installation failed, trying direct download...
                )
            )
        )
        
        REM Download and extract Maven portable version if package managers failed
        if !MAVEN_INSTALLED! equ 0 (
            echo Downloading Maven portable version directly...
            
            REM Change to script directory
            cd /d "%~dp0"
            
            set "MAVEN_URL=https://archive.apache.org/dist/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip"
            set "MAVEN_URL2=https://dlcdn.apache.org/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip"
            set "MAVEN_ZIP=%~dp0maven-temp.zip"
            set "MAVEN_TARGET=%~dp0maven"
            set "MAVEN_TEMP=%~dp0maven-temp-extract"
            
            REM Try curl first (Windows 10+ has curl built-in)
            set DOWNLOAD_SUCCESS=0
            where curl >nul 2>&1
            if not errorlevel 1 (
                echo Downloading Maven using curl...
                curl -L -f --progress-bar -o "!MAVEN_ZIP!" "!MAVEN_URL!"
                if errorlevel 1 (
                    echo Trying mirror URL...
                    curl -L -f --progress-bar -o "!MAVEN_ZIP!" "!MAVEN_URL2!"
                )
                if not errorlevel 1 (
                    if exist "!MAVEN_ZIP!" (
                        REM Check if file size is reasonable (should be > 1MB)
                        for %%A in ("!MAVEN_ZIP!") do set ZIP_SIZE=%%~zA
                        if !ZIP_SIZE! GTR 1048576 (
                            echo Download completed successfully ^(size: !ZIP_SIZE! bytes^)
                            set DOWNLOAD_SUCCESS=1
                        ) else (
                            echo Download failed: file too small ^(!ZIP_SIZE! bytes^, likely HTML error page^)
                            del "!MAVEN_ZIP!" >nul 2>&1
                        )
                    ) else (
                        echo curl download failed: file not found after download
                    )
                ) else (
                    echo curl download failed with error code: %errorlevel%
                )
            )
            
            REM Try PowerShell download as fallback (more reliable than bitsadmin)
            if !DOWNLOAD_SUCCESS! equ 0 (
                where powershell >nul 2>&1
                if not errorlevel 1 (
                    echo Downloading Maven using PowerShell...
                    call :download_maven_ps "!MAVEN_URL!" "!MAVEN_ZIP!"
                    if errorlevel 1 (
                        call :download_maven_ps "!MAVEN_URL2!" "!MAVEN_ZIP!"
                    )
                    if not errorlevel 1 (
                        if exist "!MAVEN_ZIP!" (
                            for %%A in ("!MAVEN_ZIP!") do set ZIP_SIZE=%%~zA
                            if !ZIP_SIZE! GTR 1048576 (
                                echo Download completed successfully ^(size: !ZIP_SIZE! bytes^)
                                set DOWNLOAD_SUCCESS=1
                            ) else (
                                del "!MAVEN_ZIP!" >nul 2>&1
                            )
                        )
                    )
                )
            )
            
            REM Extract if download succeeded
            if !DOWNLOAD_SUCCESS! equ 1 (
                echo Extracting Maven...
                
                if exist "!MAVEN_TEMP!" rmdir /s /q "!MAVEN_TEMP!" >nul 2>&1
                mkdir "!MAVEN_TEMP!" >nul 2>&1
                
                REM Try tar first (Windows 10+ has tar built-in)
                set EXTRACT_SUCCESS=0
                where tar >nul 2>&1
                if not errorlevel 1 (
                    tar -xf "!MAVEN_ZIP!" -C "!MAVEN_TEMP!"
                    if not errorlevel 1 (
                        for /f "delims=" %%d in ('dir /b /ad "!MAVEN_TEMP!\apache-maven-*" 2^>nul') do (
                            if exist "!MAVEN_TEMP!\%%d\bin\mvn.cmd" (
                                if exist "!MAVEN_TARGET!" rmdir /s /q "!MAVEN_TARGET!" >nul 2>&1
                                move "!MAVEN_TEMP!\%%d" "!MAVEN_TARGET!" >nul 2>&1
                                if exist "!MAVEN_TARGET!\bin\mvn.cmd" (
                                    rmdir /s /q "!MAVEN_TEMP!" >nul 2>&1
                                    del "!MAVEN_ZIP!" >nul 2>&1
                                    echo Maven portable installation completed!
                                    set "MAVEN_HOME=!MAVEN_TARGET!"
                                    set "MAVEN_CMD=!MAVEN_TARGET!\bin\mvn.cmd"
                                    set MAVEN_INSTALLED=1
                                    set EXTRACT_SUCCESS=1
                                )
                            )
                        )
                    )
                )
                
                REM Try PowerShell Expand-Archive if tar failed
                if !EXTRACT_SUCCESS! equ 0 (
                    where powershell >nul 2>&1
                    if not errorlevel 1 (
                        echo Extracting using PowerShell...
                        call :extract_maven_ps "!MAVEN_ZIP!" "!MAVEN_TEMP!" "!MAVEN_TARGET!"
                        if not errorlevel 1 (
                            if exist "!MAVEN_TARGET!\bin\mvn.cmd" (
                                set "MAVEN_HOME=!MAVEN_TARGET!"
                                set "MAVEN_CMD=!MAVEN_TARGET!\bin\mvn.cmd"
                                set MAVEN_INSTALLED=1
                                set EXTRACT_SUCCESS=1
                            )
                        )
                    )
                )
                
                REM Cleanup on failure
                if !EXTRACT_SUCCESS! equ 0 (
                    if exist "!MAVEN_TEMP!" rmdir /s /q "!MAVEN_TEMP!" >nul 2>&1
                    if exist "!MAVEN_ZIP!" del "!MAVEN_ZIP!" >nul 2>&1
                    echo Maven extraction failed.
                    set MAVEN_INSTALLED=0
                )
            ) else (
                echo.
                echo Automatic download failed. Please download Maven manually:
                echo 1. Visit: https://maven.apache.org/download.cgi
                echo 2. Download: apache-maven-3.9.6-bin.zip
                echo 3. Extract to: %~dp0maven
                echo 4. Run this script again
                echo.
                set MAVEN_INSTALLED=0
            )
        )
        
        REM Final check for Maven - use MAVEN_CMD if set, otherwise check system Maven
        if not defined MAVEN_CMD (
            if exist "maven\bin\mvn.cmd" (
                set "MAVEN_CMD=%~dp0maven\bin\mvn.cmd"
                set MAVEN_INSTALLED=1
            ) else (
                where mvn.cmd >nul 2>&1
                if not errorlevel 1 (
                    set "MAVEN_CMD=mvn.cmd"
                    set MAVEN_INSTALLED=1
                )
            )
        )
        if !MAVEN_INSTALLED! equ 0 (
            echo.
            echo ERROR: Maven installation failed.
            echo Please install Maven manually: https://maven.apache.org/download.cgi
            echo You can also extract Maven manually to the 'maven' folder in this directory
            echo.
            pause
            exit /b 1
        )
    )
)

echo Maven installation verified.
if defined MAVEN_CMD (
    call "!MAVEN_CMD!" -version
) else (
    mvn -version
)
echo.

echo ========================================
echo Setup completed successfully!
echo ========================================
echo.
echo You can now run start.bat to build and start the game server.
echo.
pause
endlocal
exit /b 0

REM Helper function for PowerShell download
:download_maven_ps
set "DL_URL=%~1"
set "DL_OUT=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -Uri '%DL_URL%' -OutFile '%DL_OUT%' -UseBasicParsing -ErrorAction Stop; if (Test-Path '%DL_OUT%') { $size = (Get-Item '%DL_OUT%').Length; if ($size -gt 1048576) { exit 0 } else { Remove-Item '%DL_OUT%' -Force; exit 1 } } else { exit 1 } } catch { exit 1 }"
exit /b %errorlevel%

REM Helper function for PowerShell extraction
:extract_maven_ps
setlocal enabledelayedexpansion
set "EX_ZIP=%~1"
set "EX_TEMP=%~2"
set "EX_TARGET=%~3"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Path '%EX_ZIP%' -DestinationPath '%EX_TEMP%' -Force -ErrorAction Stop; $dir = Get-ChildItem -Directory '%EX_TEMP%' | Where-Object { $_.Name -like 'apache-maven-*' } | Select-Object -First 1; if ($dir) { if (Test-Path '%EX_TARGET%') { Remove-Item '%EX_TARGET%' -Recurse -Force }; Move-Item -Path $dir.FullName -Destination '%EX_TARGET%' -Force }; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
    if exist "%EX_TARGET%\bin\mvn.cmd" (
        rmdir /s /q "%EX_TEMP%" >nul 2>&1
        del "%EX_ZIP%" >nul 2>&1
        echo Maven portable installation completed!
        endlocal
        exit /b 0
    )
)
endlocal
exit /b 1

