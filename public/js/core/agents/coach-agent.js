// AGENT 5 – COACH AGENT (centrale agent)
// Combineert de uitkomsten van de Training-, Recovery- en Performance-agent tot:
//  - dagelijkse signalen (met herleidbare brongegevens)
//  - wekelijkse rapporten
//  - een gepseudonimiseerde context voor de AI-assistent
//
// Alle signalen hier zijn REGELGEBASEERD (controleerbaar). Taal-AI wordt alleen gebruikt
// om rapporten te verwoorden en vragen te beantwoorden (zie /api/assistant en /api/report).

import { addDays, weekStart, round, sum, fmtDuration } from "../util.js";
import * as dataAgent from "./data-agent.js";
import * as trainingAgent from "./training-agent.js";
import * as recoveryAgent from "./recovery-agent.js";
import * as performanceAgent from "./performance-agent.js";

const SEV = { high: 3, medium: 2, positive: 0 };

// Uitleg per type bevinding. "interpretation" is bewust voorzichtig geformuleerd.
const PLAYBOOK = {
  load_change: (f) => f.direction === "up" ? {
    title: "Sharp rise in training load",
    why: `Load is ${f.ratio}× the recent weekly average. Rapid increases (roughly above 1.3–1.5×) are commonly associated with a higher chance of excessive fatigue, especially when sustained.`,
    question: "Was this increase planned? How is your body responding to the extra work?",
    next: "Compare with the planned block. If unplanned, consider whether the coming days need an easier session.",
  } : {
    title: "Marked drop in training load",
    why: `Load is ${f.ratio}× the recent weekly average – a large reduction compared with the athlete's own pattern.`,
    question: "Has anything changed in the past week – work, illness, travel, motivation?",
    next: "Check whether this is a planned recovery week. If not, ask about the reason before adjusting the plan.",
  },
  volume_change: (f) => ({
    title: f.direction === "up" ? "Unusual increase in training volume" : "Unusual decrease in training volume",
    why: `${f.value} h in the last 7 days vs. ${f.baseline} h on average per week before (${signed(f.changePct)}%).`,
    question: f.direction === "up" ? "Did you add extra sessions or make sessions longer than planned?" : "Were sessions skipped or shortened? What got in the way?",
    next: "Review the session list for this week and compare with the plan.",
  }),
  frequency_drop: (f) => ({
    title: "Fewer sessions than usual",
    why: `${f.value} sessions in the last 7 days vs. ${f.baseline} per week on average.`,
    question: "How did this week go? Is the schedule still realistic?",
    next: "Consider a short check-in on availability and motivation.",
  }),
  recovery_hrv_ms: (f) => ({
    title: "HRV below personal baseline",
    why: `7-day HRV average ${f.value} ms vs. personal baseline ${f.baseline} ms (${signed(f.changePct)}%, ${Math.abs(f.z)} SD below normal for this athlete).`,
    question: "How have you been sleeping and feeling lately? Any extra stress outside training?",
    next: "Consider asking about well-being before the next hard session. This is not a diagnosis – it only shows a deviation from the athlete's own pattern.",
  }),
  recovery_resting_hr: (f) => ({
    title: "Resting heart rate above personal baseline",
    why: `7-day average ${f.value} bpm vs. baseline ${f.baseline} bpm (+${round(f.value - f.baseline, 1)} bpm).`,
    question: "Do you feel any different than usual – tired, run down, stressed?",
    next: "Monitor for a few days; combine with how the athlete reports feeling.",
  }),
  recovery_sleep_score: (f) => ({
    title: "Lower sleep score than usual",
    why: `7-day sleep score ${f.value} vs. baseline ${f.baseline}.`,
    question: "Has your sleep been different lately?",
    next: "Discuss sleep and recovery routines in the next conversation.",
  }),
  recovery_sleep_hours: (f) => ({
    title: "Shorter sleep than usual",
    why: `7-day average ${f.value} h vs. baseline ${f.baseline} h.`,
    question: "Are you getting less sleep than usual? Is that temporary?",
    next: "Consider sleep when deciding on intensity this week.",
  }),
  recovery_fatigue: (f) => ({
    title: "Rising perceived fatigue",
    why: `Self-reported fatigue averages ${f.value}/10 vs. ${f.baseline}/10 normally.`,
    question: "You've reported feeling more tired – what do you think is behind it?",
    next: "Talk through recent load and life stress; check whether the plan still fits.",
  }),
  consistency_drop: (f) => ({
    title: "Training consistency declining",
    why: `${f.value}% of planned sessions completed in the last 2 weeks vs. ${f.baseline}% in the 6 weeks before.`,
    question: "What has made it harder to complete sessions recently?",
    next: "Explore barriers (time, motivation, niggles) and whether the plan needs simplifying.",
  }),
  efficiency_bike: (f) => effPlay(f, "power"),
  efficiency_run: (f) => effPlay(f, "speed"),
};

function effPlay(f, what) {
  return f.positive ? {
    title: `Improving ${what} at the same heart rate`,
    why: `Recent easy sessions show ${signed(f.changePct)}% more ${what} per heartbeat than the 6 weeks before.`,
    question: "How do easy sessions feel compared with a month ago?",
    next: "Consider whether zones or targets should be re-tested.",
  } : {
    title: `Less ${what} at the same heart rate`,
    why: `Recent easy sessions show ${signed(f.changePct)}% ${what} per heartbeat vs. the 6 weeks before. Heat, terrain or fatigue can also explain this.`,
    question: "Have conditions been different (heat, hills, equipment)? How do easy sessions feel?",
    next: "Check session conditions before drawing conclusions; consider a controlled test later.",
  };
}

const signed = (x) => (x > 0 ? `+${x}` : `${x}`);

/** Voert de volledige pijplijn uit voor één sporter. */
export function analyzeAthlete({ profile, raw }, asOf) {
  const prepared = dataAgent.prepare(raw, { asOf });
  const training = trainingAgent.analyze(prepared, profile, asOf);
  const recovery = recoveryAgent.analyze(prepared, profile, asOf);
  const performance = performanceAgent.analyze(prepared, profile, asOf);
  const all = [...training.findings, ...recovery.findings, ...performance.findings];

  const concerns = all.filter((f) => f.severity !== "positive");
  const positives = all.filter((f) => f.severity === "positive");
  const score = sum(concerns.map((f) => SEV[f.severity] || 0)) + (concerns.length >= 2 ? 1 : 0);
  const status = score >= 5 ? "attention" : score >= 2 ? "watch" : "ok";

  const signals = all.map((f) => {
    const p = (PLAYBOOK[f.id] || (() => ({ title: f.metric, why: "", question: "", next: "" })))(f);
    return {
      id: `${profile.id}:${f.id}`, athleteId: profile.id, agent: f.agent, severity: f.severity, positive: f.severity === "positive",
      title: p.title,
      measured: { metric: f.metric, value: f.value, baseline: f.baseline, changePct: f.changePct, unit: f.unit || "" },
      dataUsed: f.sources,
      whatChanged: `${f.metric}: ${f.value}${f.unit || ""} vs. ${f.baseline}${f.unit || ""}${f.changePct != null ? ` (${signed(f.changePct)}${f.unit === "%" ? " pts" : "%"})` : ""}`,
      whyNotable: p.why,
      question: p.question,
      nextStep: p.next,
    };
  }).sort((a, b) => (SEV[b.severity] || 0) - (SEV[a.severity] || 0));

  return { profile, asOf, quality: prepared.quality, prepared, training, recovery, performance, signals, concerns, positives, score, status };
}

export function analyzeAll(dataset, asOf) {
  return dataset.map((d) => analyzeAthlete(d, asOf));
}

/** Overzicht voor de hele groep (Overview-pagina). */
export function groupOverview(results, asOf) {
  const active = results.filter((r) => r.prepared.activities.some((a) => a.date > addDays(asOf, -14)));
  const attention = results.filter((r) => r.status === "attention");
  const watch = results.filter((r) => r.status === "watch");
  const weeks = results[0]?.training.weeks.map((w, i) => ({
    weekStart: w.weekStart, partial: w.partial,
    hours: round(sum(results.map((r) => r.training.weeks[i].hours)), 1),
    load: round(sum(results.map((r) => r.training.weeks[i].load))),
    sessions: sum(results.map((r) => r.training.weeks[i].sessions)),
  })) || [];
  return {
    total: results.length, active: active.length, attention: attention.length, watch: watch.length,
    avgLoad7: round(sum(results.map((r) => r.training.summary.load7)) / (results.length || 1)),
    hoursThisWeek: weeks.at(-1)?.hours ?? 0,
    hoursLastWeek: weeks.at(-2)?.hours ?? 0,
    weeks,
  };
}

/** Deterministisch weekrapport (basis). AI kan dit later alleen verwoorden, niet veranderen. */
export function weeklyReport(r, asOf) {
  const wk = r.training.weeks.at(-2); // laatste volledige week
  const prev = r.training.weeks.slice(-6, -2);
  const prevAvgLoad = round(sum(prev.map((w) => w.load)) / (prev.length || 1));
  const from = wk.weekStart, to = addDays(wk.weekStart, 6);
  const acts = r.prepared.activities.filter((a) => a.date >= from && a.date <= to);
  const bySport = {};
  acts.forEach((a) => {
    const s = (bySport[a.sport] ||= { sessions: 0, minutes: 0, km: 0 });
    s.sessions++; s.minutes += a.duration_min; s.km += a.distance_km || 0;
  });
  const done = r.performance.consistency.find((c) => c.weekStart === from);
  const rec = r.recovery.available ? Object.values(r.recovery.metrics).map((m) => `${m.label}: ${m.recent}${m.unit ? " " + m.unit : ""} (baseline ${m.baseline})`) : [];

  return {
    athleteId: r.profile.id, weekStart: from, weekEnd: to,
    done: {
      sessions: acts.length, planned: r.profile.plannedPerWeek || null, completionPct: done?.pct ?? null,
      duration: fmtDuration(sum(acts.map((a) => a.duration_min))), distanceKm: round(sum(acts.map((a) => a.distance_km || 0)), 1),
      bySport: Object.entries(bySport).map(([sport, s]) => ({ sport, sessions: s.sessions, duration: fmtDuration(s.minutes), km: round(s.km, 1) })),
    },
    load: { week: wk.load, previous4wkAvg: prevAvgLoad, changePct: prevAvgLoad ? round(((wk.load - prevAvgLoad) / prevAvgLoad) * 100) : null, fitness: r.training.summary.fitness, form: r.training.summary.form },
    trends: r.performance.efficiency.map((e) => `${e.sport === "bike" ? "Power" : "Speed"} per heartbeat: ${e.changePct > 0 ? "+" : ""}${e.changePct}% (last 3 wks vs. 6 wks before)`),
    recovery: rec,
    recoveryMissing: r.recovery.missing,
    positives: r.signals.filter((s) => s.positive).map((s) => s.title).concat(done && done.pct >= 90 ? [`Completed ${done.done}/${done.planned} planned sessions`] : []),
    attention: r.signals.filter((s) => !s.positive).map((s) => s.title),
    talkingPoints: r.signals.filter((s) => !s.positive).map((s) => s.question).slice(0, 3),
    goal: r.performance.goal,
  };
}

/**
 * Gepseudonimiseerde context voor de AI. Geen namen, geen leeftijden: alleen codes (A1, A2, …)
 * en berekende kengetallen. De vertaling code → naam gebeurt pas in de browser.
 */
export function aiContext(results, asOf) {
  return {
    asOf,
    note: "Pseudonymised. Athlete codes only. All numbers were computed by deterministic code.",
    athletes: results.map((r, i) => ({
      code: `A${i + 1}`,
      sport: r.profile.sport,
      goal: r.profile.goal || null,
      weeksToGoalEvent: r.performance.goal.weeksToGo,
      status: r.status,
      training: {
        last7d: { hours: r.training.summary.hours7, sessions: r.training.summary.sessions7, load: r.training.summary.load7 },
        avgPerWeekPrev4wk: { hours: r.training.summary.hours28avg, sessions: r.training.summary.sessions28avg, load: r.training.summary.load28avg },
        loadRatio: r.training.summary.ratio,
        fitness: r.training.summary.fitness, fatigue: r.training.summary.fatigue, form: r.training.summary.form,
        intensityLast7dPct: r.training.summary.intensity7,
        weeklyLoad12wk: r.training.weeks.map((w) => w.load),
        weeklyHours12wk: r.training.weeks.map((w) => w.hours),
      },
      recovery: r.recovery.available ? r.recovery.metrics : "NOT AVAILABLE – no recovery data for this athlete",
      recoveryGaps: r.recovery.missing,
      efficiency: r.performance.efficiency.map(({ weekly, ...e }) => e),
      consistencyPctLast9wk: r.performance.consistency.map((c) => c.pct),
      signals: r.signals.map((s) => ({ title: s.title, measured: s.whatChanged, dataUsed: s.dataUsed, positive: s.positive })),
      dataQuality: { duplicatesRemoved: r.quality.duplicatesRemoved.length, invalidRows: r.quality.invalidRows.length, recoveryCoveragePct: r.quality.recovery.coverage.pct },
    })),
  };
}
