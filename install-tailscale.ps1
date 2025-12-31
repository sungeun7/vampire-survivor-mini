# Tailscale 자동 설치 스크립트 (Windows)
# PowerShell에서 실행: .\install-tailscale.ps1

Write-Host "Tailscale 설치를 시작합니다..." -ForegroundColor Cyan

# Tailscale 설치 여부 확인
$tailscaleInstalled = Get-Command tailscale -ErrorAction SilentlyContinue

if ($tailscaleInstalled) {
    Write-Host "Tailscale이 이미 설치되어 있습니다." -ForegroundColor Green
    Write-Host "Tailscale IP 확인 중..." -ForegroundColor Cyan
    $ip = tailscale ip 2>$null
    if ($ip) {
        Write-Host "Tailscale IP: $ip" -ForegroundColor Green
    } else {
        Write-Host "Tailscale이 실행되지 않았습니다. 'tailscale up' 명령으로 시작하세요." -ForegroundColor Yellow
    }
    exit 0
}

# Windows 버전 확인
$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -lt 10) {
    Write-Host "Windows 10 이상이 필요합니다." -ForegroundColor Red
    exit 1
}

Write-Host "Tailscale 다운로드 중..." -ForegroundColor Cyan

# Tailscale 다운로드 URL (Windows)
$downloadUrl = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
$installerPath = "$env:TEMP\tailscale-setup.exe"

try {
    # 다운로드
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "다운로드 완료. 설치를 시작합니다..." -ForegroundColor Green
    
    # 설치 실행 (관리자 권한 필요)
    Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -Verb RunAs
    
    Write-Host "`n설치가 완료되었습니다!" -ForegroundColor Green
    Write-Host "Tailscale을 시작하려면:" -ForegroundColor Cyan
    Write-Host "  1. 시작 메뉴에서 'Tailscale' 검색 후 실행" -ForegroundColor Yellow
    Write-Host "  2. 또는 PowerShell에서: tailscale up" -ForegroundColor Yellow
    Write-Host "`nTailscale IP 확인: tailscale ip" -ForegroundColor Cyan
    
} catch {
    Write-Host "오류 발생: $_" -ForegroundColor Red
    Write-Host "수동 설치: https://tailscale.com/download" -ForegroundColor Yellow
    exit 1
} finally {
    # 임시 파일 정리
    if (Test-Path $installerPath) {
        Remove-Item $installerPath -ErrorAction SilentlyContinue
    }
}

