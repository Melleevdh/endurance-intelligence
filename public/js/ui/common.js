// Gedeelde UI-hulpjes.
import { icon, sportIcon } from "./icons.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const initials = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).filter((c) => /[A-Za-z]/.test(c)).slice(0, 2).join("").toUpperCase();

export const SPORT_LABEL = { triathlon: "Triathlon", cycling: "Cycling", running: "Running", bike: "Bike", run: "Run", swim: "Swim" };

export const STATUS_LABEL = { attention: "Needs attention", watch: "Keep an eye on", ok: "On track" };
export const SEV_LABEL = { high: "High", medium: "Medium", positive: "Positive" };

export function statusPill(status) {
  return `<span class="pill ${status}"><span class="dot ${status}"></span>${STATUS_LABEL[status]}</span>`;
}

export function sportTag(sport) {
  return `<span class="sport-tag">${sportIcon(sport)}${SPORT_LABEL[sport] || esc(sport)}</span>`;
}

export function avatar(name, cls = "") {
  return `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(name))}</span>`;
}

/** Signaalkaart met de 5 vaste vragen. Objectieve meting en interpretatie zijn visueel gescheiden. */
export function signalCard(s, athleteName, { open = false, showAthlete = true } = {}) {
  const sevPill = s.positive ? `<span class="pill positive">Positive</span>` : `<span class="pill ${s.severity}">${SEV_LABEL[s.severity]}</span>`;
  return `
  <div class="signal ${open ? "open" : ""}" data-signal="${esc(s.id)}">
    <div class="signal-head" role="button" tabindex="0" aria-expanded="${open}">
      ${showAthlete ? avatarFor(athleteName) : ""}
      <div style="min-width:0">
        <div class="title">${showAthlete ? `${esc(athleteName)} · ` : ""}${esc(s.title)}</div>
        <div class="meta num">${esc(s.whatChanged)}</div>
      </div>
      ${sevPill}
      <span class="chev">${icon("chevron")}</span>
    </div>
    <div class="signal-body">
      <div class="sig-grid">
        <div class="sig-block measured">
          <h4>1 · Data used <span class="tag-obj">MEASURED</span></h4>
          <ul>${s.dataUsed.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        </div>
        <div class="sig-block measured">
          <h4>2 · What changed <span class="tag-obj">MEASURED</span></h4>
          <p class="num">${esc(s.whatChanged)}</p>
        </div>
        <div class="sig-block interp">
          <h4>3 · Why it stands out <span class="tag-int">INTERPRETATION</span></h4>
          <p>${esc(s.whyNotable)}</p>
        </div>
        <div class="sig-block interp">
          <h4>4 · Question for the athlete <span class="tag-int">SUGGESTION</span></h4>
          <p>“${esc(s.question)}”</p>
        </div>
        <div class="sig-block interp" style="grid-column:1/-1">
          <h4>5 · Possible next step <span class="tag-int">SUGGESTION</span></h4>
          <p>${esc(s.nextStep)}</p>
        </div>
      </div>
      <p class="small faint" style="margin:10px 0 0">Rule-based signal from the ${esc(s.agent)} agent. Not a medical assessment – the coach decides.</p>
    </div>
  </div>`;
}

function avatarFor(name) {
  return avatar(name);
}

export function bindSignals(root) {
  root.querySelectorAll(".signal-head").forEach((h) => {
    const toggle = () => {
      const card = h.closest(".signal");
      card.classList.toggle("open");
      h.setAttribute("aria-expanded", card.classList.contains("open"));
    };
    h.addEventListener("click", toggle);
    h.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle()));
  });
}

// ---------- Server-API ----------

export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* geen JSON */ }
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.status = r.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/** Inlog-dialoog voor AI-functies (beschermt de API-sleutel tegen misbruik). Resolve't true bij succes. */
export function requireLogin() {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="lgT">
      <h2 id="lgT">Sign in to use AI features</h2>
      <p class="muted small" style="margin:0">AI calls cost money, so they are protected with the app password (set as <code>APP_PASSWORD</code> in Vercel).</p>
      <form><input class="input" type="password" name="pw" placeholder="App password" autocomplete="current-password" required>
      <div class="err" hidden></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" data-x>Cancel</button><button class="btn primary">Sign in</button></div></form></div>`;
    document.body.appendChild(bg);
    const form = bg.querySelector("form");
    const errEl = bg.querySelector(".err");
    form.pw.focus();
    const close = (ok) => { bg.remove(); resolve(ok); };
    bg.querySelector("[data-x]").onclick = () => close(false);
    bg.addEventListener("click", (e) => e.target === bg && close(false));
    form.onsubmit = async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      try {
        await api("/api/login", { method: "POST", body: { password: form.pw.value } });
        close(true);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    };
  });
}

/** Roept een AI-endpoint aan; vraagt zo nodig eerst om in te loggen. */
export async function callAI(path, body) {
  try {
    return await api(path, { method: "POST", body });
  } catch (e) {
    if (e.status === 401 && (await requireLogin())) return api(path, { method: "POST", body });
    throw e;
  }
}

/** Minimale, veilige markdown (alinea's, opsommingen, vet). */
export function md(text) {
  const lines = esc(text).split("\n");
  let html = "", inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (/^\s*[-•*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.replace(/^\s*[-•*]\s+/, "")}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim()) html += `<p>${line.replace(/^#+\s*/, "")}</p>`;
    }
  }
  return html + (inList ? "</ul>" : "");
}
