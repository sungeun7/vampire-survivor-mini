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

  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    dash: false,
    dashPressed: false,
  };

  const camera = { x: 0, y: 0, shake: 0 };

  const player = {
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
  };

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
      apply: () => (player.damage *= 1.2),
    },
    {
      id: "as",
      title: "공격 속도",
      desc: "+18% 발사 속도",
      badge: "+AS",
      apply: () => (player.fireRate *= 1.18),
    },
    {
      id: "spd",
      title: "이동 속도",
      desc: "+12% 이동 속도",
      badge: "+MS",
      apply: () => (player.speed *= 1.12),
    },
    {
      id: "hp",
      title: "최대 체력",
      desc: "+25 최대 체력 (현재 체력도 회복)",
      badge: "+HP",
      apply: () => {
        player.hpMax += 25;
        player.hp = Math.min(player.hpMax, player.hp + 25);
      },
    },
    {
      id: "regen",
      title: "재생",
      desc: "+0.6 HP/초",
      badge: "REGEN",
      apply: () => (player.regen += 0.6),
    },
    {
      id: "size",
      title: "투사체 크기",
      desc: "+35% 투사체 크기",
      badge: "+SIZE",
      apply: () => (player.projSize *= 1.35),
    },
    {
      id: "pierce",
      title: "관통",
      desc: "+1 관통",
      badge: "+PIERCE",
      apply: () => (player.pierce += 1),
    },
    {
      id: "magnet",
      title: "자석 범위",
      desc: "+35% 경험치 흡수 범위",
      badge: "+MAG",
      apply: () => (player.pickup *= 1.35),
    },
    {
      id: "dash",
      title: "대시 쿨다운 감소",
      desc: "대시 쿨다운 -18%",
      badge: "DASH",
      apply: () => (player.dashCdMax *= 0.82),
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
      x: player.x,
      y: player.y - 24,
      ttl: 1.0,
      text: `+ ${u.title}`,
      color: "#7c5cff",
    });
  }

  function gainXP(amount) {
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level += 1;
      player.xpToNext = Math.floor(player.xpToNext * 1.28 + 8);
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

  function nearestEnemy() {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function shoot() {
    const e = nearestEnemy();
    if (!e) return;

    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const [nx, ny] = norm(dx, dy);

    const spread = 0.06;
    const ang = Math.atan2(ny, nx) + rand(-spread, spread);

    const vx = Math.cos(ang) * player.projSpeed;
    const vy = Math.sin(ang) * player.projSpeed;

    projectiles.push({
      x: player.x,
      y: player.y,
      vx,
      vy,
      r: player.projSize,
      life: 1.35,
      damage: player.damage,
      pierce: player.pierce,
    });
  }

  // Timers
  let shootAcc = 0;
  let spawnAcc = 0;

  function reset() {
    state.t = 0;
    state.dt = 0;
    state.paused = false;
    state.gameOver = false;
    state.wave = 0;

    player.x = 0;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.hp = 100;
    player.hpMax = 100;
    player.invuln = 0;
    player.speed = 175;
    player.dashCd = 0;
    player.dashCdMax = 1.1;
    player.dashTime = 0;

    player.level = 1;
    player.xp = 0;
    player.xpToNext = 18;

    player.damage = 9;
    player.fireRate = 3.2;
    player.projSpeed = 420;
    player.pierce = 0;
    player.projSize = 4;
    player.knock = 120;
    player.pickup = 70;
    player.regen = 0;

    shootAcc = 0;
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
    if (k === "w" || e.key === "ArrowUp") input.up = down;
    if (k === "s" || e.key === "ArrowDown") input.down = down;
    if (k === "a" || e.key === "ArrowLeft") input.left = down;
    if (k === "d" || e.key === "ArrowRight") input.right = down;

    if (e.code === "Space") {
      input.dash = down;
      if (down) input.dashPressed = true;
    }

    if (down && (k === "p")) {
      if (!state.gameOver && !choosing) state.paused = !state.paused;
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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
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

    // Regen
    if (player.regen > 0) {
      player.hp = Math.min(player.hpMax, player.hp + player.regen * dt);
    }

    // Dash
    if (player.dashCd > 0) player.dashCd -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.dashTime > 0) {
      player.dashTime -= dt;
    }

    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    let mx = ix;
    let my = iy;

    if (mx !== 0 || my !== 0) {
      [mx, my] = norm(mx, my);
    }

    let speed = player.speed;

    // Start dash
    if (input.dashPressed) {
      input.dashPressed = false;
      if (player.dashCd <= 0 && (mx !== 0 || my !== 0)) {
        player.dashTime = player.dashTimeMax;
        player.dashCd = player.dashCdMax;
        player.invuln = Math.max(player.invuln, 0.12);
        camera.shake = Math.max(camera.shake, 5);
      }
    }

    if (player.dashTime > 0) speed = player.dashSpeed;

    // Smooth movement
    const targetVx = mx * speed;
    const targetVy = my * speed;
    const accel = player.dashTime > 0 ? 26 : 16;

    player.vx = lerp(player.vx, targetVx, 1 - Math.exp(-accel * dt));
    player.vy = lerp(player.vy, targetVy, 1 - Math.exp(-accel * dt));

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Camera
    camera.x = lerp(camera.x, player.x, 1 - Math.exp(-10 * dt));
    camera.y = lerp(camera.y, player.y, 1 - Math.exp(-10 * dt));

    // Auto shooting
    shootAcc += dt;
    const shotInterval = 1 / player.fireRate;
    while (shootAcc >= shotInterval) {
      shootAcc -= shotInterval;
      shoot();
    }

    // Spawn
    spawnAcc += dt;
    const spawnInterval = 1 / spawnRate;
    while (spawnAcc >= spawnInterval) {
      spawnAcc -= spawnInterval;
      const r = Math.random();
      if (state.t > 25 && r < 0.12) spawnEnemy("runner");
      else if (state.t > 45 && r < 0.20) spawnEnemy("tank");
      else spawnEnemy("grunt");
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const [nx, ny] = norm(dx, dy);

      e.vx = lerp(e.vx, nx * e.speed, 1 - Math.exp(-8 * dt));
      e.vy = lerp(e.vy, ny * e.speed, 1 - Math.exp(-8 * dt));
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      if (e.hitCd > 0) e.hitCd -= dt;

      // Collision player
      const d = len(player.x - e.x, player.y - e.y);
      if (d < player.r + e.r) {
        if (e.hitCd <= 0 && player.invuln <= 0) {
          e.hitCd = 0.55;
          player.invuln = 0.42;
          player.hp -= e.damage;
          camera.shake = Math.max(camera.shake, 9);
          effects.hitFlash = 0.2;
          floats.push({ x: player.x, y: player.y - 18, ttl: 0.65, text: `-${e.damage}`, color: "#ff4d6d" });
          if (player.hp <= 0) {
            player.hp = 0;
            state.gameOver = true;
          }
        }

        // soft push
        const push = (player.r + e.r - d) * 0.6;
        e.x -= nx * push;
        e.y -= ny * push;
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
          e.x += nx * (player.knock * dt);
          e.y += ny * (player.knock * dt);

          floats.push({ x: e.x, y: e.y - 18, ttl: 0.55, text: `${Math.floor(p.damage)}`, color: "#e8eeff" });

          if (e.hp <= 0) {
            // drop XP
            const base = 4 + Math.floor(state.t / 25);
            spawnOrb(e.x, e.y, base);
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
      const dx = player.x - o.x;
      const dy = player.y - o.y;
      const d = len(dx, dy);

      if (d < player.pickup) {
        const [nx, ny] = norm(dx, dy);
        const pull = clamp((player.pickup - d) / player.pickup, 0, 1);
        o.x += nx * (260 * pull * dt);
        o.y += ny * (260 * pull * dt);
      }

      if (d < player.r + o.r + 2) {
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
    const xpPct = Math.floor((player.xp / player.xpToNext) * 100);
    const dashPct = Math.floor(((player.dashCdMax - player.dashCd) / player.dashCdMax) * 100);

    hudEl.textContent =
      `HP ${Math.floor(player.hp)}/${player.hpMax}  ` +
      `LV ${player.level}  ` +
      `XP ${xpPct}%\n` +
      `DMG ${Math.floor(player.damage)}  ` +
      `AS ${player.fireRate.toFixed(1)}/s  ` +
      `PIERCE ${player.pierce}  ` +
      `PICKUP ${Math.floor(player.pickup)}\n` +
      `ENEMIES ${enemies.length}  ` +
      `TIME ${state.t.toFixed(1)}s  ` +
      `DASH ${clamp(dashPct, 0, 100)}%`;

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

    // Player
    {
      const [sx, sy] = worldToScreen(player.x, player.y);

      // pickup ring
      ctx.beginPath();
      ctx.strokeStyle = "rgba(69,255,177,0.07)";
      ctx.lineWidth = 2;
      ctx.arc(sx, sy, player.pickup, 0, TAU);
      ctx.stroke();

      // body
      ctx.beginPath();
      const inv = player.invuln > 0;
      ctx.fillStyle = inv ? "rgba(255,255,255,0.95)" : "rgba(232,238,255,0.92)";
      ctx.arc(sx, sy, player.r, 0, TAU);
      ctx.fill();

      // direction nub
      const d = norm(player.vx, player.vy);
      ctx.beginPath();
      ctx.fillStyle = "rgba(124,92,255,0.9)";
      ctx.arc(sx + d[0] * 10, sy + d[1] * 10, 3.2, 0, TAU);
      ctx.fill();

      // HP bar
      const hpPct = clamp(player.hp / player.hpMax, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(16, H - 18, W - 32, 8);
      ctx.fillStyle = "rgba(69,255,177,0.75)";
      ctx.fillRect(16, H - 18, (W - 32) * hpPct, 8);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(16, H - 18, W - 32, 8);

      // XP bar
      const xpPct = clamp(player.xp / player.xpToNext, 0, 1);
      ctx.fillStyle = "rgba(124,92,255,0.35)";
      ctx.fillRect(16, H - 30, (W - 32) * xpPct, 6);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.strokeRect(16, H - 30, W - 32, 6);
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
