import { esc, signalCard, bindSignals, statusPill, avatar } from "../ui/common.js";

let sev = "all";

export default function insights(el, { state }) {
  const all = state.results.flatMap((r) => r.signals.map((s) => ({ s, r })));
  const concerns = all.filter((x) => !x.s.positive);
  const positives = all.filter((x) => x.s.positive);
  const attention = state.results.filter((r) => r.status !== "ok").sort((a, b) => b.score - a.score);

  el.innerHTML = `
  <div class="page-head"><div><h1>Daily Insights</h1>
    <p>Athletes whose data deviates from their own recent pattern. Every signal shows the data it is based on.</p></div></div>
  <div class="note" style="margin-bottom:16px">
    <span class="tag-obj">MEASURED</span> = calculated directly from the data. &nbsp;
    <span class="tag-int">INTERPRETATION / SUGGESTION</span> = rule-based reading of that data, written cautiously. No medical diagnoses. You decide what to do.
  </div>
  <div class="grid g-main">
    <div>
      <div class="toolbar">
        ${["all", "high", "medium"].map((k) => `<button class="btn ${sev === k ? "primary" : ""}" data-sev="${k}">${{ all: `All (${concerns.length})`, high: `High (${concerns.filter((x) => x.s.severity === "high").length})`, medium: `Medium (${concerns.filter((x) => x.s.severity === "medium").length})` }[k]}</button>`).join("")}
        <button class="btn ghost" id="expand">Expand all</button>
      </div>
      <div id="list"></div>
      <div id="pos">${positives.length ? `<h2 style="margin:24px 0 10px">Positive developments</h2>${positives.map(({ s, r }) => signalCard(s, r.profile.name)).join("")}` : ""}</div>
    </div>
    <div class="card" style="align-self:start">
      <h2 style="margin-bottom:10px">Who to check in with</h2>
      ${attention.length ? attention.map((r) => `<a href="#/athletes/${r.profile.id}" style="display:flex;gap:10px;align-items:center;padding:8px 0;text-decoration:none;border-bottom:1px solid var(--border)">${avatar(r.profile.name)}<div style="flex:1;min-width:0"><b>${esc(r.profile.name)}</b><div class="small muted">${r.concerns.length} signal${r.concerns.length === 1 ? "" : "s"}</div></div>${statusPill(r.status)}</a>`).join("") : `<p class="muted">Nobody stands out today.</p>`}
      <p class="small faint" style="margin:12px 0 0">Priority = number and strength of signals. Several recovery values moving together weigh more than one.</p>
    </div>
  </div>`;

  const draw = () => {
    const list = concerns.filter((x) => sev === "all" || x.s.severity === sev);
    el.querySelector("#list").innerHTML = list.length ? list.map(({ s, r }, i) => signalCard(s, r.profile.name, { open: i === 0 })).join("") : `<div class="card empty">No signals in this category today.</div>`;
    bindSignals(el.querySelector("#list"));
  };
  el.querySelectorAll("[data-sev]").forEach((b) => b.addEventListener("click", () => {
    sev = b.dataset.sev;
    el.querySelectorAll("[data-sev]").forEach((x) => x.classList.toggle("primary", x === b));
    draw();
  }));
  el.querySelector("#expand").addEventListener("click", () => el.querySelectorAll(".signal").forEach((s) => s.classList.add("open")));
  draw();
  bindSignals(el.querySelector("#pos"));
}
