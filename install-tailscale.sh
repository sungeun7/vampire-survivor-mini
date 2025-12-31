#!/bin/bash
# Tailscale 자동 설치 스크립트 (Linux/Mac)
# 실행: chmod +x install-tailscale.sh && ./install-tailscale.sh

echo "Tailscale 설치를 시작합니다..."

# Tailscale 설치 여부 확인
if command -v tailscale &> /dev/null; then
    echo "Tailscale이 이미 설치되어 있습니다."
    echo "Tailscale IP 확인 중..."
    IP=$(tailscale ip 2>/dev/null)
    if [ -n "$IP" ]; then
        echo "Tailscale IP: $IP"
    else
        echo "Tailscale이 실행되지 않았습니다. 'tailscale up' 명령으로 시작하세요."
    fi
    exit 0
fi

# OS 확인
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        echo "Debian/Ubuntu 감지. Tailscale 설치 중..."
        curl -fsSL https://tailscale.com/install.sh | sh
    elif command -v yum &> /dev/null; then
        # RHEL/CentOS
        echo "RHEL/CentOS 감지. Tailscale 설치 중..."
        curl -fsSL https://tailscale.com/install.sh | sh
    elif command -v pacman &> /dev/null; then
        # Arch Linux
        echo "Arch Linux 감지. Tailscale 설치 중..."
        sudo pacman -S tailscale
    else
        echo "지원되지 않는 Linux 배포판입니다."
        echo "수동 설치: https://tailscale.com/download"
        exit 1
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &> /dev/null; then
        echo "Homebrew로 Tailscale 설치 중..."
        brew install tailscale
    else
        echo "Homebrew가 필요합니다. 설치: https://brew.sh"
        echo "또는 수동 설치: https://tailscale.com/download"
        exit 1
    fi
else
    echo "지원되지 않는 운영체제입니다."
    echo "수동 설치: https://tailscale.com/download"
    exit 1
fi

echo ""
echo "설치가 완료되었습니다!"
echo "Tailscale을 시작하려면: tailscale up"
echo "Tailscale IP 확인: tailscale ip"

