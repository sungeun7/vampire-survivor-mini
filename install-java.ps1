# Install Java 17 MSI - called by setup.bat
$msiPath = Join-Path $PSScriptRoot 'java-17-installer.msi'
if (Test-Path $msiPath) {
    $msiexec = Join-Path $env:SystemRoot 'System32\msiexec.exe'
    Start-Process -FilePath $msiexec -ArgumentList '/i', $msiPath, '/quiet', '/norestart', 'ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome' -Wait
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
}
