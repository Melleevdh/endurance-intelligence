// Tests voor de analysepijplijn. Draaien met: npm test  (Node 22, geen packages nodig)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoDataset, DEMO_ATHLETES } from "../public/js/core/demo-data.js";
import { analyzeAll, groupOverview, weeklyReport, aiContext } from "../public/js/core/agents/coach-agent.js";
import { prepare, normalizeActivity } from "../public/js/core/agents/data-agent.js";
import { parseCSV, detectKind, groupByAthlete } from "../public/js/core/csv.js";

const ASOF = "2026-11-11";
const results = analyzeAll(buildDemoDataset(ASOF), ASOF);
const byName = (n) => results.find((r) => r.profile.name.startsWith(n));

test("demo set: 8 athletes, 3 triathletes, 3 cyclists, 2 runners", () => {
  assert.equal(DEMO_ATHLETES.length, 8);
  const c = (s) => DEMO_ATHLETES.filter((a) => a.sport === s).length;
  assert.deepEqual([c("triathlon"), c("cycling"), c("running")], [3, 3, 2]);
});

test("demo data is deterministic for the same date", () => {
  assert.deepEqual(buildDemoDataset(ASOF), buildDemoDataset(ASOF));
});

test("scenario athletes are detected by the agents (without knowing the scenario)", () => {
  assert.ok(byName("Noor").signals.some((s) => s.id.endsWith("load_change") || s.id.endsWith("volume_change")), "volume spike");
  assert.ok(byName("Ruben").signals.some((s) => s.id.endsWith("recovery_hrv_ms")), "HRV drop");
  assert.ok(byName("Lotte").signals.some((s) => s.id.endsWith("consistency_drop")), "consistency drop");
  assert.ok(byName("Daan").signals.some((s) => s.id.endsWith("recovery_fatigue")), "rising fatigue");
  assert.equal(byName("Mila").quality.duplicatesRemoved.length, 1, "duplicate upload removed");
});

test("every signal is traceable: data used, change, reason, question, next step", () => {
  for (const r of results) for (const s of r.signals) {
    assert.ok(s.dataUsed.length > 0, s.id);
    for (const k of ["whatChanged", "whyNotable", "question", "nextStep"]) assert.ok(s[k] && s[k].length > 5, `${s.id} ${k}`);
  }
});

test("athlete without recovery data gets no recovery claims", () => {
  const joris = byName("Joris");
  assert.equal(joris.recovery.available, false);
  assert.equal(joris.signals.filter((s) => s.agent === "recovery").length, 0);
  assert.match(JSON.stringify(aiContext([joris], ASOF)), /NOT AVAILABLE/);
});

test("AI context is pseudonymised (no athlete names)", () => {
  const ctx = JSON.stringify(aiContext(results, ASOF));
  for (const a of DEMO_ATHLETES) assert.ok(!ctx.includes(a.name.split(" ")[0]), a.name);
});

test("group overview and weekly reports compute", () => {
  const o = groupOverview(results, ASOF);
  assert.equal(o.total, 8);
  assert.equal(o.weeks.length, 12);
  const rep = weeklyReport(byName("Noor"), ASOF);
  assert.ok(rep.done.sessions > 0);
  assert.ok(rep.load.week > 0);
});

test("data agent: validation, sRPE estimate, duplicates", () => {
  assert.ok(normalizeActivity({ date: "2026-13-40", sport: "run", duration_min: 30 }).error);
  assert.ok(normalizeActivity({ date: "2026-11-01", sport: "kayak", duration_min: 30 }).error);
  const { activity } = normalizeActivity({ date: "2026-11-01", sport: "Hardlopen", duration_min: "60", rpe: "6", avg_pace: "5:00" });
  assert.equal(activity.sport, "run");
  assert.equal(activity.tss, 60);
  assert.equal(activity.tss_estimated, true);
  assert.equal(activity.avg_pace_sec_km, 300);
  const p = prepare({ activities: [
    { date: "2026-11-01", start_time: "07:00", sport: "bike", duration_min: 90 },
    { date: "2026-11-01", start_time: "07:03", sport: "ride", duration_min: 91 },
  ] }, { asOf: "2026-11-02" });
  assert.equal(p.activities.length, 1);
  assert.equal(p.quality.duplicatesRemoved.length, 1);
});

test("CSV parser: semicolons, quotes, BOM, grouping", () => {
  const { header, rows } = parseCSV('﻿athlete;date;sport;duration_min\n"Doe, J";2026-11-01;run;45\n;2026-11-02;run;30\n');
  assert.equal(detectKind(header), "activities");
  assert.equal(rows[0].athlete, "Doe, J");
  const { groups, errors } = groupByAthlete(rows, "activities");
  assert.equal(Object.keys(groups).length, 1);
  assert.equal(errors.length, 1);
});

test("analysis is stable on other dates (no crashes, sensible statuses)", () => {
  for (const d of ["2026-01-05", "2026-06-30", "2026-12-31", "2027-03-14"]) {
    const res = analyzeAll(buildDemoDataset(d), d);
    assert.equal(res.length, 8);
    assert.ok(res.filter((r) => r.status === "attention").length <= 5, d);
  }
});
