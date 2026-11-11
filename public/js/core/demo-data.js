// SYNTHETISCHE DEMODATA – geen echte personen, geen echte gezondheidsgegevens.
// Alles wordt deterministisch gegenereerd (zelfde datum = zelfde data), zodat
// grafieken, signalen en rapporten reproduceerbaar zijn.
//
// Ieder demoprofiel heeft een "scenario" dat de laatste weken bewust een patroon
// toevoegt (bijv. volumestijging of dalende HRV). Zo is te zien hoe de agents
// daarop reageren. De agents kennen dit scenario NIET; ze zien alleen de ruwe data.

import { addDays, rng, gauss, clamp, round } from "./util.js";

export const HISTORY_DAYS = 84; // 12 weken

export const DEMO_ATHLETES = [
  {
    id: "ath-01", name: "Noor Hendriks", sport: "triathlon", ageGroup: "30–34",
    goal: "Ironman 70.3 – sub 5:15", goalEventInDays: 68, plannedPerWeek: 9, baseHours: 10,
    ftp: 245, thresholdPaceSec: 262, swimPaceSec100: 108, hrRest: 48, hrMax: 186,
    hasRecovery: true, hrvBase: 64, scenario: "volume_spike",
  },
  {
    id: "ath-02", name: "Daan Verbeek", sport: "triathlon", ageGroup: "40–44",
    goal: "Olympic distance – sub 2:20", goalEventInDays: 40, plannedPerWeek: 7, baseHours: 8,
    ftp: 270, thresholdPaceSec: 255, swimPaceSec100: 112, hrRest: 52, hrMax: 178,
    hasRecovery: true, hrvBase: 52, scenario: "fatigue_rising",
  },
  {
    id: "ath-03", name: "Mila Jansen", sport: "triathlon", ageGroup: "25–29",
    goal: "Full Ironman – first finish", goalEventInDays: 180, plannedPerWeek: 10, baseHours: 12,
    ftp: 228, thresholdPaceSec: 285, swimPaceSec100: 104, hrRest: 50, hrMax: 192,
    hasRecovery: true, hrvBase: 71, scenario: "duplicate_upload",
  },
  {
    id: "ath-04", name: "Ruben Koster", sport: "cycling", ageGroup: "35–39",
    goal: "Gran fondo 160 km", goalEventInDays: 95, plannedPerWeek: 6, baseHours: 9,
    ftp: 292, hrRest: 46, hrMax: 184, hasRecovery: true, hrvBase: 68, scenario: "hrv_drop",
  },
  {
    id: "ath-05", name: "Femke Smit", sport: "cycling", ageGroup: "25–29",
    goal: "Raise FTP to 260 W", goalEventInDays: null, plannedPerWeek: 5, baseHours: 7,
    ftp: 238, hrRest: 49, hrMax: 190, hasRecovery: true, hrvBase: 74, scenario: "improving",
  },
  {
    id: "ath-06", name: "Joris Bos", sport: "cycling", ageGroup: "50–54",
    goal: "Stage race fitness (4 days)", goalEventInDays: 120, plannedPerWeek: 6, baseHours: 10,
    ftp: 265, hrRest: 51, hrMax: 172, hasRecovery: false, scenario: "stable",
  },
  {
    id: "ath-07", name: "Lotte Mulder", sport: "running", ageGroup: "30–34",
    goal: "Marathon – sub 3:30", goalEventInDays: 54, plannedPerWeek: 5, baseHours: 6,
    thresholdPaceSec: 268, hrRest: 47, hrMax: 189, hasRecovery: true, hrvBase: 60, scenario: "consistency_drop",
  },
  {
    id: "ath-08", name: "Sem de Wit", sport: "running", ageGroup: "20–24",
    goal: "10 km – sub 38:00", goalEventInDays: 33, plannedPerWeek: 6, baseHours: 5,
    thresholdPaceSec: 232, hrRest: 44, hrMax: 198, hasRecovery: true, hrvBase: 82, scenario: "performance_dip",
  },
];

// Weekpatroon: welke dag (0 = maandag) welk soort sessie heeft.
const PATTERNS = {
  triathlon: [
    ["swim", "easy"], ["run", "interval"], ["bike", "tempo"], ["swim", "tempo"],
    ["run", "easy"], ["bike", "long"], ["run", "long"], ["bike", "easy"], ["swim", "easy"], ["run", "easy"],
  ],
  cycling: [["bike", "easy"], ["bike", "interval"], ["bike", "easy"], ["bike", "tempo"], ["bike", "long"], ["bike", "easy"], ["bike", "interval"]],
  running: [["run", "easy"], ["run", "interval"], ["run", "easy"], ["run", "tempo"], ["run", "long"], ["run", "easy"], ["run", "easy"]],
};
// Dagen van de week waarop sessies vallen, afhankelijk van aantal sessies.
const DAY_SLOTS = {
  5: [0, 1, 3, 5, 6], 6: [0, 1, 2, 3, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
  9: [0, 1, 1, 2, 3, 4, 5, 6, 6], 10: [0, 0, 1, 2, 3, 3, 4, 5, 6, 6],
};
const IF_RANGE = { easy: [0.62, 0.7], tempo: [0.8, 0.87], interval: [0.88, 0.97], long: [0.66, 0.73] };
const DUR_WEIGHT = { easy: 0.8, tempo: 1, interval: 0.9, long: 2.1 };

/**
 * Genereert ruwe data voor één sporter tot en met `asOf`.
 * Vorm is bewust "ruw" (zoals uit een export): de Data Agent normaliseert het.
 */
export function generateAthleteData(a, asOf) {
  const rand = rng(`${a.id}:${asOf}`);
  const start = addDays(asOf, -(HISTORY_DAYS - 1));
  const activities = [];
  const recovery = [];
  const slots = DAY_SLOTS[a.plannedPerWeek];
  const pattern = PATTERNS[a.sport];
  const firstMonday = (() => {
    const d = new Date(start + "T00:00:00Z");
    return addDays(start, -((d.getUTCDay() + 6) % 7));
  })();

  for (let w = 0; ; w++) {
    const monday = addDays(firstMonday, w * 7);
    if (monday > asOf) break;
    const daysFromEnd = (iso) => Math.round((Date.parse(asOf) - Date.parse(iso)) / 86400000);
    // Periodisering: 3 opbouwweken, 1 herstelweek.
    const block = [0.96, 1, 1.04, 0.86][w % 4];
    let weekHours = a.baseHours * block * (1 + gauss(rand, 0, 0.04));
    const weightTotal = slots.reduce((s, _, i) => s + DUR_WEIGHT[pattern[i % pattern.length][1]], 0);

    slots.forEach((dow, i) => {
      const date = addDays(monday, dow);
      if (date < start || date > asOf) return;
      const back = daysFromEnd(date);
      const [type, kind] = pattern[i % pattern.length];
      let hours = (weekHours * DUR_WEIGHT[kind]) / weightTotal;
      let ifv = IF_RANGE[kind][0] + rand() * (IF_RANGE[kind][1] - IF_RANGE[kind][0]);

      // ---- Scenario's (alleen recente weken) ----
      if (a.scenario === "volume_spike" && back <= 6) hours = ((a.baseHours * DUR_WEIGHT[kind]) / weightTotal) * 1.8;
      if (a.scenario === "consistency_drop" && back <= 13 && rand() < 0.5) return; // gemiste sessie
      if (rand() < 0.04) return; // af en toe een normale gemiste sessie
      if (date === asOf && rand() < 0.5) return; // vandaag nog niet alles gedaan

      const durMin = round(clamp(hours * 60 * (1 + gauss(rand, 0, 0.08)), 20, 420));
      const perf = performanceFactor(a, back);
      const hrDrift = a.scenario === "performance_dip" && back <= 20 ? 5 : 0;
      const avgHr = round(a.hrRest + (a.hrMax - a.hrRest) * (0.45 + 0.55 * (ifv - 0.6) / 0.4) + gauss(rand, 0, 2) + hrDrift);
      const fatigueRpe = a.scenario === "fatigue_rising" && back <= 10 ? (10 - back) * 0.17 : 0;
      const rpe = clamp(round(1 + ifv * 8 + gauss(rand, 0, 0.5) + fatigueRpe), 1, 10);
      const tss = round((durMin / 60) * ifv * ifv * 100);

      const act = {
        external_id: `${a.id}-${date}-${i}`,
        date, start_time: `${String(6 + ((i * 5) % 13)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
        sport: type, session_type: kind, duration_min: durMin, avg_hr: avgHr, rpe, tss,
      };
      if (type === "bike") {
        act.avg_power = round(a.ftp * ifv * perf);
        act.distance_km = round((durMin / 60) * (24 + ifv * 12), 1);
      } else if (type === "run") {
        const pace = (a.thresholdPaceSec / (0.75 + ifv * 0.3)) / perf;
        act.avg_pace_sec_km = round(pace);
        act.distance_km = round((durMin * 60) / pace, 1);
      } else {
        const pace100 = a.swimPaceSec100 / (0.85 + ifv * 0.15);
        act.distance_km = round((durMin * 60) / pace100 / 10, 2);
        act.avg_pace_sec_100m = round(pace100);
      }
      activities.push(act);

    });
  }

  // Dubbele upload (zelfde sessie twee keer, bijv. horloge én app): laatste fietsrit.
  if (a.scenario === "duplicate_upload") {
    const last = [...activities].reverse().find((x) => x.sport === "bike");
    if (last) activities.push({ ...last, external_id: last.external_id + "-dup", start_time: last.start_time.slice(0, 3) + String(Number(last.start_time.slice(3)) + 2).padStart(2, "0"), duration_min: last.duration_min + 1 });
  }

  if (a.hasRecovery) {
    for (let d = 0; d < HISTORY_DAYS; d++) {
      const date = addDays(start, d);
      const back = HISTORY_DAYS - 1 - d;
      if (rand() < 0.07 && back > 1) continue; // ontbrekende meting (horloge niet gedragen)
      let hrv = gauss(rand, a.hrvBase, a.hrvBase * 0.07);
      let rhr = gauss(rand, a.hrRest, 1.4);
      let sleepScore = gauss(rand, 79, 6);
      let sleepH = gauss(rand, 7.4, 0.5);
      let fatigue = gauss(rand, 3, 0.8);
      if (a.scenario === "hrv_drop" && back <= 5) {
        hrv *= 0.76; rhr += 5; sleepScore -= 11; sleepH -= 0.8; fatigue += 2.2;
      }
      if (a.scenario === "fatigue_rising" && back <= 10) fatigue += (10 - back) * 0.35;
      if (a.scenario === "volume_spike" && back <= 6) fatigue += 1;
      recovery.push({
        date,
        hrv_ms: round(clamp(hrv, 15, 160)),
        resting_hr: round(rhr),
        sleep_score: round(clamp(sleepScore, 20, 100)),
        sleep_hours: round(clamp(sleepH, 3, 11), 1),
        fatigue: round(clamp(fatigue, 1, 10)),
      });
    }
  }
  return { activities, recovery };
}

// Prestatie-ontwikkeling die in vermogen/tempo doorwerkt.
function performanceFactor(a, back) {
  if (a.scenario === "improving") return 1 + 0.1 * (1 - back / HISTORY_DAYS);
  return 1 + 0.015 * (1 - back / HISTORY_DAYS);
}

/** Volledige demodataset: profielen + ruwe data. */
export function buildDemoDataset(asOf) {
  return DEMO_ATHLETES.map((a) => {
    const { scenario, hrvBase, ...profile } = a; // scenario blijft intern
    return { profile: { ...profile, source: "demo" }, raw: generateAthleteData(a, asOf) };
  });
}
