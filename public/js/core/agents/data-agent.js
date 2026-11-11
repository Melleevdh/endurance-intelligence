// AGENT 1 – DATA AGENT
// Verzamelt, normaliseert en controleert ruwe gegevens. Puur rekenwerk, geen AI.
// Uitvoer: schone activiteiten + herstelmetingen + een kwaliteitsrapport.

import { addDays, round } from "../util.js";

const SPORT_ALIASES = {
  bike: "bike", cycling: "bike", ride: "bike", fietsen: "bike", wielrennen: "bike", virtualride: "bike",
  run: "run", running: "run", hardlopen: "run", lopen: "run", trailrun: "run",
  swim: "swim", swimming: "swim", zwemmen: "swim",
};

export function normalizeSport(s) {
  return SPORT_ALIASES[String(s || "").trim().toLowerCase().replace(/\s+/g, "")] || null;
}

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Tempo "4:35" of seconden → seconden per km. */
export function parsePace(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d+:\d{1,2}$/.test(s)) {
    const [m, sec] = s.split(":").map(Number);
    return m * 60 + sec;
  }
  return num(s);
}

/**
 * Normaliseert één activiteit. Geeft { activity } of { error }.
 * Bekende velden: date, start_time, sport, session_type, duration_min, distance_km,
 * avg_hr, avg_power, avg_pace_sec_km, avg_pace_sec_100m, rpe, tss.
 */
export function normalizeActivity(r) {
  const date = String(r.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "invalid or missing date" };
  const sport = normalizeSport(r.sport);
  if (!sport) return { error: `unknown sport "${r.sport ?? ""}"` };
  const duration = num(r.duration_min);
  if (duration == null || duration <= 0 || duration > 1440) return { error: "duration_min missing or out of range" };

  const a = {
    external_id: r.external_id || null,
    date,
    start_time: r.start_time || null,
    sport,
    session_type: r.session_type || null,
    duration_min: round(duration),
    distance_km: num(r.distance_km),
    avg_hr: num(r.avg_hr),
    avg_power: num(r.avg_power),
    avg_pace_sec_km: parsePace(r.avg_pace_sec_km ?? r.avg_pace),
    avg_pace_sec_100m: num(r.avg_pace_sec_100m),
    rpe: num(r.rpe),
    tss: num(r.tss),
    tss_estimated: false,
  };
  if (a.avg_hr != null && (a.avg_hr < 30 || a.avg_hr > 230)) a.avg_hr = null;
  if (a.rpe != null && (a.rpe < 1 || a.rpe > 10)) a.rpe = null;
  if (a.sport === "run" && !a.avg_pace_sec_km && a.distance_km) a.avg_pace_sec_km = round((a.duration_min * 60) / a.distance_km);

  // Trainingsbelasting ontbreekt? Schat via sRPE (duur × RPE), een gangbare methode.
  // Dit wordt expliciet gemarkeerd, zodat het herleidbaar blijft.
  if (a.tss == null && a.rpe != null) {
    a.tss = round((a.duration_min * a.rpe) / 6);
    a.tss_estimated = true;
  }
  return { activity: a };
}

export function normalizeRecovery(r) {
  const date = String(r.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "invalid or missing date" };
  const m = {
    date,
    hrv_ms: num(r.hrv_ms),
    resting_hr: num(r.resting_hr),
    sleep_score: num(r.sleep_score),
    sleep_hours: num(r.sleep_hours),
    fatigue: num(r.fatigue),
  };
  if (m.hrv_ms != null && (m.hrv_ms < 5 || m.hrv_ms > 300)) m.hrv_ms = null;
  if (m.fatigue != null && (m.fatigue < 1 || m.fatigue > 10)) m.fatigue = null;
  if (Object.values(m).slice(1).every((v) => v == null)) return { error: "no recovery values" };
  return { measurement: m };
}

function minutesOf(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Twee activiteiten zijn dubbel bij zelfde dag + sport, start < 10 min uit elkaar en duur ±5%. */
function isDuplicate(a, b) {
  if (a.date !== b.date || a.sport !== b.sport) return false;
  const ta = minutesOf(a.start_time);
  const tb = minutesOf(b.start_time);
  const timeClose = ta == null || tb == null ? true : Math.abs(ta - tb) <= 10;
  const durClose = Math.abs(a.duration_min - b.duration_min) <= Math.max(2, a.duration_min * 0.05);
  return timeClose && durClose;
}

/**
 * Hoofdfunctie: bereidt ruwe data van één sporter voor op analyse.
 * @returns {{activities, recovery, quality}}
 */
export function prepare(raw, { asOf, windowDays = 84 } = {}) {
  const issues = [];
  const activities = [];
  const duplicates = [];
  (raw.activities || []).forEach((r, idx) => {
    const { activity, error } = normalizeActivity(r);
    if (error) return issues.push({ kind: "invalid_activity", row: idx + 1, detail: error });
    const dup = activities.find((x) => isDuplicate(x, activity));
    if (dup) {
      duplicates.push({ date: activity.date, sport: activity.sport, duration_min: activity.duration_min, kept: dup.external_id, removed: activity.external_id });
      return;
    }
    activities.push(activity);
  });

  const recovery = [];
  const seen = new Set();
  (raw.recovery || []).forEach((r, idx) => {
    const { measurement, error } = normalizeRecovery(r);
    if (error) return issues.push({ kind: "invalid_recovery", row: idx + 1, detail: error });
    if (seen.has(measurement.date)) return issues.push({ kind: "duplicate_recovery", row: idx + 1, detail: `second measurement on ${measurement.date} ignored` });
    seen.add(measurement.date);
    recovery.push(measurement);
  });

  activities.sort((a, b) => (a.date + (a.start_time || "")).localeCompare(b.date + (b.start_time || "")));
  recovery.sort((a, b) => a.date.localeCompare(b.date));

  // Volledigheid in het analysevenster.
  const end = asOf || activities.at(-1)?.date || recovery.at(-1)?.date;
  const from = end ? addDays(end, -(windowDays - 1)) : null;
  const inWin = (d) => from && d >= from && d <= end;
  const recDays = recovery.filter((r) => inWin(r.date));
  const field = (k) => recDays.filter((r) => r[k] != null).length;
  const acts = activities.filter((a) => inWin(a.date));

  const quality = {
    window: { from, to: end, days: windowDays },
    activityCount: acts.length,
    duplicatesRemoved: duplicates,
    invalidRows: issues,
    fields: {
      heart_rate: share(acts.filter((a) => a.avg_hr != null).length, acts.length),
      power: share(acts.filter((a) => a.sport === "bike" && a.avg_power != null).length, acts.filter((a) => a.sport === "bike").length),
      rpe: share(acts.filter((a) => a.rpe != null).length, acts.length),
      tss_estimated: acts.filter((a) => a.tss_estimated).length,
    },
    recovery: {
      available: recovery.length > 0,
      daysWithData: recDays.length,
      coverage: share(recDays.length, windowDays),
      hrv: field("hrv_ms"), resting_hr: field("resting_hr"), sleep: field("sleep_score"), fatigue: field("fatigue"),
    },
  };
  return { activities, recovery, quality };
}

function share(n, d) {
  return { n, of: d, pct: d ? round((n / d) * 100) : null };
}
