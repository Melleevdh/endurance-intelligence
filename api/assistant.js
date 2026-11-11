// POST /api/assistant – AI Coach Assistant.
// Ontvangt ALLEEN gepseudonimiseerde, berekende kengetallen (A1, A2, …) uit de browser.
// Slaat niets op. De AI interpreteert; alle getallen zijn vooraf door code berekend.
import { handler, body, HttpError, requireLogin, rateLimit, claude, boundedJSON, assertNoContactData } from "./_lib.js";

const SYSTEM = `You are the analysis assistant inside Endurance Intelligence, a tool for endurance coaches (triathlon, cycling, running).
You answer the coach's questions about their athletes using ONLY the JSON data provided in <data>.

Rules:
- Athletes are identified by codes (A1, A2, …). Always refer to them by their code exactly as written (e.g. "A4"); the app replaces codes with names.
- Use only numbers and facts present in the data. Never invent values, sessions, dates or causes.
- If the data does not contain what is needed to answer, say clearly which information is missing (e.g. "No recovery data is available for A6").
- Clearly separate what was measured from your interpretation. Use cautious language ("may", "could be worth asking").
- No medical diagnoses, no injury or illness claims. You support the coach; the coach decides.
- When you mention a number, mention what it is compared with (e.g. "7-day load 512 vs. 4-week average 340").
- "loadRatio" = last 7 days load ÷ average weekly load of the 4 weeks before. "form" = fitness − fatigue. Recovery z-values compare the last 7 days with the athlete's own previous 4 weeks.
- Be concise: short paragraphs or bullet points, max ~220 words. Write in the language of the question.`;

export default handler({
  async POST(req) {
    requireLogin(req);
    await rateLimit("ai:assistant", 60, 3600); // max 60 vragen per uur (kostenbeheersing)
    const b = body(req);
    const question = String(b.question || "").trim().slice(0, 600);
    if (!question) throw new HttpError(400, "Please enter a question.");
    const data = boundedJSON(b.context, 60000);
    const history = (Array.isArray(b.history) ? b.history : []).slice(-6)
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.text || "").slice(0, 2000) }))
      .filter((m) => m.content);
    while (history.length && history[0].role !== "user") history.shift();
    assertNoContactData(question + data);

    const messages = [
      ...history,
      { role: "user", content: `<data>\n${data}\n</data>\n\nCoach's question: ${question}` },
    ];
    return claude({ system: SYSTEM, messages, maxTokens: 700 });
  },
});
