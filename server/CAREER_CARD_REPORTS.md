# Career Card Scoring Service

This document covers the cached Gemini scoring workflow that now lives entirely inside the Express
API and stores its output in Neon. Recruiters get instant access to the cached results, and the
simulator never relies on Supabase anymore.

## Environment variables

Configure these in the API process (e.g. `.env` inside `server/`):

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Standard Neon/Postgres connection string. |
| `GEMINI_API_KEY` | ✅ | Service account key used for Google’s Gemini API. Never expose it to the browser. |
| `GEMINI_MODEL` | optional | Overrides the default `gemini-2.0-flash-exp` model without code changes. |
| `HONOR_LOCK_BASE_URL` | optional | Used to sign selfie/ID URLs in the simulator identity module. |
| `CANDIDATE_NAMESPACE_UUID` | optional | Namespace used when deterministically mapping numeric application IDs to UUIDs. Defaults to `4d9158ab-4720-4f53-9ce0-b4c6b0c8f0b2`. |

## API surface

| Method & Path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/career-card-reports` | Public (rate-limited) | Ensures a report exists for `candidate_id`. Reuses cached Neon data when the uploaded career card hash hasn’t changed; otherwise re-runs Gemini and upserts the new payload. Request body `{ candidate_id: string, forceRefresh?: boolean }`. |
| `GET /api/career-card-reports/:candidateId` | Recruiter JWT required | Returns the cached Neon record only. Used by `ApplicantReportPage` so the dashboard never talks to Gemini directly. |

`candidate_id` accepts either the UUID that backs `public.candidates.id` or the legacy numeric
application ID; the server deterministically converts numeric IDs into a UUID namespace so the Neon
table can still enforce uniqueness.

## Neon schema

Run the following SQL (or apply `server/migrations/20250224_add_career_card_reports.sql`):

```sql
create extension if not exists pgcrypto;

create table if not exists public.career_card_reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique,
  overall_score numeric,
  category_scores jsonb not null default '{}'::jsonb,
  strengths text[] not null default '{}'::text[],
  improvements text[] not null default '{}'::text[],
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

## Career card ingestion

- If the ATS application already populates `applications.career_card` with structured JSON, that blob
  is used verbatim.
- Otherwise we read the latest uploaded `career_card` file:
  * `.json` uploads are parsed directly.
  * `.pdf` uploads are processed server-side. We extract text when possible and, regardless of
    extraction success, attach the PDF bytes (inline base64) so Gemini still receives the original
    document.
- If no structured or extractable data is available, the backend responds with
  `career_card_missing` so the UI can prompt for a retry/re-upload.

## Data stored in `career_card_reports`

| Column | Notes |
| --- | --- |
| `overall_score` | 0–100 overall alignment. |
| `category_scores` | JSON blob keyed by `technicalSkills`, `experience`, `culturalFit`, `projectAlignment`, each with `{ score, feedback }`. |
| `strengths` / `improvements` | Ordered string arrays coming from Gemini’s tool call payload. |
| `overall_feedback` | Summary paragraph shown in the dashboard. |
| `raw_report` | Full Gemini payload + metadata (card hash, job/org identifiers, etc.) for audit + analytics. |

Before each Gemini call we hash the concatenation of `{ careerCardData, companyDescription,
roleDescription }`. If the hash matches the cached `raw_report.metadata.card_hash`, we reuse the
existing record.

## Frontend wiring

* `ApplyPage.jsx` calls `POST /api/career-card-reports` immediately after a successful submit. The
  optimistic module displays prep status inside the confirmation screen and exposes a retry button
  (which simply re-runs the POST with `forceRefresh: true`).
* `ApplicantReportPage.jsx` fetches only the cached report via the secured `GET` endpoint and
  renders the “Career Card Scoring” block right after the AI Simulation Evaluation section.

Because the scoring payload is cached in Neon, Gemini only runs once per unique career card (or
again when the JSON payload truly changes). Recruiters always see the cached data and never need
Gemini credentials in the browser.
