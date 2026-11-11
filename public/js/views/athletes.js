import { esc, avatar, statusPill, sportTag, STATUS_LABEL } from "../ui/common.js";
import { sparkline } from "../ui/charts.js";

const filters = { q: "", sport: "", status: "", sort: "priority" };

export default function athletes(el, { state }) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Athletes</h1><p>${state.results.length} athletes · search, filter and open a profile.</p></div>
    <div class="actions"><a class="btn" href="#/settings">Import CSV</a></div></div>
  <div class="card">
    <div class="toolbar">
      <input class="input" type="search" id="q" placeholder="Search by name or goal…" value="${esc(filters.q)}" aria-label="Search athletes">
      <select class="input" id="sport" aria-label="Sport"><option value="">All sports</option><option value="triathlon">Triathlon</option><option value="cycling">Cycling</option><option value="running">Running</option></select>
      <select class="input" id="status" aria-label="Status"><option value="">All statuses</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select class="input" id="sort" aria-label="Sort"><option value="priority">Sort: priority</option><option value="name">Sort: name</option><option value="load">Sort: 7-day load</option><option value="ratio">Sort: load ratio</option></select>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Athlete</th><th>Sport</th><th class="hide-sm">Goal</th><th>Status</th><th class="r">7-day h</th><th class="r hide-sm">7-day load</th><th class="r hide-sm">Ratio</th><th class="hide-sm">Weekly load</th><th class="hide-sm">Recovery data</th></tr></thead>
      <tbody id="rows"></tbody></table></div>
  </div>`;

  ["sport", "status", "sort"].forEach((k) => (el.querySelector("#" + k).value = filters[k]));
  const draw = () => {
    const q = filters.q.toLowerCase();
    let list = state.results.filter((r) =>
      (!q || r.profile.name.toLowerCase().includes(q) || (r.profile.goal || "").toLowerCase().includes(q)) &&
      (!filters.sport || r.profile.sport === filters.sport) && (!filters.status || r.status === filters.status));
    const s = filters.sort;
    list.sort((a, b) => s === "name" ? a.profile.name.localeCompare(b.profile.name)
      : s === "load" ? b.training.summary.load7 - a.training.summary.load7
      : s === "ratio" ? (b.training.summary.ratio ?? 0) - (a.training.summary.ratio ?? 0)
      : b.score - a.score);
    el.querySelector("#rows").innerHTML = list.length ? list.map((r) => `
      <tr class="click" data-id="${r.profile.id}">
        <td><div style="display:flex;gap:10px;align-items:center">${avatar(r.profile.name)}<div><b>${esc(r.profile.name)}</b>${r.profile.source === "csv" ? ` <span class="pill info">CSV</span>` : ""}<div class="small muted">${esc(r.profile.ageGroup || "")}</div></div></div></td>
        <td>${sportTag(r.profile.sport)}</td>
        <td class="hide-sm">${esc(r.profile.goal || "–")}</td>
        <td>${statusPill(r.status)}</td>
        <td class="r num">${r.training.summary.hours7}</td>
        <td class="r num hide-sm">${r.training.summary.load7}</td>
        <td class="r num hide-sm">${r.training.summary.ratio?.toFixed(2) ?? "–"}</td>
        <td class="hide-sm">${sparkline(r.training.weeks.map((w) => (w.partial ? null : w.load)))}</td>
        <td class="hide-sm">${r.recovery.available ? `<span class="pill positive">${r.quality.recovery.coverage.pct}% of days</span>` : `<span class="pill neutral">None</span>`}</td>
      </tr>`).join("") : `<tr><td colspan="9" class="empty">No athletes match these filters.</td></tr>`;
    el.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => (location.hash = `#/athletes/${tr.dataset.id}`)));
  };
  el.querySelector("#q").addEventListener("input", (e) => ((filters.q = e.target.value), draw()));
  ["sport", "status", "sort"].forEach((k) => el.querySelector("#" + k).addEventListener("change", (e) => ((filters[k] = e.target.value), draw())));
  draw();
}
