#!/bin/bash

echo "🎮 Mini Survivors 서버 시작 중..."
echo ""

# Node.js가 설치되어 있는지 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo "   https://nodejs.org/ 에서 Node.js를 설치하세요."
    exit 1
fi

# 의존성이 설치되어 있는지 확인
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 설치 중..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 의존성 설치 실패"
        exit 1
    fi
fi

# 서버 시작
echo "✅ 서버 시작 중..."
echo "   브라우저가 자동으로 열립니다..."
echo ""
echo "   서버를 중지하려면 Ctrl+C를 누르세요."
echo ""

npm start

