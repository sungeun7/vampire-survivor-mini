(() => {
  "use strict";

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hudEl = document.getElementById("hud");
  const msgEl = document.getElementById("message");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlayTitle");
  const overlaySubEl = document.getElementById("overlaySub");
  const choicesEl = document.getElementById("choices");
  const menuButtonEl = document.getElementById("menuButton");

  const W = canvas.width;
  const H = canvas.height;

  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const len = (x, y) => Math.hypot(x, y);
  const norm = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const rand = (a, b) => a + Math.random() * (b - a);

  function fmt(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.floor(n)}`;
  }

  // 사운드 시스템
  let audioContext = null;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn("AudioContext를 초기화할 수 없습니다:", e);
  }

  // 사운드 효과 생성 함수
  function playSound(frequency, duration, type = "sine", volume = 0.1) {
    if (!audioContext) return;
    
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
      // 사운드 재생 실패 시 무시
    }
  }

  // 총알 발사 소리
  function playShootSound() {
    playSound(800, 0.05, "square", 0.15);
  }

  // 적이 터지는 소리
  function playEnemyDeathSound() {
    // 짧은 폭발음 효과
    playSound(200, 0.1, "sawtooth", 0.2);
    setTimeout(() => playSound(150, 0.08, "sawtooth", 0.15), 20);
  }

  // 레벨업 소리
  function playLevelUpSound() {
    // 상승하는 멜로디
    playSound(400, 0.1, "sine", 0.2);
    setTimeout(() => playSound(500, 0.1, "sine", 0.2), 80);
    setTimeout(() => playSound(600, 0.15, "sine", 0.2), 160);
  }

  // 칼 휘두르는 소리
  function playSwordSwingSound() {
    // 날카로운 휘두르는 소리
    playSound(300, 0.08, "sawtooth", 0.2);
    setTimeout(() => playSound(250, 0.06, "sawtooth", 0.15), 30);
  }

  /**
   * World is infinite-ish; camera follows player.
   */
  const state = {
    t: 0,
    dt: 0,
    paused: false,
    gameOver: false,
    wave: 0,
  };

  // Start menu / mode select
  let started = false;
  let overlayMode = "menu"; // "menu" | "levelup"

  // 역대 기록 (상위 10개)
  function getTopScores() {
    const scoresJson = localStorage.getItem('topScores') || '[]';
    try {
      return JSON.parse(scoresJson);
    } catch {
      return [];
    }
  }

  function saveScore(time) {
    const scores = getTopScores();
    scores.push(time);
    scores.sort((a, b) => b - a); // 내림차순 정렬
    const top10 = scores.slice(0, 10); // 상위 10개만 저장
    localStorage.setItem('topScores', JSON.stringify(top10));
    return top10;
  }

  const topScores = getTopScores();
  const bestTime = topScores.length > 0 ? topScores[0] : 0;

  // Network multiplayer
  let ws = null;
  let isHost = false;
  let clientId = null;
  let myPlayerId = null;
  let remotePlayers = {}; // { playerId: playerData }
  let remoteProjectiles = []; // 원격 플레이어의 투사체
  let serverUrl = null;

  // 캐릭터 타입: "gun" (총) 또는 "sword" (칼)
  let player1CharacterType = "gun";
  let player2CharacterType = "gun";

  const input1 = {
    up: false,
    down: false,
    left: false,
    right: false,
    dash: false,
    dashPressed: false,
  };

  const input2 = {
    up: false,
    down: false,
    left: false,
    right: false,
    dash: false,
    dashPressed: false,
  };

  // 키 바인딩 설정 (localStorage에서 로드)
  const defaultKeyBindings = {
    p1: {
      up: "w",
      down: "s",
      left: "a",
      right: "d",
      dash: "Space",
    },
    p2: {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      dash: "Enter",
    },
  };

  let keyBindings = { ...defaultKeyBindings };

  // localStorage에서 키 바인딩 로드
  function loadKeyBindings() {
    try {
      const saved = localStorage.getItem("keyBindings");
      if (saved) {
        const parsed = JSON.parse(saved);
        keyBindings = { ...defaultKeyBindings, ...parsed };
      }
    } catch (e) {
      console.error("키 바인딩 로드 실패:", e);
    }
  }

  // localStorage에 키 바인딩 저장
  function saveKeyBindings() {
    try {
      localStorage.setItem("keyBindings", JSON.stringify(keyBindings));
    } catch (e) {
      console.error("키 바인딩 저장 실패:", e);
    }
  }

  // 초기 로드
  loadKeyBindings();

  const camera = { x: 0, y: 0, shake: 0 };

  const BASE_PLAYER = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 12,
    hp: 100,
    hpMax: 100,
    invuln: 0,
    speed: 175,
    dashSpeed: 460,
    dashCd: 0,
    dashCdMax: 1.1,
    dashTime: 0,
    dashTimeMax: 0.16,

    level: 1,
    xp: 0,
    xpToNext: 18,

    damage: 9,
    fireRate: 3.2, // shots per sec
    angularSpeed: 8.0, // 칼 회전 속도 (rad/s)
    projSpeed: 420,
    pierce: 0,
    projSize: 4,
    projCount: 1, // 발사체 개수
    knock: 120,
    pickup: 70,
    regen: 0,

    magnetPulse: 0,
    shootAcc: 0,
  };

  function makePlayer(id, color) {
    return { ...BASE_PLAYER, id, color };
  }

  const player1 = makePlayer("P1", "rgba(232,238,255,0.92)");
  const player2 = makePlayer("P2", "rgba(124,92,255,0.95)");
  let multiplayer = false;

  function activePlayers() {
    return multiplayer ? [player1, player2] : [player1];
  }

  // 총 플레이어 수 (로컬 + 원격, 자신 제외)
  function totalPlayerCount() {
    const localCount = activePlayers().length;
    // 원격 플레이어 수 (자신 제외)
    let remoteCount = 0;
    if (ws && ws.readyState === WebSocket.OPEN) {
      remoteCount = Object.keys(remotePlayers).filter(pid => pid !== myPlayerId).length;
    }
    return localCount + remoteCount;
  }

  // Back-compat alias (기존 로직이 player를 참조)
  const player = player1;

  function applyToAllPlayers(fn) {
    for (const p of activePlayers()) fn(p);
  }

  /** @type {{x:number,y:number,vx:number,vy:number,r:number,life:number,damage:number,pierce:number}[]} */
  const projectiles = [];

  /** @type {{player:object,angle:number,baseAngle:number,angularSpeed:number,length:number,width:number,damage:number,hitEnemies:Set,cooldown:number}[]} */
  const swords = []; // 칼 캐릭터의 막대기

  /** @type {{x:number,y:number,vx:number,vy:number,r:number,hp:number,hpMax:number,speed:number,damage:number,hitCd:number,kind:string}[]} */
  const enemies = [];

  /** @type {{x:number,y:number,r:number,amount:number}[]} */
  const orbs = [];

  /** @type {{x:number,y:number,ttl:number,text:string,color:string}[]} */
  const floats = [];

  const effects = {
    hitFlash: 0,
  };

  // Level up overlay
  let choosing = false;
  /** @type {{id:string,title:string,desc:string,apply:()=>void,badge?:string}[]} */
  let currentChoices = [];

  // 연속 선택 추적 (같은 아이템 3번 연속 선택 시 보너스)
  let lastUpgradeIds = []; // 최근 3개의 선택한 업그레이드 ID

  const upgrades = [
    {
      id: "dmg",
      title: "피해량 증가",
      desc: "+30% 피해량",
      badge: "+DMG",
      apply: () => applyToAllPlayers((p) => (p.damage *= 1.3)),
    },
    {
      id: "as",
      title: "공격 속도",
      desc: "+18% 속도",
      badge: "+AS",
      apply: () => applyToAllPlayers((p) => {
        p.fireRate *= 1.18; // 총 캐릭터: 발사 속도 증가
        p.angularSpeed *= 1.18; // 칼 캐릭터: 회전 속도 증가
        // 칼 막대기의 회전 속도도 업데이트
        const sword = swords.find(s => s.player === p);
        if (sword) {
          const speedSign = sword.angularSpeed >= 0 ? 1 : -1;
          sword.angularSpeed = Math.abs(p.angularSpeed) * speedSign;
        }
      }),
    },
    {
      id: "spd",
      title: "이동 속도",
      desc: "+12% 이동 속도",
      badge: "+MS",
      apply: () => applyToAllPlayers((p) => (p.speed *= 1.12)),
    },
    {
      id: "hp",
      title: "최대 체력",
      desc: "+25 최대 체력 (현재 체력도 회복)",
      badge: "+HP",
      apply: () => {
        applyToAllPlayers((p) => {
          p.hpMax += 25;
          p.hp = Math.min(p.hpMax, p.hp + 25);
        });
      },
    },
    {
      id: "heal",
      title: "생명력 회복",
      desc: "30% 체력 회복",
      badge: "HEAL",
      apply: () => {
        applyToAllPlayers((p) => {
          const healAmount = p.hpMax * 0.3;
          p.hp = Math.min(p.hpMax, p.hp + healAmount);
        });
      },
    },
    {
      id: "regen",
      title: "재생",
      desc: "+0.6 HP/초",
      badge: "REGEN",
      apply: () => applyToAllPlayers((p) => (p.regen += 0.6)),
    },
    {
      id: "size",
      title: "칼 크기 증가",
      desc: "+50% 칼 크기",
      badge: "+SIZE",
      characterType: "sword", // 칼 캐릭터 전용
      apply: () => applyToAllPlayers((p) => (p.projSize *= 1.5)),
    },
    {
      id: "projCount",
      title: "총알 증가",
      desc: "+1 총알 개수",
      badge: "+PROJ",
      characterType: "gun", // 총 캐릭터 전용
      apply: () => applyToAllPlayers((p) => (p.projCount = (p.projCount || 1) + 1)),
    },
    {
      id: "pierce",
      title: "관통",
      desc: "+1 관통",
      badge: "+PIERCE",
      apply: () => applyToAllPlayers((p) => (p.pierce += 1)),
    },
    {
      id: "magnet",
      title: "자석 범위",
      desc: "+35% 경험치 흡수 범위",
      badge: "+MAG",
      apply: () => applyToAllPlayers((p) => (p.pickup *= 1.35)),
    },
    {
      id: "dash",
      title: "대시 쿨다운 감소",
      desc: "대시 쿨다운 -18%",
      badge: "DASH",
      apply: () => applyToAllPlayers((p) => (p.dashCdMax *= 0.82)),
    },
  ];

  function returnToMainMenu() {
    // 재연결 타이머 취소
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // 재연결 시도 횟수 초기화
    reconnectAttempts = 0;
    isReconnecting = false;

    // 네트워크 연결 종료 (정상 종료 코드로 재연결 방지)
    if (ws) {
      try {
        // 정상 종료 코드(1000)를 보내서 재연결이 시도되지 않도록 함
        ws.close(1000, "User requested disconnect");
      } catch (e) {
        console.error("WebSocket 종료 중 오류:", e);
      }
      ws = null;
    }
    isHost = false;
    clientId = null;
    myPlayerId = null;
    remotePlayers = {};
    serverUrl = null;

    // 게임 상태 리셋
    started = false;
    state.paused = true;
    state.gameOver = false;
    state.t = 0;
    state.dt = 0;
    state.wave = 0;
    multiplayer = false;
    choosing = false;
    overlayMode = "menu";

    // 게임 배열 초기화
    projectiles.length = 0;
    enemies.length = 0;
    orbs.length = 0;
    floats.length = 0;

    // 효과 초기화
    effects.hitFlash = 0;

    // 업그레이드 선택 초기화
    currentChoices = [];
    lastUpgradeIds = [];

    // 스폰 누적값 초기화
    spawnAcc = 0;

    // 플레이어 초기화
    Object.assign(player1, { ...BASE_PLAYER, id: "P1", color: player1.color });
    Object.assign(player2, { ...BASE_PLAYER, id: "P2", color: player2.color });
    player1.x = 0;
    player1.y = 0;
    player2.x = 40;
    player2.y = 0;

    // 입력 상태 초기화
    input1.up = false;
    input1.down = false;
    input1.left = false;
    input1.right = false;
    input1.dash = false;
    input1.dashPressed = false;
    input2.up = false;
    input2.down = false;
    input2.left = false;
    input2.right = false;
    input2.dash = false;
    input2.dashPressed = false;

    // 카메라 초기화
    camera.x = 0;
    camera.y = 0;
    camera.shake = 0;

    // 메뉴 버튼 숨기기
    if (menuButtonEl) menuButtonEl.classList.add("hidden");

    // 오버레이 숨기기
    overlayEl.classList.add("hidden");

    // 메인 메뉴 표시
    showStartMenu();
  }

  function showStartMenu() {
    overlayMode = "menu";
    choosing = false;
    state.paused = true;
    overlayEl.classList.remove("hidden");
    if (overlayTitleEl) overlayTitleEl.textContent = "플레이어 선택";
    if (overlaySubEl) overlaySubEl.textContent = "1인 또는 2인 협동을 선택하세요";

    // 메뉴 버튼 숨기기
    if (menuButtonEl) menuButtonEl.classList.add("hidden");

    choicesEl.innerHTML = "";
    const options = [
      {
        title: "1인 플레이",
        desc: "P1: WASD 이동 · Space 대시",
        badge: "1P",
        onPick: () => showCharacterSelect(false, null),
      },
      {
        title: "2인 협동 (로컬)",
        desc: "P1: WASD+Space · P2: 방향키+Enter (적/아이템 2배)",
        badge: "2P",
        onPick: () => showCharacterSelect(true, null),
      },
      {
        title: "호스트 (멀티플레이)",
        desc: "서버를 시작하고 다른 플레이어를 기다립니다",
        badge: "HOST",
        onPick: () => showHostMenu(),
      },
      {
        title: "조인 (멀티플레이)",
        desc: "호스트의 서버에 연결합니다",
        badge: "JOIN",
        onPick: () => showJoinMenu(),
      },
      {
        title: "설정",
        desc: "키 바인딩 및 게임 설정",
        badge: "SET",
        onPick: () => showSettingsMenu(),
      },
    ];

    options.forEach((opt, idx) => {
      const div = document.createElement("div");
      div.className = "choice";
      div.dataset.idx = String(idx);
      div.innerHTML = `
        <div class="choiceTitle">
          <div>${idx + 1}. ${opt.title}</div>
          <div class="badge"><span class="kbd">${idx + 1}</span> ${opt.badge}</div>
        </div>
        <div class="choiceDesc">${opt.desc}</div>
      `;
      div.addEventListener("click", () => opt.onPick());
      choicesEl.appendChild(div);
    });
  }

  // 뒤로가기 버튼 생성 헬퍼
  function createBackButton(onClick) {
    const backBtn = document.createElement("div");
    backBtn.className = "choice";
    backBtn.style.cursor = "pointer";
    backBtn.style.marginTop = "12px";
    backBtn.style.opacity = "0.8";
    backBtn.innerHTML = `
      <div class="choiceTitle">
        <div>← 뒤로가기 <span class="kbd">ESC</span></div>
      </div>
    `;
    backBtn.addEventListener("click", onClick);
    return backBtn;
  }

  // 캐릭터 선택 메뉴
  function showCharacterSelect(enableMultiplayer, isNetworkMultiplayer) {
    overlayMode = "menu";
    overlayEl.classList.remove("hidden");
    if (overlayTitleEl) overlayTitleEl.textContent = "캐릭터 선택";
    if (overlaySubEl) overlaySubEl.textContent = enableMultiplayer ? "P1과 P2의 캐릭터를 선택하세요" : "캐릭터를 선택하세요";

    choicesEl.innerHTML = "";

    // P1 캐릭터 선택
    const p1Section = document.createElement("div");
    p1Section.style.marginBottom = "20px";
    p1Section.innerHTML = `<div style="font-weight:bold; margin-bottom:8px; color:rgba(232,238,255,0.95);">플레이어 1 (P1)</div>`;
    choicesEl.appendChild(p1Section);

    const p1Characters = [
      {
        title: "총 캐릭터",
        desc: "총알 증가 업그레이드 사용",
        badge: "🔫",
        type: "gun",
      },
      {
        title: "칼 캐릭터",
        desc: "칼 크기 증가 업그레이드 사용",
        badge: "⚔️",
        type: "sword",
      },
    ];

    p1Characters.forEach((char) => {
      const div = document.createElement("div");
      div.className = "choice";
      div.style.marginBottom = "8px";
      const isSelected = player1CharacterType === char.type;

      div.innerHTML = `
        <div class="choiceTitle" style="display:flex; justify-content:space-between; align-items:center;">
          <div>${char.badge} ${char.title}</div>
          ${isSelected ? '<div class="badge" style="background:rgba(69,255,177,0.3);">선택됨</div>' : ''}
        </div>
        <div class="choiceDesc">${char.desc}</div>
      `;

      div.addEventListener("click", () => {
        player1CharacterType = char.type;
        if (enableMultiplayer) {
          showCharacterSelect(enableMultiplayer, isNetworkMultiplayer);
        } else {
          startGame(enableMultiplayer, isNetworkMultiplayer);
        }
      });

      choicesEl.appendChild(div);
    });

    // P2 캐릭터 선택 (멀티플레이어일 때만)
    if (enableMultiplayer) {
      const p2Section = document.createElement("div");
      p2Section.style.marginTop = "24px";
      p2Section.style.marginBottom = "20px";
      p2Section.innerHTML = `<div style="font-weight:bold; margin-bottom:8px; color:rgba(124,92,255,0.95);">플레이어 2 (P2)</div>`;
      choicesEl.appendChild(p2Section);

      const p2Characters = [
        {
          title: "총 캐릭터",
          desc: "총알 증가 업그레이드 사용",
          badge: "🔫",
          type: "gun",
        },
        {
          title: "칼 캐릭터",
          desc: "칼 크기 증가 업그레이드 사용",
          badge: "⚔️",
          type: "sword",
        },
      ];

      p2Characters.forEach((char) => {
        const div = document.createElement("div");
        div.className = "choice";
        div.style.marginBottom = "8px";
        const isSelected = player2CharacterType === char.type;

        div.innerHTML = `
          <div class="choiceTitle" style="display:flex; justify-content:space-between; align-items:center;">
            <div>${char.badge} ${char.title}</div>
            ${isSelected ? '<div class="badge" style="background:rgba(69,255,177,0.3);">선택됨</div>' : ''}
          </div>
          <div class="choiceDesc">${char.desc}</div>
        `;

        div.addEventListener("click", () => {
          player2CharacterType = char.type;
          startGame(enableMultiplayer, isNetworkMultiplayer);
        });

        choicesEl.appendChild(div);
      });
    }

    // 뒤로가기 버튼
    const backBtn = createBackButton(() => {
      if (isNetworkMultiplayer) {
        // 네트워크 멀티플레이어면 호스트/조인 메뉴로 돌아가기
        if (isHost) {
          showHostMenu();
        } else {
          showJoinMenu();
        }
      } else {
        showStartMenu();
      }
    });
    choicesEl.appendChild(backBtn);
  }

  function showHostMenu() {
    overlayMode = "menu";
    overlayEl.classList.remove("hidden");
    if (overlayTitleEl) overlayTitleEl.textContent = "호스트 서버";
    if (overlaySubEl) overlaySubEl.textContent = "서버를 시작합니다. 다른 플레이어가 조인할 수 있습니다.";

    choicesEl.innerHTML = "";

    // Tailscale 설치 안내
    const tailscaleInfo = document.createElement("div");
    tailscaleInfo.className = "choice";
    tailscaleInfo.style.marginBottom = "12px";
    tailscaleInfo.style.opacity = "0.9";
    tailscaleInfo.innerHTML = `
      <div class="choiceTitle">
        <div>📦 Tailscale 설치 필요</div>
      </div>
      <div class="choiceDesc">
        Windows: <code style="background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;">.\install-tailscale.ps1</code><br>
        Linux/Mac: <code style="background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;">./install-tailscale.sh</code>
      </div>
    `;
    choicesEl.appendChild(tailscaleInfo);

    const div = document.createElement("div");
    div.className = "choice";
    div.id = "hostStatus";
    div.innerHTML = `
      <div class="choiceTitle">
        <div>서버 시작 중...</div>
      </div>
      <div class="choiceDesc">
        기본 주소: ws://localhost:8080<br>
        <small style="opacity:0.7;">서버가 모든 인터페이스에서 리스닝 중입니다.<br>서버 콘솔에서 Tailscale IP를 확인하세요.</small>
      </div>
    `;
    choicesEl.appendChild(div);

    // 뒤로가기 버튼 (서버 연결 전에만)
    const backBtn = createBackButton(() => {
      if (ws) {
        ws.close();
        ws = null;
      }
      showStartMenu();
    });
    choicesEl.appendChild(backBtn);

    // 서버에 연결 (호스트)
    connectToServer("ws://localhost:8080", true);
  }

  // IP 주소를 자동으로 ws://와 :8080을 붙여서 완전한 URL로 변환
  function formatWebSocketUrl(input) {
    let url = input.trim();

    // 이미 ws:// 또는 wss://로 시작하면 그대로 사용
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return url;
    }

    // IP 주소만 입력된 경우 (예: 100.101.35.13)
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(url)) {
      return `ws://${url}:8080`;
    }

    // 포트가 포함된 경우 (예: 100.101.35.13:8080)
    const ipPortPattern = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
    if (ipPortPattern.test(url)) {
      return `ws://${url}`;
    }

    // localhost인 경우
    if (url === 'localhost' || url.startsWith('localhost:')) {
      if (url === 'localhost') {
        return 'ws://localhost:8080';
      }
      return `ws://${url}`;
    }

    // 그 외의 경우는 그대로 반환 (사용자가 직접 입력한 전체 URL)
    return url;
  }

  function showJoinMenu() {
    overlayMode = "menu";
    overlayEl.classList.remove("hidden");
    if (overlayTitleEl) overlayTitleEl.textContent = "서버에 조인";
    if (overlaySubEl) overlaySubEl.textContent = "호스트의 IP 주소를 입력하세요";

    choicesEl.innerHTML = "";

    // Tailscale 설치 안내
    const tailscaleInfo = document.createElement("div");
    tailscaleInfo.className = "choice";
    tailscaleInfo.style.marginBottom = "12px";
    tailscaleInfo.style.opacity = "0.9";
    tailscaleInfo.innerHTML = `
      <div class="choiceTitle">
        <div>📦 Tailscale 설치 필요</div>
      </div>
      <div class="choiceDesc">
        Windows: <code style="background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;">.\install-tailscale.ps1</code><br>
        Linux/Mac: <code style="background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;">./install-tailscale.sh</code>
      </div>
    `;
    choicesEl.appendChild(tailscaleInfo);

    const inputDiv = document.createElement("div");
    inputDiv.style.padding = "12px";

    // 저장된 IP 확인
    const savedIP = localStorage.getItem('lastTailscaleIP');
    const defaultValue = savedIP ? formatWebSocketUrl(savedIP) : '';
    const defaultPlaceholder = savedIP ? `ws://${savedIP}:8080` : "100.101.35.13 또는 ws://100.101.35.13:8080";

    inputDiv.innerHTML = `
      <input type="text" id="serverUrlInput" placeholder="${defaultPlaceholder}"
             value="${defaultValue}"
             style="width:100%; padding:8px; background:rgba(15,23,48,.8); border:1px solid rgba(255,255,255,.2);
                    border-radius:8px; color:var(--text); font-size:13px; margin-bottom:8px;">
      <div style="font-size:11px; opacity:0.7; margin-bottom:8px; text-align:center;" id="ipHint">
        ${savedIP ? `💡 저장된 IP 사용: ${savedIP} (IP만 입력해도 자동으로 ws://와 :8080이 추가됩니다)` : '💡 IP 주소만 입력해도 자동으로 ws://와 :8080이 추가됩니다 (예: 100.101.35.13)'}
      </div>
      <div class="choice" style="cursor:pointer; margin-top:8px;">
        <div class="choiceTitle">
          <div>연결 (Enter 키로도 연결 가능)</div>
        </div>
      </div>
    `;
    choicesEl.appendChild(inputDiv);

    const input = document.getElementById("serverUrlInput");
    const connectBtn = inputDiv.querySelector(".choice");

    const doConnect = () => {
      let url = input.value.trim();

      if (!url) {
        if (overlaySubEl) overlaySubEl.textContent = "IP 주소를 입력하세요";
        return;
      }

      // IP 주소를 자동으로 포맷팅
      url = formatWebSocketUrl(url);

      // 포맷팅된 URL을 입력 필드에 다시 표시
      if (url !== input.value.trim()) {
        input.value = url;
      }

      // 연결 성공한 IP 저장
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        // Tailscale IP (100.x.x.x) 또는 일반 IP 저장
        if (hostname.startsWith('100.') || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
          localStorage.setItem('lastTailscaleIP', hostname);
        }
      } catch (e) {}

      connectToServer(url, false);
    };

    connectBtn.addEventListener("click", doConnect);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doConnect();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (ws) {
          ws.close();
          ws = null;
        }
        showStartMenu();
      }
    });

    // 뒤로가기 버튼
    const backBtn = createBackButton(() => {
      if (ws) {
        ws.close();
        ws = null;
      }
      showStartMenu();
    });
    choicesEl.appendChild(backBtn);

    // 포커스 자동 설정
    setTimeout(() => input.focus(), 100);
  }

  // 설정 메뉴
  let waitingForKey = null; // 현재 키 입력 대기 중인 설정 (예: "p1.up")

  function showSettingsMenu() {
    overlayMode = "menu";
    overlayEl.classList.remove("hidden");
    if (overlayTitleEl) overlayTitleEl.textContent = "설정";
    if (overlaySubEl) overlaySubEl.textContent = "키를 클릭하여 변경하세요";

    choicesEl.innerHTML = "";

    // 키 이름 표시 함수
    function getKeyDisplay(key) {
      const keyMap = {
        "w": "W", "a": "A", "s": "S", "d": "D",
        "ArrowUp": "↑", "ArrowDown": "↓", "ArrowLeft": "←", "ArrowRight": "→",
        "Space": "Space", "Enter": "Enter",
      };
      return keyMap[key] || key;
    }

    // P1 설정
    const p1Section = document.createElement("div");
    p1Section.style.marginBottom = "20px";
    p1Section.innerHTML = `<div style="font-weight:bold; margin-bottom:8px; color:rgba(232,238,255,0.95);">플레이어 1 (P1)</div>`;
    choicesEl.appendChild(p1Section);

    const p1Keys = [
      { label: "위", key: "up" },
      { label: "아래", key: "down" },
      { label: "왼쪽", key: "left" },
      { label: "오른쪽", key: "right" },
      { label: "대시", key: "dash" },
    ];

    p1Keys.forEach(({ label, key }) => {
      const div = document.createElement("div");
      div.className = "choice";
      div.style.marginBottom = "8px";
      const bindingKey = `p1.${key}`;
      const currentKey = keyBindings.p1[key];
      const isWaiting = waitingForKey === bindingKey;

      div.innerHTML = `
        <div class="choiceTitle" style="display:flex; justify-content:space-between; align-items:center;">
          <div>${label}</div>
          <div class="badge" style="${isWaiting ? 'background:rgba(69,255,177,0.3);' : ''}">
            <span class="kbd">${isWaiting ? '키 입력 대기...' : getKeyDisplay(currentKey)}</span>
          </div>
        </div>
      `;

      div.addEventListener("click", () => {
        waitingForKey = bindingKey;
        showSettingsMenu(); // 메뉴 새로고침
      });

      choicesEl.appendChild(div);
    });

    // P2 설정
    const p2Section = document.createElement("div");
    p2Section.style.marginTop = "24px";
    p2Section.style.marginBottom = "20px";
    p2Section.innerHTML = `<div style="font-weight:bold; margin-bottom:8px; color:rgba(124,92,255,0.95);">플레이어 2 (P2)</div>`;
    choicesEl.appendChild(p2Section);

    const p2Keys = [
      { label: "위", key: "up" },
      { label: "아래", key: "down" },
      { label: "왼쪽", key: "left" },
      { label: "오른쪽", key: "right" },
      { label: "대시", key: "dash" },
    ];

    p2Keys.forEach(({ label, key }) => {
      const div = document.createElement("div");
      div.className = "choice";
      div.style.marginBottom = "8px";
      const bindingKey = `p2.${key}`;
      const currentKey = keyBindings.p2[key];
      const isWaiting = waitingForKey === bindingKey;

      div.innerHTML = `
        <div class="choiceTitle" style="display:flex; justify-content:space-between; align-items:center;">
          <div>${label}</div>
          <div class="badge" style="${isWaiting ? 'background:rgba(69,255,177,0.3);' : ''}">
            <span class="kbd">${isWaiting ? '키 입력 대기...' : getKeyDisplay(currentKey)}</span>
          </div>
        </div>
      `;

      div.addEventListener("click", () => {
        waitingForKey = bindingKey;
        showSettingsMenu(); // 메뉴 새로고침
      });

      choicesEl.appendChild(div);
    });

    // 기본값으로 리셋 버튼
    const resetBtn = document.createElement("div");
    resetBtn.className = "choice";
    resetBtn.style.marginTop = "20px";
    resetBtn.style.opacity = "0.8";
    resetBtn.innerHTML = `
      <div class="choiceTitle">
        <div>기본값으로 리셋</div>
      </div>
    `;
    resetBtn.addEventListener("click", () => {
      keyBindings = { ...defaultKeyBindings };
      saveKeyBindings();
      showSettingsMenu(); // 메뉴 새로고침
    });
    choicesEl.appendChild(resetBtn);

    // 뒤로가기 버튼
    const backBtn = createBackButton(() => {
      waitingForKey = null;
      showStartMenu();
    });
    choicesEl.appendChild(backBtn);
  }

  // 키 입력 감지 (설정 메뉴용)
  function handleKeyBindingInput(e) {
    if (!waitingForKey) return false;

    // ESC는 취소
    if (e.key === "Escape") {
      waitingForKey = null;
      showSettingsMenu(); // 메뉴 새로고침
      return true;
    }

    // 키 바인딩 저장
    const [player, action] = waitingForKey.split(".");
    const keyValue = e.code === "Space" ? "Space" :
                     (e.code === "Enter" || e.code === "NumpadEnter") ? "Enter" :
                     e.key.length === 1 ? e.key.toLowerCase() : e.key;

    keyBindings[player][action] = keyValue;
    saveKeyBindings();
    waitingForKey = null;

    // 메뉴 새로고침
    showSettingsMenu();
    return true;
  }

  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  let reconnectTimer = null;
  let isReconnecting = false;

  function connectToServer(url, host) {
    // 기존 연결 정리
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    try {
      console.log(`\n🔌 서버 연결 시도 중...`);
      console.log(`   연결 URL: ${url}`);
      isHost = host;

      if (overlaySubEl && !isReconnecting) {
        overlaySubEl.textContent = "서버에 연결하는 중...";
      }

      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("✅ 서버 연결 성공!");
        console.log("   연결 URL:", url);
        reconnectAttempts = 0;
        isReconnecting = false;

        // 연결 성공한 IP 저장
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname;
          // Tailscale IP (100.x.x.x) 또는 일반 IP 저장
          if (hostname.startsWith('100.') || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
            localStorage.setItem('lastTailscaleIP', hostname);
            console.log("   IP 주소 저장됨:", hostname);
          }
        } catch (e) {
          console.error("   IP 저장 실패:", e);
        }

        if (overlaySubEl) {
          overlaySubEl.textContent = host
            ? "호스트 모드: 다른 플레이어를 기다리는 중..."
            : "서버에 연결되었습니다!";
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerMessage(data);
        } catch (err) {
          console.error("메시지 파싱 오류:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("❌ WebSocket 연결 오류 발생");
        console.error("   연결 URL:", url);
        console.error("   오류 타입:", err.type);
        console.error("   오류 타겟:", err.target?.url);
        console.error("   오류 상세:", err);

        // 연결 진단 정보 수집
        let urlObj;
        let isTailscaleIP = false;
        try {
          urlObj = new URL(url);
          isTailscaleIP = urlObj.hostname.startsWith('100.');
        } catch (e) {
          console.error("   URL 파싱 실패:", e);
        }

        if (overlaySubEl && !isReconnecting) {
          const errorDetails = [];
          errorDetails.push("<strong style='color:#ff4d6d;'>❌ 연결 실패</strong>");
          errorDetails.push("<br><br>");
          errorDetails.push("<strong>연결 URL:</strong> " + url);
          errorDetails.push("<br><br>");
          errorDetails.push("<strong>확인 사항:</strong>");
          errorDetails.push("<br>");
          errorDetails.push("1️⃣ <strong>서버 실행 확인</strong>");
          errorDetails.push("   → 호스트 PC에서 <code style='background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;'>npm start</code> 실행 중인지 확인");
          errorDetails.push("   → 서버 콘솔에 '✅ WebSocket 서버가 포트 8080에서 리스닝 중입니다' 메시지 확인");
          errorDetails.push("<br>");
          errorDetails.push("2️⃣ <strong>방화벽 설정</strong> (호스트 PC, 관리자 권한 PowerShell)");
          errorDetails.push("   <code style='background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;'>netsh advfirewall firewall add rule name=\"WebSocket Server\" dir=in action=allow protocol=TCP localport=8080</code>");
          errorDetails.push("<br>");
          if (isTailscaleIP) {
            errorDetails.push("3️⃣ <strong>Tailscale 확인</strong>");
            errorDetails.push("   → 호스트 PC: <code style='background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;'>tailscale status</code> (실행 중인지 확인)");
            errorDetails.push("   → 호스트 PC: <code style='background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;'>tailscale ip</code> (IP 주소 확인)");
            errorDetails.push("   → 이 PC: <code style='background:rgba(0,0,0,.3);padding:2px 4px;border-radius:4px;'>tailscale status</code> (같은 네트워크인지 확인)");
            errorDetails.push("   → 호스트와 이 PC가 같은 Tailscale 계정으로 로그인되어 있는지 확인");
            errorDetails.push("<br>");
            errorDetails.push("4️⃣ <strong>IP 주소 확인</strong>");
            errorDetails.push("   → 호스트 PC의 서버 콘솔에서 표시된 Tailscale IP 확인");
            errorDetails.push("   → IP 주소가 변경되었을 수 있음 (다시 확인 필요)");
          } else {
            errorDetails.push("3️⃣ <strong>로컬 서버 확인</strong>");
            errorDetails.push("   → localhost 서버가 실행 중인지 확인");
          }
          errorDetails.push("<br>");
          errorDetails.push("5️⃣ <strong>네트워크 연결 확인</strong>");
          errorDetails.push("   → 호스트 PC와 이 PC가 같은 네트워크에 있는지 확인");
          errorDetails.push("   → 서버 콘솔에서 연결 시도가 표시되는지 확인");

          overlaySubEl.innerHTML = errorDetails.join("<br>");
        }
      };

      ws.onclose = (event) => {
        console.log(`\n⚠️  서버 연결 종료`);
        console.log(`   종료 코드: ${event.code}`);
        console.log(`   종료 이유: ${event.reason || '없음'}`);
        console.log(`   연결 URL: ${url}`);
        ws = null;

        // 연결 실패 원인 분석
        let errorMsg = "";
        let errorDetails = [];
        if (event.code === 1006) {
          errorMsg = "연결이 정상적으로 종료되지 않았습니다.";
          errorDetails.push("서버가 실행 중인지 확인하세요.");
          errorDetails.push("방화벽이 포트 8080을 막고 있을 수 있습니다.");
          errorDetails.push("네트워크 연결이 끊어졌을 수 있습니다.");
        } else if (event.code === 1002) {
          errorMsg = "프로토콜 오류가 발생했습니다.";
          errorDetails.push("서버와 클라이언트의 WebSocket 버전이 호환되지 않을 수 있습니다.");
        } else if (event.code === 1003) {
          errorMsg = "서버가 연결을 거부했습니다.";
          errorDetails.push("서버가 최대 연결 수에 도달했을 수 있습니다.");
          errorDetails.push("서버가 유지보수 중일 수 있습니다.");
        } else if (event.code === 1008) {
          errorMsg = "정책 위반으로 연결이 종료되었습니다.";
          errorDetails.push("서버가 보안 정책에 따라 연결을 거부했습니다.");
        } else if (event.code === 1000) {
          console.log("   정상 종료 (사용자 요청)");
          return; // 정상 종료는 재연결 시도하지 않음
        }

        // 정상 종료가 아니고, 호스트 모드이거나 재연결 시도 가능한 경우
        if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          if (host || started) {
            // 호스트이거나 게임이 시작된 경우 자동 재연결 시도
            isReconnecting = true;
            reconnectAttempts++;
            const delay = Math.min(1000 * reconnectAttempts, 5000); // 최대 5초

            console.log(`재연결 시도 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (${delay}ms 후)...`);
            if (overlaySubEl) {
              overlaySubEl.innerHTML =
                `연결 끊김. 재연결 시도 중... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})<br>` +
                (errorMsg ? `<small style="opacity:0.7;">${errorMsg}</small>` : "");
            }

            reconnectTimer = setTimeout(() => {
              connectToServer(url, host);
            }, delay);
            return;
          }
        }

        // 재연결 불가능한 경우
        if (overlaySubEl) {
          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            const errorDetails = [];
            errorDetails.push("<strong style='color:#ff4d6d;'>❌ 연결 실패</strong>");
            errorDetails.push("최대 재연결 시도 횟수 초과.");
            if (errorMsg) {
              errorDetails.push("<br><br><strong>" + errorMsg + "</strong>");
              if (errorDetails.length > 0) {
                errorDetails.push("<br>");
                errorDetails.push(errorDetails.join("<br>"));
              }
            }
            errorDetails.push("<br><br><strong>연결 URL:</strong> " + url);
            errorDetails.push("<br><br><strong>확인 사항:</strong>");
            errorDetails.push("1️⃣ 서버가 실행 중인지 (호스트 PC에서 npm start)");
            errorDetails.push("2️⃣ 방화벽 설정 (포트 8080) - 호스트 PC");
            errorDetails.push("3️⃣ Tailscale 실행 상태 (양쪽 PC 모두)");
            errorDetails.push("4️⃣ IP 주소 확인 (호스트 PC의 서버 콘솔 확인)");
            errorDetails.push("5️⃣ 같은 Tailscale 계정으로 로그인되어 있는지 확인");
            overlaySubEl.innerHTML = errorDetails.join("<br>");
          } else if (!host && !started) {
            // 게스트 모드이고 게임이 시작되지 않은 경우
            const errorDetails = [];
            if (errorMsg) {
              errorDetails.push("<strong style='color:#ff4d6d;'>❌ " + errorMsg + "</strong>");
            } else {
              errorDetails.push("<strong style='color:#ff4d6d;'>❌ 연결 실패</strong>");
            }
            errorDetails.push("<br><br><strong>연결 URL:</strong> " + url);
            errorDetails.push("<br><br><strong>확인 사항:</strong>");
            errorDetails.push("1️⃣ 서버가 실행 중인지 (호스트 PC에서 npm start)");
            errorDetails.push("2️⃣ 방화벽 설정 (포트 8080) - 호스트 PC");
            errorDetails.push("3️⃣ Tailscale 실행 상태 (양쪽 PC 모두)");
            errorDetails.push("4️⃣ IP 주소 확인 (호스트 PC의 서버 콘솔 확인)");
            errorDetails.push("5️⃣ 같은 Tailscale 계정으로 로그인되어 있는지 확인");
            errorDetails.push("<br><br>다시 시도하려면 IP 주소를 입력하고 연결 버튼을 클릭하세요.");
            overlaySubEl.innerHTML = errorDetails.join("<br>");
          } else {
            overlaySubEl.innerHTML =
              "연결이 끊어졌습니다." +
              (errorMsg ? `<br><small style="opacity:0.7;">${errorMsg}</small>` : "");
          }
        }
        reconnectAttempts = 0;
        isReconnecting = false;
      };
    } catch (err) {
      console.error("연결 실패:", err);
      if (overlaySubEl) overlaySubEl.textContent = "연결 실패: " + err.message;
    }
  }

  function handleServerMessage(data) {
    switch (data.type) {
      case "connected":
        clientId = data.clientId;
        myPlayerId = data.playerId;
        isHost = data.isHost;
        console.log(`연결됨: ${myPlayerId} (${isHost ? "호스트" : "클라이언트"})`);

        // Tailscale IP 정보 저장
        if (data.tailscaleIP && isHost) {
          localStorage.setItem('lastTailscaleIP', data.tailscaleIP);
        }

        if (isHost) {
          // 호스트는 캐릭터 선택 화면으로 이동
          showCharacterSelect(false, true);
        } else {
          // 게스트: 서버 상태 확인
          if (data.state && data.state.started) {
            // 호스트가 이미 게임을 시작한 경우 즉시 시작 (캐릭터는 기본값)
            overlayEl.classList.add("hidden");
            startGame(false, true);
          } else {
            // 호스트가 아직 게임을 시작하지 않았으면 캐릭터 선택 화면으로 이동
            showCharacterSelect(false, true);
          }
        }
        break;

      case "state":
        // 서버 상태 동기화
        if (data.state.players) {
          Object.keys(data.state.players).forEach((pid) => {
            if (pid !== myPlayerId) {
              if (!remotePlayers[pid]) {
                remotePlayers[pid] = { ...data.state.players[pid] };
              } else {
                // 부드러운 보간 (lerp) - 위치만 보간, 능력치는 즉시 업데이트
                const rp = remotePlayers[pid];
                const sp = data.state.players[pid];
                rp.x = lerp(rp.x, sp.x, 0.3);
                rp.y = lerp(rp.y, sp.y, 0.3);
                // 능력치는 즉시 업데이트 (서버에서 받은 값 사용)
                rp.hp = sp.hp;
                rp.hpMax = sp.hpMax;
                rp.level = sp.level;
                rp.damage = sp.damage;
                rp.fireRate = sp.fireRate;
                rp.pierce = sp.pierce;
                rp.pickup = sp.pickup;
                rp.dashCd = sp.dashCd;
                rp.dashCdMax = sp.dashCdMax;
                rp.projSize = sp.projSize;
                rp.projCount = sp.projCount || 1;
              }
            }
          });
          // 서버에서 사라진 플레이어 제거
          Object.keys(remotePlayers).forEach((pid) => {
            if (!data.state.players[pid] || pid === myPlayerId) {
              delete remotePlayers[pid];
            }
          });
        }
        // 게스트가 들어오면 자동으로 멀티플레이로 전환
        const remotePlayerCount = Object.keys(data.state.players || {}).filter(pid => pid !== myPlayerId).length;
        if (remotePlayerCount > 0 && !multiplayer && isHost) {
          // 호스트가 1인 플레이 중인데 게스트가 들어옴 -> 멀티플레이로 전환
          multiplayer = true;
          console.log("게스트가 들어와서 멀티플레이로 전환");
        }

        if (data.state.started && !started) {
          started = true;
          overlayEl.classList.add("hidden");
          // 게스트는 호스트가 게임을 시작하면 자동으로 시작 (캐릭터는 이미 선택됨)
          if (!isHost) {
            startGame(false, true);
          }
        }
        if (data.state.gameOver) {
          state.gameOver = true;
        }
        break;

      case "projectile":
        // 원격 플레이어의 투사체 추가
        if (data.playerId !== myPlayerId && data.projectile) {
          remoteProjectiles.push({
            ...data.projectile,
            playerId: data.playerId,
          });
        }
        break;

      case "hostChanged":
        if (data.newHostId === clientId) {
          isHost = true;
          console.log("호스트 권한 획득");
        }
        break;
    }
  }

  function sendToServer(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function startGame(enableMultiplayer, isNetworkMultiplayer = false) {
    multiplayer = enableMultiplayer;
    started = true;
    overlayMode = "levelup";
    choosing = false;
    state.paused = false;
    overlayEl.classList.add("hidden");

    // 메뉴 버튼 표시
    if (menuButtonEl) menuButtonEl.classList.remove("hidden");

    if (isNetworkMultiplayer) {
      // 네트워크 멀티플레이 모드
      // 호스트는 1인 플레이로 시작하지만, 서버와의 동기화를 위해 서버에도 게임 시작 상태를 알림
      // (startGame 메시지는 connected 핸들러에서 보냄)
    }

    reset();
  }

  function chooseUpgrades() {
    if (!started) return;
    overlayMode = "levelup";
    choosing = true;
    state.paused = true; // 모든 모드에서 레벨업 선택 시 일시정지
    overlayEl.classList.remove("hidden");
    choicesEl.innerHTML = "";
    // 레벨업 소리
    playLevelUpSound();

    // 서버 관련 문구 제거
    if (overlaySubEl) overlaySubEl.textContent = "";

    // 캐릭터 타입에 맞는 업그레이드만 필터링
    const availableUpgrades = upgrades.filter((u) => {
      // characterType이 없으면 모든 캐릭터에서 사용 가능
      if (!u.characterType) return true;

      // 멀티플레이어일 때는 P1 또는 P2 중 하나라도 해당 캐릭터 타입이면 사용 가능
      if (multiplayer) {
        return u.characterType === player1CharacterType || u.characterType === player2CharacterType;
      }

      // 싱글플레이어일 때는 P1 캐릭터 타입만 확인
      return u.characterType === player1CharacterType;
    });

    // pick 3 unique
    const picks = [];
    const pool = availableUpgrades.slice();
    while (picks.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    currentChoices = picks;

    picks.forEach((u, idx) => {
      const div = document.createElement("div");
      div.className = "choice";
      div.dataset.idx = String(idx);
      div.innerHTML = `
        <div class="choiceTitle">
          <div>${idx + 1}. ${u.title}</div>
          <div class="badge"><span class="kbd">${idx + 1}</span> ${u.badge || ""}</div>
        </div>
        <div class="choiceDesc">${u.desc}</div>
      `;
      div.addEventListener("click", () => pickUpgrade(idx));
      choicesEl.appendChild(div);
    });
  }

  function pickUpgrade(idx) {
    if (!choosing) return;
    if (overlayMode !== "levelup") return;
    const u = currentChoices[idx];
    // 선택지 데이터가 비어있으면(예: DOM/상태 꼬임) 오버레이가 영구히 안 닫히는 문제 방지
    if (!u) {
      choosing = false;
      state.paused = false;
      overlayEl.classList.add("hidden");
      console.warn("pickUpgrade: missing choice", { idx, currentChoices });
      return;
    }

    // 연속 선택 추적
    lastUpgradeIds.push(u.id);
    if (lastUpgradeIds.length > 3) {
      lastUpgradeIds.shift(); // 최근 3개만 유지
    }

    // 같은 아이템 3번 연속 선택 확인
    const isTriple = lastUpgradeIds.length === 3 &&
                     lastUpgradeIds[0] === u.id &&
                     lastUpgradeIds[1] === u.id &&
                     lastUpgradeIds[2] === u.id;

    // 업그레이드 적용 중 예외가 나도 입력이 "먹통"처럼 보이지 않게 방어
    try {
    u.apply();

      // 3번 연속 선택 시 10% 추가 증가
      if (isTriple) {
        // 각 업그레이드 타입에 맞는 추가 보너스 적용
        if (u.id === "dmg") {
          applyToAllPlayers((p) => (p.damage *= 1.1));
        } else if (u.id === "as") {
          applyToAllPlayers((p) => {
            p.fireRate *= 1.1; // 총 캐릭터: 발사 속도 증가
            p.angularSpeed *= 1.1; // 칼 캐릭터: 회전 속도 증가
            // 칼 막대기의 회전 속도도 업데이트
            const sword = swords.find(s => s.player === p);
            if (sword) {
              const speedSign = sword.angularSpeed >= 0 ? 1 : -1;
              sword.angularSpeed = Math.abs(p.angularSpeed) * speedSign;
            }
          });
        } else if (u.id === "spd") {
          applyToAllPlayers((p) => (p.speed *= 1.1));
        } else if (u.id === "hp") {
          applyToAllPlayers((p) => {
            p.hpMax = Math.floor(p.hpMax * 1.1);
            p.hp = Math.floor(p.hp * 1.1);
          });
        } else if (u.id === "heal") {
          applyToAllPlayers((p) => {
            const bonusHeal = p.hpMax * 0.1; // 추가 10% 회복
            p.hp = Math.min(p.hpMax, p.hp + bonusHeal);
          });
        } else if (u.id === "regen") {
          applyToAllPlayers((p) => (p.regen *= 1.1));
        } else if (u.id === "size") {
          applyToAllPlayers((p) => (p.projSize *= 1.1));
          // 칼 막대기의 크기도 즉시 업데이트 (다음 프레임에서 자동 반영됨)
        } else if (u.id === "pierce") {
          applyToAllPlayers((p) => (p.pierce += 1));
        } else if (u.id === "magnet") {
          applyToAllPlayers((p) => (p.pickup *= 1.1));
        } else if (u.id === "dash") {
          applyToAllPlayers((p) => (p.dashCdMax *= 0.9));
        }

        // 3번 연속 선택 보너스 표시
        floats.push({
          x: player1.x,
          y: player1.y - 48,
          ttl: 1.5,
          text: `🎉 3연속 보너스! +10%`,
          color: "#45ffb1",
        });

        // 연속 선택 초기화 (다음 연속 선택을 위해)
        lastUpgradeIds = [];
      }
    } catch (err) {
      console.error("upgrade apply failed", err, u);
    }

    choosing = false;
    state.paused = false;
    overlayEl.classList.add("hidden");

    floats.push({
      x: player1.x,
      y: player1.y - 24,
      ttl: 1.0,
      text: `+ ${u.title}`,
      color: "#7c5cff",
    });
  }

  // Shared progression (레벨/XP는 팀 공용)
  function gainXP(amount) {
    player1.xp += amount;
    while (player1.xp >= player1.xpToNext) {
      player1.xp -= player1.xpToNext;
      player1.level += 1;
      player1.xpToNext = Math.floor(player1.xpToNext * 1.28 + 8);
      chooseUpgrades();
    }
  }

  function spawnOrb(x, y, amount) {
    orbs.push({ x, y, r: 6, amount });
  }

  // 몬스터 등급에 따른 경험치 배율 계산
  function getEnemyTierMultiplier(kind) {
    // grunt: 등급 0, runner: 등급 1, tank: 등급 2
    const tier = kind === "grunt" ? 0 : kind === "runner" ? 1 : kind === "tank" ? 2 : 0;
    return Math.pow(1.5, tier); // 1.5^등급
  }

  function spawnEnemy(kind = "grunt") {
    // spawn around camera at distance
    const ang = rand(0, TAU);
    const dist = rand(360, 520);
    const sx = camera.x + Math.cos(ang) * dist;
    const sy = camera.y + Math.sin(ang) * dist;

    let hp = 26;
    let speed = 60;
    let damage = 12;
    let r = 12;

    // Scale with time
    const s = 1 + state.t / 45;

    if (kind === "runner") {
      hp = 18;
      speed = 92;
      damage = 10;
      r = 10;
    }

    if (kind === "tank") {
      hp = 60;
      speed = 42;
      damage = 18;
      r = 15;
    }

    enemies.push({
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      r,
      hp: hp * s,
      hpMax: hp * s,
      speed: speed * (0.9 + 0.1 * s),
      damage,
      hitCd: 0,
      kind,
    });
  }

  function nearestEnemy(from) {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function shoot(from) {
    // 칼 캐릭터인 경우 막대기 생성/업데이트
    if (from.characterType === "sword") {
      // 이미 막대기가 있으면 생성하지 않음
      const existingSword = swords.find(s => s.player === from);
      if (!existingSword) {
        // 초기 칼 길이는 캐릭터 사이즈(반지름)의 2.5배로 시작, 업그레이드로 증가
        const baseLength = (from.r || 12) * 2.5; // 플레이어 반지름의 2.5배
        // projSize가 4에서 시작하므로, (projSize - 4)로 증가분을 계산하여 더 큰 증가폭 적용
        const sizeMultiplier = (from.projSize || 4) - 4; // 기본값 4를 빼서 증가분만 계산
        const length = baseLength + sizeMultiplier * 3.0; // 칼 크기에 따라 길이 결정 (더 큰 증가폭)
        const width = 3 + sizeMultiplier * 1.0; // 칼 크기에 따라 두께 결정 (더 큰 증가폭)
        
        // 캐릭터 시야 방향을 기준으로 -45도에서 시작 (90도 범위의 시작점)
        const facingAngle = from.lastFacingAngle !== undefined ? from.lastFacingAngle : 0;
        const startAngle = facingAngle - Math.PI / 4; // -45도 (90도 범위의 시작)
        
        swords.push({
          player: from,
          angle: 0, // 0 ~ 90도 범위에서 회전 (0도 = 시작점, 90도 = 끝점)
          baseAngle: startAngle, // 기준 각도 (캐릭터 시야 방향 - 45도)
          angularSpeed: from.angularSpeed || 8.0, // 플레이어의 회전 속도 사용 (공격 속도 업그레이드 영향)
          length: length,
          width: width,
          damage: from.damage,
          hitEnemies: new Set(), // 이미 맞춘 적 추적
          cooldown: 0, // 쿨다운 시간 (초)
        });
        // 칼 휘두르는 소리
        playSwordSwingSound();
      }
      return;
    }

    // 총 캐릭터인 경우 기존 로직 (투사체 발사)
    const e = nearestEnemy(from);
    if (!e) return;

    const dx = e.x - from.x;
    const dy = e.y - from.y;
    const [nx, ny] = norm(dx, dy);

    const baseAng = Math.atan2(ny, nx);
    const projCount = from.projCount || 1;
    const spread = projCount > 1 ? 0.15 : 0.06; // 여러 발사체일 때 더 넓은 스프레드

    // 발사체 개수만큼 투사체 생성
    for (let i = 0; i < projCount; i++) {
      const offset = projCount > 1 ? (i - (projCount - 1) / 2) * spread : 0;
      const ang = baseAng + offset + rand(-0.02, 0.02);

      const vx = Math.cos(ang) * from.projSpeed;
      const vy = Math.sin(ang) * from.projSpeed;

      const proj = {
        x: from.x,
        y: from.y,
      vx,
      vy,
        r: from.projSize,
      life: 1.35,
        damage: from.damage,
        pierce: from.pierce,
        knock: from.knock,
      };
      projectiles.push(proj);

      // 네트워크 멀티플레이: 호스트가 투사체를 생성하면 서버에 전송
      if (ws && ws.readyState === WebSocket.OPEN && isHost && myPlayerId && from === player1) {
        sendToServer({
          type: "projectile",
          playerId: myPlayerId,
          projectile: proj,
        });
      }
    }
    
    // 총알 발사 소리 (총 캐릭터만)
    if (from.characterType === "gun") {
      playShootSound();
    }
  }

  // Timers
  let spawnAcc = 0;

  function reset() {
    state.t = 0;
    state.dt = 0;
    state.paused = false;
    state.gameOver = false;
    state.wave = 0;

    Object.assign(player1, { ...BASE_PLAYER, id: "P1", color: player1.color, characterType: player1CharacterType });
    Object.assign(player2, { ...BASE_PLAYER, id: "P2", color: player2.color, characterType: player2CharacterType });
    player1.x = 0;
    player1.y = 0;
    player2.x = 40;
    player2.y = 0;
    spawnAcc = 0;

    projectiles.length = 0;
    swords.length = 0;
    enemies.length = 0;
    orbs.length = 0;
    floats.length = 0;

    choosing = false;
    if (started) overlayEl.classList.add("hidden");
  }

  // 키 매칭 함수
  function matchesKey(e, binding) {
    if (!binding) return false;
    const k = e.key.toLowerCase();
    const code = e.code;

    // 키 이름으로 매칭 (예: "w", "ArrowUp")
    if (binding.toLowerCase() === k || binding === e.key) return true;

    // 키 코드로 매칭 (예: "Space", "Enter")
    if (binding === code) return true;

    // 특수 케이스: Space와 Enter
    if (binding === "Space" && code === "Space") return true;
    if (binding === "Enter" && (e.key === "Enter" || code === "NumpadEnter")) return true;

    return false;
  }

  // Input
  function setKey(e, down) {
    // 설정 메뉴에서 키 바인딩 입력 중이면 처리
    if (waitingForKey && down) {
      if (handleKeyBindingInput(e)) {
        e.preventDefault();
        return;
      }
    }

    const k = e.key.toLowerCase();

    // P1 키 바인딩
    if (matchesKey(e, keyBindings.p1.up)) input1.up = down;
    if (matchesKey(e, keyBindings.p1.down)) input1.down = down;
    if (matchesKey(e, keyBindings.p1.left)) input1.left = down;
    if (matchesKey(e, keyBindings.p1.right)) input1.right = down;
    if (matchesKey(e, keyBindings.p1.dash)) {
      input1.dash = down;
      if (down) input1.dashPressed = true;
    }

    // P2 키 바인딩 (멀티일 때만)
    if (multiplayer) {
      if (matchesKey(e, keyBindings.p2.up)) input2.up = down;
      if (matchesKey(e, keyBindings.p2.down)) input2.down = down;
      if (matchesKey(e, keyBindings.p2.left)) input2.left = down;
      if (matchesKey(e, keyBindings.p2.right)) input2.right = down;
      if (matchesKey(e, keyBindings.p2.dash)) {
        input2.dash = down;
        if (down) input2.dashPressed = true;
      }
    }

    if (down && (k === "p")) {
      if (!state.gameOver && !choosing) state.paused = !state.paused;
    }

    // ESC 키: 메뉴에서 뒤로가기
    if (down && k === "escape") {
      if (overlayMode === "menu" && !started) {
        // 조인 메뉴나 호스트 메뉴에서 메인 메뉴로
        if (overlayTitleEl && overlayTitleEl.textContent === "서버에 조인") {
          if (ws) {
            ws.close();
            ws = null;
          }
          showStartMenu();
        } else if (overlayTitleEl && overlayTitleEl.textContent === "호스트 서버") {
          if (ws && ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            ws = null;
          }
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            showStartMenu();
          }
        }
        // 레벨업 메뉴에서는 ESC로 닫기 안 함 (1~3으로 선택해야 함)
      }
    }

    // 시작 전: 메뉴에서 1/2로 선택
    if (down && !started && overlayMode === "menu") {
      const c = e.code;
      if (k === "1" || c === "Digit1" || c === "Numpad1") return startGame(false);
      if (k === "2" || c === "Digit2" || c === "Numpad2") return startGame(true);
    }

    if (down && state.gameOver && k === "r") {
      reset();
    }

    if (down && choosing) {
      // 브라우저/키보드/숫자패드 차이 대비: e.key + e.code 모두 허용
      const c = e.code;
      if (k === "1" || c === "Digit1" || c === "Numpad1") return pickUpgrade(0);
      if (k === "2" || c === "Digit2" || c === "Numpad2") return pickUpgrade(1);
      if (k === "3" || c === "Digit3" || c === "Numpad3") return pickUpgrade(2);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter"].includes(e.key)) e.preventDefault();
    setKey(e, true);
  });
  window.addEventListener("keyup", (e) => setKey(e, false));

  // Main loop
  let last = performance.now();
  function frame(now) {
    const rawDt = (now - last) / 1000;
    last = now;

    state.dt = clamp(rawDt, 0, 1 / 20);
    // 레벨업 선택 중이거나 일시정지 상태일 때는 게임 업데이트하지 않음
    if (!state.paused && !state.gameOver && !choosing) {
      update(state.dt);
    }
    render();

    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (!started) return;
    state.t += dt;

    // Difficulty ramp (80%로 축소)
    const spawnRate = (0.9 + state.t / 35) * 0.8; // enemies/sec

    const ps = activePlayers();

    // Players update (movement / dash / regen / shooting)
    for (const p of ps) {
      const inp = p === player1 ? input1 : input2;

    // Regen
      if (p.regen > 0) {
        p.hp = Math.min(p.hpMax, p.hp + p.regen * dt);
    }

      // Dash timers
      if (p.dashCd > 0) p.dashCd -= dt;
      if (p.invuln > 0) p.invuln -= dt;
      if (p.dashTime > 0) p.dashTime -= dt;

      const ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    let mx = ix;
    let my = iy;
      if (mx !== 0 || my !== 0) [mx, my] = norm(mx, my);

      let speed = p.speed;

    // Start dash
      if (inp.dashPressed) {
        inp.dashPressed = false;
        if (p.dashCd <= 0 && (mx !== 0 || my !== 0)) {
          p.dashTime = p.dashTimeMax;
          p.dashCd = p.dashCdMax;
          p.invuln = Math.max(p.invuln, 0.12);
        camera.shake = Math.max(camera.shake, 5);
      }
    }

      if (p.dashTime > 0) speed = p.dashSpeed;

    // Smooth movement
    const targetVx = mx * speed;
    const targetVy = my * speed;
      const accel = p.dashTime > 0 ? 26 : 16;

      p.vx = lerp(p.vx, targetVx, 1 - Math.exp(-accel * dt));
      p.vy = lerp(p.vy, targetVy, 1 - Math.exp(-accel * dt));

      // 마지막 이동 방향 저장 (칼 캐릭터 시야 방향용)
      if (Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1) {
        p.lastFacingAngle = Math.atan2(p.vy, p.vx);
      } else if (p.lastFacingAngle === undefined) {
        p.lastFacingAngle = 0; // 기본 방향 (오른쪽)
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 네트워크 멀티플레이: 플레이어 위치와 능력치를 서버에 전송 (호스트만)
      if (ws && ws.readyState === WebSocket.OPEN && isHost && myPlayerId && p === player1) {
        sendToServer({
          type: "playerUpdate",
          playerId: myPlayerId,
          player: {
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            hp: p.hp,
            hpMax: p.hpMax,
            level: p.level,
            damage: p.damage,
            fireRate: p.fireRate,
            pierce: p.pierce,
            pickup: p.pickup,
            dashCd: p.dashCd,
            dashCdMax: p.dashCdMax,
            projSize: p.projSize,
            projCount: p.projCount || 1,
          },
        });
      }

      // Auto shooting (per player)
      p.shootAcc += dt;
      const shotInterval = 1 / p.fireRate;
      while (p.shootAcc >= shotInterval) {
        p.shootAcc -= shotInterval;
        shoot(p);
    }
    }

    // Camera follows own player (each player sees their own character)
    // 각 클라이언트는 자신의 로컬 player1을 조종하므로, 카메라는 항상 player1을 따라감
    camera.x = lerp(camera.x, player1.x, 1 - Math.exp(-10 * dt));
    camera.y = lerp(camera.y, player1.y, 1 - Math.exp(-10 * dt));

    // Spawn
    spawnAcc += dt;
    const spawnInterval = 1 / spawnRate;
    const playerCount = totalPlayerCount();
    while (spawnAcc >= spawnInterval) {
      spawnAcc -= spawnInterval;
      // 플레이어 수만큼 적 스폰 (2명=2배, 3명=3배...)
      for (let n = 0; n < playerCount; n++) {
      const r = Math.random();
      if (state.t > 25 && r < 0.12) spawnEnemy("runner");
      else if (state.t > 45 && r < 0.20) spawnEnemy("tank");
      else spawnEnemy("grunt");
      }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      // Chase nearest player
      const ps = activePlayers();
      let target = ps[0];
      let bestD = Infinity;
      for (const p of ps) {
        const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          target = p;
        }
      }

      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const [nx, ny] = norm(dx, dy);

      e.vx = lerp(e.vx, nx * e.speed, 1 - Math.exp(-8 * dt));
      e.vy = lerp(e.vy, ny * e.speed, 1 - Math.exp(-8 * dt));
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      if (e.hitCd > 0) e.hitCd -= dt;

      // Collision players
      for (const p of ps) {
        const d = len(p.x - e.x, p.y - e.y);
        if (d < p.r + e.r) {
          if (e.hitCd <= 0 && p.invuln <= 0) {
          e.hitCd = 0.55;
            p.invuln = 0.42;
            p.hp -= e.damage;
          camera.shake = Math.max(camera.shake, 9);
          effects.hitFlash = 0.2;
            floats.push({ x: p.x, y: p.y - 18, ttl: 0.65, text: `-${e.damage}`, color: "#ff4d6d" });
            if (p.hp <= 0) {
              p.hp = 0;
            state.gameOver = true;
              // 카메라 흔들림 중지
              camera.shake = 0;
              // 역대 기록 저장
              saveScore(state.t);
            }
        }

          // soft push (away from player)
          const [pnx, pny] = norm(e.x - p.x, e.y - p.y);
          const push = (p.r + e.r - d) * 0.6;
          e.x += pnx * push;
          e.y += pny * push;
        }
      }
    }

    // Update remote projectiles
    for (let i = remoteProjectiles.length - 1; i >= 0; i--) {
      const p = remoteProjectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.life <= 0) {
        remoteProjectiles.splice(i, 1);
        continue;
      }
    }

    // Update swords (칼 막대기)
    for (let i = swords.length - 1; i >= 0; i--) {
      const sword = swords[i];
      const p = sword.player;

      // 플레이어가 죽었거나 게임이 끝났으면 막대기 제거
      if (p.hp <= 0 || state.gameOver) {
        swords.splice(i, 1);
        continue;
      }

      // 플레이어의 회전 속도와 동기화
      sword.angularSpeed = Math.abs(p.angularSpeed || 8.0);

      // 칼 크기 업그레이드 반영 (매 프레임 업데이트)
      const baseLength = (p.r || 12) * 2.5;
      const sizeMultiplier = (p.projSize || 4) - 4;
      sword.length = baseLength + sizeMultiplier * 3.0;
      sword.width = 3 + sizeMultiplier * 1.0;

      // 쿨다운 중이면 대기
      if (sword.cooldown > 0) {
        sword.cooldown -= dt;
        // 쿨다운 중에는 칼을 숨김 (angle을 음수로 설정하여 렌더링하지 않음)
        sword.angle = -1;
        if (sword.cooldown <= 0) {
          // 쿨다운이 끝나면 새로운 공격 시작
          sword.angle = 0;
          sword.cooldown = 0;
          // 기준 각도를 캐릭터 시야 방향으로 업데이트
          const facingAngle = p.lastFacingAngle !== undefined ? p.lastFacingAngle : 0;
          sword.baseAngle = facingAngle - Math.PI / 4; // -45도 (90도 범위의 시작)
          sword.hitEnemies.clear(); // 새로운 공격을 위해 충돌 기록 초기화
          // 칼 휘두르는 소리
          playSwordSwingSound();
        }
        continue; // 쿨다운 중에는 회전하지 않음
      }

      // 막대기 회전 (90도 범위: 0도 ~ 90도, 1회성 공격)
      const maxAngle = Math.PI / 2; // 90도 (라디안)
      sword.angle += sword.angularSpeed * dt;
      
      // 90도에 도달하면 공격 완료, 0.6초 쿨다운 시작
      if (sword.angle >= maxAngle) {
        sword.angle = maxAngle; // 90도에서 멈춤
        sword.cooldown = 0.6; // 0.6초 쿨다운
        sword.hitEnemies.clear(); // 충돌 기록 초기화
        continue; // 쿨다운 시작, 충돌 체크하지 않음
      }

      // 실제 각도 = 기준 각도 + 상대 각도 (0 ~ 90도)
      const actualAngle = sword.baseAngle + sword.angle;

      // 막대기 끝점 계산
      const endX = p.x + Math.cos(actualAngle) * sword.length;
      const endY = p.y + Math.sin(actualAngle) * sword.length;

      // 적과 충돌 체크
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];

        // 이미 이 프레임에서 맞춘 적은 건너뛰기
        if (sword.hitEnemies.has(e)) continue;

        // 막대기와 적의 거리 계산 (막대기 중심선에서 적까지의 최단 거리)
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);

        // 막대기 범위 내에 있는지 확인
        if (distToPlayer <= sword.length + e.r) {
          // 실제 막대기 각도와 적 방향 각도 차이 계산
          const actualAngle = sword.baseAngle + sword.angle;
          const enemyAngle = Math.atan2(dy, dx);
          let angleDiff = Math.abs(actualAngle - enemyAngle);
          if (angleDiff > Math.PI) angleDiff = TAU - angleDiff;

          // 막대기 범위 내에 있고 각도 차이가 작으면 충돌 (90도 범위 내)
          if (angleDiff < Math.PI / 2 || distToPlayer < sword.length * 0.5) {
            sword.hitEnemies.add(e); // 이 프레임에서 맞춘 적으로 표시

            // 데미지
            e.hp -= sword.damage;
            const [nx, ny] = norm(e.x - p.x, e.y - p.y);
            e.x += nx * (120 * dt); // 넉백
            e.y += ny * (120 * dt);

            floats.push({ x: e.x, y: e.y - 18, ttl: 0.55, text: `${Math.floor(sword.damage)}`, color: "#e8eeff" });

            if (e.hp <= 0) {
              // drop XP (등급별 경험치 배율 적용)
              const base = 4 + Math.floor(state.t / 25);
              const tierMultiplier = getEnemyTierMultiplier(e.kind);
              const xpAmount = Math.floor(base * tierMultiplier);
              const playerCount = totalPlayerCount();
              for (let n = 0; n < playerCount; n++) spawnOrb(e.x, e.y, xpAmount);
              enemies.splice(j, 1);
              // 적이 터지는 소리
              playEnemyDeathSound();
            }
          }
        }
      }

      // 매 프레임마다 hitEnemies 초기화 (다음 프레임에서 다시 맞출 수 있도록)
      sword.hitEnemies.clear();
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.life <= 0) {
        projectiles.splice(i, 1);
        continue;
      }

      // hits (관통 지원)
      const hitEnemies = new Set(); // 이미 맞춘 적 추적 (같은 적을 여러 번 맞추지 않도록)
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (hitEnemies.has(j)) continue; // 이미 맞춘 적은 건너뛰기

        const d = len(p.x - e.x, p.y - e.y);
        if (d < p.r + e.r) {
          // damage
          e.hp -= p.damage;
          const [nx, ny] = norm(e.x - p.x, e.y - p.y);
          e.x += nx * (p.knock * dt);
          e.y += ny * (p.knock * dt);

          floats.push({ x: e.x, y: e.y - 18, ttl: 0.55, text: `${Math.floor(p.damage)}`, color: "#e8eeff" });

          if (e.hp <= 0) {
            // drop XP (등급별 경험치 배율 적용)
            const base = 4 + Math.floor(state.t / 25);
            const tierMultiplier = getEnemyTierMultiplier(e.kind);
            const xpAmount = Math.floor(base * tierMultiplier);
            // 플레이어 수만큼 아이템(경험치) 드랍 (2명=2배, 3명=3배...)
            const playerCount = totalPlayerCount();
            for (let n = 0; n < playerCount; n++) spawnOrb(e.x, e.y, xpAmount);
            enemies.splice(j, 1);
            // 적이 터지는 소리
            playEnemyDeathSound();
          }

          // 관통 처리
          hitEnemies.add(j);
          if (p.pierce > 0) {
            p.pierce -= 1;
            // 관통이 남아있으면 계속 진행 (break 없음)
          } else {
            // 관통이 없으면 투사체 제거하고 루프 종료
            projectiles.splice(i, 1);
          break;
          }
        }
      }
    }

    // Update orbs + pickup
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      const ps = activePlayers();
      // Find nearest player (and pull if within pickup)
      let target = ps[0];
      let bestD = Infinity;
      for (const p of ps) {
        const d2 = (p.x - o.x) ** 2 + (p.y - o.y) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          target = p;
        }
      }

      const dx = target.x - o.x;
      const dy = target.y - o.y;
      const d = len(dx, dy);

      if (d < target.pickup) {
        const [nx, ny] = norm(dx, dy);
        const pull = clamp((target.pickup - d) / target.pickup, 0, 1);
        o.x += nx * (260 * pull * dt);
        o.y += ny * (260 * pull * dt);
      }

      if (d < target.r + o.r + 2) {
        gainXP(o.amount);
        orbs.splice(i, 1);
      }
    }

    // Floating text
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.ttl -= dt;
      f.y -= 18 * dt;
      if (f.ttl <= 0) floats.splice(i, 1);
    }

    // camera shake (게임 오버 시 흔들림 중지)
    if (state.gameOver) {
      camera.shake = 0;
    } else if (camera.shake > 0) {
      camera.shake = Math.max(0, camera.shake - 18 * dt);
    }
    if (effects.hitFlash > 0) effects.hitFlash = Math.max(0, effects.hitFlash - 2.2 * dt);

    // HUD
    const xpPct = Math.floor((player1.xp / player1.xpToNext) * 100);
    const dash1Pct = Math.floor(((player1.dashCdMax - player1.dashCd) / player1.dashCdMax) * 100);
    const dash2Pct = Math.floor(((player2.dashCdMax - player2.dashCd) / player2.dashCdMax) * 100);

    // 네트워크 멀티플레이어 확인
    const isNetworkMultiplayer = ws && ws.readyState === WebSocket.OPEN && Object.keys(remotePlayers).length > 0;
    const isLocalMultiplayer = multiplayer && !isNetworkMultiplayer;

    if (isNetworkMultiplayer || isLocalMultiplayer) {
      // 멀티플레이어: 각 플레이어 정보를 구분해서 표시
      let hudText = '';

      // P1 정보 (자신)
      hudText += `[P1] HP ${Math.floor(player1.hp)}/${player1.hpMax}  `;
      hudText += `LV ${player1.level}  `;
      hudText += `DMG ${Math.floor(player1.damage)}  `;
      hudText += `AS ${player1.fireRate.toFixed(1)}/s  `;
      hudText += `PIERCE ${player1.pierce}  `;
      hudText += `PICKUP ${Math.floor(player1.pickup)}\n`;
      hudText += `DASH ${clamp(dash1Pct, 0, 100)}%\n\n`;

      // P2 정보 (로컬 멀티플레이어)
      if (isLocalMultiplayer) {
        hudText += `[P2] HP ${Math.floor(player2.hp)}/${player2.hpMax}  `;
        hudText += `LV ${player2.level}  `;
        hudText += `DMG ${Math.floor(player2.damage)}  `;
        hudText += `AS ${player2.fireRate.toFixed(1)}/s  `;
        hudText += `PIERCE ${player2.pierce}  `;
        hudText += `PICKUP ${Math.floor(player2.pickup)}\n`;
        hudText += `DASH ${clamp(dash2Pct, 0, 100)}%\n\n`;
      }

      // 원격 플레이어 정보 (네트워크 멀티플레이어)
      if (isNetworkMultiplayer) {
        Object.values(remotePlayers).forEach((rp, index) => {
          if (rp.id === myPlayerId) return; // 자신은 제외
          const playerNum = index + 2;
          const dashPct = rp.dashCdMax ? Math.floor(((rp.dashCdMax - (rp.dashCd || 0)) / rp.dashCdMax) * 100) : 0;
          hudText += `[P${playerNum}] HP ${Math.floor(rp.hp || 0)}/${rp.hpMax || 100}  `;
          hudText += `LV ${rp.level || 1}  `;
          hudText += `DMG ${Math.floor(rp.damage || 10)}  `;
          hudText += `AS ${(rp.fireRate || 1).toFixed(1)}/s  `;
          hudText += `PIERCE ${rp.pierce || 0}  `;
          hudText += `PICKUP ${Math.floor(rp.pickup || 50)}\n`;
          hudText += `DASH ${clamp(dashPct, 0, 100)}%\n\n`;
        });
      }

      // 공통 정보
      hudText += `XP ${xpPct}%  `;
      hudText += `ENEMIES ${enemies.length}  `;
      hudText += `TIME ${state.t.toFixed(1)}s`;

      hudEl.textContent = hudText;
    } else {
      // 싱글플레이어
    hudEl.textContent =
        `HP ${Math.floor(player1.hp)}/${player1.hpMax}  LV ${player1.level}  XP ${xpPct}%\n` +
        `DMG ${Math.floor(player1.damage)}  ` +
        `AS ${player1.fireRate.toFixed(1)}/s  ` +
        `PIERCE ${player1.pierce}  ` +
        `PICKUP ${Math.floor(player1.pickup)}\n` +
      `ENEMIES ${enemies.length}  ` +
      `TIME ${state.t.toFixed(1)}s  ` +
        `DASH ${clamp(dash1Pct, 0, 100)}%`;
    }

    if (state.gameOver) {
      msgEl.innerHTML = `사망! <span class="kbd">R</span> 로 다시 시작`;
    } else if (state.paused) {
      msgEl.innerHTML = `일시정지 (<span class="kbd">P</span>)`;
    } else {
      msgEl.textContent = "";
    }
  }

  function worldToScreen(x, y) {
    return [x - camera.x + W / 2, y - camera.y + H / 2];
  }

  function render() {
    // Background
    ctx.clearRect(0, 0, W, H);

    const shakeX = (Math.random() * 2 - 1) * camera.shake;
    const shakeY = (Math.random() * 2 - 1) * camera.shake;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Grid
    const grid = 60;
    const cx = camera.x;
    const cy = camera.y;
    const startX = Math.floor((cx - W) / grid) * grid;
    const endX = Math.floor((cx + W) / grid) * grid;
    const startY = Math.floor((cy - H) / grid) * grid;
    const endY = Math.floor((cy + H) / grid) * grid;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";

    for (let x = startX; x <= endX; x += grid) {
      const [sx] = worldToScreen(x, cy);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += grid) {
      const [, sy] = worldToScreen(cx, y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
    }

    // Orbs
    for (const o of orbs) {
      const [sx, sy] = worldToScreen(o.x, o.y);
      ctx.beginPath();
      ctx.fillStyle = "rgba(69,255,177,0.85)";
      ctx.arc(sx, sy, o.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(69,255,177,0.25)";
      ctx.stroke();
    }

    // Projectiles
    for (const p of projectiles) {
      const [sx, sy] = worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.fillStyle = "rgba(124,92,255,0.95)";
      ctx.arc(sx, sy, p.r, 0, TAU);
      ctx.fill();
    }

    // Remote projectiles (원격 플레이어의 투사체)
    for (const p of remoteProjectiles) {
      const [sx, sy] = worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.fillStyle = "rgba(232,238,255,0.85)"; // 호스트 투사체 색상
      ctx.arc(sx, sy, p.r, 0, TAU);
      ctx.fill();
    }

    // Swords (칼 막대기)
    for (const sword of swords) {
      // 쿨다운 중이면 렌더링하지 않음
      if (sword.cooldown > 0 || sword.angle < 0) continue;
      
      const p = sword.player;
      const [px, py] = worldToScreen(p.x, p.y);
      // 실제 각도 = 기준 각도 + 상대 각도
      const actualAngle = sword.baseAngle + sword.angle;
      const endX = p.x + Math.cos(actualAngle) * sword.length;
      const endY = p.y + Math.sin(actualAngle) * sword.length;
      const [ex, ey] = worldToScreen(endX, endY);

      // 막대기 그리기
      ctx.beginPath();
      ctx.strokeStyle = "rgba(232,238,255,0.9)";
      ctx.lineWidth = sword.width;
      ctx.lineCap = "round";
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Enemies
    for (const e of enemies) {
      const [sx, sy] = worldToScreen(e.x, e.y);

      let fill = "rgba(255,77,109,0.9)";
      if (e.kind === "runner") fill = "rgba(255,142,76,0.9)";
      if (e.kind === "tank") fill = "rgba(255,77,109,0.65)";

      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.arc(sx, sy, e.r, 0, TAU);
      ctx.fill();

      // HP bar (subtle)
      const pct = clamp(e.hp / e.hpMax, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(sx - e.r, sy - e.r - 10, e.r * 2, 4);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(sx - e.r, sy - e.r - 10, e.r * 2 * pct, 4);
    }

    // Players
    {
      const ps = activePlayers();
      for (const p of ps) {
        const [sx, sy] = worldToScreen(p.x, p.y);

      // pickup ring
      ctx.beginPath();
      ctx.strokeStyle = "rgba(69,255,177,0.07)";
      ctx.lineWidth = 2;
        ctx.arc(sx, sy, p.pickup, 0, TAU);
      ctx.stroke();

      // body
      ctx.beginPath();
        const inv = p.invuln > 0;
        ctx.fillStyle = inv ? "rgba(255,255,255,0.95)" : p.color;
        ctx.arc(sx, sy, p.r, 0, TAU);
      ctx.fill();

      // direction nub
        const d = norm(p.vx, p.vy);
      ctx.beginPath();
      ctx.fillStyle = "rgba(124,92,255,0.9)";
      ctx.arc(sx + d[0] * 10, sy + d[1] * 10, 3.2, 0, TAU);
      ctx.fill();

        // label
        ctx.fillStyle = "rgba(159,176,214,0.95)";
        ctx.font = "11px ui-sans-serif, system-ui";
        ctx.fillText(p.id, sx - 10, sy - p.r - 10);
      }

      // 원격 플레이어 렌더링 (네트워크 멀티플레이)
      if (ws && ws.readyState === WebSocket.OPEN) {
        Object.values(remotePlayers).forEach((rp) => {
          if (rp.id === myPlayerId) return; // 자신은 제외
          const [sx, sy] = worldToScreen(rp.x || 0, rp.y || 0);

          // body
          ctx.beginPath();
          ctx.fillStyle = rp.color || "rgba(124,92,255,0.95)";
          ctx.arc(sx, sy, 12, 0, TAU);
          ctx.fill();

          // label
          ctx.fillStyle = "rgba(159,176,214,0.95)";
          ctx.font = "11px ui-sans-serif, system-ui";
          ctx.fillText(rp.id || "?", sx - 10, sy - 18);
        });
      }

      // HP bars (P1 / P2)
      const barW = W - 32;
      const baseY = H - 18;
      const hp1 = clamp(player1.hp / player1.hpMax, 0, 1);
      const hp2 = clamp(player2.hp / player2.hpMax, 0, 1);

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(16, baseY, barW, 8);
      ctx.fillStyle = "rgba(69,255,177,0.75)";
      ctx.fillRect(16, baseY, barW * hp1, 8);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(16, baseY, barW, 8);

      if (multiplayer) {
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(16, baseY - 10, barW, 6);
        ctx.fillStyle = "rgba(124,92,255,0.75)";
        ctx.fillRect(16, baseY - 10, barW * hp2, 6);
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.strokeRect(16, baseY - 10, barW, 6);
      }

      // XP bar (shared)
      const xpPct = clamp(player1.xp / player1.xpToNext, 0, 1);
      ctx.fillStyle = "rgba(124,92,255,0.35)";
      ctx.fillRect(16, H - 30, barW * xpPct, 6);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.strokeRect(16, H - 30, barW, 6);
    }

    // Floating text
    for (const f of floats) {
      const [sx, sy] = worldToScreen(f.x, f.y);
      ctx.globalAlpha = clamp(f.ttl / 0.6, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.fillText(f.text, sx + 10, sy);
      ctx.globalAlpha = 1;
    }

    // Flash
    if (effects.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,77,109,${effects.hitFlash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Game over overlay text (in-canvas subtle)
    if (state.gameOver) {
      const currentScores = getTopScores();
      const currentBest = currentScores.length > 0 ? currentScores[0] : 0;
      const timeMinutes = Math.floor(state.t / 60);
      const timeSeconds = Math.floor(state.t % 60);
      const isNewRecord = state.t >= currentBest && state.t > 0;

      // 배경 (기록 개수에 따라 크기 조정)
      const panelHeight = 200 + Math.min(currentScores.length, 10) * 20;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(W / 2 - 220, H / 2 - panelHeight / 2, 440, panelHeight);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.strokeRect(W / 2 - 220, H / 2 - panelHeight / 2, 440, panelHeight);

      let y = H / 2 - panelHeight / 2 + 30;

      // 제목
      ctx.fillStyle = "rgba(232,238,255,0.95)";
      ctx.font = "800 24px ui-sans-serif, system-ui";
      ctx.fillText("사망!", W / 2 - 32, y);
      y += 35;

      // 현재 생존 시간
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.fillStyle = isNewRecord ? "rgba(69,255,177,0.95)" : "rgba(159,176,214,0.95)";
      const timeText = `생존 시간: ${timeMinutes}:${timeSeconds.toString().padStart(2, '0')}`;
      ctx.fillText(timeText, W / 2 - 100, y);
      y += 25;

      if (isNewRecord) {
        ctx.fillStyle = "rgba(69,255,177,0.95)";
        ctx.font = "800 14px ui-sans-serif, system-ui";
        ctx.fillText("🎉 신기록!", W / 2 - 40, y);
        y += 25;
      }

      // 역대 기록 (상위 10개)
      if (currentScores.length > 0) {
        ctx.fillStyle = "rgba(124,92,255,0.95)";
        ctx.font = "800 16px ui-sans-serif, system-ui";
        ctx.fillText("역대 기록", W / 2 - 50, y);
        y += 25;

        ctx.font = "13px ui-sans-serif, system-ui";
        const displayScores = currentScores.slice(0, 10);
        for (let i = 0; i < displayScores.length; i++) {
          const score = displayScores[i];
          const scoreMinutes = Math.floor(score / 60);
          const scoreSeconds = Math.floor(score % 60);
          const isCurrent = Math.abs(score - state.t) < 0.1;

          ctx.fillStyle = isCurrent ? "rgba(69,255,177,0.95)" : "rgba(159,176,214,0.85)";
          const rankText = `${i + 1}위: ${scoreMinutes}:${scoreSeconds.toString().padStart(2, '0')}`;
          ctx.fillText(rankText, W / 2 - 80, y);
          y += 18;
        }
      }

      // 다시 시작 안내
      y += 10;
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(159,176,214,0.95)";
      ctx.fillText("R 로 다시 시작", W / 2 - 52, y);
    }

    // 일시정지 표시 (화면 옆에)
    if (state.paused && !state.gameOver && !choosing) {
      ctx.save();
      ctx.fillStyle = "rgba(232,238,255,0.9)";
      ctx.font = "bold 20px ui-sans-serif, system-ui";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("일시 정지", W - 20, 20);
      ctx.restore();
    }

    ctx.restore();
  }

  // 메뉴 버튼 클릭 이벤트
  if (menuButtonEl) {
    menuButtonEl.addEventListener("click", () => {
      // 게임이 시작된 상태에서만 메뉴로 돌아가기 (레벨업 선택 중이 아닐 때)
      if (started && !choosing) {
        returnToMainMenu();
      }
    });
  }

  // 첫 화면: 플레이어 선택 화면부터 시작
  started = false;
  choosing = false;
  overlayMode = "menu";
  state.paused = true;
  reset();
  showStartMenu();
  requestAnimationFrame(frame);
})();
