/* Page chrome, video galleries and small interactions. */
(function () {
  "use strict";
  const DATA = window.SPLITMOE || { videos: { moe: [], sota: { prompts: [], models: [] }, gallery: [] } };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasIO = "IntersectionObserver" in window;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const shorten = (p, n = 118) => (p.length > n ? `${p.slice(0, p.lastIndexOf(" ", n))} …` : p);

  const SOTA_TITLES = {
    "horse-meadow": "Horse: graze → gallop",
    watermelon: "Cutting a watermelon",
    "olive-oil": "Pouring olive oil",
    "ice-timelapse": "Melting-ice timelapse",
    "woman-dancing": "A woman dancing",
  };

  function nearView(node, fn, margin = "700px") {
    if (!hasIO) { fn(); return; }
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { io.disconnect(); fn(); }
    }, { rootMargin: `${margin} 0px` });
    io.observe(node);
  }

  /* ------------------------------------------------------------ lazy video */
  const Lazy = (() => {
    const play = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    const setPoster = (v) => { if (v.dataset.poster && !v.getAttribute("poster")) v.setAttribute("poster", v.dataset.poster); };
    const load = (v) => { setPoster(v); if (v.dataset.src && !v.getAttribute("src")) v.setAttribute("src", v.dataset.src); };
    if (!hasIO) return { observe: load, play, load };
    const posterIO = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { setPoster(e.target); posterIO.unobserve(e.target); }
    }), { rootMargin: "600px 0px" });
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { load(v); if (!reduceMotion) play(v); }
      else if (!v.paused) v.pause();
    }), { rootMargin: "60px 0px", threshold: 0.01 });
    return { observe(v) { posterIO.observe(v); io.observe(v); }, play, load };
  })();

  /* ------------------------------------------------------------- lightbox */
  const Lightbox = (() => {
    const box = $("#lightbox"), media = $("#lbMedia"), cap = $("#lbCaption"), closeBtn = $("#lbClose");
    let lastFocus = null;
    function open(node, caption) {
      lastFocus = document.activeElement;
      media.replaceChildren(node);
      cap.innerHTML = caption || "";
      box.classList.add("open");
      box.setAttribute("aria-hidden", "false");
      document.documentElement.style.overflow = "hidden";
      closeBtn.focus({ preventScroll: true });
    }
    function close() {
      if (!box.classList.contains("open")) return;
      box.classList.remove("open");
      box.setAttribute("aria-hidden", "true");
      document.documentElement.style.overflow = "";
      const v = media.querySelector("video");
      if (v) v.pause();
      setTimeout(() => { if (!box.classList.contains("open")) media.replaceChildren(); }, 320);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    box.addEventListener("click", (e) => {
      if (e.target === box || e.target === closeBtn || e.target.classList.contains("lb-inner")) close();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return {
      image(src, alt, caption) {
        const img = new Image();
        img.src = src;
        img.alt = alt || "";
        open(img, caption);
      },
      video(src, poster, caption) {
        const v = document.createElement("video");
        Object.assign(v, { src, poster, controls: true, loop: true, muted: true, playsInline: true, autoplay: true });
        open(v, caption);
        Lazy.play(v);
      },
    };
  })();

  /* ---------------------------------------------------------- page chrome */
  function initChrome() {
    const nav = $("#nav"), bar = $(".scroll-progress i"), toTop = $("#toTop"), toggle = $("#navToggle");
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
        nav.classList.toggle("scrolled", y > 30);
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        toTop.classList.toggle("on", y > 900);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$(".nav-links a").forEach((a) => a.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }));

    if (!hasIO) return;
    const links = new Map($$(".nav-links a").map((a) => [a.getAttribute("href").slice(1), a]));
    const spy = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.remove("active"));
      const a = links.get(e.target.id);
      if (a) a.classList.add("active");
    }), { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  function initReveal() {
    const els = $$(".reveal");
    if (!hasIO || reduceMotion) { els.forEach((e) => e.classList.add("in")); return; }
    els.forEach((e) => {
      const sibs = Array.from(e.parentElement.children).filter((c) => c.classList.contains("reveal"));
      const i = sibs.indexOf(e);
      if (sibs.length > 2 && i > 0) e.style.transitionDelay = `${Math.min(i, 4) * 70}ms`;
    });
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    els.forEach((e) => io.observe(e));
  }

  function initPointerFx() {
    if (window.matchMedia("(hover: none)").matches) return;
    $$(".spot").forEach((node) => node.addEventListener("pointermove", (e) => {
      const r = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${e.clientX - r.left}px`);
      node.style.setProperty("--my", `${e.clientY - r.top}px`);
    }));
    const glow = $(".cursor-glow");
    if (!glow || reduceMotion) return;
    let x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y, raf = 0;
    const loop = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    window.addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      glow.classList.add("on");
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
  }

  function initCounters() {
    const nums = $$("[data-count]");
    if (!nums.length || reduceMotion || !hasIO) return;
    nums.forEach((n) => (n.textContent = "0"));
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const node = e.target, target = +node.dataset.count, t0 = performance.now(), dur = 1500;
      const run = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        node.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }), { threshold: 0.6 });
    nums.forEach((n) => io.observe(n));
  }

  /* ------------------------------------------------------------- showreel */
  function initReel() {
    const t1 = $("#reelTrack1"), t2 = $("#reelTrack2");
    if (!t1 || !t2) return;
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    const g = byId(DATA.videos.gallery), sp = byId(DATA.videos.sota.prompts), moe = byId(DATA.videos.moe);
    const G = (id) => g[id] && { src: `static/videos/gallery/${id}.mp4`, poster: `static/posters/gallery/${id}.webp`, title: g[id].title, prompt: g[id].prompt };
    const S = (id) => sp[id] && { src: `static/videos/sota/${id}_ours.mp4`, poster: `static/posters/sota/${id}_ours.webp`, title: SOTA_TITLES[id], prompt: sp[id].prompt };
    const E = (id, title) => moe[id] && { src: `static/videos/moe/${id}_ours.mp4`, poster: `static/posters/moe/${id}_ours.webp`, title, prompt: moe[id].prompt };
    const row1 = [G("wizard"), G("train-platform"), S("horse-meadow"), G("red-fox"), G("cyclist"), G("porch-retriever"), S("woman-dancing"), G("stubble-man"), G("skateboarder")];
    const row2 = [G("desert"), S("ice-timelapse"), G("chameleon"), G("park-chess"), E("cat-feather", "Cat meets a feather toy"), G("window-ledge"), S("watermelon"), G("flaxen-woman"), E("dog-bird", "Dog barks at a bird"), G("sandcastle")];

    const fill = (track, items) => {
      items = items.filter(Boolean);
      const frag = document.createDocumentFragment();
      [0, 1].forEach((copy) => items.forEach((it) => {
        const fig = document.createElement("figure");
        fig.className = "reel-tile";
        if (copy) fig.setAttribute("aria-hidden", "true");
        fig.innerHTML = `<video muted loop playsinline preload="none" data-src="${it.src}" data-poster="${it.poster}"></video>` +
          `<figcaption><b>${esc(it.title)}</b>${esc(shorten(it.prompt))}</figcaption>`;
        fig.addEventListener("click", () => Lightbox.video(it.src, it.poster, `<b>${esc(it.title)}</b>${esc(it.prompt)}`));
        frag.appendChild(fig);
      }));
      track.appendChild(frag);
      $$("video", track).forEach((v) => Lazy.observe(v));
    };
    fill(t1, row1);
    fill(t2, row2);
  }

  /* ------------------------------------------- SplitMoE vs. standard MoE */
  function initCompare() {
    const stage = $("#compareStage");
    const items = DATA.videos.moe;
    if (!stage || !items.length) return;
    const vb = $(".cmp-base", stage), vo = $(".cmp-ours", stage);
    const rail = $("#compareRail"), promptEl = $("#comparePrompt");
    const playBtn = $("#cmpPlay"), modeBtn = $("#cmpMode");
    let idx = -1, paused = reduceMotion, inView = false, introduced = false;

    const thumbs = items.map((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "thumb";
      b.setAttribute("role", "listitem");
      b.title = it.prompt;
      b.dataset.bg = `static/posters/moe/${it.id}_ours.webp`;
      b.innerHTML = `<span>${esc(it.prompt)}</span>`;
      b.addEventListener("click", () => {
        select(i);
        rail.scrollTo({ left: b.offsetLeft - rail.clientWidth / 2 + b.clientWidth / 2, behavior: "smooth" });
      });
      rail.appendChild(b);
      return b;
    });

    const playBoth = () => { Lazy.play(vb); Lazy.play(vo); };
    function select(i) {
      if (i === idx) return;
      idx = i;
      const it = items[i];
      vb.setAttribute("poster", `static/posters/moe/${it.id}_wan-moe.webp`);
      vo.setAttribute("poster", `static/posters/moe/${it.id}_ours.webp`);
      vb.src = `static/videos/moe/${it.id}_wan-moe.mp4`;
      vo.src = `static/videos/moe/${it.id}_ours.mp4`;
      promptEl.textContent = it.prompt;
      thumbs.forEach((t, j) => t.classList.toggle("active", j === i));
      if (inView && !paused) playBoth();
    }

    setInterval(() => {
      if (vb.paused || vo.paused || !isFinite(vb.duration) || !isFinite(vo.duration)) return;
      if (Math.abs(vb.duration - vo.duration) > 0.15) return;
      if (Math.abs(vo.currentTime - vb.currentTime) > 0.1) vo.currentTime = vb.currentTime;
    }, 600);

    let dragging = false, pos = 50;
    const setPos = (p) => {
      pos = Math.min(98, Math.max(2, p));
      stage.style.setProperty("--pos", `${pos}%`);
      stage.setAttribute("aria-valuenow", String(Math.round(pos)));
    };
    const fromClient = (x) => { const r = stage.getBoundingClientRect(); setPos(((x - r.left) / r.width) * 100); };
    stage.setAttribute("tabindex", "0");
    stage.setAttribute("role", "slider");
    stage.setAttribute("aria-label", "Comparison divider: standard MoE on the left, SplitMoE on the right");
    stage.setAttribute("aria-valuemin", "0");
    stage.setAttribute("aria-valuemax", "100");
    stage.addEventListener("pointerdown", (e) => {
      if (stage.classList.contains("sbs")) return;
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      fromClient(e.clientX);
    });
    stage.addEventListener("pointermove", (e) => { if (dragging) fromClient(e.clientX); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => stage.addEventListener(ev, () => (dragging = false)));
    stage.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { setPos(pos - 5); e.preventDefault(); }
      if (e.key === "ArrowRight") { setPos(pos + 5); e.preventDefault(); }
    });

    const setPlayLabel = () => (playBtn.textContent = paused ? "▶ Play" : "❚❚ Pause");
    setPlayLabel();
    playBtn.addEventListener("click", () => {
      paused = !paused;
      if (paused) { vb.pause(); vo.pause(); } else playBoth();
      setPlayLabel();
    });
    modeBtn.addEventListener("click", () => {
      const sbs = stage.classList.toggle("sbs");
      modeBtn.textContent = sbs ? "⇆ Slider" : "◧ Side by side";
    });

    nearView(stage, () => {
      thumbs.forEach((t) => (t.style.backgroundImage = `url("${t.dataset.bg}")`));
      select(0);
    });
    if (hasIO) {
      new IntersectionObserver((es) => {
        inView = es[0].isIntersecting;
        if (inView && !paused) playBoth(); else { vb.pause(); vo.pause(); }
        if (inView && !introduced && !reduceMotion) {
          introduced = true;
          const t0 = performance.now();
          const run = (now) => {
            const t = Math.min(1, (now - t0) / 1300);
            setPos(82 - 32 * (1 - Math.pow(1 - t, 3)));
            if (t < 1 && !dragging) requestAnimationFrame(run);
          };
          requestAnimationFrame(run);
        }
      }, { threshold: 0.25 }).observe(stage);
    } else { select(0); }
  }

  /* ---------------------------------------------------- vs. SOTA models */
  function initSota() {
    const grid = $("#sotaGrid"), tabs = $("#sotaTabs"), promptEl = $("#sotaPrompt"), restart = $("#sotaRestart");
    const { prompts, models } = DATA.videos.sota;
    if (!grid || !prompts.length) return;
    const vids = models.map((m) => {
      const tile = document.createElement("div");
      tile.className = `sota-tile${m.key === "ours" ? " ours" : ""}`;
      tile.innerHTML = `<video muted loop playsinline preload="none"></video><span class="tag">${esc(m.name)}<small>${esc(m.params)}</small></span>`;
      grid.appendChild(tile);
      return { m, v: $("video", tile) };
    });
    let cur = -1, inView = false;
    const tabBtns = prompts.map((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sota-tab";
      b.setAttribute("role", "tab");
      b.innerHTML = `<img alt="" loading="lazy" src="static/posters/sota/${p.id}_ours.webp"><span>${esc(SOTA_TITLES[p.id] || p.prompt)}</span>`;
      b.addEventListener("click", () => select(i));
      tabs.appendChild(b);
      return b;
    });
    function select(i) {
      if (i === cur) return;
      cur = i;
      const p = prompts[i];
      tabBtns.forEach((b, j) => { b.classList.toggle("active", j === i); b.setAttribute("aria-selected", String(j === i)); });
      promptEl.textContent = p.prompt;
      vids.forEach(({ m, v }) => {
        v.setAttribute("poster", `static/posters/sota/${p.id}_${m.key}.webp`);
        v.src = `static/videos/sota/${p.id}_${m.key}.mp4`;
        if (inView && !reduceMotion) Lazy.play(v);
      });
    }
    restart.addEventListener("click", () => vids.forEach(({ v }) => { v.currentTime = 0; Lazy.play(v); }));
    nearView(grid, () => select(0));
    if (hasIO) {
      new IntersectionObserver((es) => {
        inView = es[0].isIntersecting;
        vids.forEach(({ v }) => { if (inView && !reduceMotion && v.getAttribute("src")) Lazy.play(v); else v.pause(); });
      }, { threshold: 0.15 }).observe(grid);
    }
  }

  /* -------------------------------------------------------------- gallery */
  function initGallery() {
    const host = $("#gallery");
    if (!host) return;
    DATA.videos.gallery.forEach((it) => {
      const src = `static/videos/gallery/${it.id}.mp4`, poster = `static/posters/gallery/${it.id}.webp`;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "g-tile";
      b.setAttribute("aria-label", `Enlarge: ${it.title}`);
      b.innerHTML = `<video muted loop playsinline preload="none" data-src="${src}" data-poster="${poster}"></video>` +
        `<div class="g-cap"><b>${esc(it.title)}</b><span>${esc(it.prompt)}</span></div>`;
      b.addEventListener("click", () => Lightbox.video(src, poster, `<b>${esc(it.title)}</b>${esc(it.prompt)}`));
      host.appendChild(b);
      Lazy.observe($("video", b));
    });
  }

  /* ---------------------------------------------------------- misc blocks */
  function initZoom() {
    document.addEventListener("click", (e) => {
      const img = e.target.closest("img[data-zoom]");
      if (!img) return;
      const holder = img.closest("figure, .pathology");
      const cap = holder && holder.querySelector("figcaption, .pathology-caption");
      Lightbox.image(img.currentSrc || img.src, img.alt, cap ? cap.innerHTML : "");
    });
  }

  function initPathology() {
    const card = $(".pathology");
    if (!card) return;
    const imgs = $$(".pathology-stage img", card), cap = $("#pathologyCaption"), cards = $$(".p-card", card);
    const TEXT = {
      baseline: {
        cap: "Baseline MoE scatters correlated patches across experts under strict capacity constraints, causing fragmented routing and poor spatiotemporal consistency.",
        cards: [["Temporal jitter", "Similar regions switch experts from frame to frame."],
                ["Spatial striping", "Homogeneous areas are artificially split to satisfy load constraints."],
                ["Semantic fragmentation", "Adjacent tokens of one object scatter across unrelated experts."]],
      },
      ours: {
        cap: "SplitMoE routes coherent entities to semantic experts and residual textures to generic experts, achieving stable utilization without enforcing uniformity.",
        cards: [["Stable over time", "The horse and the barn keep their semantic experts across frames."],
                ["No striping", "Homogeneous regions stay with one expert instead of being cut into bands."],
                ["Coherent entities", "Each object maps to a consistent semantic expert; generic experts absorb texture."]],
      },
    };
    const seg = $('.seg[data-group="routing"]', card);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.classList.contains("active")) return;
      $$("button", seg).forEach((x) => x.classList.toggle("active", x === b));
      const key = b.dataset.value;
      imgs.forEach((im) => im.classList.toggle("is-active", im.dataset.key === key));
      card.classList.toggle("fixed", key === "ours");
      cap.textContent = TEXT[key].cap;
      cards.forEach((c, i) => {
        $("h4", c).textContent = TEXT[key].cards[i][0];
        $("p", c).textContent = TEXT[key].cards[i][1];
      });
    });
  }

  function initTabs() {
    $$(".tabs").forEach((tabs) => {
      const btns = $$(".tab-list button", tabs), panels = $$(".tab-panel", tabs);
      btns.forEach((b) => b.addEventListener("click", () => {
        btns.forEach((x) => x.classList.toggle("active", x === b));
        panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === b.dataset.tab));
      }));
    });
  }

  function initBib() {
    const btn = $("#copyBib"), code = $("#bibCode");
    if (!btn || !code) return;
    btn.addEventListener("click", async () => {
      const text = code.textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      btn.textContent = "Copied ✓";
      btn.classList.add("done");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1800);
    });
  }

  function initSoon() {
    $$("[data-soon]").forEach((a) => {
      a.title = "Coming soon";
      a.addEventListener("click", (e) => e.preventDefault());
    });
  }

  window.__renderMath = function () {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
  };

  function boot() {
    initChrome();
    initReveal();
    initPointerFx();
    initCounters();
    initReel();
    initCompare();
    initSota();
    initGallery();
    initZoom();
    initPathology();
    initTabs();
    initBib();
    initSoon();
    window.__renderMath();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
