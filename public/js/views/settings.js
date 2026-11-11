import { esc, api } from "../ui/common.js";
import { icon } from "../ui/icons.js";
import { parseCSV, detectKind, groupByAthlete, SAMPLE_ACTIVITIES, SAMPLE_RECOVERY } from "../core/csv.js";
import { prepare } from "../core/agents/data-agent.js";
import { addDays, hash } from "../core/util.js";
import { recompute } from "../app.js";

// ---------- Opslag van geïmporteerde data (alleen in deze browser) ----------
const KEY = "ei.imported.v1";

export function loadImported() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveImported(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function sportFrom(acts) {
  const s = new Set(acts.map((a) => String(a.sport).toLowerCase()));
  const has = (k) => [...s].some((x) => x.includes(k));
  if (has("swim") || (has("run") && (has("bike") || has("ride") || has("cycl")))) return "triathlon";
  if (has("bike") || has("ride") || has("cycl") || has("fiets")) return "cycling";
  return "running";
}

// ---------- Integraties: status is EERLIJK, niets wordt gesuggereerd dat niet getest is ----------
const INTEGRATIONS = [
  {
    name: "Strava", color: "#e05a1b", short: "St",
    status: ["Not configured", "neutral"],
    body: `Officially available via OAuth 2.0 (athlete authorises access; tokens stay server-side). <b>Not built yet, on purpose.</b> Strava's API terms restrict use of Strava data in AI applications and limit showing an athlete's data to others; whether a coach dashboard with AI summaries is allowed must be confirmed with Strava in writing first. New apps also start limited to a handful of athletes and need a Strava subscription for the developer.`,
    next: "Ask Strava developer support for written confirmation of the coach + AI use case before building.",
  },
  {
    name: "Garmin Connect", color: "#1a73a8", short: "Ga",
    status: ["Depends on external approval", "medium"],
    body: "Official access is only through the Garmin Connect Developer Program (business application and approval). New applications have been paused since spring 2026 according to developer reports; there is no public date for reopening.",
    next: "Use CSV export from Garmin Connect for now; apply once the programme reopens.",
  },
  {
    name: "TrainingPeaks", color: "#2b3a55", short: "TP",
    status: ["Depends on external approval", "medium"],
    body: "The TrainingPeaks API is only available to approved commercial developers via an access request (not for personal use). Approval is reviewed case by case.",
    next: "Submit an access request once there is a company and a clear use case.",
  },
  {
    name: "CSV import", color: "#0fa3a3", short: "CSV",
    status: ["Working", "positive"],
    body: "Upload exported activity or recovery files. Parsed and checked by the Data Agent in your browser – the file is not uploaded to a server.",
    next: null,
  },
];

export default async function settings(el, { state }) {
  el.innerHTML = `
  <div class="page-head"><div><h1>Settings & Integrations</h1><p>Manage data sources. Statuses below reflect what has actually been built and tested.</p></div></div>
  <div class="grid g-main">
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><h2>Data sources</h2></div>
        ${INTEGRATIONS.map((i) => `<div class="integration">
          <div class="int-logo" style="background:${i.color}">${i.short}</div>
          <div class="int-body"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3>${i.name}</h3><span class="pill ${i.status[1]}">${i.status[0]}</span></div>
            <p>${i.body}</p>${i.next ? `<p class="small"><b>Next step:</b> ${i.next}</p>` : ""}</div></div>`).join("")}
      </div>

      <div class="card" id="import"><div class="card-head"><div><h2>CSV import</h2><div class="card-sub">Activities or recovery data · comma or semicolon separated</div></div></div>
        <div class="note" style="margin-bottom:12px"><b>Demo phase:</b> only import synthetic or test data. Do not import real athlete data until athletes have given consent and the database with per-coach security is switched on.</div>
        <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:12px"><input type="checkbox" id="consent"> <span>I confirm this file contains test/synthetic data, or data I am allowed to process for these athletes.</span></label>
        <div class="dropzone" id="drop">${icon("upload").replace("<svg", '<svg width="26" height="26"')}<p style="margin:6px 0">Drag a CSV file here, or</p>
          <label class="btn"><input type="file" id="file" accept=".csv,text/csv" hidden> Choose file</label></div>
        <div id="importResult" style="margin-top:12px"></div>
        <details style="margin-top:12px"><summary class="small" style="cursor:pointer">Expected columns & sample files</summary>
          <p class="small muted">Activities: <code>athlete, date, sport, duration_min</code> (required) + optional <code>start_time, session_type, distance_km, avg_hr, avg_power, avg_pace (m:ss/km), rpe, tss</code>. Missing load is estimated from duration × RPE and marked.</p>
          <p class="small muted">Recovery: <code>athlete, date</code> + any of <code>hrv_ms, resting_hr, sleep_score, sleep_hours, fatigue (1–10)</code>.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-sample="activities">Download sample activities</button><button class="btn" data-sample="recovery">Download sample recovery</button></div>
        </details>
        <div id="importedList" style="margin-top:12px"></div>
      </div>
    </div>

    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><h2>System status</h2><span class="right small muted">live check</span></div><div id="status"><p class="muted">Checking…</p></div></div>
      <div class="card"><h2 style="margin-bottom:8px">Privacy (GDPR / AVG)</h2>
        <ul class="small" style="margin:0;padding-left:18px">
          <li><b>This demo</b> uses synthetic athletes only. Imported CSV data stays in this browser (localStorage) and can be removed below.</li>
          <li><b>AI</b>: only computed metrics under codes (A1, A2…) are sent to the AI provider – no names, ages or raw files. Nothing is stored server-side.</li>
          <li><b>Planned database</b>: per-coach separation enforced by the database itself (row-level security); integration tokens only stored server-side.</li>
          <li>Recovery data (HRV, sleep, resting HR) counts as health data under the GDPR – explicit athlete consent is required before real use.</li>
        </ul></div>
    </div>
  </div>`;

  // ---- Systeemstatus (echte check van de server) ----
  api("/api/status").then((s) => {
    const row = (label, ok, txt) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--border)"><span class="dot ${ok === true ? "ok" : ok === false ? "attention" : "watch"}" style="margin-top:6px"></span><div><b>${label}</b><div class="small muted">${txt}</div></div></div>`;
    el.querySelector("#status").innerHTML =
      row("Analysis engine", true, "Deterministic agents running in the browser") +
      row("AI (Anthropic)", s.ai.configured ? true : false, s.ai.configured ? `API key present · model ${esc(s.ai.model)}` : "ANTHROPIC_API_KEY not set – AI features disabled") +
      row("AI login protection", s.auth.configured ? true : false, s.auth.configured ? "APP_PASSWORD set" : "APP_PASSWORD / SESSION_SECRET not set") +
      row("Database (Supabase)", s.database.reachable === true ? true : s.database.configured ? false : null, esc(s.database.detail));
  }).catch(() => {
    el.querySelector("#status").innerHTML = `<p class="muted small">Server functions not reachable (normal when opening the files without Vercel). The dashboard itself still works.</p>`;
  });

  // ---- Voorbeeldbestanden ----
  el.querySelectorAll("[data-sample]").forEach((b) => b.addEventListener("click", () => {
    const tpl = b.dataset.sample === "activities" ? SAMPLE_ACTIVITIES : SAMPLE_RECOVERY;
    const text = tpl.replace(/\{d-(\d+)\}/g, (_, n) => addDays(state.asOf, -Number(n)));
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `sample-${b.dataset.sample}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));

  // ---- Import ----
  const result = el.querySelector("#importResult");
  const handle = async (file) => {
    if (!el.querySelector("#consent").checked) {
      result.innerHTML = `<div class="err">Please confirm the data statement above first.</div>`;
      return;
    }
    if (file.size > 5_000_000) return (result.innerHTML = `<div class="err">File is larger than 5 MB.</div>`);
    const { header, rows } = parseCSV(await file.text());
    const kind = detectKind(header);
    if (!kind) return (result.innerHTML = `<div class="err">Columns not recognised. Expected at least <code>athlete, date, sport, duration_min</code> or recovery columns.</div>`);
    const { groups, errors } = groupByAthlete(rows, kind);
    const list = loadImported();
    const summary = [];
    Object.entries(groups).forEach(([name, data]) => {
      const id = "csv-" + hash(name.toLowerCase()).toString(36);
      let entry = list.find((x) => x.profile.id === id);
      if (!entry) {
        entry = { profile: { id, name, sport: "running", source: "csv", goal: null, plannedPerWeek: null }, raw: { activities: [], recovery: [] } };
        list.push(entry);
      }
      entry.raw[kind].push(...data[kind]);
      if (kind === "activities") entry.profile.sport = sportFrom(entry.raw.activities);
      const q = prepare(entry.raw, { asOf: state.asOf }).quality;
      summary.push({ name, rows: data[kind].length, dups: q.duplicatesRemoved.length, invalid: q.invalidRows.length });
    });
    if (!saveImported(list)) return (result.innerHTML = `<div class="err">Could not store the data in this browser (storage blocked or full).</div>`);
    recompute();
    result.innerHTML = `<div class="ai-box" style="background:var(--positive-soft);border-color:#bfe3cf"><b>Imported ${rows.length} ${kind} rows</b> for ${summary.length} athlete(s).
      <ul class="small" style="margin:6px 0 0">${summary.map((s) => `<li>${esc(s.name)}: ${s.rows} rows · ${s.dups} duplicate(s) removed · ${s.invalid} invalid row(s) skipped</li>`).join("")}${errors.map((e) => `<li class="err">Row ${e.row}: ${esc(e.detail)}</li>`).join("")}</ul></div>`;
    drawImported();
  };
  el.querySelector("#file").addEventListener("change", async (e) => {
    if (e.target.files[0]) await handle(e.target.files[0]);
    e.target.value = ""; // zodat hetzelfde bestand opnieuw gekozen kan worden
  });
  const drop = el.querySelector("#drop");
  drop.addEventListener("dragover", (e) => (e.preventDefault(), drop.classList.add("drag")));
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]);
  });

  const drawImported = () => {
    const list = loadImported();
    el.querySelector("#importedList").innerHTML = list.length ? `<h3 style="margin-bottom:6px">Imported athletes (this browser)</h3>
      ${list.map((x) => `<div style="display:flex;gap:10px;align-items:center;padding:5px 0"><a href="#/athletes/${x.profile.id}"><b>${esc(x.profile.name)}</b></a><span class="small muted">${x.raw.activities.length} activities · ${x.raw.recovery.length} recovery rows</span></div>`).join("")}
      <button class="btn" id="clear" style="margin-top:6px">Delete all imported data</button>` : "";
    el.querySelector("#clear")?.addEventListener("click", () => {
      if (!confirm("Delete all imported CSV data from this browser? This cannot be undone.")) return;
      saveImported([]);
      try { localStorage.removeItem(KEY); } catch { /* niets */ }
      recompute();
      drawImported();
      result.innerHTML = "";
    });
  };
  drawImported();
}
