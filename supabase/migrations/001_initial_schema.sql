-- ═══════════════════════════════════════════════════════════
-- NUDGET — COMPLETE DATABASE SCHEMA
-- Run this entire file once in Supabase SQL Editor
-- Project: nudget
-- ═══════════════════════════════════════════════════════════

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- 1. USERS (extends Supabase auth.users)
-- ─────────────────────────────────────────────
create table public.users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  name                 text not null default '',
  theme                text not null default '',
  scratch_rollover     boolean not null default true,
  nudge_threshold_days integer not null default 3,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Auto-create a users row when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- 2. AREAS
-- ─────────────────────────────────────────────
create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  name       text not null,
  color      text not null default 'var(--p1)',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. PROJECTS
-- ─────────────────────────────────────────────
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  area_id    uuid references public.areas(id) on delete set null,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 4. TASKS
-- ─────────────────────────────────────────────
create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  title             text not null,
  gtd_state         text not null default 'inbox'
                    check (gtd_state in ('inbox','next','waiting','someday','reference','done')),
  energy            text not null default 'med'
                    check (energy in ('low','med','high')),
  due_date          date,
  recurrence        text,           -- iCal RRULE string e.g. 'FREQ=DAILY'
  freq_days         integer,        -- soft frequency target in days
  last_completed_at timestamptz,
  progress_type     text not null default 'binary'
                    check (progress_type in ('binary','percent','numeric')),
  progress_val      integer not null default 0,
  progress_target   integer,
  progress_unit     text,
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 5. TASK ↔ PROJECT (many-to-many junction)
-- ─────────────────────────────────────────────
create table public.task_projects (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key (task_id, project_id)
);

-- ─────────────────────────────────────────────
-- 6. SUBTASKS
-- ─────────────────────────────────────────────
create table public.subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  sort_order integer not null default 0
);

-- ─────────────────────────────────────────────
-- 7. HABITS
-- ─────────────────────────────────────────────
create table public.habits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  name             text not null,
  icon_file        text,            -- filename in assets/icons/habits/
  recurrence       text not null default 'FREQ=DAILY',
  progress_target  integer,
  progress_unit    text,
  streak           integer not null default 0,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 8. HABIT LOGS
-- Each row = one day's check-in for one habit
-- value: 1 for binary done, or the numeric value (e.g. 6 glasses)
-- ─────────────────────────────────────────────
create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references public.habits(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  log_date   date not null,
  value      integer not null default 1,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)   -- one log per habit per day
);

-- ─────────────────────────────────────────────
-- 9. EVENTS
-- ─────────────────────────────────────────────
create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  name                text not null,
  event_date          date not null,
  type                text not null default 'other'
                      check (type in ('birthday','anniversary','deadline','reminder','other')),
  reminder_offset_days integer not null default 7,
  notes               text not null default '',
  created_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 10. SCRATCH ITEMS
-- ─────────────────────────────────────────────
create table public.scratch_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  item_date  date not null default current_date,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 11. SCRATCH LOGS (EOD collapse records)
-- ─────────────────────────────────────────────
create table public.scratch_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  log_date   date not null,
  done_count integer not null default 0,
  unique (user_id, log_date)
);

-- ─────────────────────────────────────────────
-- 12. NUDGES (frequency task nudge lifecycle)
-- ─────────────────────────────────────────────
create table public.nudges (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  status       text not null default 'triggered'
               check (status in ('triggered','seen','escalated','dismissed')),
  triggered_at timestamptz not null default now(),
  seen_at      timestamptz,
  escalated_at timestamptz
);

-- ─────────────────────────────────────────────
-- 13. COMPLETION HISTORY (daily task done roll-up)
-- ─────────────────────────────────────────────
create table public.completion_history (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.users(id) on delete cascade,
  log_date date not null,
  count    integer not null default 1,
  unique (user_id, log_date)
);

-- ─────────────────────────────────────────────
-- 14. SYNC QUEUE (offline mutations that need flushing)
-- This table is client-side only (IndexedDB).
-- Listed here for documentation — not created in Supabase.
-- Schema: { id, table, operation, payload, created_at, retries }
-- ─────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════
-- INDEXES (performance for common query patterns)
-- ═══════════════════════════════════════════════════════════
create index idx_tasks_user_id      on public.tasks(user_id);
create index idx_tasks_gtd_state    on public.tasks(user_id, gtd_state);
create index idx_tasks_due_date     on public.tasks(user_id, due_date);
create index idx_habit_logs_date    on public.habit_logs(habit_id, log_date);
create index idx_events_date        on public.events(user_id, event_date);
create index idx_scratch_items_date on public.scratch_items(user_id, item_date);
create index idx_nudges_status      on public.nudges(user_id, status);


-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Every table is locked to the authenticated user.
-- Users can ONLY see and modify their own rows.
-- ═══════════════════════════════════════════════════════════

-- Enable RLS on every table
alter table public.users             enable row level security;
alter table public.areas             enable row level security;
alter table public.projects          enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_projects     enable row level security;
alter table public.subtasks          enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_logs        enable row level security;
alter table public.events            enable row level security;
alter table public.scratch_items     enable row level security;
alter table public.scratch_logs      enable row level security;
alter table public.nudges            enable row level security;
alter table public.completion_history enable row level security;

-- Helper: current user's id
-- (auth.uid() is the Supabase built-in)

-- users
create policy "users: own row only" on public.users
  for all using (auth.uid() = id);

-- areas
create policy "areas: own rows only" on public.areas
  for all using (auth.uid() = user_id);

-- projects
create policy "projects: own rows only" on public.projects
  for all using (auth.uid() = user_id);

-- tasks
create policy "tasks: own rows only" on public.tasks
  for all using (auth.uid() = user_id);

-- task_projects — join table; check via tasks
create policy "task_projects: own rows only" on public.task_projects
  for all using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

-- subtasks — check via tasks
create policy "subtasks: own rows only" on public.subtasks
  for all using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

-- habits
create policy "habits: own rows only" on public.habits
  for all using (auth.uid() = user_id);

-- habit_logs
create policy "habit_logs: own rows only" on public.habit_logs
  for all using (auth.uid() = user_id);

-- events
create policy "events: own rows only" on public.events
  for all using (auth.uid() = user_id);

-- scratch_items
create policy "scratch_items: own rows only" on public.scratch_items
  for all using (auth.uid() = user_id);

-- scratch_logs
create policy "scratch_logs: own rows only" on public.scratch_logs
  for all using (auth.uid() = user_id);

-- nudges
create policy "nudges: own rows only" on public.nudges
  for all using (auth.uid() = user_id);

-- completion_history
create policy "completion_history: own rows only" on public.completion_history
  for all using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- REALTIME (enable for tables the client subscribes to)
-- ═══════════════════════════════════════════════════════════
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table
    public.tasks,
    public.habits,
    public.habit_logs,
    public.events,
    public.scratch_items,
    public.nudges;
commit;


-- ═══════════════════════════════════════════════════════════
-- UPDATED_AT auto-trigger
-- ═══════════════════════════════════════════════════════════
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

create trigger users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();