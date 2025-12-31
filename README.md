# Mini Survivors (브라우저 미니 게임)

Canvas로 만든 **Vampire Survivors 스타일** 미니 게임입니다. **Tailscale을 사용한 네트워크 멀티플레이**를 지원합니다!

## 실행 방법 (가장 간단)

1) 폴더에서 `index.html`을 더블클릭해서 브라우저로 열기

> 일부 브라우저/환경에서는 로컬 파일 실행이 제한될 수 있어요. 그럴 땐 아래 "로컬 서버" 방식으로 실행하세요.

## 실행 방법 (로컬 서버)

PowerShell에서 프로젝트 폴더로 이동 후:

```powershell
python -m http.server 5173
```

그 다음 브라우저에서 `http://localhost:5173` 접속.

## 네트워크 멀티플레이 (Tailscale)

### Tailscale 자동 설치

#### Windows
```powershell
.\install-tailscale.ps1
```

#### Linux/Mac
```bash
chmod +x install-tailscale.sh && ./install-tailscale.sh
```


### 서버 실행 (호스트)

1. **Node.js 설치 필요** (https://nodejs.org/)
2. **Tailscale 설치** (위의 자동 설치 스크립트 사용)
3. 의존성 설치:
   ```powershell
   npm install
   ```
4. 서버 시작:
   ```powershell
   npm start
   ```
5. **Tailscale IP 확인**:
   ```powershell
   tailscale ip
   ```
6. 브라우저에서 게임 열기 → **"3. 호스트 (멀티플레이)"** 선택

### 클라이언트 연결

1. **Tailscale 설치** (위의 자동 설치 스크립트 사용)
2. 호스트의 Tailscale IP를 받기 (예: `100.64.1.2`)
3. 브라우저에서 게임 열기 → **"4. 조인 (멀티플레이)"** 선택
4. 서버 주소 입력: `ws://100.64.1.2:8080` (호스트의 Tailscale IP 사용)
5. 연결 후 호스트가 게임을 시작하면 자동으로 참여

### 연결 문제 해결

**100.101.35.13 같은 Tailscale IP로 접속이 안 될 때 (단계별 해결):**

#### 1단계: 서버 실행 확인 (호스트)
```powershell
# 프로젝트 폴더에서
npm start
```
- 콘솔에 "서버가 모든 인터페이스에서 리스닝 중입니다" 메시지 확인
- "Tailscale: ws://100.101.35.13:8080" 메시지 확인
- 이 메시지가 없다면 서버가 제대로 시작되지 않은 것

#### 2단계: 방화벽 설정 (가장 흔한 원인!) (호스트)
Windows 방화벽이 포트 8080을 차단하고 있을 가능성이 높습니다.

**자동 설정 (권장):**
`start.bat`를 실행하면 자동으로 방화벽 규칙이 추가됩니다. (관리자 권한으로 실행 권장)

**수동 설정:**
```powershell
# PowerShell을 관리자 권한으로 실행 후:
netsh advfirewall firewall add rule name="WebSocket Server" dir=in action=allow protocol=TCP localport=8080
```

또는 Windows 방화벽 설정에서:
1. Windows 보안 → 방화벽 및 네트워크 보호
2. 고급 설정
3. 인바운드 규칙 → 새 규칙
4. 포트 선택 → TCP → 특정 로컬 포트: 8080
5. 연결 허용 → 모든 프로필 선택 → 이름: "WebSocket Server"

#### 3단계: Tailscale 상태 확인 (호스트 & 클라이언트)
```powershell
# 두 컴퓨터 모두에서 실행
tailscale status  # 연결 상태 확인
tailscale ip      # IP 주소 확인 (호스트는 100.101.35.13이어야 함)
```
- 두 컴퓨터가 같은 Tailscale 계정으로 로그인되어 있어야 함
- 호스트의 IP가 `100.101.35.13`과 일치하는지 확인

#### 4단계: 네트워크 연결 테스트 (클라이언트)
클라이언트 컴퓨터에서 PowerShell 실행:
```powershell
Test-NetConnection -ComputerName 100.101.35.13 -Port 8080
```
- **"TcpTestSucceeded: True"** → 연결 가능 (서버가 실행되지 않았거나 다른 문제)
- **"TcpTestSucceeded: False"** → 방화벽 문제 (2단계 참고)

#### 5단계: 서버 로그 확인 (호스트)
클라이언트에서 연결 시도 시 호스트 서버 콘솔 확인:
- **로그가 나타남** → 연결은 되지만 다른 문제일 수 있음
- **로그가 없음** → 방화벽이 연결을 차단하고 있음 (2단계 참고)

#### 빠른 진단
클라이언트에서 PowerShell 실행:
```powershell
Test-NetConnection -ComputerName 100.101.35.13 -Port 8080
```
- **False** → 방화벽 문제 (2단계 참고)
- **True** → 서버가 실행되지 않았거나 다른 문제 (1단계, 3단계 참고)


### 주의사항

- 호스트와 클라이언트 모두 **Tailscale이 설치되어 있어야** 합니다
- 방화벽에서 포트 8080이 열려 있어야 합니다
- 호스트가 게임을 시작/리셋하면 모든 플레이어가 동기화됩니다
- 서버 IP는 `tailscale ip` 명령으로 확인하세요
- Tailscale 계정이 필요합니다 (무료): https://tailscale.com

## 조작

- **P1 이동**: WASD
- **P1 대시**: Space
- **2인 토글**: M (게임 시작 전/게임오버에서 토글하면 안전)
- **P2 이동(2인일 때)**: 방향키
- **P2 대시(2인일 때)**: Enter
- **일시정지**: P
- **레벨 업 선택**: 1~3 또는 클릭
- **사망 후 재시작**: R

## 게임 규칙

- 적이 시간이 지날수록 많아지고 강해집니다.
- 공격은 자동으로 가장 가까운 적을 향해 발사됩니다.
- 경험치(초록 구슬)를 주우면 레벨 업합니다.
- 레벨 업 시 3가지 업그레이드 중 하나를 선택합니다.
- **멀티플레이**: 플레이어 수만큼 적과 아이템이 증가합니다.

## 다음 확장 아이디어

- 무기 추가: 회전 칼, 번개, 폭발 등
- 스테이지/보스
- 진화(조건부 업그레이드)
- 모바일 터치 조작
