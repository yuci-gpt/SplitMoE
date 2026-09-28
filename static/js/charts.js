/* Tables and charts rendered from window.SPLITMOE. */
(function () {
  "use strict";
  const DATA = window.SPLITMOE;
  if (!DATA) return;
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function onReveal(node, fn) {
    if (!("IntersectionObserver" in window) || reduceMotion) { fn(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: 0.25 });
    io.observe(node);
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function tween(ms, fn, done) {
    if (reduceMotion) { fn(1); if (done) done(); return; }
    const t0 = performance.now();
    const run = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      fn(ease(t));
      if (t < 1) requestAnimationFrame(run); else if (done) done();
    };
    requestAnimationFrame(run);
  }

  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);
  function showTip(html, x, y) { tip.innerHTML = html; tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.classList.add("on"); }
  function hideTip() { tip.classList.remove("on"); }

  /* ------------------------------------------------------------------ tables */
  function rank(values) {
    const sorted = Array.from(new Set(values)).sort((a, b) => b - a);
    return { best: sorted[0], second: sorted[1], min: Math.min(...values), max: sorted[0] };
  }

  function renderResultTable(table, opts) {
    const { groups, metrics, extraCols, benches, oursMatch } = opts;
    const rows = groups.flatMap((g) => g.rows);
    const stats = metrics.map((_, j) => rank(rows.map((r) => r.values[j])));
    let html = "<thead>";
    if (benches) {
      html += `<tr class="bench"><th rowspan="2">${extraCols[0]}</th>`;
      for (let c = 1; c < extraCols.length; c++) html += `<th rowspan="2">${extraCols[c]}</th>`;
      for (const b of benches) html += `<th colspan="${b.span}" class="${b.cls}">${b.name}</th>`;
      html += "</tr><tr>";
    } else {
      html += "<tr>";
      extraCols.forEach((c) => (html += `<th>${c}</th>`));
    }
    metrics.forEach((m, j) => (html += `<th data-col="${j}">${m} ↑</th>`));
    html += "</tr></thead><tbody>";
    for (const g of groups) {
      if (g.group) html += `<tr class="group"><td colspan="${extraCols.length + metrics.length}">${g.group}</td></tr>`;
      for (const r of g.rows) {
        const ours = oursMatch(r);
        html += `<tr class="${ours ? "ours" : ""}"><td>${r.name}</td>`;
        if (extraCols.length > 1) html += `<td class="params">${r.params}</td>`;
        r.values.forEach((v, j) => {
          const s = stats[j];
          const cls = v === s.best ? "best" : v === s.second ? "second" : "";
          const pct = s.max > s.min ? ((v - s.min) / (s.max - s.min)) * 100 : 100;
          html += `<td class="v ${cls}" data-col="${j}" style="--v:${pct.toFixed(1)}%">${v.toFixed(2)}</td>`;
        });
        html += "</tr>";
      }
    }
    html += "</tbody>";
    table.innerHTML = html;

    table.addEventListener("mouseover", (e) => {
      const cell = e.target.closest("[data-col]");
      table.querySelectorAll(".col-hover").forEach((c) => c.classList.remove("col-hover"));
      if (!cell) return;
      table.querySelectorAll(`[data-col="${cell.dataset.col}"]`).forEach((c) => c.classList.add("col-hover"));
    });
    table.addEventListener("mouseleave", () => table.querySelectorAll(".col-hover").forEach((c) => c.classList.remove("col-hover")));
  }

  function initTables() {
    const T = DATA.tables;
    const main = document.getElementById("mainTable");
    if (main) {
      renderResultTable(main, {
        groups: T.main,
        metrics: T.metrics8,
        extraCols: ["Model", "#Params"],
        benches: [{ name: "VBench-2 (%)", span: 5, cls: "b-vb" }, { name: "T2V-CompBench (%)", span: 3, cls: "b-cb" }],
        oursMatch: (r) => /Ours/.test(r.name),
      });
    }
    const sp = document.getElementById("speedTable");
    if (sp) {
      const s = T.speed;
      let html = `<thead><tr><th></th>${s.columns.map((c, i) => `<th class="${i === 0 ? "oc" : ""}">${c}</th>`).join("")}</tr></thead><tbody>`;
      s.rows.forEach((r) => {
        html += `<tr><td>${r[0]}</td>${r.slice(1).map((v, i) => `<td class="${i === 0 ? "oc" : ""}">${v}</td>`).join("")}</tr>`;
      });
      sp.innerHTML = html + "</tbody>";
    }
  }

  /* ------------------------------------------------------------- dumbbell */
  function initDumbbell() {
    const svg = document.getElementById("dumbbell");
    const select = document.getElementById("dumbbellSelect");
    const baseLabel = document.getElementById("dumbbellBaseName");
    if (!svg || !select) return;
    const T = DATA.tables;
    const candidates = T.main[0].rows.concat(T.main[1].rows);
    const ours = T.main[T.main.length - 1].rows[0];
    const metrics = T.metrics8;
    const labels = { "Wan2.2-MoE": "Wan2.2-MoE (standard MoE)", "Dense Wan2.2-FT": "Dense Wan2.2-FT (dense fine-tuning)" };
    candidates.forEach((c, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = labels[c.name] || c.name;
      if (c.name === "Wan2.2-MoE") o.selected = true;
      select.appendChild(o);
    });

    const W = 640, L = 132, R = 74, X0 = 25, X1 = 90;
    const ys = [];
    let y = 44;
    metrics.forEach((_, i) => { if (i === 5) y += 34; ys.push(y); y += 36; });
    const H = y + 16;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const sx = (v) => L + ((v - X0) / (X1 - X0)) * (W - L - R);

    const defs = el("defs", {}, svg);
    const gr = el("linearGradient", { id: "dbGrad", x1: "0", x2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#8b93a8", "stop-opacity": "0.5" }, gr);
    el("stop", { offset: "1", "stop-color": "#2ee6c5" }, gr);

    for (let v = 30; v <= 90; v += 10) {
      el("line", { x1: sx(v), x2: sx(v), y1: 26, y2: H - 22, stroke: "rgba(255,255,255,0.06)" }, svg);
      const t = el("text", { x: sx(v), y: H - 4, "text-anchor": "middle", fill: "#6d758b", "font-size": "11" }, svg);
      t.textContent = `${v}`;
    }
    const head = (text, yy, color) => {
      const t = el("text", { x: 0, y: yy, fill: color, "font-size": "10.5", "font-weight": "700", "letter-spacing": "1.6" }, svg);
      t.textContent = text;
    };
    head("VBENCH-2", 22, "#2ee6c5");
    head("T2V-COMPBENCH", ys[5] - 22, "#ffb547");

    const rowsG = metrics.map((m, i) => {
      const g = el("g", {}, svg);
      const yy = ys[i];
      const lab = el("text", { x: 0, y: yy + 4, fill: "#c9cfdf", "font-size": "13" }, g);
      lab.textContent = m;
      el("line", { x1: sx(X0), x2: sx(X1), y1: yy, y2: yy, stroke: "rgba(255,255,255,0.05)", "stroke-width": "8", "stroke-linecap": "round" }, g);
      const bar = el("line", { y1: yy, y2: yy, stroke: "url(#dbGrad)", "stroke-width": "4", "stroke-linecap": "round" }, g);
      const base = el("circle", { cy: yy, r: 6.5, fill: "#0b0d18", stroke: "#8b93a8", "stroke-width": "2.5" }, g);
      const oc = el("circle", { cy: yy, r: 7.5, fill: "#2ee6c5", stroke: "#04131a", "stroke-width": "2" }, g);
      const delta = el("text", { x: W - R + 16, y: yy + 4, "font-size": "12.5", "font-weight": "700", "font-family": "JetBrains Mono, monospace" }, g);
      const hit = el("rect", { x: 0, y: yy - 16, width: W, height: 32, fill: "transparent" }, g);
      return { bar, base, oc, delta, hit, i };
    });

    let cur = metrics.map((_, i) => ours.values[i]);
    function place(vals) {
      rowsG.forEach((r) => {
        const b = vals[r.i], o = ours.values[r.i];
        r.bar.setAttribute("x1", sx(Math.min(b, o)));
        r.bar.setAttribute("x2", sx(Math.max(b, o)));
        r.base.setAttribute("cx", sx(b));
        r.oc.setAttribute("cx", sx(o));
      });
    }
    function labelDeltas(target) {
      rowsG.forEach((r) => {
        const d = ours.values[r.i] - target.values[r.i];
        r.delta.textContent = `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`;
        r.delta.setAttribute("fill", d >= 0 ? "#2ee6c5" : "#ff8b8b");
        r.hit.onmousemove = (e) => showTip(`${metrics[r.i]}<br>${target.name}: ${target.values[r.i].toFixed(2)} · Ours: ${ours.values[r.i].toFixed(2)}`, e.clientX, e.clientY);
        r.hit.onmouseleave = hideTip;
      });
    }
    function go(target) {
      const from = cur.slice(), to = target.values;
      labelDeltas(target);
      baseLabel.textContent = target.name;
      tween(750, (t) => { cur = from.map((f, i) => f + (to[i] - f) * t); place(cur); });
    }
    place(cur);
    select.addEventListener("change", () => go(candidates[+select.value]));
    onReveal(svg, () => go(candidates[+select.value]));
  }

  /* ----------------------------------------------------- timestep routing */
  function initTimestep() {
    const svg = document.getElementById("timestepChart");
    if (!svg) return;
    const vals = DATA.timestep;
    const W = 720, H = 400, L = 78, R = 22, T = 26, B = 58;
    const Y0 = 0.3487, Y1 = 0.3522;
    const sx = (s) => L + ((s - 1) / (vals.length - 1)) * (W - L - R);
    const sy = (v) => T + ((Y1 - v) / (Y1 - Y0)) * (H - T - B);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const defs = el("defs", {}, svg);
    const lg = el("linearGradient", { id: "tsLine", x1: "0", x2: "1" }, defs);
    [["0", "#2ee6c5"], ["0.45", "#38bdf8"], ["0.75", "#a78bfa"], ["1", "#ffb547"]].forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, lg));
    const ag = el("linearGradient", { id: "tsArea", x1: "0", x2: "0", y1: "0", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#2ee6c5", "stop-opacity": "0.28" }, ag);
    el("stop", { offset: "1", "stop-color": "#2ee6c5", "stop-opacity": "0" }, ag);
    const clip = el("clipPath", { id: "tsClip" }, defs);
    const clipRect = el("rect", { x: 0, y: 0, width: 0, height: H }, clip);

    el("rect", { x: sx(10), y: T, width: sx(15) - sx(10), height: H - T - B, fill: "rgba(46,230,197,0.08)", stroke: "rgba(46,230,197,0.25)", "stroke-dasharray": "3 4" }, svg);
    const pk = el("text", { x: sx(15) + 10, y: H - B - 14, fill: "#2ee6c5", "font-size": "11.5", "font-weight": "600" }, svg);
    pk.textContent = "← peak · steps 10–15";

    for (let v = 0.349; v <= 0.35205; v += 0.0005) {
      el("line", { x1: L, x2: W - R, y1: sy(v), y2: sy(v), stroke: "rgba(255,255,255,0.06)" }, svg);
      const t = el("text", { x: L - 10, y: sy(v) + 4, "text-anchor": "end", fill: "#6d758b", "font-size": "11", "font-family": "JetBrains Mono, monospace" }, svg);
      t.textContent = v.toFixed(4);
    }
    [1, 10, 20, 30, 40, 50].forEach((s) => {
      const t = el("text", { x: sx(s), y: H - B + 20, "text-anchor": "middle", fill: "#6d758b", "font-size": "11", "font-family": "JetBrains Mono, monospace" }, svg);
      t.textContent = s;
    });
    const xl = el("text", { x: (L + W - R) / 2, y: H - 10, "text-anchor": "middle", fill: "#a3abbf", "font-size": "12.5" }, svg);
    xl.textContent = "Denoising step";
    const hn = el("text", { x: L, y: H - 10, fill: "#6d758b", "font-size": "11" }, svg);
    hn.textContent = "← high noise";
    const ln = el("text", { x: W - R, y: H - 10, "text-anchor": "end", fill: "#6d758b", "font-size": "11" }, svg);
    ln.textContent = "low noise →";
    const yl = el("text", { x: 16, y: (T + H - B) / 2, fill: "#a3abbf", "font-size": "12.5", "text-anchor": "middle", transform: `rotate(-90 16 ${(T + H - B) / 2})` }, svg);
    yl.textContent = "Semantic expert weight";

    const pts = vals.map((v, i) => [sx(i + 1), sy(v)]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = pts[i], p3 = pts[i + 1] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    const g = el("g", { "clip-path": "url(#tsClip)" }, svg);
    el("path", { d: `${d} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z`, fill: "url(#tsArea)" }, g);
    el("path", { d, fill: "none", stroke: "url(#tsLine)", "stroke-width": "3", "stroke-linecap": "round", style: "filter: drop-shadow(0 0 6px rgba(46,230,197,.45))" }, g);
    pts.forEach(([x, y]) => el("circle", { cx: x, cy: y, r: 2.6, fill: "#05060b", stroke: "rgba(255,255,255,0.75)", "stroke-width": "1.2" }, g));

    const guide = el("line", { y1: T, y2: H - B, stroke: "rgba(255,255,255,0.3)", "stroke-dasharray": "3 3", opacity: 0 }, svg);
    const dot = el("circle", { r: 6, fill: "#2ee6c5", stroke: "#fff", "stroke-width": "2", opacity: 0 }, svg);
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(vals.length - 1, Math.round(((x - L) / (W - L - R)) * (vals.length - 1))));
      guide.setAttribute("x1", pts[i][0]); guide.setAttribute("x2", pts[i][0]); guide.setAttribute("opacity", 1);
      dot.setAttribute("cx", pts[i][0]); dot.setAttribute("cy", pts[i][1]); dot.setAttribute("opacity", 1);
      const sr = dot.getBoundingClientRect();
      showTip(`step ${i + 1} · ${vals[i].toFixed(5)}`, sr.left + sr.width / 2, sr.top);
    });
    hit.addEventListener("mouseleave", () => { guide.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); hideTip(); });

    onReveal(svg, () => tween(1800, (t) => clipRect.setAttribute("width", W * t)));
  }

  function boot() {
    initTables();
    initDumbbell();
    initTimestep();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
