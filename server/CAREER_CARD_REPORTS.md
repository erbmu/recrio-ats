# Career Card Scoring Service

This document covers everything that powers the cached Gemini scoring workflow that mirrors
`career-card/supabase/functions/score-career-card`. The flow now lives inside the Express API so it
can be triggered immediately after a candidate submits their application and fetched later inside
the recruiter dashboard.

## Environment variables

Configure these in the API process (e.g. `.env` inside `server/`):

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | ✅ | Service account key used for Google’s Gemini API. Never expose it to the browser. |
| `SUPABASE_URL` | ✅ | Base URL for the shared Supabase project (same one the AI simulations already use). |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key for the same Supabase project. Required for read/write access. |
| `GEMINI_MODEL` | optional | Overrides the default `gemini-1.5-flash-latest` model without code changes. |
| `CANDIDATE_NAMESPACE_UUID` | optional | Namespace used when deterministically mapping numeric application IDs to UUIDs. Defaults to `4d9158ab-4720-4f53-9ce0-b4c6b0c8f0b2`. |

## API surface

| Method & Path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/career-card-reports` | Public (rate-limited) | Ensures a report exists for `candidate_id`. Reuses cached Supabase data when the uploaded career card hash hasn’t changed; otherwise re-runs Gemini and upserts the new payload. Request body `{ candidate_id: string, forceRefresh?: boolean }`. |
| `GET /api/career-card-reports/:candidateId` | Recruiter JWT required | Returns the cached Supabase report only. Used by `ApplicantReportPage` so the dashboard never talks to Gemini directly. |

`candidate_id` accepts either the UUID that backs `public.candidates.id` or the legacy numeric
application ID; the server deterministically converts numeric IDs into a UUID namespace so the
Supabase table can still enforce uniqueness + foreign keys.

## Supabase schema

Run the following SQL inside the **Career-Card** Supabase project. It creates the table, indexes,
and wiring needed to keep Supabase and Neon in sync.

```sql
-- Enable pgcrypto for gen_random_uuid if it is not enabled already
create extension if not exists pgcrypto;

create table if not exists public.career_card_reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique,
  overall_score numeric,
  category_scores jsonb not null default '{}'::jsonb,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  overall_feedback text,
  raw_report jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists career_card_reports_generated_at_idx
  on public.career_card_reports (generated_at desc);

create or replace function public.set_career_card_reports_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_career_card_reports_updated_at on public.career_card_reports;
create trigger trg_career_card_reports_updated_at
before update on public.career_card_reports
for each row execute function public.set_career_card_reports_updated_at();
```

The table lives alongside the existing simulation tables inside the shared Supabase project, so no
additional FDW wiring is necessary. When an environment only has numeric application IDs, the API
deterministically maps every application to a UUID so Supabase uniqueness still holds:

```
uuid = uuidv5(
  namespace = CANDIDATE_NAMESPACE_UUID || "4d9158ab-4720-4f53-9ce0-b4c6b0c8f0b2",
  name      = `application:${application_id}`
)
```

## Career card ingestion

- If the ATS application already populates `applications.career_card` with structured JSON, that blob is used verbatim.
- Otherwise we read the latest uploaded `career_card` file:
  * `.json` uploads are parsed directly.
  * `.pdf` uploads are processed server-side (no external dependencies) by extracting readable text from the PDF streams. The text is wrapped in a JSON payload (`{ format: "pdf_extracted_text", text: "…" }`) so hashing/caching still behaves consistently.
- If no structured or extractable data is available, the backend responds with `career_card_missing` so the UI can prompt for a retry/re-upload.

## Data stored in `career_card_reports`

| Column | Notes |
| --- | --- |
| `overall_score` | 0–100 overall alignment. |
| `category_scores` | JSON blob keyed by `technicalSkills`, `experience`, `culturalFit`, `projectAlignment`, each with `{ score, feedback }`. |
| `strengths` / `improvements` | Ordered string arrays coming from Gemini’s tool call payload. |
| `overall_feedback` | Summary paragraph shown in the dashboard. |
| `raw_report` | Full Gemini payload + metadata (card hash, job/org identifiers, etc.) for audit + analytics. |

Before each Gemini call we hash the concatenation of `{ careerCardData, companyDescription, roleDescription }`.
If the hash matches the cached Supabase `raw_report.metadata.card_hash`, we reuse the existing record.

## Frontend wiring

* `ApplyPage.jsx` now calls `POST /api/career-card-reports` immediately after a successful submit.
  The optimistic module displays prep status inside the confirmation screen and exposes a retry button
  (which simply re-runs the POST with `forceRefresh: true`).
* `ApplicantReportPage.jsx` fetches only the cached report via the secured `GET` endpoint and renders
  the new “Career Card Scoring” block right after the AI Simulation Evaluation section.

Because the scoring payload is cached in Supabase, Gemini only runs once per unique career card
(or again when the JSON payload truly changes). Recruiters always see the cached data and never
need Gemini credentials in the browser.
