// Endurance Intelligence – hoofdbestand van de webapp (router, staat, layout).
// Pagina's staan in ./views/*. Alle analyse gebeurt in ./core (deterministisch, controleerbaar).

import { buildDemoDataset } from "./core/demo-data.js";
import { analyzeAll, groupOverview } from "./core/agents/coach-agent.js";
import { todayISO, fmtDate } from "./core/util.js";
import { icon, logoMark } from "./ui/icons.js";
import { installTooltips } from "./ui/charts.js";
import { loadImported } from "./views/settings.js";

import overview from "./views/overview.js";
import athletes from "./views/athletes.js";
import athlete from "./views/athlete.js";
import insights from "./views/insights.js";
import reports from "./views/reports.js";
import assistant from "./views/assistant.js";
import settings from "./views/settings.js";

export const state = {
  asOf: todayISO(),
  dataset: [],
  results: [],
  overview: null,
  byId: new Map(),
};

/** (Her)berekent alle analyses: demodata + eventueel geïmporteerde CSV-data. */
export function recompute() {
  const imported = loadImported();
  state.dataset = [...buildDemoDataset(state.asOf), ...imported];
  state.results = analyzeAll(state.dataset, state.asOf);
  state.overview = groupOverview(state.results, state.asOf);
  state.byId = new Map(state.results.map((r) => [r.profile.id, r]));
  const imp = imported.length;
  document.getElementById("dataSource").textContent = `${state.results.length} athletes · demo data${imp ? ` + ${imp} imported` : ""}`;
}

const ROUTES = [
  { path: "overview", label: "Overview", icon: "overview", view: overview },
  { path: "athletes", label: "Athletes", icon: "athletes", view: athletes },
  { path: "insights", label: "Daily Insights", icon: "insights", view: insights, badge: () => state.overview.attention },
  { path: "reports", label: "Weekly Reports", icon: "reports", view: reports },
  { path: "assistant", label: "AI Coach Assistant", icon: "assistant", view: assistant },
  { path: "settings", label: "Settings & Integrations", icon: "settings", view: settings },
];

function renderNav(active) {
  document.getElementById("nav").innerHTML = ROUTES.map((r) => {
    const b = r.badge?.();
    return `<a href="#/${r.path}" class="${r.path === active ? "active" : ""}">${icon(r.icon)}<span>${r.label}</span>${b ? `<span class="count">${b}</span>` : ""}</a>`;
  }).join("");
}

async function route() {
  const [, path = "overview", ...rest] = (location.hash || "#/overview").split("/");
  const view = document.getElementById("view");
  let def = ROUTES.find((r) => r.path === path) || ROUTES[0];
  let render = def.view;
  if (path === "athletes" && rest[0]) render = athlete;
  renderNav(def.path);
  document.getElementById("app").classList.remove("nav-open");
  view.innerHTML = "";
  try {
    await render(view, { params: rest.map(decodeURIComponent), state });
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card empty">Something went wrong while rendering this page.<br><span class="small">${String(e.message || e)}</span></div>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function init() {
  document.getElementById("brand").innerHTML = `${logoMark(32)}<span class="brand-text"><b>Endurance</b><span>Intelligence</span></span>`;
  document.getElementById("menuBtn").innerHTML = icon("menu");
  document.getElementById("menuBtn").onclick = () => document.getElementById("app").classList.toggle("nav-open");
  document.getElementById("today").textContent = fmtDate(state.asOf, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  recompute();
  installTooltips(document.getElementById("view"));
  window.addEventListener("hashchange", route);
  route();
}

init();
