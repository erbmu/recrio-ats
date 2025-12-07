alter table if exists public.jobs
  add column if not exists company_description text;
