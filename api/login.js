// POST /api/login  { password }  → zet sessiecookie voor AI-functies.
// DELETE /api/login              → uitloggen.
import { handler, body, HttpError, authConfigured, checkAppPassword, setSession, clearSession, rateLimit } from "./_lib.js";

export default handler({
  async POST(req, res) {
    if (!authConfigured()) throw new HttpError(503, "Login is not configured yet (APP_PASSWORD and SESSION_SECRET are missing in Vercel).");
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    await rateLimit(`login:${ip}`, 10, 900); // max 10 pogingen per kwartier per IP
    const { password } = body(req);
    if (!password || !checkAppPassword(password)) throw new HttpError(401, "Incorrect password.");
    setSession(res);
    return { ok: true };
  },
  async DELETE(req, res) {
    clearSession(res);
    return { ok: true };
  },
});
