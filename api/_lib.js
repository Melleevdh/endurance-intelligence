// Gedeelde server-helpers (Vercel-functies). Geen externe packages nodig.
// Zelfde opzet als in hyrox-pacer: handler(), body(), ondertekende sessiecookie.
import crypto from "node:crypto";

// ---------- HTTP ----------

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function handler(methods) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const fn = methods[req.method];
    if (!fn) {
      res.status(405).json({ error: "Method not allowed." });
      return;
    }
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: status === 500 ? "Something went wrong on the server." : e.message });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

// ---------- Sessie (één app-wachtwoord voor de demofase) ----------
// Later vervangen door Supabase Auth (per-coach accounts).

const COOKIE = "ei_session";
const SESSION_DAYS = 14;

export function authConfigured() {
  return Boolean(process.env.APP_PASSWORD && process.env.SESSION_SECRET);
}

function sign(payload) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
}

export function checkAppPassword(pw) {
  const a = crypto.createHash("sha256").update(String(pw)).digest();
  const b = crypto.createHash("sha256").update(String(process.env.APP_PASSWORD)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function setSession(res) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = `coach.${exp}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function isLoggedIn(req) {
  if (!authConfigured()) return false;
  const cookies = Object.fromEntries((req.headers.cookie || "").split(";").map((c) => {
    const i = c.indexOf("=");
    return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
  const parts = (cookies[COOKIE] || "").split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return false;
  return Number(parts[1]) > Date.now();
}

export function requireLogin(req) {
  if (!authConfigured()) throw new HttpError(503, "Login is not configured yet (APP_PASSWORD and SESSION_SECRET are missing in Vercel).");
  if (!isLoggedIn(req)) throw new HttpError(401, "Please sign in first.");
}

// ---------- Eenvoudige rate limit ----------
// Gebruikt Upstash Redis als die gekoppeld is (sleutels met voorvoegsel "ei:"),
// anders een geheugenteller per serverinstantie (minder streng, maar beter dan niets).

const memory = new Map();

export async function rateLimit(name, max, windowSec) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `ei:rl:${name}:${bucket}`;
  let n;
  if (url && token) {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSec + 60)]]),
    }).catch(() => null);
    const data = r ? await r.json().catch(() => null) : null;
    n = data?.[0]?.result;
  }
  if (typeof n !== "number") {
    n = (memory.get(key) || 0) + 1;
    memory.set(key, n);
  }
  if (n > max) throw new HttpError(429, "Too many requests. Please try again later.");
}

// ---------- AI (Anthropic Messages API) ----------

export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-5-5";

export async function claude({ system, messages, maxTokens = 900 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, "AI is not configured yet (ANTHROPIC_API_KEY is missing in Vercel).");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Anthropic API", r.status, JSON.stringify(data).slice(0, 500));
    throw new HttpError(502, "The AI service could not answer right now. Please try again shortly.");
  }
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  if (!text) throw new HttpError(502, "The AI returned an empty answer.");
  return { text, model: data.model || AI_MODEL };
}

/** Begrenst grootte van context die de browser meestuurt (voorkomt misbruik en hoge kosten). */
export function boundedJSON(value, maxChars) {
  const s = JSON.stringify(value ?? null);
  if (s.length > maxChars) throw new HttpError(413, "Too much data in this request.");
  return s;
}

/** Laatste controle: geen e-mailadressen of telefoonnummers naar de AI-aanbieder. */
export function assertNoContactData(s) {
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(s) || /(\+|00)\d[\d\s-]{8,}/.test(s)) {
    throw new HttpError(400, "The request seems to contain contact details. Remove them and try again.");
  }
}
