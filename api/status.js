// GET /api/status – eerlijke systeemstatus voor de Settings-pagina.
// Toont alleen OF iets is ingesteld en of het bereikbaar is; nooit sleutels of waarden.
import { handler, authConfigured, AI_MODEL } from "./_lib.js";

async function checkSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { configured: false, reachable: null, detail: "Not connected yet – SUPABASE_URL / SUPABASE_ANON_KEY not set. The app runs on demo data." };
  try {
    const ctrl = AbortSignal.timeout(4000);
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: ctrl });
    return r.ok
      ? { configured: true, reachable: true, detail: "Reachable. Schema ready; the app still reads demo data in this version." }
      : { configured: true, reachable: false, detail: `Configured but not healthy (HTTP ${r.status}). A paused free project must be restored in Supabase.` };
  } catch {
    return { configured: true, reachable: false, detail: "Configured but not reachable (paused project or network issue)." };
  }
}

export default handler({
  async GET() {
    return {
      ai: { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: AI_MODEL },
      auth: { configured: authConfigured() },
      database: await checkSupabase(),
    };
  },
});
