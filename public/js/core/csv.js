// CSV-import. Werkt volledig in de browser: het bestand wordt niet geüpload.
//
// Twee formaten (kolomnamen in de eerste regel, volgorde vrij, komma of puntkomma):
//
// 1) Activiteiten (verplicht: athlete, date, sport, duration_min)
//    athlete,date,start_time,sport,session_type,duration_min,distance_km,avg_hr,avg_power,avg_pace,rpe,tss
//
// 2) Herstel (verplicht: athlete, date + minstens één waarde)
//    athlete,date,hrv_ms,resting_hr,sleep_score,sleep_hours,fatigue

export function parseCSV(text) {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return { header: [], rows: [] };
  const firstLine = clean.split("\n", 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const records = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); records.push(row); row = []; field = ""; }
    else field += c;
  }
  row.push(field);
  records.push(row);
  const header = records.shift().map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const rows = records
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { header, rows };
}

export function detectKind(header) {
  if (header.includes("duration_min") && header.includes("sport")) return "activities";
  if (["hrv_ms", "resting_hr", "sleep_score", "sleep_hours", "fatigue"].some((k) => header.includes(k))) return "recovery";
  return null;
}

/** Groepeert rijen per sporternaam → { naam: { activities: [], recovery: [] } } */
export function groupByAthlete(rows, kind) {
  const out = {};
  const errors = [];
  rows.forEach((r, i) => {
    const name = (r.athlete || "").trim();
    if (!name) return errors.push({ row: i + 2, detail: "missing athlete column/value" });
    if (name.length > 80) return errors.push({ row: i + 2, detail: "athlete name too long" });
    (out[name] ||= { activities: [], recovery: [] })[kind].push(r);
  });
  return { groups: out, errors };
}

export const SAMPLE_ACTIVITIES = `athlete,date,start_time,sport,session_type,duration_min,distance_km,avg_hr,avg_power,avg_pace,rpe,tss
Demo Runner,{d-6},07:00,run,easy,45,8.6,138,,5:14,3,
Demo Runner,{d-5},18:30,run,interval,60,11.2,158,,5:21,7,
Demo Runner,{d-3},07:00,run,easy,40,7.5,136,,5:20,3,
Demo Runner,{d-1},09:00,run,long,95,17.9,145,,5:18,5,
Demo Rider,{d-6},18:00,bike,interval,75,32.1,152,231,,7,
Demo Rider,{d-4},07:30,bike,easy,60,27.0,128,168,,3,
Demo Rider,{d-2},09:00,bike,long,180,82.4,136,182,,5,
Demo Rider,{d-2},09:01,bike,long,181,82.4,136,182,,5,`;

export const SAMPLE_RECOVERY = `athlete,date,hrv_ms,resting_hr,sleep_score,sleep_hours,fatigue
Demo Runner,{d-2},61,48,80,7.5,3
Demo Runner,{d-1},58,49,76,7.1,4
Demo Rider,{d-1},,52,70,6.6,5`;
