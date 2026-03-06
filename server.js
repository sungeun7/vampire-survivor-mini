const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const PORT = 8080;
const HTTP_PORT = 8081; // IP 정보 제공용 HTTP 서버
let GAME_PORT = 5173; // 게임 파일 제공용 HTTP 서버 (기본값)

// LAN IP 조회 (같은 Wi‑Fi 참가용)
function getLANIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        return iface.address;
      }
    }
  }
  return null;
}

let serverIP = getLANIP();
console.log(`\n📡 WebSocket 서버 시작:`);
console.log(`   로컬: ws://localhost:${PORT}`);
if (serverIP) {
  console.log(`   같은 Wi‑Fi(LAN): ws://${serverIP}:${PORT}`);
  console.log(`\n💡 참가: 방 코드 또는 ws://${serverIP}:${PORT}`);
}
console.log(`   리스닝 중...\n`);

const wss = new WebSocket.Server({
  port: PORT,
  host: '0.0.0.0'
});

// 게임 상태 (서버가 권한자)
let gameState = {
  started: false,
  t: 0,
  paused: false,
  gameOver: false,
  players: {}, // { clientId: playerData }
  enemies: [],
  projectiles: [],
  orbs: [],
};

// 클라이언트 관리
const clients = new Map(); // clientId -> { ws, playerId, isHost }

let nextPlayerId = 1;
let hostId = null;

// 게임 루프 (서버가 게임 로직 실행)
let lastUpdate = Date.now();
const TICK_RATE = 60; // 60 FPS
const TICK_INTERVAL = 1000 / TICK_RATE;

function broadcast(data, excludeClientId = null) {
  const msg = JSON.stringify(data);
  clients.forEach((client, id) => {
    if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(msg);
      } catch (err) {
        console.error(`메시지 전송 실패 (${id}):`, err);
        // 전송 실패 시 클라이언트 제거
        client.ws.terminate();
      }
    }
  });
}

function broadcastState() {
  broadcast({
    type: 'state',
    state: gameState,
  });
}

// 간단한 게임 로직 (서버에서 실행)
function updateGame(dt) {
  if (!gameState.started || gameState.paused || gameState.gameOver) return;

  gameState.t += dt;

  // 적 스폰 (간단화)
  const spawnRate = 0.9 + gameState.t / 35;
  const playerCount = Object.keys(gameState.players).length;
  const adjustedSpawnRate = spawnRate * playerCount;

  // TODO: 실제 게임 로직은 클라이언트와 동기화 필요
  // 지금은 플레이어 위치만 동기화
}

// 게임 루프
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastUpdate) / 1000, 0.1);
  lastUpdate = now;

  if (gameState.started) {
    updateGame(dt);
    broadcastState();
  }
}, TICK_INTERVAL);

// 서버 시작 확인
wss.on('listening', () => {
  console.log(`\n✅ WebSocket 서버가 포트 ${PORT}에서 리스닝 중입니다.`);
  console.log(`   바인딩 주소: 0.0.0.0 (모든 네트워크 인터페이스)`);
  console.log(`   로컬 주소: ws://localhost:${PORT}`);
  if (serverIP) {
    console.log(`   LAN: ws://${serverIP}:${PORT}`);
  }
  console.log(`\n📡 서버가 모든 인터페이스에서 연결을 기다리는 중...\n`);
});

// 연결 오류 처리
wss.on('error', (error) => {
  console.error(`\n❌ WebSocket 서버 오류:`, error);
  if (error.code === 'EADDRINUSE') {
    console.error(`   포트 ${PORT}가 이미 사용 중입니다.`);
    console.error(`   다른 프로그램이 포트 ${PORT}를 사용하고 있는지 확인하세요.`);
  } else if (error.code === 'EACCES') {
    console.error(`   포트 ${PORT}에 접근할 수 없습니다. 관리자 권한이 필요할 수 있습니다.`);
  }
  process.exit(1);
});

wss.on('connection', (ws, req) => {
  const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const isHost = clients.size === 0;

  if (isHost) {
    hostId = clientId;
  }

  const playerId = `P${nextPlayerId++}`;
  clients.set(clientId, { ws, playerId, isHost });

  // WebSocket 연결 시 lastRequestTime 업데이트 (서버 종료 방지)
  lastRequestTime = Date.now();

  const clientIP = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const clientHost = req.headers['host'] || 'unknown';
  console.log(`\n✅ 클라이언트 연결 성공!`);
  console.log(`   클라이언트 ID: ${clientId}`);
  console.log(`   플레이어 ID: ${playerId} ${isHost ? '[HOST]' : '[GUEST]'}`);
  console.log(`   연결 주소: ${clientIP}:${req.socket.remotePort}`);
  console.log(`   요청 Host: ${clientHost}`);
  console.log(`   현재 연결된 클라이언트 수: ${clients.size}`);
  console.log(`   User-Agent: ${req.headers['user-agent'] || 'unknown'}`);

  // Keepalive: 주기적으로 핑 전송 (30초마다)
  const keepaliveInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.ping();
      } catch (err) {
        console.error(`핑 전송 실패 (${clientId}):`, err);
        clearInterval(keepaliveInterval);
      }
    } else {
      clearInterval(keepaliveInterval);
    }
  }, 30000);

  // 초기 상태 전송 (Tailscale IP 포함)
  try {
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      playerId,
      isHost,
      state: gameState,
      serverIP: serverIP,
      tailscaleIP: serverIP,
      wsUrl: serverIP ? `ws://${serverIP}:${PORT}` : null,
    }));
  } catch (err) {
    console.error(`초기 상태 전송 실패 (${clientId}):`, err);
  }

  // 플레이어 추가
  if (!gameState.players[playerId]) {
    gameState.players[playerId] = {
      id: playerId,
      x: (Object.keys(gameState.players).length - 1) * 40,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 100,
      hpMax: 100,
      level: 1,
      color: isHost ? 'rgba(232,238,255,0.92)' : 'rgba(124,92,255,0.95)',
      // 능력치도 초기화 시 포함
      damage: 9,
      fireRate: 3.2,
      pierce: 0,
      pickup: 70,
      regen: 0,
      projSize: 4,
      projCount: 1,
      dashCd: 0,
      dashCdMax: 1.1,
    };
    
    // 호스트가 혼자 플레이 중이었는데 게스트가 들어오면 자동으로 게임 시작
    if (isHost && Object.keys(gameState.players).length === 1) {
      // 호스트가 처음 연결됨 - 게임 시작하지 않음 (1인 플레이)
    } else if (!isHost && Object.keys(gameState.players).length > 1) {
      // 게스트가 들어옴: 호스트가 이미 게임을 시작했는지 확인
      // 호스트가 이미 게임을 시작했다면 게스트도 자동으로 시작
      if (gameState.started) {
        console.log(`🎮 게스트가 연결됨 (호스트가 이미 게임 중, 총 ${Object.keys(gameState.players).length}명)`);
      } else {
        // 호스트가 아직 게임을 시작하지 않았으면 게임 시작
        gameState.started = true;
        gameState.t = 0;
        gameState.paused = false;
        gameState.gameOver = false;
        console.log(`🎮 게스트가 들어와서 게임 시작 (총 ${Object.keys(gameState.players).length}명)`);
      }
    } else if (isHost && Object.keys(gameState.players).length > 1 && !gameState.started) {
      // 호스트가 플레이 중인데 게스트가 들어옴 - 게임 시작
      gameState.started = true;
      gameState.t = 0;
      gameState.paused = false;
      gameState.gameOver = false;
      console.log(`🎮 게스트가 들어와서 게임 시작 (총 ${Object.keys(gameState.players).length}명)`);
    }
    
    broadcastState();
  }

  ws.on('message', (message) => {
    // WebSocket 메시지 수신 시 lastRequestTime 업데이트 (서버 종료 방지)
    lastRequestTime = Date.now();
    
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'playerUpdate':
          // 플레이어 위치 업데이트 (호스트만)
          if (isHost && gameState.players[data.playerId]) {
            Object.assign(gameState.players[data.playerId], data.player);
            broadcastState();
          }
          break;

        case 'startGame':
          if (isHost) {
            // 호스트가 게임을 시작 (게스트가 있을 때만 서버 게임 루프 시작)
            // 호스트가 혼자일 때는 서버 게임 루프가 필요 없음 (로컬에서 실행)
            // 게스트가 있으면 서버가 게임 상태를 관리
            if (Object.keys(gameState.players).length > 1) {
              gameState.started = true;
              gameState.t = 0;
              gameState.paused = false;
              gameState.gameOver = false;
              console.log(`🎮 호스트가 게임 시작 (총 ${Object.keys(gameState.players).length}명)`);
              broadcastState();
            }
          }
          break;

        case 'reset':
          if (isHost) {
            gameState.t = 0;
            gameState.paused = false;
            gameState.gameOver = false;
            gameState.enemies = [];
            gameState.projectiles = [];
            gameState.orbs = [];
            // 플레이어 초기화
            Object.keys(gameState.players).forEach((pid, idx) => {
              const p = gameState.players[pid];
              p.x = idx * 40;
              p.y = 0;
              p.vx = 0;
              p.vy = 0;
              p.hp = 100;
              p.hpMax = 100;
            });
            broadcastState();
          }
          break;

        case 'levelUp':
          if (isHost && gameState.players[data.playerId]) {
            const p = gameState.players[data.playerId];
            p.level = data.level;
            broadcastState();
          }
          break;

        case 'projectile':
          // 호스트가 투사체를 생성하면 모든 클라이언트에 브로드캐스트
          if (isHost && data.playerId && data.projectile) {
            broadcast({
              type: 'projectile',
              playerId: data.playerId,
              projectile: data.projectile,
            }, clientId); // 자신 제외하고 브로드캐스트
          }
          break;
      }
    } catch (err) {
      console.error('메시지 파싱 오류:', err);
    }
  });

  ws.on('close', (code, reason) => {
    clearInterval(keepaliveInterval);
    console.log(`\n❌ 클라이언트 연결 종료: ${clientId} (${playerId})`);
    console.log(`   종료 코드: ${code}, 이유: ${reason || '없음'}`);
    
    const client = clients.get(clientId);
    if (client) {
      delete gameState.players[client.playerId];
      if (clientId === hostId) {
        console.log(`⚠️  호스트가 연결을 끊었습니다.`);
        // 호스트가 나가면 다른 클라이언트 중 하나를 호스트로
        const remaining = Array.from(clients.entries()).find(([id, c]) => id !== clientId);
        if (remaining) {
          hostId = remaining[0];
          remaining[1].isHost = true;
          console.log(`   새 호스트: ${remaining[0]} (${remaining[1].playerId})`);
          broadcast({
            type: 'hostChanged',
            newHostId: remaining[0],
          });
        } else {
          console.log(`   모든 클라이언트가 연결을 끊었습니다.`);
          gameState.started = false;
        }
      }
      clients.delete(clientId);
      console.log(`   남은 클라이언트 수: ${clients.size}`);
      broadcastState();
    }
  });

  ws.on('error', (err) => {
    clearInterval(keepaliveInterval);
    console.error(`\n❌ 클라이언트 오류 발생`);
    console.error(`   클라이언트 ID: ${clientId}`);
    console.error(`   플레이어 ID: ${playerId}`);
    console.error(`   오류 메시지:`, err.message);
    console.error(`   오류 코드:`, err.code);
    console.error(`   오류 스택:`, err.stack);
  });

  ws.on('pong', () => {
    // 퐁 응답 받음 (연결 유지됨)
  });
});

// HTTP 서버: IP 정보 제공 (LAN)
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/ip' || req.url === '/api/ip') {
    const lanIP = getLANIP();
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      serverIP: lanIP,
      tailscaleIP: lanIP,
      lanIP: lanIP,
      port: PORT,
      wsUrl: lanIP ? `ws://${lanIP}:${PORT}` : null,
      wsUrlLAN: lanIP ? `ws://${lanIP}:${PORT}` : null,
      localUrl: `ws://localhost:${PORT}`,
      timestamp: Date.now()
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  }
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`📡 HTTP 서버 시작: http://localhost:${HTTP_PORT}/ip (IP 정보 제공)`);
});

// 게임 파일 제공용 HTTP 서버 (포트 충돌 시 자동으로 다른 포트 찾기)
function startGameServer(port) {
  const gameServer = http.createServer((req, res) => {
    // 마지막 요청 시간 업데이트
    lastRequestTime = Date.now();
    
    let filePath = '.' + req.url;
    if (filePath === './') {
      filePath = './index.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.woff': 'application/font-woff',
      '.ttf': 'application/font-ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'application/font-otf',
      '.wasm': 'application/wasm'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 - 파일을 찾을 수 없습니다</h1>', 'utf-8');
        } else {
          res.writeHead(500);
          res.end(`서버 오류: ${error.code}`, 'utf-8');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  gameServer.listen(port, '0.0.0.0', () => {
    GAME_PORT = port;
    console.log(`🎮 게임 서버 시작: http://localhost:${GAME_PORT}`);
    
    // 서버 시작 후 자동으로 브라우저 열기
    const url = `http://localhost:${GAME_PORT}`;
    const platform = os.platform();
    
    let command;
    if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else if (platform === 'darwin') {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }
    
    setTimeout(() => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.log(`⚠️  브라우저를 자동으로 열 수 없습니다. 수동으로 ${url} 을 열어주세요.`);
        } else {
          console.log(`✅ 브라우저가 자동으로 열렸습니다: ${url}`);
          // 브라우저 프로세스 모니터링 시작
          monitorBrowserProcess();
        }
      });
    }, 2000); // 2초 대기 (서버가 완전히 시작될 때까지)
  });

  gameServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      // 포트가 사용 중이면 다음 포트 시도
      if (port < 5200) {
        console.log(`⚠️  포트 ${port}가 사용 중입니다. 포트 ${port + 1}을 시도합니다...`);
        startGameServer(port + 1);
      } else {
        console.error(`❌ 사용 가능한 포트를 찾을 수 없습니다 (5173-5200).`);
        console.error(`   다른 프로그램이 포트를 사용하고 있는지 확인하세요.`);
        process.exit(1);
      }
    } else if (error.code === 'EACCES') {
      console.error(`❌ 포트 ${port}에 접근 권한이 없습니다. 관리자 권한이 필요할 수 있습니다.`);
      process.exit(1);
    } else {
      console.error(`❌ 게임 서버 오류:`, error);
      process.exit(1);
    }
  });
}

// 브라우저 프로세스 모니터링
let lastRequestTime = Date.now();
let browserProcessId = null;

function monitorBrowserProcess() {
  // HTTP 요청 또는 WebSocket 연결이 없으면 서버 종료 체크
  const checkInterval = setInterval(() => {
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    const activeClients = clients.size; // 활성 WebSocket 클라이언트 수
    
    // 활성 클라이언트가 있으면 서버를 유지 (멀티플레이 중)
    if (activeClients > 0) {
      // 클라이언트가 있으면 계속 실행
      return;
    }
    
    // 10초 동안 HTTP 요청이 없고, 활성 클라이언트도 없으면 브라우저가 닫힌 것으로 간주
    if (timeSinceLastRequest > 10000) {
      console.log('브라우저가 닫혔고 활성 클라이언트가 없습니다. 서버를 종료합니다...');
      clearInterval(checkInterval);
      // 서버 종료 시 창도 닫히도록 함
      setTimeout(() => {
        process.exit(0);
      }, 500);
    }
  }, 5000); // 5초마다 확인
}

// 게임 서버 시작
startGameServer(GAME_PORT);

wss.on('listening', () => {
  const address = wss.address();
  console.log(`\n✅ 서버가 모든 인터페이스에서 리스닝 중입니다.`);
  console.log(`   주소: ${address.address}:${address.port}`);
  console.log(`   프로토콜: WebSocket (WS)\n`);
  
  // 서버 상태 주기적 확인
  setInterval(() => {
    console.log(`📊 서버 상태: ${clients.size}명 연결 중, 게임 상태: ${gameState.started ? '진행 중' : '대기 중'}`);
  }, 30000); // 30초마다
});

// 연결 오류 처리
wss.on('error', (error) => {
  console.error('❌ 서버 오류:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`   포트 ${PORT}가 이미 사용 중입니다.`);
  } else if (error.code === 'EACCES') {
    console.error(`   포트 ${PORT}에 접근 권한이 없습니다. 관리자 권한이 필요할 수 있습니다.`);
  }
});

