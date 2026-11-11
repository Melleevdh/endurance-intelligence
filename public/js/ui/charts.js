// Eenvoudige, afhankelijkheidsvrije SVG-grafieken met hover-tooltips.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function niceStep(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/**
 * Lijngrafiek. series: [{ name, values: [num|null], color, dashed?, area? }]
 * labels: x-labels (zelfde lengte). opts: { height, yMin, yMax, unit, bands: [{from,to,color}] }
 */
export function lineChart({ labels, series, height = 220, yMin, yMax, unit = "", band }) {
  const W = 640, H = height, pl = 40, pr = 10, pt = 10, pb = 26;
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (band) all.push(band.from, band.to);
  let dataLo = Math.min(...all), dataHi = Math.max(...all);
  // Vanaf 0 beginnen tenzij de waarden ver van 0 liggen (dan inzoomen).
  if (dataLo >= 0 && dataLo < dataHi * 0.45) dataLo = 0;
  else if (dataLo > 0) dataLo -= (dataHi - dataLo) * 0.25;
  if (yMin != null) dataLo = yMin;
  if (yMax != null) dataHi = yMax;
  const step = niceStep((dataHi - dataLo) / 4 || 1);
  const lo = yMin ?? Math.floor(dataLo / step) * step;
  const hi = yMax ?? Math.ceil((dataHi + (yMax == null ? (dataHi - dataLo) * 0.04 : 0)) / step) * step;
  const ticks = Math.round((hi - lo) / step) || 1;
  const n = labels.length;
  const x = (i) => pl + (n === 1 ? 0 : (i * (W - pl - pr)) / (n - 1));
  const y = (v) => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb);
  let g = "";
  for (let t = 0; t <= ticks; t++) {
    const v = lo + ((hi - lo) * t) / ticks;
    g += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(2)}</text>`;
  }
  if (band) g += `<rect x="${pl}" width="${W - pl - pr}" y="${y(band.to)}" height="${Math.max(0, y(band.from) - y(band.to))}" fill="${band.color || "rgba(15,163,163,0.08)"}"/>`;
  const every = Math.ceil(n / 7);
  labels.forEach((l, i) => {
    if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`;
  });
  series.forEach((s) => {
    let d = "", pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    if (s.area) {
      const idx = s.values.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
      if (idx.length) g += `<path d="${d}L${x(idx.at(-1))},${y(lo)}L${x(idx[0])},${y(lo)}Z" fill="${s.color}" opacity="0.1"/>`;
    }
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="4 4"' : ""}/>`;
    if (s.dots) s.values.forEach((v, i) => v != null && (g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${s.color}"/>`));
  });
  // Onzichtbare hover-kolommen
  const colW = (W - pl - pr) / Math.max(1, n - 1);
  labels.forEach((l, i) => {
    const tip = `${l} · ` + series.map((s) => `${s.name}: ${s.values[i] == null ? "–" : s.values[i] + unit}`).join(" · ");
    g += `<rect x="${x(i) - colW / 2}" y="${pt}" width="${colW}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(tip)}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(", "))}">${g}</svg>` + legend(series);
}

/** Staafgrafiek. bars: [{ label, value, color?, note? }] */
export function barChart({ bars, height = 200, unit = "", color = "var(--series-1)", avgLine }) {
  const W = 640, H = height, pl = 40, pr = 10, pt = 10, pb = 26;
  const max = niceMax(Math.max(...bars.map((b) => b.value || 0), avgLine || 0) * 1.08);
  const y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const slot = (W - pl - pr) / bars.length;
  const bw = Math.min(34, slot * 0.62);
  let g = "";
  for (let t = 0; t <= 4; t++) {
    const v = (max * t) / 4;
    g += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  const step = Math.ceil(bars.length / 8);
  bars.forEach((b, i) => {
    const cx = pl + slot * i + slot / 2;
    const h = Math.max(0, y(0) - y(b.value || 0));
    g += `<rect x="${cx - bw / 2}" y="${y(b.value || 0)}" width="${bw}" height="${h}" rx="3" fill="${b.color || color}" ${b.faded ? 'opacity="0.45"' : ""}/>`;
    g += `<rect x="${cx - slot / 2}" y="${pt}" width="${slot}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(`${b.label}: ${b.value ?? "–"}${unit}${b.note ? " · " + b.note : ""}`)}"/>`;
    if (i % step === 0 || i === bars.length - 1) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  if (avgLine) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(avgLine)}" y2="${y(avgLine)}" stroke="var(--navy-700)" stroke-dasharray="4 4" stroke-width="1.2"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

export function sparkline(values, { color = "var(--series-1)", width = 120, height = 32 } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v);
  const x = (i) => (i * width) / (values.length - 1);
  const y = (val) => height - 2 - ((val - lo) / (hi - lo || 1)) * (height - 4);
  let d = "", pen = false;
  values.forEach((val, i) => {
    if (val == null) return (pen = false);
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`;
    pen = true;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

/** Horizontale verdeling (bijv. intensiteit laag/matig/hoog). */
export function splitBar(parts) {
  return `<div class="bar-split">${parts.map((p) => `<span style="width:${p.pct}%;background:${p.color}" title="${esc(p.label)}: ${p.pct}%"></span>`).join("")}</div>`;
}

function legend(series) {
  if (series.length < 2) return "";
  return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
}

/** Eén globale tooltip voor alle grafieken. */
export function installTooltips(root = document) {
  const tip = document.createElement("div");
  tip.className = "chart-tip hidden";
  document.body.appendChild(tip);
  root.addEventListener("mousemove", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) return tip.classList.add("hidden");
    tip.textContent = t.getAttribute("data-tip");
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
    tip.classList.remove("hidden");
  });
  root.addEventListener("mouseleave", () => tip.classList.add("hidden"));
}
