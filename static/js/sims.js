/* Interactive illustrations: routing simulator, push–pull prototype toy,
   and the "one token, eight experts" grid. */
(function () {
  "use strict";
  const DATA = window.SPLITMOE || {};
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function whenVisible(el, onChange) {
    if (!("IntersectionObserver" in window)) { onChange(true); return; }
    new IntersectionObserver((entries) => onChange(entries[0].isIntersecting), { threshold: 0.05 }).observe(el);
  }

  function bindSeg(root, group, onPick) {
    const seg = root.querySelector(`.seg[data-group="${group}"]`);
    if (!seg) return null;
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn || btn.disabled || btn.classList.contains("active")) return;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      onPick(btn.dataset.value);
    });
    return seg;
  }

  function hash(a, b, c) {
    let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263) ^ Math.imul(c + 13, 1103515245);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ======================================================================
     Routing simulator
     ====================================================================== */
  function initRoutingSim() {
    const root = document.getElementById("routingSim");
    const maps = DATA.patchMaps;
    if (!root || !maps) return;

    const canvas = document.getElementById("simCanvas");
    const ctx = canvas.getContext("2d");
    const hist = document.getElementById("simHist");
    const hctx = hist.getContext("2d");
    const badge = document.getElementById("simBadge");
    const note = document.getElementById("simNote");
    const domEl = document.getElementById("simDom"), domBar = document.getElementById("simDomBar");
    const jitEl = document.getElementById("simJit"), jitBar = document.getElementById("simJitBar");
    const histLabel = document.getElementById("simHistLabel");
    const opacityInput = document.getElementById("simOpacity");

    const GW = 48, GH = 24, N = GW * GH;
    const CW = canvas.width, CH = canvas.height, PW = CW / GW, PH = CH / GH;
    const N_STD = 16, N_SEM = 20, N_GEN = 16;
    const SUBJECT = { horse: "horse", chameleon: "chameleon", dog: "dog" };

    const DIVERGING = ["#2748c9", "#3d5fdc", "#5577e8", "#7292ef", "#93aef4", "#b6c9f7", "#d6e0f5", "#ecebef",
                       "#f6d9d4", "#f4bcb1", "#ef9c8c", "#e67b69", "#db5a4b", "#cb3c33", "#b7262a", "#9e1422"];
    const PASTEL = ["#e8a8b8", "#b9a6e3", "#9fd3c7", "#f3c98b", "#a7c7e7", "#d8b4a0", "#c5e0a5", "#f2a488",
                    "#b4d9ef", "#e5b7e0", "#a9d6b0", "#f7d6a1", "#c3b1d9", "#9cc5c0", "#f0b6a6", "#bcd4a6",
                    "#d4c2ee", "#a5cfe0", "#efc1cf", "#c9d7a8"];
    const STD_PAL = shuffleColors(DIVERGING, 5);
    const GEN_PAL = shuffleColors(DIVERGING, 11);
    const SEM_IDS = [2, 9, 13, 4, 16, 7];

    function shuffleColors(list, seed) {
      const rnd = mulberry32(seed), out = list.slice();
      for (let i = out.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    }

    const scenes = {};
    for (const [name, m] of Object.entries(maps)) {
      const img = new Image();
      img.src = m.poster;
      scenes[name] = {
        img, k: m.k,
        sem: Uint8Array.from(m.sem, (c) => parseInt(c, 36)),
        fine: Uint8Array.from(m.fine, (c) => parseInt(c, 36)),
      };
      img.addEventListener("load", () => { if (state.scene === name) render(); });
    }

    const state = { mode: "standard", branch: "sem", scene: "horse", opacity: 0.68 };
    let assign = new Int16Array(N), prevAssign = new Int16Array(N), oldAssign = new Int16Array(N);
    let palette = STD_PAL, oldPalette = STD_PAL;
    const epoch = new Uint16Array(N);
    let tick = 0, sweep = 1, sweepStart = 0, timer = 0, inView = false, switchRate = 0;

    function balancedAssign(scoreFn, experts) {
      const score = new Float32Array(N * experts);
      for (let i = 0; i < N; i++) for (let e = 0; e < experts; e++) score[i * experts + e] = scoreFn(i, e);
      const bias = new Float32Array(experts), load = new Float32Array(experts), target = N / experts;
      for (let it = 0; it < 14; it++) {
        load.fill(0);
        for (let i = 0; i < N; i++) {
          let best = 0, bv = -1e9;
          for (let e = 0; e < experts; e++) { const v = score[i * experts + e] + bias[e]; if (v > bv) { bv = v; best = e; } }
          assign[i] = best; load[best]++;
        }
        for (let e = 0; e < experts; e++) bias[e] += 0.045 * Math.sign(target - load[e]);
      }
    }

    // Strict capacity: every expert takes exactly N / experts patches; patches are
    // served in a shuffled order and fall back to their next-best expert when full.
    function capacityAssign(scoreFn, experts, seed) {
      const cap = Math.ceil(N / experts), load = new Int32Array(experts);
      const order = Array.from({ length: N }, (_, i) => i);
      const rnd = mulberry32(seed);
      for (let i = N - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
      const prefs = new Array(experts);
      for (const i of order) {
        for (let e = 0; e < experts; e++) prefs[e] = [scoreFn(i, e), e];
        prefs.sort((a, b) => b[0] - a[0]);
        for (const [, e] of prefs) if (load[e] < cap) { assign[i] = e; load[e]++; break; }
      }
    }

    function computeAssign(jitter) {
      prevAssign.set(assign);
      const sc = scenes[state.scene];
      if (state.mode === "standard") {
        if (jitter) for (let i = 0; i < N; i++) if (Math.random() < 0.16) epoch[i]++;
        const stripe = tick >> 3;
        capacityAssign((i, e) => {
          const row = (i / GW) | 0;
          let s = hash(i, e, epoch[i]);
          if (e === (row * 5 + stripe) % N_STD) s += 0.55;
          if (e === (sc.fine[i] * 7 + 3) % N_STD) s += 0.42;
          return s;
        }, N_STD, 17 + tick);
      } else if (state.branch === "sem") {
        for (let i = 0; i < N; i++) {
          let r = sc.sem[i];
          if (hash(i, 99, 1) < 0.22) {
            const x = i % GW, y = (i / GW) | 0;
            const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dy] of nb) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
              const r2 = sc.sem[yy * GW + xx];
              if (r2 !== r) { r = r2; break; }
            }
          }
          assign[i] = SEM_IDS[r % SEM_IDS.length];
        }
      } else {
        if (jitter) for (let i = 0; i < N; i++) if (Math.random() < 0.015) epoch[i]++;
        balancedAssign((i, e) => {
          const f = sc.fine[i];
          let s = hash(i, e + 40, epoch[i] >> 2) * 0.75;
          if (e === (f * 5 + 1) % N_GEN) s += 0.85;
          if (e === (f * 5 + 2) % N_GEN) s += 0.45;
          return s;
        }, N_GEN);
      }
      let changed = 0;
      for (let i = 0; i < N; i++) if (assign[i] !== prevAssign[i]) changed++;
      switchRate = jitter ? changed / N : 0;
      tick++;
    }

    function currentPalette() {
      if (state.mode === "standard") return STD_PAL;
      return state.branch === "sem" ? PASTEL : GEN_PAL;
    }
    function expertCount() {
      if (state.mode === "standard") return N_STD;
      return state.branch === "sem" ? N_SEM : N_GEN;
    }

    function render() {
      const sc = scenes[state.scene];
      ctx.clearRect(0, 0, CW, CH);
      if (sc.img.complete && sc.img.naturalWidth) ctx.drawImage(sc.img, 0, 0, CW, CH);
      ctx.globalAlpha = state.opacity;
      const edge = sweep * (GW + 6) - 3;
      for (let i = 0; i < N; i++) {
        const x = i % GW, y = (i / GW) | 0;
        const useOld = sweep < 1 && x > edge;
        ctx.fillStyle = useOld ? oldPalette[oldAssign[i]] : palette[assign[i]];
        ctx.fillRect(x * PW, y * PH, PW, PH);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < GW; x++) { ctx.moveTo(x * PW + 0.5, 0); ctx.lineTo(x * PW + 0.5, CH); }
      for (let y = 1; y < GH; y++) { ctx.moveTo(0, y * PH + 0.5); ctx.lineTo(CW, y * PH + 0.5); }
      ctx.stroke();
      if (sweep < 1) {
        const sx = Math.max(0, edge) * PW;
        const g = ctx.createLinearGradient(sx - 60, 0, sx + 4, 0);
        g.addColorStop(0, "rgba(46,230,197,0)");
        g.addColorStop(1, "rgba(46,230,197,0.85)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - 60, 0, 64, CH);
      }
      renderHist();
      renderMetrics();
    }

    function renderHist() {
      const E = expertCount(), load = new Array(E).fill(0);
      for (let i = 0; i < N; i++) load[assign[i]]++;
      const w = hist.width, h = hist.height, pad = 14, bw = (w - pad * 2) / E;
      const max = Math.max(...load, N / E * 1.6);
      hctx.clearRect(0, 0, w, h);
      hctx.strokeStyle = "rgba(255,255,255,0.12)";
      hctx.setLineDash([4, 5]);
      const yu = h - pad - ((N / E) / max) * (h - pad * 2);
      hctx.beginPath(); hctx.moveTo(pad, yu); hctx.lineTo(w - pad, yu); hctx.stroke();
      hctx.setLineDash([]);
      for (let e = 0; e < E; e++) {
        const bh = (load[e] / max) * (h - pad * 2);
        hctx.fillStyle = palette[e];
        hctx.fillRect(pad + e * bw + bw * 0.14, h - pad - bh, bw * 0.72, bh);
      }
      const labels = {
        standard: `Expert load · ${N_STD} experts, strictly uniform`,
        sem: `Semantic-expert load · ${N_SEM} experts, long-tailed`,
        gen: `Generic-expert load · ${N_GEN} experts, softly balanced`,
      };
      histLabel.textContent = labels[state.mode === "standard" ? "standard" : state.branch];
    }

    function renderMetrics() {
      const sc = scenes[state.scene];
      const K = sc.k, counts = new Map();
      const size = new Array(K).fill(0);
      for (let i = 0; i < N; i++) {
        const r = sc.sem[i];
        size[r]++;
        const key = r * 64 + assign[i];
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = new Array(K).fill(0);
      counts.forEach((v, key) => { const r = (key / 64) | 0; if (v > top[r]) top[r] = v; });
      let dom = 0;
      for (let r = 0; r < K; r++) dom += top[r];
      dom /= N;
      domEl.textContent = dom.toFixed(2);
      domBar.style.width = `${Math.round(dom * 100)}%`;
      jitEl.textContent = `${Math.round(switchRate * 100)}%`;
      jitBar.style.width = `${Math.min(100, Math.round(switchRate * 400))}%`;

      const subject = SUBJECT[state.scene];
      if (state.mode === "standard") {
        badge.textContent = "Standard MoE · top-1 of 16 experts";
        note.innerHTML = `Each patch is routed independently under load balancing. Loads look perfectly even — but the ${subject} is split across many experts, stripes appear in flat regions, and assignments flicker from frame to frame.`;
      } else if (state.branch === "sem") {
        badge.textContent = "SplitMoE · top-1 semantic expert";
        note.innerHTML = `Prototype guidance sends each coherent region to one semantic expert, frame after frame. Loads become long-tailed, and that is fine: the semantic branch balances by meaning, not by count.`;
      } else {
        badge.textContent = "SplitMoE · top-1 generic expert";
        note.innerHTML = `Generic experts keep flexible, balanced capacity for residual texture and detail — the part of the signal that discrete semantic grouping does not capture.`;
      }
    }

    function animateSweep() {
      if (reduceMotion) { sweep = 1; render(); return; }
      sweepStart = performance.now();
      const run = (now) => {
        sweep = Math.min(1, (now - sweepStart) / 520);
        render();
        if (sweep < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }

    function switchTo(change) {
      oldAssign.set(assign);
      oldPalette = palette;
      Object.assign(state, change);
      palette = currentPalette();
      computeAssign(false);
      switchRate = 0;
      branchSeg.classList.toggle("off", state.mode === "standard");
      animateSweep();
    }

    bindSeg(root, "mode", (v) => switchTo({ mode: v }));
    const branchSeg = bindSeg(root, "branch", (v) => switchTo({ branch: v }));
    bindSeg(root, "scene", (v) => switchTo({ scene: v }));
    branchSeg.classList.add("off");
    opacityInput.addEventListener("input", () => { state.opacity = opacityInput.value / 100; render(); });

    function loop() {
      clearInterval(timer);
      if (!inView || reduceMotion) return;
      timer = setInterval(() => {
        if (sweep < 1) return;
        if (state.mode === "split" && state.branch === "sem") { switchRate = 0; return; }
        computeAssign(true);
        render();
      }, 420);
    }

    computeAssign(false);
    render();
    whenVisible(root, (v) => { inView = v; loop(); });
  }

  /* ======================================================================
     Push–pull prototype toy
     ====================================================================== */
  function initPushPull() {
    const root = document.getElementById("pushPull");
    const canvas = document.getElementById("ppCanvas");
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    const conceptsEl = document.getElementById("ppConcepts");
    const covEl = document.getElementById("ppCov");
    const deadEl = document.getElementById("ppDead");
    const explainEl = document.getElementById("ppExplain");

    const M = 12, BATCH = 256, BANK = 128, T = 0.25, K_PULL = 0.07, K_COV = 0.1, MARGIN = 0.6, K_PUSH = 0.06;
    const BLOBS = [
      [0.05, -0.05, 0.33, 0.5], [0.62, 0.48, 0.07, 0.1], [-0.62, 0.5, 0.08, 0.09], [-0.7, -0.42, 0.07, 0.08],
      [0.58, -0.58, 0.06, 0.08], [0.0, 0.8, 0.06, 0.07], [0.85, -0.02, 0.05, 0.08],
    ];
    const EXPLAIN = {
      pull: "Pull alone drags prototypes toward the dominant mode: they pile up on redundant background features, the duplicates starve, and the rare concepts go unclaimed.",
      push: "Push alone scatters prototypes to the rim — well separated but off the data manifold, leaving under-used or dead experts.",
      both: "Pull anchors every prototype to real features while push keeps them apart, so they spread over the manifold and claim the rare concepts too.",
    };
    const STYLE = {
      pull: { color: "#ff9f43", shape: "tri" },
      push: { color: "#3ecf6e", shape: "pent" },
      both: { color: "#ff5d6c", shape: "star" },
    };

    let F = [], concepts = [], added = [], P = [], mode = "both";
    let S = 400, dpr = 1, raf = 0, running = false, inView = false, frame = 0;
    const rnd = mulberry32(2026);

    function gauss() {
      let u = 0, v = 0;
      while (u === 0) u = rnd();
      while (v === 0) v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function makeFeatures() {
      F = []; concepts = []; added = [];
      const total = 1400;
      BLOBS.forEach(([cx, cy, sd, w], idx) => {
        const n = Math.round(total * w);
        for (let i = 0; i < n; i++) {
          const x = cx + gauss() * sd, y = cy + gauss() * sd;
          if (x * x + y * y < 0.94) F.push({ x, y });
        }
        if (idx > 0) concepts.push({ x: cx, y: cy });
      });
    }

    function initPrototypes() {
      const r = mulberry32((Math.random() * 1e9) | 0);
      P = [];
      for (let m = 0; m < M; m++) {
        const a = r() * Math.PI * 2, d = Math.abs(gauss()) * 0.06;
        P.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: 0, vy: 0, trail: [] });
      }
    }

    function step() {
      const fx = new Float64Array(M), fy = new Float64Array(M);
      if (mode !== "push") {
        const w = new Float64Array(M), mx = new Float64Array(M), my = new Float64Array(M), d2 = new Float64Array(M);
        for (let b = 0; b < BATCH; b++) {
          const f = F[(Math.random() * F.length) | 0];
          let mn = Infinity;
          for (let m = 0; m < M; m++) {
            const dx = f.x - P[m].x, dy = f.y - P[m].y;
            d2[m] = dx * dx + dy * dy;
            if (d2[m] < mn) mn = d2[m];
          }
          let z = 0;
          for (let m = 0; m < M; m++) { d2[m] = Math.exp(-(d2[m] - mn) / T); z += d2[m]; }
          for (let m = 0; m < M; m++) { const a = d2[m] / z; w[m] += a; mx[m] += a * f.x; my[m] += a * f.y; }
        }
        const bank = new Array(BANK);
        for (let k = 0; k < BANK; k++) bank[k] = F[(Math.random() * F.length) | 0];
        for (let m = 0; m < M; m++) {
          const p = P[m];
          if (w[m] > 1e-6) {
            const g = Math.min(1, w[m] / (BATCH / M));
            fx[m] += K_PULL * (mx[m] / w[m] - p.x) * g;
            fy[m] += K_PULL * (my[m] / w[m] - p.y) * g;
          }
          let best = null, bd = Infinity;
          for (const f of bank) {
            const dx = f.x - p.x, dy = f.y - p.y, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = f; }
          }
          fx[m] += K_COV * (best.x - p.x);
          fy[m] += K_COV * (best.y - p.y);
        }
      }
      if (mode !== "pull") {
        for (let m = 0; m < M; m++) {
          for (let j = 0; j < M; j++) {
            if (j === m) continue;
            const dx = P[m].x - P[j].x, dy = P[m].y - P[j].y, d = Math.hypot(dx, dy) || 1e-6;
            if (d < MARGIN) { fx[m] += K_PUSH * (dx / d) * (MARGIN - d); fy[m] += K_PUSH * (dy / d) * (MARGIN - d); }
          }
        }
      }
      for (let m = 0; m < M; m++) {
        const p = P[m];
        p.vx = 0.8 * p.vx + fx[m];
        p.vy = 0.8 * p.vy + fy[m];
        p.x += p.vx; p.y += p.vy;
        const r = Math.hypot(p.x, p.y);
        if (r > 1) { p.x /= r; p.y /= r; }
      }
    }

    function metrics() {
      let covered = 0;
      const owner = new Array(M).fill(0);
      for (const f of F) {
        let bd = Infinity, bm = 0;
        for (let m = 0; m < M; m++) {
          const d = Math.hypot(f.x - P[m].x, f.y - P[m].y);
          if (d < bd) { bd = d; bm = m; }
        }
        if (bd < 0.15) covered++;
        owner[bm]++;
      }
      const all = concepts.concat(added);
      let got = 0;
      for (const c of all) if (P.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 0.2)) got++;
      const dead = owner.filter((n) => n < 0.015 * F.length).length;
      conceptsEl.textContent = `${got}/${all.length}`;
      covEl.textContent = `${Math.round((covered / F.length) * 100)}%`;
      deadEl.textContent = `${dead}`;
      conceptsEl.style.color = got === all.length ? "var(--sem)" : got <= all.length / 3 ? "#ff8b8b" : "";
      deadEl.style.color = dead === 0 ? "var(--sem)" : "#ff8b8b";
    }

    const toPx = (v) => S / 2 + v * S * 0.46;

    function shape(x, y, r, kind) {
      ctx.beginPath();
      if (kind === "tri") {
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      } else if (kind === "pent") {
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      } else {
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      }
      ctx.closePath();
    }

    function draw() {
      ctx.clearRect(0, 0, S, S);
      const c = S / 2, R = S * 0.46;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(c, c, (R * k) / 3, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(125,185,255,0.42)";
      const dot = Math.max(1.2, S / 360);
      for (const f of F) ctx.fillRect(toPx(f.x) - dot / 2, toPx(f.y) - dot / 2, dot, dot);

      for (const a of added) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(toPx(a.x), toPx(a.y), S * 0.46 * 0.14, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      if (mode !== "pull") {
        for (let m = 0; m < M; m++) for (let j = m + 1; j < M; j++) {
          const d = Math.hypot(P[m].x - P[j].x, P[m].y - P[j].y);
          if (d < MARGIN) {
            ctx.strokeStyle = `rgba(255,120,120,${0.35 * (1 - d / MARGIN)})`;
            ctx.beginPath(); ctx.moveTo(toPx(P[m].x), toPx(P[m].y)); ctx.lineTo(toPx(P[j].x), toPx(P[j].y)); ctx.stroke();
          }
        }
      }

      const st = STYLE[mode];
      const size = Math.max(7, S / 42);
      for (const p of P) {
        p.trail.push([p.x, p.y]);
        if (p.trail.length > 26) p.trail.shift();
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        p.trail.forEach(([x, y], i) => (i ? ctx.lineTo(toPx(x), toPx(y)) : ctx.moveTo(toPx(x), toPx(y))));
        ctx.stroke();
        ctx.globalAlpha = 1;
        const x = toPx(p.x), y = toPx(p.y);
        const g = ctx.createRadialGradient(x, y, 0, x, y, size * 2.6);
        g.addColorStop(0, st.color + "66");
        g.addColorStop(1, st.color + "00");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, size * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = st.color;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.2;
        shape(x, y, size, st.shape);
        ctx.fill(); ctx.stroke();
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      S = canvas.clientWidth || 400;
      canvas.width = Math.round(S * dpr);
      canvas.height = Math.round(S * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function tickFrame() {
      if (!running) return;
      step(); step();
      draw();
      if (++frame % 12 === 0) metrics();
      raf = requestAnimationFrame(tickFrame);
    }
    function play() { if (running) return; running = true; raf = requestAnimationFrame(tickFrame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    bindSeg(root, "pp", (v) => { mode = v; explainEl.textContent = EXPLAIN[v]; P.forEach((p) => (p.trail = [])); });
    document.getElementById("ppReset").addEventListener("click", () => { makeFeatures(); initPrototypes(); metrics(); draw(); });
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) - S / 2) / (S * 0.46), y = ((e.clientY - r.top) - S / 2) / (S * 0.46);
      if (x * x + y * y > 0.86) return;
      if (added.length >= 4) {
        const old = added.shift();
        F = F.filter((f) => f.src !== old);
      }
      const blob = { x, y };
      for (let i = 0; i < 90; i++) {
        const fx = x + gauss() * 0.045, fy = y + gauss() * 0.045;
        if (fx * fx + fy * fy < 0.94) F.push({ x: fx, y: fy, src: blob });
      }
      added.push(blob);
      metrics();
      if (reduceMotion) { for (let i = 0; i < 300; i++) step(); draw(); metrics(); }
    });

    makeFeatures();
    initPrototypes();
    explainEl.textContent = EXPLAIN[mode];
    resize();
    if (reduceMotion) { for (let i = 0; i < 900; i++) step(); draw(); }
    metrics();
    window.addEventListener("resize", resize);
    whenVisible(root, (v) => { inView = v; if (v && !reduceMotion) play(); else stop(); });
  }

  /* ======================================================================
     Expert grid: 1 shared + 20 semantic + 80 generic, Top-2 + Top-6 lit
     ====================================================================== */
  function initExpertGrid() {
    const panel = document.getElementById("expertPanel");
    if (!panel) return;
    const make = (id, n) => {
      const host = document.getElementById(id);
      const cells = [];
      for (let i = 0; i < n; i++) { const c = document.createElement("i"); c.className = "cell"; host.appendChild(c); cells.push(c); }
      return cells;
    };
    make("cellsShared", 1);
    const sem = make("cellsSem", 20), gen = make("cellsGen", 80);
    const pick = (cells, k) => {
      cells.forEach((c) => c.classList.remove("on"));
      const idx = new Set();
      while (idx.size < k) idx.add((Math.random() * cells.length) | 0);
      idx.forEach((i) => cells[i].classList.add("on"));
    };
    let timer = 0;
    const run = () => { pick(sem, 2); pick(gen, 6); };
    run();
    whenVisible(panel, (v) => {
      clearInterval(timer);
      if (v && !reduceMotion) timer = setInterval(run, 950);
    });
  }

  function boot() {
    initRoutingSim();
    initPushPull();
    initExpertGrid();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
