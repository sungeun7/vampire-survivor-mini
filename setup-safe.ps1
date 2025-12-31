# PowerShell wrapper for setup.bat - ensures window stays open
$Host.UI.RawUI.WindowTitle = "Mini Survivors - Setup"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Mini Survivors - Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Launching setup script..." -ForegroundColor Yellow
Write-Host ""

# Change to script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Run setup.bat with error handling
$exitCode = 0
try {
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "setup.bat" -Wait -NoNewWindow -PassThru
    $exitCode = $process.ExitCode
} catch {
    Write-Host "Error running setup.bat: $_" -ForegroundColor Red
    $exitCode = 1
}

# Always pause at the end
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($exitCode -ne 0) {
    Write-Host "Setup script ended with errors. Exit code: $exitCode" -ForegroundColor Red
} else {
    Write-Host "Setup script completed successfully." -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

exit $exitCode

