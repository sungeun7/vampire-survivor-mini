@echo off
@REM Licensed to the Apache Software Foundation (ASF) under one
@REM or more contributor license agreements.  See the NOTICE file
@REM distributed with this work for additional information
@REM regarding copyright ownership.  The ASF licenses this file
@REM to you under the Apache License, Version 2.0 (the
@REM "License"); you may not use this file except in compliance
@REM with the License.  You may obtain a copy of the License at
@REM
@REM    https://www.apache.org/licenses/LICENSE-2.0
@REM
@REM Unless required by applicable law or agreed to in writing,
@REM software distributed under the License is distributed on an
@REM "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
@REM KIND, either express or implied.  See the License for the
@REM specific language governing permissions and limitations
@REM under the License.

@REM Maven Wrapper startup script for Windows

if exist "%USERPROFILE%\.m2\wrapper\dists\maven-wrapper-3.2.0\maven-wrapper.jar" (
    set WRAPPER_JAR=%USERPROFILE%\.m2\wrapper\dists\maven-wrapper-3.2.0\maven-wrapper.jar
) else (
    set WRAPPER_JAR=%~dp0maven-wrapper.jar
)

if not exist "%WRAPPER_JAR%" (
    echo Maven Wrapper JAR not found. Downloading...
    powershell -Command "Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar' -OutFile '%WRAPPER_JAR%'"
)

@REM Provide a "standardized" way to retrieve the CLI args that will
@REM work with both Windows and non-Windows executions.
set MAVEN_CMD_LINE_ARGS=%*

java.exe ^
    -Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR% ^
    -classpath "%WRAPPER_JAR%" ^
    org.apache.maven.wrapper.MavenWrapperMain %MAVEN_CMD_LINE_ARGS%
if ERRORLEVEL 1 goto error
goto end

:error
set ERROR_CODE=1

:end
@ENDLOCAL
set ERROR_CODE=%ERROR_CODE%
exit /b %ERROR_CODE%

