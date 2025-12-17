(() => {
  "use strict";

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hudEl = document.getElementById("hud");
  const msgEl = document.getElementById("message");
  const overlayEl = document.getElementById("overlay");
  const choicesEl = document.getElementById("choices");

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
    projSpeed: 420,
    pierce: 0,
    projSize: 4,
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

  // Back-compat alias (기존 로직이 player를 참조)
  const player = player1;

  function applyToAllPlayers(fn) {
    for (const p of activePlayers()) fn(p);
  }

  /** @type {{x:number,y:number,vx:number,vy:number,r:number,life:number,damage:number,pierce:number}[]} */
  const projectiles = [];

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

  const upgrades = [
    {
      id: "dmg",
      title: "피해량 증가",
      desc: "+20% 피해량",
      badge: "+DMG",
      apply: () => applyToAllPlayers((p) => (p.damage *= 1.2)),
    },
    {
      id: "as",
      title: "공격 속도",
      desc: "+18% 발사 속도",
      badge: "+AS",
      apply: () => applyToAllPlayers((p) => (p.fireRate *= 1.18)),
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
      id: "regen",
      title: "재생",
      desc: "+0.6 HP/초",
      badge: "REGEN",
      apply: () => applyToAllPlayers((p) => (p.regen += 0.6)),
    },
    {
      id: "size",
      title: "투사체 크기",
      desc: "+35% 투사체 크기",
      badge: "+SIZE",
      apply: () => applyToAllPlayers((p) => (p.projSize *= 1.35)),
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

  function chooseUpgrades() {
    choosing = true;
    state.paused = true;
    overlayEl.classList.remove("hidden");
    choicesEl.innerHTML = "";

    // pick 3 unique
    const picks = [];
    const pool = upgrades.slice();
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
    const u = currentChoices[idx];
    if (!u) return;
    u.apply();

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
    const e = nearestEnemy(from);
    if (!e) return;

    const dx = e.x - from.x;
    const dy = e.y - from.y;
    const [nx, ny] = norm(dx, dy);

    const spread = 0.06;
    const ang = Math.atan2(ny, nx) + rand(-spread, spread);

    const vx = Math.cos(ang) * from.projSpeed;
    const vy = Math.sin(ang) * from.projSpeed;

    projectiles.push({
      x: from.x,
      y: from.y,
      vx,
      vy,
      r: from.projSize,
      life: 1.35,
      damage: from.damage,
      pierce: from.pierce,
      knock: from.knock,
    });
  }

  // Timers
  let spawnAcc = 0;

  function reset() {
    state.t = 0;
    state.dt = 0;
    state.paused = false;
    state.gameOver = false;
    state.wave = 0;

    Object.assign(player1, { ...BASE_PLAYER, id: "P1", color: player1.color });
    Object.assign(player2, { ...BASE_PLAYER, id: "P2", color: player2.color });
    player1.x = 0;
    player1.y = 0;
    player2.x = 40;
    player2.y = 0;
    spawnAcc = 0;

    projectiles.length = 0;
    enemies.length = 0;
    orbs.length = 0;
    floats.length = 0;

    choosing = false;
    overlayEl.classList.add("hidden");
  }

  // Input
  function setKey(e, down) {
    const k = e.key.toLowerCase();
    // P1: WASD + Space
    if (k === "w") input1.up = down;
    if (k === "s") input1.down = down;
    if (k === "a") input1.left = down;
    if (k === "d") input1.right = down;

    // P2: Arrow keys + Enter (멀티일 때만)
    if (multiplayer) {
      if (e.key === "ArrowUp") input2.up = down;
      if (e.key === "ArrowDown") input2.down = down;
      if (e.key === "ArrowLeft") input2.left = down;
      if (e.key === "ArrowRight") input2.right = down;
    }

    if (e.code === "Space") {
      input1.dash = down;
      if (down) input1.dashPressed = true;
    }

    if (multiplayer && (e.key === "Enter" || e.code === "NumpadEnter")) {
      input2.dash = down;
      if (down) input2.dashPressed = true;
    }

    if (down && (k === "p")) {
      if (!state.gameOver && !choosing) state.paused = !state.paused;
    }

    // 멀티 토글: M (게임 시작 전/게임오버일 때만)
    if (down && k === "m") {
      if (state.t < 0.25 || state.gameOver) {
        multiplayer = !multiplayer;
        reset();
      }
    }

    if (down && state.gameOver && k === "r") {
      reset();
    }

    if (down && choosing) {
      if (k === "1") pickUpgrade(0);
      if (k === "2") pickUpgrade(1);
      if (k === "3") pickUpgrade(2);
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
    if (!state.paused && !state.gameOver) {
      update(state.dt);
    }
    render();

    requestAnimationFrame(frame);
  }

  function update(dt) {
    state.t += dt;

    // Difficulty ramp
    const spawnRate = 0.9 + state.t / 35; // enemies/sec

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

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Auto shooting (per player)
      p.shootAcc += dt;
      const shotInterval = 1 / p.fireRate;
      while (p.shootAcc >= shotInterval) {
        p.shootAcc -= shotInterval;
        shoot(p);
      }
    }

    // Camera follows team center
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    camera.x = lerp(camera.x, cx, 1 - Math.exp(-10 * dt));
    camera.y = lerp(camera.y, cy, 1 - Math.exp(-10 * dt));

    // Spawn
    spawnAcc += dt;
    const spawnInterval = 1 / spawnRate;
    while (spawnAcc >= spawnInterval) {
      spawnAcc -= spawnInterval;
      // 2명이면 적 스폰 2배
      for (let n = 0; n < activePlayers().length; n++) {
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

      // hits
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const d = len(p.x - e.x, p.y - e.y);
        if (d < p.r + e.r) {
          // damage
          e.hp -= p.damage;
          const [nx, ny] = norm(e.x - p.x, e.y - p.y);
          e.x += nx * (p.knock * dt);
          e.y += ny * (p.knock * dt);

          floats.push({ x: e.x, y: e.y - 18, ttl: 0.55, text: `${Math.floor(p.damage)}`, color: "#e8eeff" });

          if (e.hp <= 0) {
            // drop XP
            const base = 4 + Math.floor(state.t / 25);
            // 2명이면 아이템(경험치) 2배
            for (let n = 0; n < activePlayers().length; n++) spawnOrb(e.x, e.y, base);
            enemies.splice(j, 1);
          }

          if (p.pierce > 0) {
            p.pierce -= 1;
          } else {
            projectiles.splice(i, 1);
          }
          break;
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

    // camera shake
    if (camera.shake > 0) camera.shake = Math.max(0, camera.shake - 18 * dt);
    if (effects.hitFlash > 0) effects.hitFlash = Math.max(0, effects.hitFlash - 2.2 * dt);

    // HUD
    const xpPct = Math.floor((player1.xp / player1.xpToNext) * 100);
    const dash1Pct = Math.floor(((player1.dashCdMax - player1.dashCd) / player1.dashCdMax) * 100);
    const dash2Pct = Math.floor(((player2.dashCdMax - player2.dashCd) / player2.dashCdMax) * 100);

    const hpLine = multiplayer
      ? `P1 HP ${Math.floor(player1.hp)}/${player1.hpMax}   P2 HP ${Math.floor(player2.hp)}/${player2.hpMax}`
      : `HP ${Math.floor(player1.hp)}/${player1.hpMax}`;

    hudEl.textContent =
      `${hpLine}  LV ${player1.level}  XP ${xpPct}%\n` +
      `DMG ${Math.floor(player1.damage)}  ` +
      `AS ${player1.fireRate.toFixed(1)}/s  ` +
      `PIERCE ${player1.pierce}  ` +
      `PICKUP ${Math.floor(player1.pickup)}\n` +
      `ENEMIES ${enemies.length}  ` +
      `TIME ${state.t.toFixed(1)}s  ` +
      (multiplayer ? `DASH P1 ${clamp(dash1Pct, 0, 100)}%  P2 ${clamp(dash2Pct, 0, 100)}%` : `DASH ${clamp(dash1Pct, 0, 100)}%`);

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
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(W / 2 - 170, H / 2 - 50, 340, 100);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(W / 2 - 170, H / 2 - 50, 340, 100);

      ctx.fillStyle = "rgba(232,238,255,0.95)";
      ctx.font = "800 22px ui-sans-serif, system-ui";
      ctx.fillText("사망!", W / 2 - 32, H / 2 - 10);
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.fillStyle = "rgba(159,176,214,0.95)";
      ctx.fillText("R 로 다시 시작", W / 2 - 52, H / 2 + 18);
    }

    ctx.restore();
  }

  reset();
  requestAnimationFrame(frame);
})();
