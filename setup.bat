@echo off
REM Ensure window stays open - use goto to skip to end on any error
title Mini Survivors - Setup

REM Use COMSPEC to ensure we can find cmd.exe
if "%COMSPEC%"=="" set COMSPEC=%SystemRoot%\system32\cmd.exe

REM Clear screen and show startup message immediately
cls
echo ========================================
echo Mini Survivors - Environment Setup
echo ========================================
echo.
echo Script is starting...
echo Current directory: %CD%
echo Script location: %~dp0
echo.
echo Please wait...
echo.
timeout /t 2 >nul 2>&1

REM Always ensure we reach script_end - wrap everything in error handling
set MAIN_EXIT_CODE=0

REM Call main script logic with error handling
call :main_script 2>&1
if errorlevel 1 (
    set MAIN_EXIT_CODE=1
)

REM Always go to script_end - use goto to ensure we reach it
goto :script_end

REM If we somehow get here, go to script_end
goto :script_end

REM If script fails before reaching script_end, this will catch it
:catch_error
set MAIN_EXIT_CODE=1
goto :script_end

REM Error handler - catch any unexpected errors
:error_handler
set MAIN_EXIT_CODE=1
goto :script_end

:script_end
REM Show completion message - always execute this
echo.
echo ========================================
if %MAIN_EXIT_CODE% neq 0 (
    echo Script ended with errors. Exit code: %MAIN_EXIT_CODE%
) else (
    echo Script completed successfully.
)
echo ========================================
echo.
echo Press any key to close this window...
REM Use regular pause to ensure it works
pause
exit /b %MAIN_EXIT_CODE%

:main_script
REM Display startup message
echo Starting setup script...
echo.

REM Change to script directory first
cd /d "%~dp0" 2>nul
if errorlevel 1 (
    echo ERROR: Cannot change to script directory.
    echo Current directory: %CD%
    echo Script path: %~f0
    echo.
    exit /b 1
)

REM Enable error handling - continue on error but track it
set "SCRIPT_ERROR=0"

echo ========================================
echo Mini Survivors - Environment Setup
echo ========================================
echo.
echo This script will install Java and Maven if needed.
echo.

REM Step 1: Check and install Java if needed
echo (1/2) Checking Java...
java -version >nul 2>&1
if errorlevel 1 goto :java_not_found
goto :java_found

:java_not_found
echo Java is not installed or not in PATH.
echo Attempting to install Java automatically...
echo.

REM Try winget
where winget >nul 2>&1
if not errorlevel 1 (
        echo Installing Java 17 using winget...
        winget install -e --id Microsoft.OpenJDK.17 --accept-source-agreements --accept-package-agreements --silent
        if not errorlevel 1 (
            echo Java installation completed!
            echo Waiting for environment variables to update...
            timeout /t 5 >nul

            REM Try to find Java in common installation paths and add to PATH
            set JAVA_FOUND=0
            REM Note: Java path will be automatically added to system PATH by installer
            REM This section is for immediate use in current session
            echo Note: If Java was just installed, you may need to restart this script.
            echo The installer should have added Java to system PATH automatically.
        )
    )

    REM Try Chocolatey if winget failed
    java -version >nul 2>&1
    if errorlevel 1 (
        where choco >nul 2>&1
        if not errorlevel 1 (
            echo Installing Java 17 using Chocolatey...
            choco install openjdk17 -y
            if not errorlevel 1 (
                echo Java installation completed!
                timeout /t 3 >nul
                if exist "%ProgramData%\chocolatey\bin\refreshenv.cmd" (
                    call "%ProgramData%\chocolatey\bin\refreshenv.cmd" >nul 2>&1
                )
            )
        )
    )

    REM Try direct download and install if package managers failed
    java -version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo Package managers failed. Attempting direct download.
        echo Downloading Java 17 installer...
        REM Try PowerShell download if available
        set "PS_PATH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
        if exist "%PS_PATH%" (
            "%PS_PATH%" -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -Uri 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.msi' -OutFile 'java-17-installer.msi' -UseBasicParsing -ErrorAction Stop; if (Test-Path 'java-17-installer.msi') { $size = (Get-Item 'java-17-installer.msi').Length; if ($size -gt 1048576) { exit 0 } else { Remove-Item 'java-17-installer.msi' -Force; exit 1 } } else { exit 1 } } catch { exit 1 }" 2>nul
            if not errorlevel 1 (
                if exist "java-17-installer.msi" (
                    call :check_file_size_java "java-17-installer.msi"
                )
            )
        )
        REM Try curl as fallback if PowerShell failed or not available
        if not exist "java-17-installer.msi" (
            curl --version >nul 2>&1
            if not errorlevel 1 (
                echo Downloading Java 17 installer using curl...
                curl -L -f --progress-bar -o "java-17-installer.msi" "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.msi"
                if not errorlevel 1 (
                    if exist "java-17-installer.msi" (
                        call :check_file_size_java "java-17-installer.msi"
                    )
                )
            )
        )
        
        REM Install if download succeeded
        if exist "java-17-installer.msi" (
            echo.
            echo Installing Java 17...
            echo NOTE: Administrator rights may be required. Please approve the UAC prompt if it appears.
            echo.
            msiexec /i "java-17-installer.msi" /quiet /norestart ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome
            if not errorlevel 1 (
                echo Java installation completed!
                timeout /t 5 >nul
                echo Note: Java installer should have added Java to system PATH.
                echo If Java is not found, please restart this script or open a new command prompt.
            )
            if exist "java-17-installer.msi" del "java-17-installer.msi" >nul 2>&1
        )
    )

    REM Final check
    java -version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ERROR: Java installation failed or not completed.
        echo.
        echo Please install Java 17 manually:
        echo 1. Visit https://adoptium.net/temurin/releases/
        echo 2. Download "Java 17 (LTS)" - Windows x64 MSI installer
        echo 3. Run the installer and follow the prompts
        echo 4. Restart this script after installation
        echo.
        echo Alternative: Install using winget (run as Administrator):
        echo   winget install -e --id Microsoft.OpenJDK.17
        echo.
        goto :error_exit
    )
)
goto :java_check_done

:java_found
echo Java installation verified.
java -version
echo.

:java_check_done

REM Step 2: Check and install Maven if needed
echo (2/2) Checking Maven...
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
        set "MAVEN_HOME=maven"
        set "MAVEN_CMD=maven\bin\mvn.cmd"
        REM Verify it works
        call "%MAVEN_CMD%" -version >nul 2>&1
        if not errorlevel 1 (
            set MAVEN_INSTALLED=1
            echo Portable Maven verified.
        ) else (
            echo Warning: Portable Maven found but not working, will try to reinstall...
            set MAVEN_INSTALLED=0
            set "MAVEN_CMD="
        )
    )

    if %MAVEN_INSTALLED% equ 0 (
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
        if %MAVEN_INSTALLED% equ 0 (
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
        if %MAVEN_INSTALLED% equ 0 (
            echo Downloading Maven portable version directly...

            REM Change to script directory
            set "MAVEN_URL=https://archive.apache.org/dist/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip"
            set "MAVEN_URL2=https://dlcdn.apache.org/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.zip"
            set "MAVEN_ZIP=maven-temp.zip"
            set "MAVEN_TARGET=maven"
            set "MAVEN_TEMP=maven-temp-extract"

            REM Try curl first (Windows 10+ has curl built-in)
            set DOWNLOAD_SUCCESS=0
            where curl >nul 2>&1
            if not errorlevel 1 (
                echo Downloading Maven using curl...
                curl -L -f --progress-bar -o "%MAVEN_ZIP%" "%MAVEN_URL%"
                if errorlevel 1 (
                    echo Trying mirror URL...
                    curl -L -f --progress-bar -o "%MAVEN_ZIP%" "%MAVEN_URL2%"
                )
                if not errorlevel 1 (
                    if exist "%MAVEN_ZIP%" (
                        REM Check if file size is reasonable (should be > 1MB)
                        set ZIP_SIZE=0
                        for %%A in ("%MAVEN_ZIP%") do set ZIP_SIZE=%%~zA
                        setlocal enabledelayedexpansion
                        if !ZIP_SIZE! GTR 1048576 (
                            echo Download completed successfully ^(size: !ZIP_SIZE! bytes^)
                            endlocal & set DOWNLOAD_SUCCESS=1
                        ) else (
                            echo Download failed: file too small ^(!ZIP_SIZE! bytes^, likely HTML error page^)
                            del "%MAVEN_ZIP%" >nul 2>&1
                            endlocal & set DOWNLOAD_SUCCESS=0
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
                    call :download_maven_ps "%MAVEN_URL%" "%MAVEN_ZIP%"
                    if errorlevel 1 (
                        call :download_maven_ps "%MAVEN_URL2%" "%MAVEN_ZIP%"
                    )
                    if not errorlevel 1 (
                        if exist "%MAVEN_ZIP%" (
                            set ZIP_SIZE=0
                            for %%A in ("%MAVEN_ZIP%") do set ZIP_SIZE=%%~zA
                            setlocal enabledelayedexpansion
                            if !ZIP_SIZE! GTR 1048576 (
                                echo Download completed successfully ^(size: !ZIP_SIZE! bytes^)
                                endlocal & set DOWNLOAD_SUCCESS=1
                            ) else (
                                del "%MAVEN_ZIP%" >nul 2>&1
                                endlocal & set DOWNLOAD_SUCCESS=0
                            )
                        )
                    )
                )
            )

            REM Extract if download succeeded
            if %DOWNLOAD_SUCCESS% equ 1 (
                echo Extracting Maven...

                if exist "%MAVEN_TEMP%" rmdir /s /q "%MAVEN_TEMP%" >nul 2>&1
                mkdir "%MAVEN_TEMP%" >nul 2>&1

                REM Try tar first (Windows 10+ has tar built-in)
                set EXTRACT_SUCCESS=0
                where tar >nul 2>&1
                if not errorlevel 1 (
                    tar -xf "%MAVEN_ZIP%" -C "%MAVEN_TEMP%"
                    if not errorlevel 1 (
                        for /f "delims=" %%d in ('dir /b /ad "%MAVEN_TEMP%\apache-maven-*" 2^>nul') do (
                            if exist "%MAVEN_TEMP%\%%d\bin\mvn.cmd" (
                                if exist "%MAVEN_TARGET%" rmdir /s /q "%MAVEN_TARGET%" >nul 2>&1
                                move "%MAVEN_TEMP%\%%d" "%MAVEN_TARGET%" >nul 2>&1
                                if exist "%MAVEN_TARGET%\bin\mvn.cmd" (
                                    rmdir /s /q "%MAVEN_TEMP%" >nul 2>&1
                                    del "%MAVEN_ZIP%" >nul 2>&1
                                    echo Maven portable installation completed!
                                    set "MAVEN_HOME=%MAVEN_TARGET%"
                                    set "MAVEN_CMD=%MAVEN_TARGET%\bin\mvn.cmd"
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
                        call :extract_maven_ps "%MAVEN_ZIP%" "%MAVEN_TEMP%" "%MAVEN_TARGET%"
                        if not errorlevel 1 (
                            if exist "%MAVEN_TARGET%\bin\mvn.cmd" (
                                set "MAVEN_HOME=%MAVEN_TARGET%"
                                set "MAVEN_CMD=%MAVEN_TARGET%\bin\mvn.cmd"
                                set MAVEN_INSTALLED=1
                                set EXTRACT_SUCCESS=1
                            )
                        )
                    )
                )

                REM Cleanup on failure
                if %EXTRACT_SUCCESS% equ 0 (
                    if exist "%MAVEN_TEMP%" rmdir /s /q "%MAVEN_TEMP%" >nul 2>&1
                    if exist "%MAVEN_ZIP%" del "%MAVEN_ZIP%" >nul 2>&1
                    echo Maven extraction failed.
                    set MAVEN_INSTALLED=0
                )
            ) else (
                echo.
                echo Automatic download failed. Please download Maven manually:
                echo 1. Visit: https://maven.apache.org/download.cgi
                echo 2. Download: apache-maven-3.9.6-bin.zip
                echo 3. Extract to: maven
                echo 4. Run this script again
                echo.
                set MAVEN_INSTALLED=0
            )
        )

        REM Final check for Maven - use MAVEN_CMD if set, otherwise check system Maven
        if not defined MAVEN_CMD (
            if exist "maven\bin\mvn.cmd" (
                set "MAVEN_CMD=maven\bin\mvn.cmd"
                set MAVEN_INSTALLED=1
            ) else (
                where mvn.cmd >nul 2>&1
                if not errorlevel 1 (
                    set "MAVEN_CMD=mvn.cmd"
                    set MAVEN_INSTALLED=1
                )
            )
        )
        if %MAVEN_INSTALLED% equ 0 (
            echo.
            echo ERROR: Maven installation failed.
            echo Please install Maven manually: https://maven.apache.org/download.cgi
            echo You can also extract Maven manually to the 'maven' folder in this directory
            echo.
            goto :error_exit
        )
    )
)

echo Maven installation verified.
if defined MAVEN_CMD (
    call "%MAVEN_CMD%" -version
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
goto :script_end

:error_exit
echo.
set MAIN_EXIT_CODE=1
goto :script_end

REM Note: :script_end is defined in the main script wrapper above

REM Helper function to download Java directly
:download_java_direct
set "DOWNLOAD_OK=0"

REM Try PowerShell first
powershell -Command "exit 0" >nul 2>&1
if not errorlevel 1 (
    call :download_java_ps "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.msi" "java-17-installer.msi"
    if not errorlevel 1 (
        if exist "java-17-installer.msi" (
            call :check_file_size_java "java-17-installer.msi"
            if not errorlevel 1 (
                set "DOWNLOAD_OK=1"
            )
        )
    )
)

REM Try curl as fallback
if "%DOWNLOAD_OK%"=="0" (
    curl --version >nul 2>&1
    if not errorlevel 1 (
        echo Downloading Java 17 installer using curl...
        curl -L -f --progress-bar -o "java-17-installer.msi" "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.msi"
        if not errorlevel 1 (
            if exist "java-17-installer.msi" (
                call :check_file_size_java "java-17-installer.msi"
                if not errorlevel 1 (
                    set "DOWNLOAD_OK=1"
                )
            )
        )
    )
)

REM Install if download succeeded
if "%DOWNLOAD_OK%"=="1" (
    echo.
    echo Installing Java 17...
    echo NOTE: Administrator rights may be required. Please approve the UAC prompt if it appears.
    echo.
    msiexec /i "java-17-installer.msi" /quiet /norestart ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome
    if not errorlevel 1 (
        echo Java installation completed!
        timeout /t 5 >nul
        echo Note: Java installer should have added Java to system PATH.
        echo If Java is not found, please restart this script or open a new command prompt.
    )
    if exist "java-17-installer.msi" del "java-17-installer.msi" >nul 2>&1
)
exit /b 0

REM Helper function to check Java file size
:check_file_size_java
setlocal enabledelayedexpansion
set "CHECK_FILE=%~1"
set MSI_SIZE=0
for %%A in ("!CHECK_FILE!") do set MSI_SIZE=%%~zA
if !MSI_SIZE! GTR 1048576 (
    echo Download completed successfully ^(size: !MSI_SIZE! bytes^)
    endlocal
    exit /b 0
) else (
    echo Download failed: file too small
    del "!CHECK_FILE!" >nul 2>&1
    endlocal
    exit /b 1
)

REM Helper function for PowerShell download (Java)
:download_java_ps
set "DL_URL=%~1"
set "DL_OUT=%~2"
set "PS_PATH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_PATH%" (
    exit /b 1
)
"%PS_PATH%" -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -Uri '%DL_URL%' -OutFile '%DL_OUT%' -UseBasicParsing -ErrorAction Stop; if (Test-Path '%DL_OUT%') { $size = (Get-Item '%DL_OUT%').Length; if ($size -gt 1048576) { exit 0 } else { Remove-Item '%DL_OUT%' -Force; exit 1 } } else { exit 1 } } catch { exit 1 }" 2>nul
exit /b %errorlevel%

REM Helper function for PowerShell download (Maven)
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

