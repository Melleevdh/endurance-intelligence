// AGENT 2 – TRAINING AGENT
// Volume, intensiteit, frequentie en trainingsbelasting. Puur rekenwerk.
//
// Begrippen (gangbaar in duursport, hier eenvoudig berekend):
// - Load        = trainingsbelasting per sessie (TSS-achtig getal, of sRPE-schatting)
// - Fitness     = 42-daags exponentieel gemiddelde van dagelijkse load (CTL)
// - Fatigue     = 7-daags exponentieel gemiddelde (ATL)
// - Form        = Fitness − Fatigue (TSB)
// - Load ratio  = load laatste 7 dagen ÷ gemiddelde weekload van de 28 dagen daarvoor

import { addDays, weekStart, sum, mean, round, pctChange } from "../util.js";

export function dailyLoad(activities, from, to) {
  const map = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, 0);
  activities.forEach((a) => map.has(a.date) && map.set(a.date, map.get(a.date) + (a.tss || 0)));
  return [...map.entries()].map(([date, load]) => ({ date, load }));
}

export function loadModel(daily) {
  let ctl = 0, atl = 0;
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  return daily.map(({ date, load }) => {
    ctl += (load - ctl) * kC;
    atl += (load - atl) * kA;
    return { date, load, fitness: round(ctl, 1), fatigue: round(atl, 1), form: round(ctl - atl, 1) };
  });
}

export function weeklySummary(activities, asOf, weeks = 12) {
  const lastMonday = weekStart(asOf);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(lastMonday, -7 * w);
    const end = addDays(start, 6);
    const acts = activities.filter((a) => a.date >= start && a.date <= end);
    const bySport = {};
    acts.forEach((a) => (bySport[a.sport] = (bySport[a.sport] || 0) + a.duration_min));
    out.push({
      weekStart: start,
      partial: end > asOf,
      sessions: acts.length,
      hours: round(sum(acts.map((a) => a.duration_min)) / 60, 1),
      distanceKm: round(sum(acts.map((a) => a.distance_km || 0)), 1),
      load: round(sum(acts.map((a) => a.tss || 0))),
      minutesBySport: bySport,
    });
  }
  return out;
}

/** Intensiteitsverdeling op basis van gemiddelde hartslag t.o.v. hartslagreserve (3 zones). */
export function intensityDistribution(acts, profile) {
  const z = { low: 0, moderate: 0, high: 0 };
  let counted = 0;
  acts.forEach((a) => {
    if (a.avg_hr == null || !profile.hrMax || !profile.hrRest) return;
    const pct = (a.avg_hr - profile.hrRest) / (profile.hrMax - profile.hrRest);
    const k = pct < 0.68 ? "low" : pct < 0.8 ? "moderate" : "high";
    z[k] += a.duration_min;
    counted += a.duration_min;
  });
  if (!counted) return null;
  return { low: round((z.low / counted) * 100), moderate: round((z.moderate / counted) * 100), high: round((z.high / counted) * 100), minutes: counted };
}

/** Trainingszones (berekend uit profielwaarden; transparante vuistregels). */
export function trainingZones(p) {
  const zones = {};
  if (p.hrMax && p.hrRest) {
    const r = p.hrMax - p.hrRest;
    const hr = (f) => Math.round(p.hrRest + r * f);
    zones.heartRate = [
      ["Z1 Recovery", `< ${hr(0.6)} bpm`], ["Z2 Endurance", `${hr(0.6)}–${hr(0.7)} bpm`],
      ["Z3 Tempo", `${hr(0.7)}–${hr(0.8)} bpm`], ["Z4 Threshold", `${hr(0.8)}–${hr(0.9)} bpm`], ["Z5 VO2max", `> ${hr(0.9)} bpm`],
    ];
  }
  if (p.ftp) {
    const w = (f) => Math.round(p.ftp * f);
    zones.power = [
      ["Z1 Active recovery", `< ${w(0.55)} W`], ["Z2 Endurance", `${w(0.56)}–${w(0.75)} W`], ["Z3 Tempo", `${w(0.76)}–${w(0.9)} W`],
      ["Z4 Threshold", `${w(0.91)}–${w(1.05)} W`], ["Z5 VO2max", `> ${w(1.06)} W`],
    ];
  }
  if (p.thresholdPaceSec) {
    const f = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    const t = p.thresholdPaceSec;
    zones.pace = [
      ["Z1 Easy", `> ${f(t * 1.29)}/km`], ["Z2 Endurance", `${f(t * 1.14)}–${f(t * 1.29)}/km`], ["Z3 Tempo", `${f(t * 1.06)}–${f(t * 1.14)}/km`],
      ["Z4 Threshold", `${f(t * 0.99)}–${f(t * 1.06)}/km`], ["Z5 VO2max", `< ${f(t * 0.99)}/km`],
    ];
  }
  return zones;
}

export function analyze(prepared, profile, asOf) {
  const { activities } = prepared;
  const from = addDays(asOf, -83);
  const daily = dailyLoad(activities, from, asOf);
  const model = loadModel(daily);
  const weeks = weeklySummary(activities, asOf);

  const last7 = activities.filter((a) => a.date > addDays(asOf, -7));
  const prev28 = activities.filter((a) => a.date <= addDays(asOf, -7) && a.date > addDays(asOf, -35));
  const load7 = sum(last7.map((a) => a.tss || 0));
  const load28avg = sum(prev28.map((a) => a.tss || 0)) / 4;
  const hours7 = sum(last7.map((a) => a.duration_min)) / 60;
  const hours28avg = sum(prev28.map((a) => a.duration_min)) / 60 / 4;
  const sessions7 = last7.length;
  const sessions28avg = prev28.length / 4;

  const findings = [];
  const ratio = load28avg > 0 ? load7 / load28avg : null;
  if (ratio != null && (ratio >= 1.3 || ratio <= 0.6)) {
    findings.push({
      agent: "training", id: "load_change", direction: ratio > 1 ? "up" : "down",
      severity: ratio >= 1.5 || ratio <= 0.5 ? "high" : "medium",
      metric: "Training load (7 days vs. 4-week average)",
      value: round(load7), baseline: round(load28avg), changePct: round(pctChange(load7, load28avg)), ratio: round(ratio, 2),
      sources: [`${last7.length} activities in the last 7 days`, `${prev28.length} activities in the 28 days before`],
    });
  }
  const hoursChange = pctChange(hours7, hours28avg);
  if (hoursChange != null && Math.abs(hoursChange) >= 30) {
    findings.push({
      agent: "training", id: "volume_change", direction: hoursChange > 0 ? "up" : "down", severity: Math.abs(hoursChange) >= 45 ? "high" : "medium",
      metric: "Training hours (7 days vs. 4-week average)", value: round(hours7, 1), baseline: round(hours28avg, 1), changePct: round(hoursChange),
      sources: [`duration_min of ${last7.length} recent activities`],
    });
  }
  const sessChange = pctChange(sessions7, sessions28avg);
  if (sessChange != null && sessChange <= -35) {
    findings.push({
      agent: "training", id: "frequency_drop", direction: "down", severity: sessChange <= -50 ? "high" : "medium",
      metric: "Sessions (7 days vs. 4-week average)", value: sessions7, baseline: round(sessions28avg, 1), changePct: round(sessChange),
      sources: ["activity count per day"],
    });
  }

  const today = model.at(-1);
  return {
    summary: {
      load7: round(load7), load28avg: round(load28avg), ratio: ratio == null ? null : round(ratio, 2),
      hours7: round(hours7, 1), hours28avg: round(hours28avg, 1), sessions7, sessions28avg: round(sessions28avg, 1),
      fitness: today.fitness, fatigue: today.fatigue, form: today.form,
      intensity7: intensityDistribution(last7, profile),
      intensity28: intensityDistribution(prev28, profile),
      avgLoadPerWeek: round(mean(weeks.filter((w) => !w.partial).map((w) => w.load))),
    },
    loadModel: model,
    weeks,
    zones: trainingZones(profile),
    findings,
  };
}
