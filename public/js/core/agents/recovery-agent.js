// AGENT 3 – RECOVERY AGENT
// Vergelijkt recente herstelmetingen met de EIGEN historische waarden van de sporter.
// Geen medische interpretatie: alleen "wijkt af van het eigen normale patroon".
// Gebruikt uitsluitend gegevens die er echt zijn; ontbrekende data wordt gemeld.

import { addDays, mean, sd, round, pctChange, slope } from "../util.js";

const METRICS = [
  { key: "hrv_ms", label: "HRV (rMSSD)", unit: "ms", worseWhen: "lower" },
  { key: "resting_hr", label: "Resting heart rate", unit: "bpm", worseWhen: "higher" },
  { key: "sleep_score", label: "Sleep score", unit: "", worseWhen: "lower" },
  { key: "sleep_hours", label: "Sleep duration", unit: "h", worseWhen: "lower" },
  { key: "fatigue", label: "Perceived fatigue (1–10)", unit: "", worseWhen: "higher" },
];

const MIN_BASELINE = 14; // minimaal aantal metingen om een betrouwbare eigen basislijn te maken
const MIN_RECENT = 3;

export function analyze(prepared, profile, asOf) {
  const rec = prepared.recovery;
  const recentFrom = addDays(asOf, -6);
  const baseFrom = addDays(asOf, -34);
  const metrics = {};
  const findings = [];
  const missing = [];

  if (!rec.length) {
    return {
      available: false, metrics: {}, findings: [],
      missing: ["No recovery data (HRV, resting HR, sleep, fatigue) is available for this athlete."],
      series: [],
    };
  }

  METRICS.forEach((m) => {
    const recent = rec.filter((r) => r.date >= recentFrom && r.date <= asOf && r[m.key] != null).map((r) => r[m.key]);
    const base = rec.filter((r) => r.date >= baseFrom && r.date < recentFrom && r[m.key] != null).map((r) => r[m.key]);
    if (base.length < MIN_BASELINE || recent.length < MIN_RECENT) {
      missing.push(`${m.label}: not enough measurements (${recent.length} recent, ${base.length} baseline; need ${MIN_RECENT}/${MIN_BASELINE}).`);
      return;
    }
    const recentMean = mean(recent);
    const baseMean = mean(base);
    const baseSd = sd(base) || 0.0001;
    const z = (recentMean - baseMean) / baseSd;
    const trend = slope(rec.filter((r) => r.date >= recentFrom).map((r) => r[m.key]));
    metrics[m.key] = {
      label: m.label, unit: m.unit, recent: round(recentMean, 1), baseline: round(baseMean, 1), baselineSd: round(baseSd, 1),
      z: round(z, 2), changePct: round(pctChange(recentMean, baseMean)), n: { recent: recent.length, baseline: base.length }, trendPerDay: round(trend, 2),
    };
    const worse = m.worseWhen === "lower" ? z <= -1.5 : z >= 1.5;
    if (worse) {
      findings.push({
        agent: "recovery", id: `recovery_${m.key}`, severity: Math.abs(z) >= 2.5 ? "high" : "medium",
        metric: `${m.label} (7-day avg vs. personal 4-week baseline)`, value: round(recentMean, 1), baseline: round(baseMean, 1),
        changePct: round(pctChange(recentMean, baseMean)), z: round(z, 1), direction: m.worseWhen === "lower" ? "down" : "up",
        sources: [`${recent.length} measurements (last 7 days)`, `${base.length} measurements (baseline, days 8–35)`],
      });
    }
  });

  // Combinatiesignaal: meerdere herstelwaarden tegelijk afwijkend is sterker dan één.
  if (findings.length >= 2) {
    findings.forEach((f) => (f.combined = findings.length));
  }

  const series = rec.filter((r) => r.date >= addDays(asOf, -55));
  return { available: true, metrics, findings, missing, series };
}
