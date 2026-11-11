// AGENT 4 – PERFORMANCE AGENT
// Prestatieontwikkeling, trainingsconsistentie en voortgang richting doel.
//
// Efficiëntie = output per hartslag, alleen bij rustige duursessies (vergelijkbare omstandigheden):
//   fietsen:  vermogen (W) ÷ hartslag   → hoger is beter
//   lopen:    snelheid (m/min) ÷ hartslag → hoger is beter

import { addDays, mean, round, pctChange, weekStart } from "../util.js";

function efficiency(a) {
  if (a.avg_hr == null) return null;
  if (a.session_type && !["easy", "long"].includes(a.session_type)) return null;
  if (a.sport === "bike" && a.avg_power) return a.avg_power / a.avg_hr;
  if (a.sport === "run" && a.avg_pace_sec_km) return (1000 / a.avg_pace_sec_km) * 60 / a.avg_hr;
  return null;
}

function effTrend(acts, sport, asOf) {
  const pts = acts.filter((a) => a.sport === sport).map((a) => ({ date: a.date, e: efficiency(a) })).filter((p) => p.e != null);
  const recent = pts.filter((p) => p.date > addDays(asOf, -21)).map((p) => p.e);
  const base = pts.filter((p) => p.date <= addDays(asOf, -21) && p.date > addDays(asOf, -63)).map((p) => p.e);
  if (recent.length < 3 || base.length < 5) return null;
  return {
    sport, recent: round(mean(recent), 3), baseline: round(mean(base), 3), changePct: round(pctChange(mean(recent), mean(base)), 1),
    n: { recent: recent.length, baseline: base.length },
    weekly: weeklyEff(pts, asOf),
  };
}

function weeklyEff(pts, asOf) {
  const out = [];
  const lm = weekStart(asOf);
  for (let w = 11; w >= 0; w--) {
    const s = addDays(lm, -7 * w), e = addDays(s, 6);
    const v = pts.filter((p) => p.date >= s && p.date <= e).map((p) => p.e);
    out.push({ weekStart: s, value: v.length ? round(mean(v), 3) : null });
  }
  return out;
}

export function analyze(prepared, profile, asOf) {
  const acts = prepared.activities;
  const findings = [];
  const sports = [...new Set(acts.map((a) => a.sport))].filter((s) => s !== "swim");
  const trends = sports.map((s) => effTrend(acts, s, asOf)).filter(Boolean);

  trends.forEach((t) => {
    if (Math.abs(t.changePct) >= 3) {
      const label = t.sport === "bike" ? "Power per heartbeat (easy/long rides)" : "Speed per heartbeat (easy/long runs)";
      findings.push({
        agent: "performance", id: `efficiency_${t.sport}`, direction: t.changePct > 0 ? "up" : "down",
        positive: t.changePct > 0, severity: t.changePct > 0 ? "positive" : Math.abs(t.changePct) >= 5 ? "high" : "medium",
        metric: `${label}: last 3 weeks vs. 6 weeks before`, value: t.recent, baseline: t.baseline, changePct: t.changePct,
        sources: [`${t.n.recent} recent sessions`, `${t.n.baseline} baseline sessions`, "avg_hr + avg_power / avg_pace"],
      });
    }
  });

  // Consistentie: uitgevoerde sessies ÷ geplande sessies per week (planning uit het profiel).
  const planned = profile.plannedPerWeek || null;
  const consistency = [];
  if (planned) {
    const lm = weekStart(asOf);
    for (let w = 8; w >= 1; w--) {
      const s = addDays(lm, -7 * w), e = addDays(s, 6);
      const done = acts.filter((a) => a.date >= s && a.date <= e).length;
      consistency.push({ weekStart: s, done, planned, pct: round(Math.min(100, (done / planned) * 100)) });
    }
    // Lopende week: deel van de planning naar rato van verstreken dagen.
    const elapsed = Math.round((Date.parse(asOf) - Date.parse(lm)) / 86400000) + 1;
    const doneNow = acts.filter((a) => a.date >= lm && a.date <= asOf).length;
    consistency.push({ weekStart: lm, done: doneNow, planned, pct: round(Math.min(100, (doneNow / (planned * elapsed / 7)) * 100)), partial: true });
    // Vergelijkt de laatste 14 dagen met de 6 weken daarvoor, op basis van werkelijke dagen
    // (niet op kalenderweken), zodat het signaal elke dag even betrouwbaar is.
    const doneIn = (from, to) => acts.filter((a) => a.date > from && a.date <= to).length;
    const recentPct = round(Math.min(100, (doneIn(addDays(asOf, -14), asOf) / (planned * 2)) * 100));
    const basePct = round(Math.min(100, (doneIn(addDays(asOf, -56), addDays(asOf, -14)) / (planned * 6)) * 100));
    if (recentPct != null && basePct != null && basePct - recentPct >= 20) {
      findings.push({
        agent: "performance", id: "consistency_drop", direction: "down", severity: basePct - recentPct >= 35 ? "high" : "medium",
        metric: "Training consistency (completed ÷ planned sessions)", value: recentPct, baseline: basePct, changePct: round(recentPct - basePct), unit: "%",
        sources: [`planned sessions per week from athlete profile (${planned})`, "activity count, last 14 days vs. 6 weeks before"],
      });
    }
  }

  const goal = {
    text: profile.goal || null,
    eventDate: profile.goalEventInDays != null ? addDays(asOf, profile.goalEventInDays) : profile.goalDate || null,
    weeksToGo: profile.goalEventInDays != null ? round(profile.goalEventInDays / 7, 1) : null,
  };

  return { efficiency: trends, consistency, goal, findings };
}
