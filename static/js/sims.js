/* The "one token, eight experts" grid. */
(function () {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function whenVisible(el, onChange) {
    if (!("IntersectionObserver" in window)) { onChange(true); return; }
    new IntersectionObserver((entries) => onChange(entries[0].isIntersecting), { threshold: 0.05 }).observe(el);
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initExpertGrid);
  else initExpertGrid();
})();
