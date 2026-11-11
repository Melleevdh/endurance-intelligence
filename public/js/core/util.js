// Kleine gedeelde hulpfuncties. Draaien zowel in de browser als in Vercel-functies.

export const DAY_MS = 86400000;

/** Datum (YYYY-MM-DD, UTC) n dagen voor/na een andere datum. */
export function addDays(iso, n) {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
}

/** Maandag van de week waarin de datum valt (ISO-week). */
export function weekStart(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = maandag
  return addDays(iso, -dow);
}

/** Deterministische random-generator (mulberry32), zodat demodata stabiel is. */
export function rng(seed) {
  let a = typeof seed === "string" ? hash(seed) : seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Normaal verdeelde ruis (Box-Muller). */
export function gauss(rand, mean = 0, sd = 1) {
  const u = 1 - rand();
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const sum = (arr) => arr.reduce((s, x) => s + x, 0);
export const mean = (arr) => (arr.length ? sum(arr) / arr.length : null);
export function sd(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map((x) => (x - m) ** 2)) / (arr.length - 1));
}
export const round = (x, d = 0) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Procentuele verandering, of null als de basis ontbreekt. */
export function pctChange(now, base) {
  if (now == null || base == null || base === 0) return null;
  return ((now - base) / Math.abs(base)) * 100;
}

/** Lineaire regressie-helling (per stap) over een reeks getallen. */
export function slope(values) {
  const pts = values.map((y, x) => [x, y]).filter(([, y]) => y != null);
  if (pts.length < 3) return null;
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  const num = sum(pts.map(([x, y]) => (x - mx) * (y - my)));
  const den = sum(pts.map(([x]) => (x - mx) ** 2));
  return den === 0 ? 0 : num / den;
}

export function fmtDuration(min) {
  if (min == null) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function fmtPace(secPerKm) {
  if (!secPerKm) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function fmtDate(iso, opts = { day: "numeric", month: "short" }) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}
