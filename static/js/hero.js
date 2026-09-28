/* Hero animation: tokens sit on a uniform grid with flickering expert colours
   (standard MoE), then a shock wave breaks them into semantic clusters that
   orbit drifting prototypes, while generic tokens keep flowing freely. */
(function () {
  "use strict";
  const canvas = document.getElementById("heroCanvas");
  if (!canvas) return;
  const hero = canvas.closest(".hero");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("heroStatus");
  const dotEl = document.getElementById("heroDot");
  const replayBtn = document.getElementById("heroReplay");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SEM = ["#2ee6c5", "#38bdf8", "#a78bfa", "#f472b6", "#7ee787"];
  const GEN = "#ffb547";
  const EXPERT = ["#3b5bdb", "#4c6ef5", "#748ffc", "#91a7ff", "#bac8ff", "#dee2e6",
                  "#ffc9c9", "#ffa8a8", "#ff8787", "#fa5252", "#e03131", "#c92a2a"];
  const WEIGHTS = [0.32, 0.24, 0.18, 0.14, 0.12];
  const HOMES = [[0.12, 0.30], [0.88, 0.27], [0.15, 0.79], [0.86, 0.77], [0.5, 0.95]];
  const GENERIC_SHARE = 0.36;
  const GRID_HOLD = 2.1; // seconds on the uniform grid before the break

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  // bucket palette: 0..11 expert colours, 12..16 semantic, 17 generic
  const PALETTE = EXPERT.map((c) => rgba(c, 0.78)).concat(SEM.map((c) => rgba(c, 0.92)), [rgba(GEN, 0.6)]);
  const HALO = EXPERT.map((c) => rgba(c, 0.12)).concat(SEM.map((c) => rgba(c, 0.16)), [rgba(GEN, 0.08)]);
  const LINK = SEM.map((c) => rgba(c, 0.09));

  let W = 0, H = 0, dpr = 1, spacing = 32;
  let tokens = [], protos = [];
  let clock = 0, breakAt = -1, broke = false;
  let running = false, inView = true, raf = 0, last = 0;
  const mouse = { x: -1e4, y: -1e4 };

  function setStatus(split) {
    if (!statusEl) return;
    statusEl.textContent = split
      ? "SplitMoE · tokens cluster around semantic prototypes"
      : "Standard MoE · uniform load balancing → fragmented routing";
    if (dotEl) dotEl.classList.toggle("ok", split);
  }

  function build() {
    spacing = Math.max(W < 720 ? 30 : 28, Math.sqrt((W * H) / 1400));
    const cols = Math.ceil(W / spacing) + 1;
    const rows = Math.ceil(H / spacing) + 1;
    const ox = (W - (cols - 1) * spacing) / 2;
    const oy = (H - (rows - 1) * spacing) / 2;
    const counts = new Array(SEM.length).fill(0);
    tokens = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let k = -1;
        if (Math.random() > GENERIC_SHARE) {
          let u = Math.random();
          k = 0;
          while (k < WEIGHTS.length - 1 && u > WEIGHTS[k]) { u -= WEIGHTS[k]; k++; }
          counts[k]++;
        }
        const gx = ox + c * spacing, gy = oy + r * spacing;
        tokens.push({
          gx, gy, x: gx, y: gy, vx: 0, vy: 0, k,
          ang: Math.random() * Math.PI * 2,
          u: Math.sqrt(Math.random()),
          spin: (0.1 + Math.random() * 0.28) * (Math.random() < 0.5 ? -1 : 1),
          e: (Math.random() * EXPERT.length) | 0,
          size: k < 0 ? 1.6 + Math.random() * 1.4 : 2.2 + Math.random() * 1.8,
          seed: Math.random() * 100,
          wave: 0, kicked: false,
        });
      }
    }
    const cx = W / 2, cy = H / 2, reach = Math.hypot(cx, cy);
    for (const t of tokens) t.wave = (Math.hypot(t.gx - cx, t.gy - cy) / reach) * 0.9;
    const s = Math.min(1, Math.max(0.55, W / 1400));
    protos = HOMES.map((h, k) => ({
      k, hx: h[0] * W, hy: h[1] * H, x: h[0] * W, y: h[1] * H, vx: 0, vy: 0,
      ph: Math.random() * Math.PI * 2,
      R: (Math.sqrt(counts[k]) * spacing * 0.32 + 14) * (0.8 + 0.2 * s),
    }));
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function restart() {
    clock = 0;
    breakAt = -1;
    broke = false;
    for (const t of tokens) t.kicked = false;
    setStatus(false);
  }

  function update(dt) {
    clock += dt;
    if (!broke && clock > GRID_HOLD) { broke = true; breakAt = clock; setStatus(true); }
    const since = broke ? clock - breakAt : 0;

    for (const p of protos) {
      let tx = p.hx + Math.sin(clock * 0.21 + p.ph) * W * 0.035;
      let ty = p.hy + Math.cos(clock * 0.17 + p.ph * 1.3) * H * 0.04;
      const md = Math.hypot(mouse.x - p.x, mouse.y - p.y);
      if (md < 260) { tx += (mouse.x - tx) * 0.28 * (1 - md / 260); ty += (mouse.y - ty) * 0.28 * (1 - md / 260); }
      let ax = (tx - p.x) * 2.4 - p.vx * 2.6;
      let ay = (ty - p.y) * 2.4 - p.vy * 2.6;
      for (const q of protos) {
        if (q === p) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1, min = (p.R + q.R) * 1.05;
        if (d < min) { ax += (dx / d) * (min - d) * 6; ay += (dy / d) * (min - d) * 6; }
      }
      p.vx += ax * dt; p.vy += ay * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    const stiff = broke ? Math.min(1, since / 1.8) * 5.5 : 7;
    for (const t of tokens) {
      let ax, ay;
      if (!broke || since < t.wave) {
        if (Math.random() < 0.022) t.e = (Math.random() * EXPERT.length) | 0;
        const jx = Math.sin(clock * 2 + t.seed) * 0.8, jy = Math.cos(clock * 1.7 + t.seed) * 0.8;
        ax = (t.gx + jx - t.x) * 7 - t.vx * 3.2;
        ay = (t.gy + jy - t.y) * 7 - t.vy * 3.2;
      } else {
        if (!t.kicked) {
          t.kicked = true;
          const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 260;
          t.vx += Math.cos(a) * sp; t.vy += Math.sin(a) * sp;
        }
        if (t.k >= 0) {
          const p = protos[t.k];
          t.ang += t.spin * dt * (1.35 - t.u);
          const r = t.u * p.R * (1 + 0.07 * Math.sin(clock * 1.3 + t.seed));
          ax = (p.x + Math.cos(t.ang) * r - t.x) * stiff - t.vx * 2.4;
          ay = (p.y + Math.sin(t.ang) * r - t.y) * stiff - t.vy * 2.4;
        } else {
          const th = Math.sin(t.x * 0.0021 + clock * 0.25) * 2.1 + Math.cos(t.y * 0.0027 - clock * 0.18) * 1.7 + t.seed * 0.02;
          ax = (Math.cos(th) * 26 - t.vx) * 1.3;
          ay = (Math.sin(th) * 26 - t.vy) * 1.3;
        }
      }
      const dx = t.x - mouse.x, dy = t.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 120 && d > 0.1) { const f = (1 - d / 120) * 1400; ax += (dx / d) * f; ay += (dy / d) * f; }
      t.vx += ax * dt; t.vy += ay * dt;
      t.x += t.vx * dt; t.y += t.vy * dt;
      if (broke && t.k < 0 && t.kicked) {
        if (t.x < -20) t.x += W + 40; else if (t.x > W + 20) t.x -= W + 40;
        if (t.y < -20) t.y += H + 40; else if (t.y > H + 20) t.y -= H + 40;
      }
    }
  }

  function bucketOf(t) {
    if (!t.kicked) return t.e;
    return t.k >= 0 ? 12 + t.k : 17;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    if (broke) {
      ctx.lineWidth = 0.6;
      for (const p of protos) {
        ctx.strokeStyle = LINK[p.k];
        ctx.beginPath();
        for (let i = p.k * 3; i < tokens.length; i += 7) {
          const t = tokens[i];
          if (t.k !== p.k || !t.kicked) continue;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(t.x, t.y);
        }
        ctx.stroke();
      }
    }

    for (let b = 0; b < PALETTE.length; b++) {
      ctx.fillStyle = HALO[b];
      for (const t of tokens) {
        if (bucketOf(t) !== b) continue;
        const s = t.size * 2.6;
        ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
      }
      ctx.fillStyle = PALETTE[b];
      for (const t of tokens) {
        if (bucketOf(t) !== b) continue;
        ctx.fillRect(t.x - t.size / 2, t.y - t.size / 2, t.size, t.size);
      }
    }

    if (broke) {
      const fade = Math.min(1, (clock - breakAt) / 1.2);
      for (const p of protos) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.R * 1.25);
        g.addColorStop(0, rgba(SEM[p.k], 0.2 * fade));
        g.addColorStop(1, rgba(SEM[p.k], 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.R * 1.25, 0, Math.PI * 2); ctx.fill();
        const pulse = 1 + 0.18 * Math.sin(clock * 2.2 + p.ph);
        ctx.strokeStyle = rgba(SEM[p.k], 0.55 * fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 11 * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba("#ffffff", 0.9 * fade);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running || reduceMotion) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function staticFrame() {
    // settle directly into the clustered state
    broke = true; breakAt = -10; clock = 0;
    for (const t of tokens) {
      t.kicked = true;
      if (t.k >= 0) {
        const p = protos[t.k];
        t.x = p.x + Math.cos(t.ang) * t.u * p.R;
        t.y = p.y + Math.sin(t.ang) * t.u * p.R;
      }
    }
    setStatus(true);
    draw();
  }

  layout();
  if (reduceMotion) staticFrame(); else play();

  let lastW = W, lastH = H, resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 140) return;
      lastW = w; lastH = h;
      layout();
      restart();
      if (reduceMotion) staticFrame();
    }, 160);
  });

  hero.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  hero.addEventListener("pointerleave", () => { mouse.x = mouse.y = -1e4; });

  if (replayBtn) replayBtn.addEventListener("click", () => { restart(); play(); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView && !document.hidden) play(); else stop();
    }, { threshold: 0.02 }).observe(hero);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else if (inView) play();
  });
})();
