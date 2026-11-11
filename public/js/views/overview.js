import { esc, avatar, statusPill, sportTag, signalCard, bindSignals } from "../ui/common.js";
import { barChart, lineChart, sparkline } from "../ui/charts.js";
import { fmtDate, round } from "../core/util.js";

export default function overview(el, { state }) {
  const o = state.overview;
  const res = state.results;
  const attention = res.filter((r) => r.status === "attention").sort((a, b) => b.score - a.score);
  const watch = res.filter((r) => r.status === "watch");
  // Belangrijkste signaal per sporter, gesorteerd op prioriteit.
  const topSignals = [...res].filter((r) => r.concerns.length).sort((a, b) => b.score - a.score)
    .map((r) => ({ s: r.signals.find((s) => !s.positive), r, more: r.concerns.length - 1 })).slice(0, 5);
  const positives = res.flatMap((r) => r.signals.filter((s) => s.positive).map((s) => ({ s, r })));
  const full = o.weeks.filter((w) => !w.partial);
  const lastFull = full.at(-1), prevFull = full.at(-2);
  const loadAvg = round(full.slice(-5, -1).reduce((s, w) => s + w.load, 0) / 4);
  const delta = (a, b) => (b ? round(((a - b) / b) * 100) : null);

  // Groepsbelasting: gemiddelde fitness/fatigue van alle sporters per dag.
  const days = res[0].training.loadModel.slice(-42);
  const avgSeries = (k) => days.map((_, i) => round(res.reduce((s, r) => s + r.training.loadModel.slice(-42)[i][k], 0) / res.length, 1));

  const n = attention.length;
  el.innerHTML = `
  <div class="page-head">
    <div><h1>Good morning, Coach</h1><p>Here is what changed across your athletes. All numbers below are computed from the training data.</p></div>
  </div>

  <div class="attention-banner">
    <div>
      <div class="big"><b>${n}</b> ${n === 1 ? "athlete may" : "athletes may"} require additional attention today.</div>
      <p>${watch.length} more to keep an eye on · ${o.total - n - watch.length} on track. Click an athlete to see why.</p>
    </div>
    <div class="chips">${attention.map((r) => `<button class="chip" data-go="#/athletes/${r.profile.id}">${avatar(r.profile.name)}${esc(r.profile.name)}</button>`).join("")}
      <button class="chip" data-go="#/insights" style="padding-left:12px">All insights →</button></div>
  </div>

  <div class="grid g-4" style="margin-bottom:16px">
    ${kpi("Total athletes", o.total, `${o.active} active in the last 14 days`)}
    ${kpi("Need attention", n, `${watch.length} on the watch list`, n ? "up" : "")}
    ${kpi("Avg. load per athlete (7 d)", o.avgLoad7, "training load units", "", sparkline(full.map((w) => round(w.load / o.total))))}
    ${kpi("Group volume last full week", `${lastFull.hours}<small>h</small>`, `${fmtSigned(delta(lastFull.hours, prevFull.hours))}% vs. week before · ${o.hoursThisWeek} h so far this week`, "", sparkline(full.map((w) => w.hours), { color: "var(--series-2)" }))}
  </div>

  <div class="grid g-main" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head"><div><h2>Weekly training load – whole group</h2><div class="card-sub">Sum of all athletes · dashed line = 4-week average (${loadAvg})</div></div></div>
      ${barChart({ bars: o.weeks.map((w) => ({ label: fmtDate(w.weekStart), value: w.load, faded: w.partial, note: w.partial ? "week in progress" : `${w.hours} h, ${w.sessions} sessions` })), avgLine: loadAvg, height: 230 })}
    </div>
    <div class="card">
      <div class="card-head"><div><h2>Today's priorities</h2><div class="card-sub">Main signal per athlete · click to expand</div></div><a class="right small" href="#/insights">View all</a></div>
      <div id="topSignals">${topSignals.length ? topSignals.map(({ s, r, more }) => signalCard(s, r.profile.name) + (more ? `<a class="small faint" style="display:block;margin:4px 0 0 4px" href="#/athletes/${r.profile.id}">+${more} more signal${more > 1 ? "s" : ""} for ${esc(r.profile.name.split(" ")[0])}</a>` : "")).join("") : `<div class="empty">No signals today.</div>`}</div>
    </div>
  </div>

  <div class="grid g-main">
    <div class="card">
      <div class="card-head"><div><h2>Athlete status</h2><div class="card-sub">Sorted by priority</div></div><a class="right small" href="#/athletes">All athletes</a></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Athlete</th><th class="hide-sm">Sport</th><th>Status</th><th class="r">7-day h</th><th class="r hide-sm">Load ratio</th><th class="hide-sm">Load, 12 wk</th></tr></thead>
        <tbody>${[...res].sort((a, b) => b.score - a.score).map((r) => `
          <tr class="click" data-go="#/athletes/${r.profile.id}">
            <td><div style="display:flex;gap:10px;align-items:center">${avatar(r.profile.name)}<b>${esc(r.profile.name)}</b></div></td>
            <td class="hide-sm">${sportTag(r.profile.sport)}</td>
            <td>${statusPill(r.status)}</td>
            <td class="r num">${r.training.summary.hours7}</td>
            <td class="r num hide-sm">${r.training.summary.ratio?.toFixed(2) ?? "–"}</td>
            <td class="hide-sm">${sparkline(r.training.weeks.map((w) => (w.partial ? null : w.load)))}</td>
          </tr>`).join("")}</tbody></table></div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card">
        <div class="card-head"><div><h2>Group fitness vs. fatigue</h2><div class="card-sub">Average across athletes, last 6 weeks</div></div></div>
        ${lineChart({ labels: days.map((d) => fmtDate(d.date)), series: [
          { name: "Fitness (42-day)", values: avgSeries("fitness"), color: "var(--series-2)", area: true },
          { name: "Fatigue (7-day)", values: avgSeries("fatigue"), color: "var(--series-1)" },
        ], height: 210 })}
      </div>
      <div class="card">
        <div class="card-head"><h2>Recent positive developments</h2></div>
        ${positives.length ? positives.map(({ s, r }) => `<div style="display:flex;gap:10px;align-items:center;padding:6px 0" class="click" data-go="#/athletes/${r.profile.id}">${avatar(r.profile.name)}<div><b>${esc(r.profile.name)}</b><div class="small muted">${esc(s.title)} · ${esc(s.whatChanged)}</div></div></div>`).join("") : `<div class="muted">No clear positive trends detected this week.</div>`}
      </div>
    </div>
  </div>`;

  bindSignals(el);
  el.querySelectorAll("[data-go]").forEach((x) => (x.style.cursor = "pointer", x.addEventListener("click", () => (location.hash = x.dataset.go))));
}

function kpi(label, value, sub, cls = "", extra = "") {
  return `<div class="card kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="delta">${sub}</div>${extra ? `<div class="spark">${extra}</div>` : ""}</div>`;
}

const fmtSigned = (x) => (x == null ? "–" : x > 0 ? `+${x}` : `${x}`);
