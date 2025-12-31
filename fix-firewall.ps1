# Windows 방화벽 규칙 추가 스크립트
# 관리자 권한으로 실행 필요

Write-Host "🔧 WebSocket 서버 방화벽 규칙 추가 중..." -ForegroundColor Cyan
Write-Host ""

# 기존 규칙 확인
$existingRule = Get-NetFirewallRule -Name "WebSocket Server" -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "⚠️  기존 규칙이 이미 존재합니다." -ForegroundColor Yellow
    Write-Host "규칙을 삭제하고 다시 추가합니다..." -ForegroundColor Yellow
    Remove-NetFirewallRule -Name "WebSocket Server" -ErrorAction SilentlyContinue
}

# 새 규칙 추가
try {
    New-NetFirewallRule -DisplayName "WebSocket Server" -Name "WebSocket Server" `
        -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow `
        -Description "Vampire Survivor Mini 게임 멀티플레이 서버용 포트"
    
    Write-Host "✅ 방화벽 규칙이 성공적으로 추가되었습니다!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 추가된 규칙:" -ForegroundColor Cyan
    Get-NetFirewallRule -Name "WebSocket Server" | Format-Table DisplayName, Direction, Protocol, LocalPort, Action -AutoSize
    Write-Host ""
    Write-Host "💡 이제 서버를 시작하고 연결을 테스트하세요:" -ForegroundColor Yellow
    Write-Host "   npm start" -ForegroundColor White
    Write-Host "   Test-NetConnection -ComputerName 100.101.35.13 -Port 8080" -ForegroundColor White
} catch {
    Write-Host "❌ 오류 발생: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 관리자 권한으로 실행했는지 확인하세요:" -ForegroundColor Yellow
    Write-Host "   1. PowerShell을 마우스 오른쪽 클릭" -ForegroundColor White
    Write-Host "   2. '관리자 권한으로 실행' 선택" -ForegroundColor White
    Write-Host "   3. 이 스크립트 다시 실행" -ForegroundColor White
    exit 1
}

