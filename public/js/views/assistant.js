import { esc, callAI, md } from "../ui/common.js";
import { icon } from "../ui/icons.js";
import { aiContext } from "../core/agents/coach-agent.js";

const thread = []; // blijft bewaard zolang de pagina open is

const SUGGESTIONS = [
  "Which athletes showed the biggest change in training load this week?",
  "How is training consistency developing for Lotte Mulder?",
  "Which athletes show a notable change in their recovery measurements?",
  "Summarise the training week of Noor Hendriks.",
  "Which topics could I discuss in my next conversation with Ruben Koster?",
];

export default function assistant(el, { state }) {
  // Pseudonimisering: namen → codes vóór verzending, codes → namen bij weergave.
  const names = state.results.map((r) => r.profile.name);
  const toCodes = (text) => names.reduce((t, n, i) => t.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), `A${i + 1}`)
    .replace(new RegExp(`\\b${n.split(" ")[0]}\\b`, "g"), `A${i + 1}`), text);
  const toNames = (text) => text.replace(/\bA(\d{1,3})\b/g, (m, d) => names[d - 1] ?? m);

  el.innerHTML = `
  <div class="page-head"><div><h1>AI Coach Assistant</h1>
    <p>Ask questions about your athletes. Answers are based only on the computed data; missing information is stated explicitly.</p></div></div>
  <div class="assistant">
    <div class="card">
      <div class="thread" id="thread" aria-live="polite"></div>
      <form class="composer" id="form">
        <textarea class="input" id="q" rows="2" maxlength="600" placeholder="Ask about load, recovery, consistency, or what to discuss…" aria-label="Question"></textarea>
        <button class="btn primary" id="send">${icon("send")} Ask</button>
      </form>
    </div>
    <div>
      <div class="card" style="margin-bottom:16px"><h2 style="margin-bottom:10px">Try asking</h2>
        ${SUGGESTIONS.map((s) => `<button class="suggestion" type="button">${esc(s)}</button>`).join("")}</div>
      <div class="card"><h2 style="margin-bottom:6px">What is sent to the AI?</h2>
        <p class="small muted" style="margin:0">Only computed metrics per athlete under a code (A1–A${names.length}). Names are replaced by codes before sending and put back in your browser. No ages, no raw activity files, no contact details. Nothing is stored by Endurance Intelligence.</p></div>
    </div>
  </div>`;

  const box = el.querySelector("#thread");
  const draw = () => {
    box.innerHTML = thread.length ? thread.map((m) => m.role === "user"
      ? `<div class="msg user">${esc(m.text)}</div>`
      : `<div class="msg ai">${m.pending ? `<span class="typing">Analysing the data…</span>` : m.error ? `<span class="err">${esc(m.error)}</span>` : md(toNames(m.text))}${m.model ? `<div class="msg-meta">AI interpretation · ${esc(m.model)} · based on ${names.length} pseudonymised athlete summaries. Verify before acting.</div>` : ""}</div>`).join("")
      : `<div class="empty">${icon("assistant").replace("<svg", '<svg width="28" height="28"')}<p>Ask a question about your athletes, or pick a suggestion.</p></div>`;
    box.lastElementChild?.scrollIntoView({ block: "nearest" });
  };

  const ask = async (question) => {
    question = question.trim();
    if (!question) return;
    thread.push({ role: "user", text: question });
    const pending = { role: "ai", pending: true };
    thread.push(pending);
    draw();
    el.querySelector("#send").disabled = true;
    try {
      const history = thread.filter((m) => !m.pending && !m.error).slice(-7, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: toCodes(m.text) }));
      const out = await callAI("/api/assistant", { question: toCodes(question), history, context: aiContext(state.results, state.asOf) });
      Object.assign(pending, { pending: false, text: out.text, model: out.model });
    } catch (e) {
      Object.assign(pending, { pending: false, error: e.message });
    }
    el.querySelector("#send").disabled = false;
    draw();
  };

  el.querySelector("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = el.querySelector("#q");
    ask(q.value);
    q.value = "";
  });
  el.querySelector("#q").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.querySelector("#form").requestSubmit(); }
  });
  el.querySelectorAll(".suggestion").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
  draw();
}
