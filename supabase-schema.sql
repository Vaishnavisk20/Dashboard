create table if not exists public.dashboard_projects (
  id uuid primary key,
  project_key text not null unique,
  project_name text,
  customer_name text,
  customer_tier text,
  project_status text,
  competency text,
  primary_ic text,
  secondary_ic text,
  ic_lead text,
  station_name text,
  estimated_go_live_date date,
  integration_type text,
  template_name text,
  use_case text,
  comment text,
  is_active boolean not null default true,
  source_file_name text,
  imported_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

alter table public.dashboard_projects add column if not exists project_name text;
alter table public.dashboard_projects add column if not exists customer_name text;
alter table public.dashboard_projects add column if not exists customer_tier text;
alter table public.dashboard_projects add column if not exists project_status text;
alter table public.dashboard_projects add column if not exists competency text;
alter table public.dashboard_projects add column if not exists primary_ic text;
alter table public.dashboard_projects add column if not exists secondary_ic text;
alter table public.dashboard_projects add column if not exists ic_lead text;
alter table public.dashboard_projects add column if not exists station_name text;
alter table public.dashboard_projects add column if not exists estimated_go_live_date date;
alter table public.dashboard_projects add column if not exists integration_type text;
alter table public.dashboard_projects add column if not exists template_name text;
alter table public.dashboard_projects add column if not exists use_case text;
alter table public.dashboard_projects add column if not exists comment text;
alter table public.dashboard_projects add column if not exists is_active boolean not null default true;
alter table public.dashboard_projects add column if not exists source_file_name text;
alter table public.dashboard_projects add column if not exists imported_at timestamptz;
alter table public.dashboard_projects add column if not exists created_at timestamptz;

create index if not exists dashboard_projects_project_key_idx
  on public.dashboard_projects (project_key);

create index if not exists dashboard_projects_customer_name_idx
  on public.dashboard_projects (customer_name);

create index if not exists dashboard_projects_status_idx
  on public.dashboard_projects (project_status);

create index if not exists dashboard_projects_go_live_idx
  on public.dashboard_projects (estimated_go_live_date);

create index if not exists dashboard_projects_data_gin_idx
  on public.dashboard_projects using gin (data);

create table if not exists public.dashboard_imports (
  id uuid primary key,
  status text,
  file_name text,
  mode text,
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  data jsonb not null
);

alter table public.dashboard_imports add column if not exists status text;
alter table public.dashboard_imports add column if not exists file_name text;
alter table public.dashboard_imports add column if not exists mode text;
alter table public.dashboard_imports add column if not exists row_count integer not null default 0;
alter table public.dashboard_imports add column if not exists confirmed_at timestamptz;

create index if not exists dashboard_imports_created_at_idx
  on public.dashboard_imports (created_at);
