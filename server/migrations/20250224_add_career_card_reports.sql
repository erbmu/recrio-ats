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
