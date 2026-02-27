# Download Java 17 installer - called by setup.bat
$ProgressPreference = 'SilentlyContinue'
$url = 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.msi'
$outFile = Join-Path $PSScriptRoot 'java-17-installer.msi'
try {
    Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing -ErrorAction Stop
    if ((Get-Item $outFile).Length -gt 1048576) { exit 0 }
    Remove-Item $outFile -Force
    exit 1
} catch {
    exit 1
}
