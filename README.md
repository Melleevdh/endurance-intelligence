# Endurance Intelligence

**AI-powered performance intelligence for endurance coaches.**
*Understand your athletes better. Make smarter coaching decisions.*

Eerste werkende versie (DEMO). Alle sporters en waarden zijn synthetisch.

## Wat zit erin

| Onderdeel | Status |
|---|---|
| Dashboard (Overview, Athletes, Daily Insights, Weekly Reports, AI Assistant, Settings) | ✅ Werkt |
| 8 synthetische sporters (3 triatlon, 3 wielrennen, 2 hardlopen), 12 weken historie | ✅ Werkt |
| Analyse-agents (Data, Training, Recovery, Performance, Coach) – deterministische code | ✅ Werkt, getest |
| Daily Insights met herleidbare bron, wat/waarom/vraag/vervolgstap | ✅ Werkt |
| Weekrapport per sporter + groep, export naar PDF (via printdialoog) | ✅ Werkt |
| CSV-import (activiteiten + herstel), validatie en ontdubbeling | ✅ Werkt (opslag alleen in de browser) |
| AI Coach Assistant + AI-weeksamenvatting (Claude, gepseudonimiseerd) | ✅ Werkt zodra `ANTHROPIC_API_KEY` + login zijn ingesteld |
| Supabase-schema met per-coach beveiliging (RLS), getest | ✅ Staat in de database |
| App leest/schrijft Supabase + coach-accounts (Supabase Auth) | 🔜 Volgende stap |
| Strava | ⏸ Bewust nog niet gebouwd – eerst schriftelijke bevestiging van Strava nodig (AI-gebruik + coachweergave) |
| Garmin | ⏳ Afhankelijk van goedkeuring (programma gepauzeerd) |
| TrainingPeaks | ⏳ Alleen voor goedgekeurde zakelijke partners |

## Opbouw (zelfde stijl als hyrox-pacer: geen packages, geen buildstap)

```
public/                 Website (HTML/CSS/JS, draait in de browser)
  js/core/              Rekenwerk – draait in browser én op de server
    demo-data.js        Synthetische demodata (deterministisch)
    csv.js              CSV-import
    agents/             data-, training-, recovery-, performance- en coach-agent
  js/views/             De 6 pagina's
  js/ui/                Grafieken (SVG), iconen, gedeelde onderdelen
api/                    Vercel-functies (server)
  assistant.js          AI-assistent
  report.js             AI-weeksamenvatting
  login.js, status.js   Inloggen voor AI-functies, eerlijke systeemstatus
supabase/migrations/    Databaseschema (al toegepast op Supabase)
tests/                  Tests: npm test
scripts/dev-server.js   Lokaal draaien: npm run dev
```

**Principe:** alle getallen en signalen komen uit controleerbare code. De AI krijgt alleen
berekende kengetallen onder codes (A1, A2 …), geen namen, en mag alleen interpreteren en verwoorden.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Naam | Nodig voor | Waar vandaan |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI-assistent en AI-samenvatting | Dezelfde sleutel als in hyrox-pacer, of console.anthropic.com |
| `APP_PASSWORD` | Inloggen voor AI-functies (beschermt tegen kosten door misbruik) | Zelf kiezen, sterk wachtwoord |
| `SESSION_SECRET` | Ondertekenen van de login-cookie | Willekeurige lange tekst (bijv. 40+ tekens) |
| `SUPABASE_URL` | Statuscheck database (en later opslag) | `https://zkjwtesimmaojfydfdpj.supabase.co` |
| `SUPABASE_ANON_KEY` | Idem | Supabase → Project Settings → API (publishable/anon key) |
| `AI_MODEL` (optioneel) | Ander Claude-model | standaard `claude-haiku-5-5` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (optioneel) | Strengere rate limit via je bestaande Upstash Redis | Upstash-integratie in Vercel koppelen aan dit project |

Zonder deze variabelen werkt het dashboard gewoon; alleen de AI-functies zijn dan uit.

## Lokaal draaien

```bash
npm test                 # analysetests
APP_PASSWORD=test SESSION_SECRET=dev npm run dev   # http://localhost:3000
```

## Privacy (AVG)

- Demo: alleen synthetische data. CSV-imports blijven in de browser (localStorage) en zijn te verwijderen.
- AI: alleen gepseudonimiseerde, berekende kengetallen; e-mailadressen/telefoonnummers worden geweigerd; niets wordt opgeslagen.
- Database: Row Level Security per coach; anonieme gebruikers geblokkeerd; integratietokens alleen server-side;
  herstelgegevens (gezondheidsdata) kunnen pas worden opgeslagen als toestemming van de sporter is vastgelegd.
- Let op: het Supabase-project staat in regio Londen (VK). Voor echte sportersdata is een project in de EU (Frankfurt) netter.
