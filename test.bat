@echo off
echo Test 1: Java check
java -version
echo.
echo Test 2: Current directory
cd
echo.
echo Test 3: Files check
if exist "index.html" (echo index.html exists) else (echo index.html NOT found)
if exist "pom.xml" (echo pom.xml exists) else (echo pom.xml NOT found)
if exist "mvnw.cmd" (echo mvnw.cmd exists) else (echo mvnw.cmd NOT found)
if exist "target\mini-survivors-server-1.0.0.jar" (echo JAR exists) else (echo JAR NOT found)
echo.
echo Test 4: Maven check
where mvn >nul 2>&1
if %errorlevel% equ 0 (echo Maven found) else (echo Maven NOT found)
echo.
pause

