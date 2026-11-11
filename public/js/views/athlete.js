import { esc, avatar, statusPill, sportTag, signalCard, bindSignals, SPORT_LABEL } from "../ui/common.js";
import { lineChart, barChart, splitBar } from "../ui/charts.js";
import { icon } from "../ui/icons.js";
import { fmtDate, fmtDuration, fmtPace } from "../core/util.js";

const TABS = ["Overview", "Training", "Recovery", "Performance", "Activities", "Data quality"];

export default function athlete(el, { params, state }) {
  const r = state.byId.get(params[0]);
  if (!r) {
    el.innerHTML = `<div class="card empty">Athlete not found. <a href="#/athletes">Back to athletes</a></div>`;
    return;
  }
  const p = r.profile;
  const tab = TABS.includes(params[1]) ? params[1] : "Overview";
  const t = r.training.summary;

  el.innerHTML = `
  <div class="page-head"><a class="btn ghost" href="#/athletes">${icon("back")} Athletes</a>
    <div class="actions"><a class="btn" href="#/reports/${p.id}">${icon("reports")} Weekly report</a></div></div>
  <div class="card" style="margin-bottom:16px">
    <div class="profile-head">
      ${avatar(p.name, "lg")}
      <div><h1>${esc(p.name)}</h1><div style="display:flex;gap:10px;align-items:center;margin-top:4px;flex-wrap:wrap">${sportTag(p.sport)} ${statusPill(r.status)} ${p.source === "csv" ? `<span class="pill info">Imported via CSV</span>` : ""}</div></div>
      <div class="facts">
        ${fact("Goal", esc(p.goal || "Not set"))}
        ${fact("Event", r.performance.goal.eventDate ? `${fmtDate(r.performance.goal.eventDate, { day: "numeric", month: "short", year: "numeric" })} · ${r.performance.goal.weeksToGo} wk` : "–")}
        ${fact("Age group", esc(p.ageGroup || "–"))}
        ${fact("Planned / week", p.plannedPerWeek ? `${p.plannedPerWeek} sessions` : "–")}
      </div>
    </div>
  </div>
  <div class="tabs" role="tablist">${TABS.map((x) => `<button role="tab" class="${x === tab ? "active" : ""}" data-tab="${x}">${x}</button>`).join("")}</div>
  <div id="tab"></div>`;

  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => (location.hash = `#/athletes/${p.id}/${encodeURIComponent(b.dataset.tab)}`)));
  const box = el.querySelector("#tab");
  ({ Overview: tabOverview, Training: tabTraining, Recovery: tabRecovery, Performance: tabPerformance, Activities: tabActivities, "Data quality": tabQuality })[tab](box, r, t);
  bindSignals(box);
}

const fact = (k, v) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`;
const kpi = (label, value, sub = "") => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${sub}</div></div>`;

function tabOverview(box, r, t) {
  const model = r.training.loadModel.slice(-56);
  box.innerHTML = `
  <div class="grid g-4" style="margin-bottom:16px">
    ${kpi("Training hours, 7 days", `${t.hours7}<small>h</small>`, `avg. ${t.hours28avg} h/week before`)}
    ${kpi("Training load, 7 days", t.load7, `avg. ${t.load28avg}/week before · ratio ${t.ratio?.toFixed(2) ?? "–"}`)}
    ${kpi("Fitness / Form", `${t.fitness}<small> / ${t.form > 0 ? "+" : ""}${t.form}</small>`, "42-day fitness · fitness − fatigue")}
    ${kpi("Sessions, 7 days", t.sessions7, `avg. ${t.sessions28avg}/week before`)}
  </div>
  <div class="grid g-main">
    <div class="card"><div class="card-head"><div><h2>Fitness, fatigue & form</h2><div class="card-sub">Last 8 weeks · computed from session load</div></div></div>
      ${lineChart({ labels: model.map((d) => fmtDate(d.date)), series: [
        { name: "Fitness", values: model.map((d) => d.fitness), color: "var(--series-2)", area: true },
        { name: "Fatigue", values: model.map((d) => d.fatigue), color: "var(--series-1)" },
        { name: "Form", values: model.map((d) => d.form), color: "var(--series-3)", dashed: true },
      ], height: 240 })}</div>
    <div class="card"><div class="card-head"><div><h2>Signals</h2><div class="card-sub">${r.signals.length ? "Click to see the data behind each signal" : ""}</div></div></div>
      ${r.signals.length ? r.signals.map((s) => signalCard(s, r.profile.name, { showAthlete: false })).join("") : `<div class="empty">No notable changes detected. Everything is within this athlete's normal range.</div>`}
    </div>
  </div>`;
}

function tabTraining(box, r, t) {
  const w = r.training.weeks;
  const i7 = t.intensity7, i28 = t.intensity28;
  const zones = r.training.zones;
  const intens = (i) => i ? splitBar([
    { label: "Low", pct: i.low, color: "var(--series-1)" }, { label: "Moderate", pct: i.moderate, color: "var(--series-2)" }, { label: "High", pct: i.high, color: "var(--high)" },
  ]) + `<div class="small muted num" style="margin-top:6px">Low ${i.low}% · Moderate ${i.moderate}% · High ${i.high}%</div>` : `<div class="note">No heart-rate data available.</div>`;
  box.innerHTML = `
  <div class="grid g-2" style="margin-bottom:16px">
    <div class="card"><div class="card-head"><div><h2>Weekly hours</h2><div class="card-sub">Last 12 weeks · faded = week in progress</div></div></div>
      ${barChart({ bars: w.map((x) => ({ label: fmtDate(x.weekStart), value: x.hours, faded: x.partial, note: `${x.sessions} sessions` })), unit: " h" })}</div>
    <div class="card"><div class="card-head"><div><h2>Weekly training load</h2><div class="card-sub">Sum of session load</div></div></div>
      ${barChart({ bars: w.map((x) => ({ label: fmtDate(x.weekStart), value: x.load, faded: x.partial })), color: "var(--series-2)", avgLine: r.training.summary.avgLoadPerWeek })}</div>
  </div>
  <div class="grid g-2">
    <div class="card"><div class="card-head"><div><h2>Intensity distribution</h2><div class="card-sub">Time by average heart rate (% of HR reserve)</div></div></div>
      <h3 style="margin-bottom:6px">Last 7 days</h3>${intens(i7)}
      <h3 style="margin:16px 0 6px">The 4 weeks before</h3>${intens(i28)}</div>
    <div class="card"><div class="card-head"><div><h2>Training zones</h2><div class="card-sub">Calculated from profile values (HR max/rest, FTP, threshold pace)</div></div></div>
      ${Object.keys(zones).length ? `<div class="grid g-${Math.min(2, Object.keys(zones).length)}">${Object.entries(zones).map(([k, z]) => `<div><h3 style="margin-bottom:6px">${{ heartRate: "Heart rate", power: "Power", pace: "Run pace" }[k]}</h3><table class="table zone-table">${z.map(([n, v]) => `<tr><td>${n}</td><td class="r num">${v}</td></tr>`).join("")}</table></div>`).join("")}</div>`
        : `<div class="note">No zone inputs (HR max/rest, FTP or threshold pace) in this profile.</div>`}
    </div>
  </div>`;
}

function tabRecovery(box, r) {
  const rec = r.recovery;
  if (!rec.available) {
    box.innerHTML = `<div class="card empty">${icon("data")}<h2 style="margin:8px 0">No recovery data available</h2><p>This athlete has no HRV, resting heart rate, sleep or fatigue measurements.<br>The analysis therefore makes no statements about recovery.</p></div>`;
    return;
  }
  const s = rec.series;
  const labels = s.map((d) => fmtDate(d.date));
  const m = rec.metrics;
  const band = (k) => m[k] ? { from: m[k].baseline - m[k].baselineSd, to: m[k].baseline + m[k].baselineSd } : null;
  box.innerHTML = `
  <div class="grid g-4" style="margin-bottom:16px">
    ${Object.values(m).slice(0, 4).map((x) => kpi(x.label, `${x.recent}<small>${x.unit ? " " + x.unit : ""}</small>`, `baseline ${x.baseline} · ${x.changePct > 0 ? "+" : ""}${x.changePct}%`)).join("")}
  </div>
  <div class="grid g-2">
    <div class="card"><div class="card-head"><div><h2>HRV</h2><div class="card-sub">Shaded band = personal normal range (baseline ± 1 SD)</div></div></div>
      ${lineChart({ labels, series: [{ name: "HRV (ms)", values: s.map((d) => d.hrv_ms), color: "var(--series-1)", dots: true }], band: band("hrv_ms"), unit: " ms" })}</div>
    <div class="card"><div class="card-head"><div><h2>Resting heart rate</h2><div class="card-sub">Shaded band = personal normal range</div></div></div>
      ${lineChart({ labels, series: [{ name: "Resting HR (bpm)", values: s.map((d) => d.resting_hr), color: "var(--series-2)", dots: true }], band: band("resting_hr"), unit: " bpm" })}</div>
    <div class="card"><div class="card-head"><h2>Sleep score</h2></div>
      ${lineChart({ labels, series: [{ name: "Sleep score", values: s.map((d) => d.sleep_score), color: "var(--series-3)" }], band: band("sleep_score") })}</div>
    <div class="card"><div class="card-head"><h2>Perceived fatigue (1–10)</h2></div>
      ${lineChart({ labels, series: [{ name: "Fatigue", values: s.map((d) => d.fatigue), color: "var(--medium)", dots: true }], yMin: 0, yMax: 10 })}</div>
  </div>
  ${rec.missing.length ? `<div class="note" style="margin-top:16px"><b>Not analysed:</b> ${rec.missing.map(esc).join(" ")}</div>` : ""}
  <p class="small faint" style="margin-top:12px">Recovery values are compared only with this athlete's own history. A deviation is not a diagnosis.</p>`;
}

function tabPerformance(box, r) {
  const perf = r.performance;
  const c = perf.consistency;
  box.innerHTML = `
  <div class="grid g-2">
    <div class="card"><div class="card-head"><div><h2>Training consistency</h2><div class="card-sub">Completed ÷ planned sessions per week${r.profile.plannedPerWeek ? ` (plan: ${r.profile.plannedPerWeek}/week)` : ""}</div></div></div>
      ${c.length ? barChart({ bars: c.map((x) => ({ label: fmtDate(x.weekStart), value: x.pct, faded: x.partial, note: `${x.done}/${x.planned} sessions`, color: x.pct < 70 ? "var(--medium)" : "var(--series-1)" })), unit: "%" }) : `<div class="note">No planned sessions per week in this profile, so consistency cannot be calculated.</div>`}</div>
    <div class="card"><div class="card-head"><div><h2>Efficiency trend</h2><div class="card-sub">Output per heartbeat in easy/long sessions – higher means more output for the same effort</div></div></div>
      ${perf.efficiency.length ? perf.efficiency.map((e) => `
        <h3 style="margin-bottom:4px">${e.sport === "bike" ? "Power per heartbeat (W/bpm)" : "Speed per heartbeat (m/min per bpm)"} <span class="pill ${e.changePct >= 3 ? "positive" : e.changePct <= -3 ? "medium" : "neutral"}">${e.changePct > 0 ? "+" : ""}${e.changePct}%</span></h3>
        ${lineChart({ labels: e.weekly.map((w) => fmtDate(w.weekStart)), series: [{ name: SPORT_LABEL[e.sport], values: e.weekly.map((w) => w.value), color: "var(--series-2)", dots: true }], height: 170 })}`).join("")
        : `<div class="note">Not enough easy sessions with heart rate + power/pace to calculate a trend.</div>`}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Goal</h2><p style="margin:6px 0 0">${esc(perf.goal.text || "No goal set.")}${perf.goal.weeksToGo != null ? ` · <b>${perf.goal.weeksToGo} weeks</b> to go (${fmtDate(perf.goal.eventDate, { day: "numeric", month: "long", year: "numeric" })}).` : ""}</p></div>`;
}

function tabActivities(box, r) {
  const acts = [...r.prepared.activities].reverse().slice(0, 40);
  box.innerHTML = `<div class="card"><div class="card-head"><div><h2>Recent activities</h2><div class="card-sub">Last 40 sessions after de-duplication</div></div></div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Sport</th><th class="hide-sm">Type</th><th class="r">Duration</th><th class="r">Distance</th><th class="r hide-sm">Avg HR</th><th class="r">Power / pace</th><th class="r hide-sm">RPE</th><th class="r">Load</th></tr></thead>
  <tbody>${acts.map((a) => `<tr>
    <td class="num">${fmtDate(a.date, { weekday: "short", day: "numeric", month: "short" })}</td><td>${SPORT_LABEL[a.sport]}</td><td class="hide-sm muted">${esc(a.session_type || "–")}</td>
    <td class="r num">${fmtDuration(a.duration_min)}</td><td class="r num">${a.distance_km != null ? a.distance_km + " km" : "–"}</td>
    <td class="r num hide-sm">${a.avg_hr ?? "–"}</td>
    <td class="r num">${a.avg_power ? a.avg_power + " W" : a.avg_pace_sec_km ? fmtPace(a.avg_pace_sec_km) : a.avg_pace_sec_100m ? fmtPace(a.avg_pace_sec_100m).replace("/km", "/100m") : "–"}</td>
    <td class="r num hide-sm">${a.rpe ?? "–"}</td><td class="r num">${a.tss ?? "–"}${a.tss_estimated ? "*" : ""}</td></tr>`).join("")}</tbody></table></div>
  <p class="small faint">* Load estimated from duration × RPE (session-RPE) because no load value was provided.</p></div>`;
}

function tabQuality(box, r) {
  const q = r.quality;
  const f = q.fields;
  const row = (k, v) => `<tr><td>${k}</td><td class="r num">${v}</td></tr>`;
  box.innerHTML = `<div class="grid g-2">
    <div class="card"><h2 style="margin-bottom:10px">Data Agent report</h2><table class="table">
      ${row("Analysis window", `${fmtDate(q.window.from)} – ${fmtDate(q.window.to)} (${q.window.days} days)`)}
      ${row("Activities", q.activityCount)}
      ${row("Duplicates removed", q.duplicatesRemoved.length)}
      ${row("Invalid rows skipped", q.invalidRows.length)}
      ${row("Activities with heart rate", `${f.heart_rate.n}/${f.heart_rate.of} (${f.heart_rate.pct ?? "–"}%)`)}
      ${row("Rides with power", f.power.of ? `${f.power.n}/${f.power.of} (${f.power.pct}%)` : "no rides")}
      ${row("Activities with RPE", `${f.rpe.n}/${f.rpe.of}`)}
      ${row("Load values estimated (sRPE)", f.tss_estimated)}
      ${row("Days with recovery data", q.recovery.available ? `${q.recovery.daysWithData}/${q.window.days} (${q.recovery.coverage.pct}%)` : "none")}
    </table></div>
    <div class="card"><h2 style="margin-bottom:10px">Details</h2>
      ${q.duplicatesRemoved.length ? `<h3>Duplicates removed</h3><ul>${q.duplicatesRemoved.map((d) => `<li class="num">${fmtDate(d.date)} · ${SPORT_LABEL[d.sport]} · ${fmtDuration(d.duration_min)} – kept one copy</li>`).join("")}</ul>` : `<p class="muted">No duplicate activities found.</p>`}
      ${q.invalidRows.length ? `<h3>Skipped rows</h3><ul>${q.invalidRows.slice(0, 20).map((i) => `<li>Row ${i.row}: ${esc(i.detail)}</li>`).join("")}</ul>` : `<p class="muted">No invalid rows.</p>`}
      ${r.recovery.missing.length ? `<h3>Gaps</h3><ul>${r.recovery.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
    </div></div>`;
}
