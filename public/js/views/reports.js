import { esc, avatar, statusPill, sportTag, callAI, md, SPORT_LABEL } from "../ui/common.js";
import { barChart } from "../ui/charts.js";
import { icon, logoMark } from "../ui/icons.js";
import { weeklyReport, aiContext } from "../core/agents/coach-agent.js";
import { fmtDate } from "../core/util.js";

// AI-teksten worden alleen in het geheugen van deze pagina bewaard.
const aiCache = new Map();

export default function reports(el, { params, state }) {
  const sel = params[0] || "group";
  const opts = [`<option value="group">Whole training group</option>`, ...state.results.map((r) => `<option value="${r.profile.id}">${esc(r.profile.name)}</option>`)];
  el.innerHTML = `
  <div class="page-head"><div><h1>Weekly Reports</h1><p>Based on the last full week (Mon–Sun). Facts are computed; the optional AI summary only rephrases them.</p></div>
    <div class="actions">
      <select class="input" id="pick" aria-label="Report for">${opts.join("")}</select>
      <button class="btn" id="print">${icon("print")} Export PDF</button>
    </div></div>
  <div id="rep"></div>`;
  el.querySelector("#pick").value = sel;
  el.querySelector("#pick").onchange = (e) => (location.hash = `#/reports/${e.target.value}`);
  el.querySelector("#print").onclick = () => window.print();
  const box = el.querySelector("#rep");
  if (sel === "group") return groupReport(box, state);
  const r = state.byId.get(sel);
  if (!r) return (box.innerHTML = `<div class="card empty">Athlete not found.</div>`);
  athleteReport(box, r, state);
}

function printHeader(title, sub) {
  return `<div class="print-only"><div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">${logoMark(26)}<div><b>Endurance Intelligence</b> · ${esc(title)}<div class="small muted">${esc(sub)} · DEMO – synthetic data</div></div></div></div>`;
}

function athleteReport(box, r, state) {
  const rep = weeklyReport(r, state.asOf);
  const p = r.profile;
  const period = `${fmtDate(rep.weekStart, { day: "numeric", month: "long" })} – ${fmtDate(rep.weekEnd, { day: "numeric", month: "long", year: "numeric" })}`;
  const li = (arr, empty) => (arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`);
  const weeks = r.training.weeks.filter((w) => !w.partial).slice(-6);

  box.innerHTML = `
  <div class="card report">
    ${printHeader(`Weekly report – ${p.name}`, period)}
    <div class="profile-head" style="margin-bottom:6px">${avatar(p.name, "lg")}<div><h2 style="font-size:19px">${esc(p.name)}</h2>
      <div style="display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap">${sportTag(p.sport)} ${statusPill(r.status)} <span class="muted small">${period}</span></div></div></div>

    <section><h3>What did the athlete do this week?</h3>
      <p class="num">${rep.done.sessions} sessions${rep.done.planned ? ` of ${rep.done.planned} planned` : ""} · ${rep.done.duration} · ${rep.done.distanceKm} km</p>
      ${rep.done.bySport.length ? `<table class="table" style="max-width:480px"><thead><tr><th>Sport</th><th class="r">Sessions</th><th class="r">Time</th><th class="r">Distance</th></tr></thead><tbody>${rep.done.bySport.map((s) => `<tr><td>${SPORT_LABEL[s.sport]}</td><td class="r num">${s.sessions}</td><td class="r num">${s.duration}</td><td class="r num">${s.km} km</td></tr>`).join("")}</tbody></table>` : ""}
    </section>

    <section><h3>How did training load develop?</h3>
      <p class="num">Load this week <b>${rep.load.week}</b> vs. ${rep.load.previous4wkAvg} average over the 4 weeks before (${rep.load.changePct > 0 ? "+" : ""}${rep.load.changePct ?? "–"}%). Current fitness ${rep.load.fitness}, form ${rep.load.form > 0 ? "+" : ""}${rep.load.form}.</p>
      <div style="max-width:560px">${barChart({ bars: weeks.map((w) => ({ label: fmtDate(w.weekStart), value: w.load, color: w.weekStart === rep.weekStart ? "var(--series-1)" : "#c7d3e0" })), height: 150 })}</div>
    </section>

    <section><h3>Which trends are visible?</h3>
      ${li(rep.trends, "Not enough comparable sessions to show an efficiency trend.")}
      ${rep.recovery.length ? `<h3 style="margin-top:10px">Recovery (7-day average vs. personal baseline)</h3>${li(rep.recovery, "")}` : `<p class="muted">No recovery data available – recovery is not assessed.</p>`}
    </section>

    <div class="grid g-2">
      <section><h3>Positive developments</h3>${li(rep.positives, "No specific positive changes detected.")}</section>
      <section><h3>Points of attention <span class="small muted" style="font-weight:400">(current signals)</span></h3>${li(rep.attention, "No points of attention.")}</section>
    </div>

    <section><h3>What could the coach discuss?</h3>${li(rep.talkingPoints.map((q) => `“${q}”`), "No specific topics – a regular check-in is enough.")}</section>

    <section class="${aiCache.has(p.id) ? "" : "no-print"}" id="aiSec"><h3>AI summary <span class="tag-int">AI · OPTIONAL</span></h3>
      <div id="ai">${aiCache.has(p.id) ? aiBlock(aiCache.get(p.id)) : `<p class="muted small no-print">Let the AI write a short narrative summary for the coach based on the facts above. Only pseudonymised numbers are sent (no name).</p><button class="btn no-print" id="gen">${icon("sparkle")} Generate AI summary</button>`}</div>
    </section>
    <p class="small faint">Generated by Endurance Intelligence. Facts are computed from the athlete's training data; interpretations are suggestions for the coach, not medical advice.</p>
  </div>`;

  box.querySelector("#gen")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Writing summary…";
    const idx = state.results.indexOf(r);
    const ctx = aiContext([r], state.asOf).athletes[0];
    try {
      const out = await callAI("/api/report", { athlete: { ...ctx, code: `A${idx + 1}` }, report: { ...rep, athleteId: undefined } });
      aiCache.set(p.id, out);
      box.querySelector("#ai").innerHTML = aiBlock(out);
      box.querySelector("#aiSec").classList.remove("no-print");
    } catch (err) {
      box.querySelector("#ai").innerHTML = `<div class="note">AI summary not available: ${esc(err.message)}</div>`;
    }
  });
}

function aiBlock(out) {
  return `<div class="ai-box"><div class="ai-label">${icon("sparkle").replace("<svg", '<svg width="14" height="14"')} AI-written · based on the facts above</div>${md(out.text)}
    <div class="small faint" style="margin-top:8px">Model: ${esc(out.model)} · sent: pseudonymised metrics only</div></div>`;
}

function groupReport(box, state) {
  const res = state.results;
  const lastFull = state.overview.weeks.filter((w) => !w.partial).at(-1);
  const rows = res.map((r) => ({ r, rep: weeklyReport(r, state.asOf) }));
  box.innerHTML = `
  <div class="card report" style="max-width:none">
    ${printHeader("Group weekly report", `Week of ${fmtDate(lastFull.weekStart, { day: "numeric", month: "long", year: "numeric" })}`)}
    <h2 style="font-size:19px">Training group · week of ${fmtDate(lastFull.weekStart, { day: "numeric", month: "long", year: "numeric" })}</h2>
    <p class="muted num">${res.length} athletes · ${lastFull.sessions} sessions · ${lastFull.hours} h · total load ${lastFull.load}</p>
    <section><div class="table-wrap"><table class="table">
      <thead><tr><th>Athlete</th><th>Status</th><th class="r">Sessions</th><th class="r">Time</th><th class="r">Load</th><th class="r">vs. 4 wk</th><th>Attention</th><th class="hide-sm">Positive</th></tr></thead>
      <tbody>${rows.sort((a, b) => b.r.score - a.r.score).map(({ r, rep }) => `<tr class="click" data-go="#/reports/${r.profile.id}">
        <td><b>${esc(r.profile.name)}</b><div class="small muted">${SPORT_LABEL[r.profile.sport]}</div></td><td>${statusPill(r.status)}</td>
        <td class="r num">${rep.done.sessions}${rep.done.planned ? `/${rep.done.planned}` : ""}</td><td class="r num">${rep.done.duration}</td>
        <td class="r num">${rep.load.week}</td><td class="r num">${rep.load.changePct > 0 ? "+" : ""}${rep.load.changePct ?? "–"}%</td>
        <td class="small">${rep.attention.map(esc).join("<br>") || "–"}</td><td class="small hide-sm">${rep.positives.map(esc).join("<br>") || "–"}</td></tr>`).join("")}</tbody></table></div></section>
    <p class="small faint">Click an athlete for the full individual report. Facts are computed; no AI is used in this overview.</p>
  </div>`;
  box.querySelectorAll("[data-go]").forEach((x) => x.addEventListener("click", () => (location.hash = x.dataset.go)));
}
