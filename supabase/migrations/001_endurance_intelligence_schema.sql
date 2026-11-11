-- Endurance Intelligence – databaseschema (Supabase / Postgres)
-- Alle tabellen hebben voorvoegsel ei_ zodat ze naast andere projecten in dezelfde database passen.
--
-- Beveiliging:
--  * Iedere rij hoort bij één coach (coach_id = Supabase Auth-gebruiker).
--  * Row Level Security (RLS): de database zelf laat een coach alleen eigen rijen zien/wijzigen.
--  * Samengestelde foreign keys (athlete_id, coach_id) voorkomen dat data aan de sporter
--    van een andere coach gekoppeld wordt.
--  * ei_integration_tokens heeft RLS AAN en GEEN policies: alleen de server (service role)
--    kan erbij. Tokens worden bovendien versleuteld opgeslagen door de app.
--  * ei_audit_log: coaches kunnen alleen toevoegen en eigen regels lezen, niet wijzigen.
--
-- Dataminimalisatie (AVG): geen geboortedatum (alleen leeftijdscategorie), geen adres,
-- geen e-mail van sporters. Herstelgegevens zijn gezondheidsgegevens → consent_at verplicht
-- vóór opslag van echte recovery-data (afgedwongen in ei_recovery_metrics via trigger).

-- ---------- Coaches ----------
create table public.ei_coaches (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.ei_coach_settings (
  coach_id uuid primary key references public.ei_coaches (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- Sporters ----------
create table public.ei_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.ei_coaches (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  sport text not null check (sport in ('triathlon', 'cycling', 'running')),
  age_group text check (age_group is null or char_length(age_group) <= 12),
  hr_max smallint check (hr_max between 120 and 230),
  hr_rest smallint check (hr_rest between 25 and 100),
  ftp_w smallint check (ftp_w between 50 and 600),
  threshold_pace_sec smallint check (threshold_pace_sec between 120 and 600),
  planned_sessions_per_week smallint check (planned_sessions_per_week between 0 and 21),
  consent_health_data_at timestamptz,            -- toestemming sporter voor gezondheidsdata
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, coach_id)
);
create index ei_athletes_coach_idx on public.ei_athletes (coach_id);

create table public.ei_athlete_goals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,
  athlete_id uuid not null,
  description text not null check (char_length(description) between 1 and 200),
  event_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade
);
create index ei_goals_athlete_idx on public.ei_athlete_goals (athlete_id);

-- ---------- Trainingsdata ----------
create table public.ei_training_activities (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,
  athlete_id uuid not null,
  source text not null check (source in ('csv', 'strava', 'garmin', 'trainingpeaks', 'manual', 'demo')),
  external_id text,
  activity_date date not null,
  start_time time,
  sport text not null check (sport in ('swim', 'bike', 'run')),
  session_type text,
  duration_min numeric(6, 1) not null check (duration_min > 0 and duration_min <= 1440),
  distance_km numeric(7, 2) check (distance_km >= 0),
  avg_hr smallint check (avg_hr between 30 and 230),
  avg_power_w smallint check (avg_power_w between 0 and 2500),
  avg_pace_sec_km smallint check (avg_pace_sec_km > 0),
  rpe smallint check (rpe between 1 and 10),
  load numeric(6, 1),
  load_estimated boolean not null default false,  -- true = geschat via duur × RPE
  imported_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade,
  unique (athlete_id, source, external_id)
);
create index ei_activities_athlete_date_idx on public.ei_training_activities (athlete_id, activity_date);

-- Berekende dagwaarden (cache; altijd opnieuw te berekenen uit activiteiten).
create table public.ei_training_metrics (
  coach_id uuid not null,
  athlete_id uuid not null,
  metric_date date not null,
  daily_load numeric(7, 1) not null default 0,
  fitness numeric(6, 1),
  fatigue numeric(6, 1),
  form numeric(6, 1),
  computed_at timestamptz not null default now(),
  primary key (athlete_id, metric_date),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade
);

create table public.ei_recovery_metrics (
  coach_id uuid not null,
  athlete_id uuid not null,
  metric_date date not null,
  source text not null check (source in ('csv', 'strava', 'garmin', 'trainingpeaks', 'manual', 'demo')),
  hrv_ms numeric(5, 1) check (hrv_ms between 5 and 300),
  resting_hr smallint check (resting_hr between 25 and 120),
  sleep_score smallint check (sleep_score between 0 and 100),
  sleep_hours numeric(4, 1) check (sleep_hours between 0 and 16),
  fatigue smallint check (fatigue between 1 and 10),
  primary key (athlete_id, metric_date),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade
);

-- Herstelgegevens (gezondheidsdata) alleen opslaan als de sporter toestemming heeft gegeven,
-- of als het om demodata gaat.
create function public.ei_require_health_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.ei_athletes a
    where a.id = new.athlete_id and (a.consent_health_data_at is not null or a.is_demo)
  ) then
    raise exception 'Health data requires recorded athlete consent (consent_health_data_at).';
  end if;
  return new;
end $$;
create trigger ei_recovery_consent before insert or update on public.ei_recovery_metrics
  for each row execute function public.ei_require_health_consent();

-- ---------- AI-uitvoer ----------
create table public.ei_ai_insights (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,
  athlete_id uuid not null,
  insight_date date not null,
  agent text not null check (agent in ('data', 'training', 'recovery', 'performance', 'coach')),
  kind text not null,
  severity text check (severity in ('high', 'medium', 'positive')),
  measured jsonb not null,           -- objectieve meting (waarde, basislijn, verandering)
  source_refs jsonb not null,        -- welke data is gebruikt (herleidbaarheid)
  interpretation text,               -- regelgebaseerde of AI-tekst
  generated_by text not null default 'rules', -- 'rules' of modelnaam
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade
);
create index ei_insights_coach_date_idx on public.ei_ai_insights (coach_id, insight_date desc);

create table public.ei_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,
  athlete_id uuid not null,
  week_start date not null,
  facts jsonb not null,              -- berekende feiten
  ai_summary text,                   -- optionele AI-verwoording
  ai_model text,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade,
  unique (athlete_id, week_start)
);

-- ---------- Integraties ----------
create table public.ei_integrations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.ei_coaches (id) on delete cascade,
  athlete_id uuid,
  provider text not null check (provider in ('strava', 'garmin', 'trainingpeaks')),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'pending_approval', 'connected', 'error', 'revoked')),
  last_tested_at timestamptz,        -- status 'connected' alleen na een echte test
  last_error text,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.ei_athletes (id, coach_id) on delete cascade
);

-- Alleen server-side toegankelijk (RLS aan, geen policies). Waarden versleuteld door de app.
create table public.ei_integration_tokens (
  integration_id uuid primary key references public.ei_integrations (id) on delete cascade,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  expires_at timestamptz,
  scopes text[],
  updated_at timestamptz not null default now()
);

-- ---------- Logging ----------
create table public.ei_audit_log (
  id bigint generated always as identity primary key,
  coach_id uuid not null references public.ei_coaches (id) on delete cascade,
  action text not null check (char_length(action) <= 60),
  entity text check (char_length(entity) <= 40),
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index ei_audit_coach_idx on public.ei_audit_log (coach_id, created_at desc);

-- ---------- Row Level Security ----------
alter table public.ei_coaches             enable row level security;
alter table public.ei_coach_settings      enable row level security;
alter table public.ei_athletes            enable row level security;
alter table public.ei_athlete_goals       enable row level security;
alter table public.ei_training_activities enable row level security;
alter table public.ei_training_metrics    enable row level security;
alter table public.ei_recovery_metrics    enable row level security;
alter table public.ei_ai_insights         enable row level security;
alter table public.ei_weekly_reports      enable row level security;
alter table public.ei_integrations        enable row level security;
alter table public.ei_integration_tokens  enable row level security;
alter table public.ei_audit_log           enable row level security;

create policy "own profile" on public.ei_coaches
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own settings" on public.ei_coach_settings
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own athletes" on public.ei_athletes
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own goals" on public.ei_athlete_goals
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own activities" on public.ei_training_activities
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own training metrics" on public.ei_training_metrics
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own recovery metrics" on public.ei_recovery_metrics
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own insights" on public.ei_ai_insights
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "own reports" on public.ei_weekly_reports
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
-- Integraties: coach mag status lezen; wijzigen gebeurt alleen server-side na een echte test.
create policy "read own integrations" on public.ei_integrations
  for select to authenticated using (coach_id = (select auth.uid()));
create policy "read own audit log" on public.ei_audit_log
  for select to authenticated using (coach_id = (select auth.uid()));
create policy "append own audit log" on public.ei_audit_log
  for insert to authenticated with check (coach_id = (select auth.uid()));

-- Indexen op foreign keys (prestaties).
create index ei_goals_coach_idx on public.ei_athlete_goals (athlete_id, coach_id);
create index ei_activities_fk_idx on public.ei_training_activities (athlete_id, coach_id);
create index ei_training_metrics_fk_idx on public.ei_training_metrics (athlete_id, coach_id);
create index ei_recovery_fk_idx on public.ei_recovery_metrics (athlete_id, coach_id);
create index ei_insights_fk_idx on public.ei_ai_insights (athlete_id, coach_id);
create index ei_reports_fk_idx on public.ei_weekly_reports (athlete_id, coach_id);
create index ei_integrations_coach_idx on public.ei_integrations (coach_id);
create index ei_integrations_fk_idx on public.ei_integrations (athlete_id, coach_id);

-- De consent-functie hoeft niet via de API aanroepbaar te zijn.
revoke execute on function public.ei_require_health_consent() from public, anon, authenticated;
