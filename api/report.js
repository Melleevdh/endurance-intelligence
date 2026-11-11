// POST /api/report – laat de AI een kort weekrapport VERWOORDEN op basis van berekende feiten.
// De AI voegt geen nieuwe feiten toe. Gepseudonimiseerd; niets wordt opgeslagen.
import { handler, body, requireLogin, rateLimit, claude, boundedJSON, assertNoContactData } from "./_lib.js";

const SYSTEM = `You write short weekly summaries for an endurance coach in Endurance Intelligence.
You receive computed facts for ONE athlete (code only) in <facts>. Write for the coach, in English.

Structure (plain text, no headings, 120–180 words):
1. One or two sentences on what the athlete did this week and how load compared with the weeks before.
2. Notable trends and positive developments.
3. Points of attention, phrased cautiously, each tied to the measured number.
4. One or two concrete topics the coach could raise.

Rules: use only the facts given; if something (e.g. recovery data) is missing, say so in one short sentence.
No medical diagnoses. Refer to the athlete as "the athlete". Do not invent numbers.`;

export default handler({
  async POST(req) {
    requireLogin(req);
    await rateLimit("ai:report", 40, 3600);
    const b = body(req);
    const facts = boundedJSON({ athlete: b.athlete, report: b.report }, 20000);
    assertNoContactData(facts);
    return claude({ system: SYSTEM, messages: [{ role: "user", content: `<facts>\n${facts}\n</facts>` }], maxTokens: 500 });
  },
});
