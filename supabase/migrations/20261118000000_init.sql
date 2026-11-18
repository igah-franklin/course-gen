-- =============================================================================
-- CourseForge — initial schema
-- Tables, indexes, constraints, RLS policies, storage buckets, helper functions.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Utility: updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync with auth email.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Admin check used by RLS policies.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- -----------------------------------------------------------------------------
-- platform_settings (key/value, admin managed)
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- courses
-- -----------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  subtitle text,
  description text,
  youtube_url text not null,
  youtube_video_id text not null,
  thumbnail_url text,
  original_video_title text,
  channel_name text,
  video_description text,
  video_duration integer,              -- seconds
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  estimated_duration integer,          -- minutes
  learning_objectives jsonb not null default '[]'::jsonb,
  prerequisites jsonb not null default '[]'::jsonb,
  target_audience text,
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'ready', 'needs_review', 'failed')),
  is_public boolean not null default false,
  transcript_source text,
  coverage jsonb not null default '{}'::jsonb,        -- what was actually analyzed
  quality_report jsonb not null default '{}'::jsonb,  -- QA results
  processing_warnings jsonb not null default '[]'::jsonb,
  completion_settings jsonb not null default '{}'::jsonb, -- {require_final_assessment, passing_score}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_user_idx on public.courses (user_id, created_at desc);
create index courses_public_idx on public.courses (is_public, status) where is_public;
create index courses_video_idx on public.courses (youtube_video_id);
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

-- Can the current user view this course?
create or replace function public.can_view_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and (c.user_id = auth.uid()
           or (c.is_public and c.status in ('ready', 'needs_review'))
           or public.is_admin())
  );
$$;

create or replace function public.owns_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- course_modules / lessons / illustrations
-- -----------------------------------------------------------------------------
create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  description text,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position) deferrable initially deferred
);
create index course_modules_course_idx on public.course_modules (course_id, position);
create trigger course_modules_updated_at before update on public.course_modules
  for each row execute function public.set_updated_at();

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  description text,
  content jsonb not null default '{}'::jsonb,
  learning_objectives jsonb not null default '[]'::jsonb,
  original_timestamp_start integer,  -- seconds
  original_timestamp_end integer,    -- seconds
  position integer not null,
  estimated_reading_time integer,    -- minutes
  covered_point_ids text[] not null default '{}',
  quality_flags jsonb not null default '[]'::jsonb,
  generation_status text not null default 'pending'
    check (generation_status in ('pending', 'generated', 'failed')),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position) deferrable initially deferred
);
create index lessons_module_idx on public.lessons (module_id, position);
create index lessons_course_idx on public.lessons (course_id);
create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

create table public.lesson_illustrations (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  image_url text,
  storage_path text,
  image_type text not null, -- diagram | flowchart | steps | comparison | code | concept | video_frame | image
  source text not null default 'ai_diagram'
    check (source in ('ai_diagram', 'ai_image', 'video_frame', 'user_upload')),
  title text not null,
  description text,
  position integer not null default 0,
  timestamp_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index lesson_illustrations_lesson_idx on public.lesson_illustrations (lesson_id, position);

-- -----------------------------------------------------------------------------
-- Transcript + user-provided frames (inputs to analysis)
-- -----------------------------------------------------------------------------
create table public.transcript_segments (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses (id) on delete cascade,
  position integer not null,
  start_seconds numeric not null,
  end_seconds numeric not null,
  text text not null,
  unique (course_id, position)
);

create table public.video_frames (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  timestamp_seconds integer,
  caption text,
  analysis jsonb,
  created_at timestamptz not null default now()
);
create index video_frames_course_idx on public.video_frames (course_id);

-- -----------------------------------------------------------------------------
-- Learner state
-- -----------------------------------------------------------------------------
create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  last_lesson_id uuid references public.lessons (id) on delete set null,
  started_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, course_id)
);
create index course_enrollments_user_idx on public.course_enrollments (user_id, last_accessed_at desc);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  completed boolean not null default false,
  last_read_position numeric not null default 0 check (last_read_position between 0 and 1),
  time_spent_seconds integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);
create index lesson_progress_user_course_idx on public.lesson_progress (user_id, course_id);
create trigger lesson_progress_updated_at before update on public.lesson_progress
  for each row execute function public.set_updated_at();

create table public.learning_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  seconds integer not null default 0,
  lessons_completed integer not null default 0,
  primary key (user_id, activity_date)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);
create trigger learning_notes_updated_at before update on public.learning_notes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Assessments
-- -----------------------------------------------------------------------------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  module_id uuid references public.course_modules (id) on delete cascade,
  kind text not null default 'module' check (kind in ('module', 'final')),
  title text not null,
  description text,
  passing_score integer not null default 70 check (passing_score between 0 and 100),
  created_at timestamptz not null default now()
);
create unique index quizzes_module_unique on public.quizzes (module_id) where module_id is not null;
create unique index quizzes_final_unique on public.quizzes (course_id) where kind = 'final';

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  question text not null,
  question_type text not null
    check (question_type in ('multiple_choice', 'true_false', 'short_answer', 'practical')),
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  explanation text,
  position integer not null default 0
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  score numeric not null,
  passed boolean not null,
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);
create index quiz_attempts_user_quiz_idx on public.quiz_attempts (user_id, quiz_id, completed_at desc);

-- -----------------------------------------------------------------------------
-- Certificates
-- -----------------------------------------------------------------------------
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  certificate_number text not null unique,
  certificate_url text,           -- storage path in the private "certificates" bucket
  verification_token text not null unique,
  recipient_name text not null,
  course_title text not null,
  issued_at timestamptz not null default now(),
  revoked boolean not null default false,
  regeneration_allowed boolean not null default false,
  unique (user_id, course_id)
);

-- -----------------------------------------------------------------------------
-- Background jobs
-- -----------------------------------------------------------------------------
create table public.course_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  job_type text not null default 'generate_course'
    check (job_type in ('generate_course', 'regenerate_lesson', 'regenerate_illustrations')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled')),
  current_stage text,
  progress integer not null default 0 check (progress between 0 and 100),
  total_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  error_message text,
  input jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  locked_until timestamptz,
  next_run_at timestamptz not null default now(),
  slices integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_user_idx on public.course_generation_jobs (user_id, created_at desc);
create index jobs_runnable_idx on public.course_generation_jobs (status, next_run_at)
  where status in ('queued', 'running', 'waiting');
create index jobs_course_idx on public.course_generation_jobs (course_id, created_at desc);
create trigger jobs_updated_at before update on public.course_generation_jobs
  for each row execute function public.set_updated_at();

create table public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.course_generation_jobs (id) on delete cascade,
  stage text not null,
  task_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'waiting', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  position integer not null default 0,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (job_id, task_key)
);
create index job_tasks_job_stage_idx on public.job_tasks (job_id, stage, position);
create trigger job_tasks_updated_at before update on public.job_tasks
  for each row execute function public.set_updated_at();

create table public.job_logs (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.course_generation_jobs (id) on delete cascade,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index job_logs_job_idx on public.job_logs (job_id, created_at);
create index job_logs_errors_idx on public.job_logs (created_at desc) where level = 'error';

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  job_id uuid references public.course_generation_jobs (id) on delete set null,
  course_id uuid references public.courses (id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_job_idx on public.ai_usage (job_id);

-- Atomically claim a job lease. Returns the job row when claimed, nothing otherwise.
create or replace function public.claim_job(p_job_id uuid, p_lease_seconds integer)
returns setof public.course_generation_jobs
language sql security definer set search_path = public as $$
  update public.course_generation_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         status = case when status in ('queued', 'waiting') then 'running' else status end,
         started_at = coalesce(started_at, now()),
         slices = slices + 1
   where id = p_job_id
     and status in ('queued', 'running', 'waiting')
     and next_run_at <= now()
     and (locked_until is null or locked_until < now())
  returning *;
$$;
revoke all on function public.claim_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_job(uuid, integer) to service_role;

-- Increment daily learning time for the current user (bounded per call).
create or replace function public.record_learning_time(p_seconds integer, p_lessons_completed integer default 0)
returns void language sql security invoker set search_path = public as $$
  insert into public.learning_activity (user_id, activity_date, seconds, lessons_completed)
  values (auth.uid(), current_date, least(greatest(p_seconds, 0), 300), greatest(p_lessons_completed, 0))
  on conflict (user_id, activity_date) do update
    set seconds = public.learning_activity.seconds + excluded.seconds,
        lessons_completed = public.learning_activity.lessons_completed + excluded.lessons_completed;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_illustrations enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.video_frames enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.learning_activity enable row level security;
alter table public.bookmarks enable row level security;
alter table public.learning_notes enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.course_generation_jobs enable row level security;
alter table public.job_tasks enable row level security;
alter table public.job_logs enable row level security;
alter table public.ai_usage enable row level security;

-- profiles: users see/update themselves; admins see everyone.
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- Users may only change these columns (role is not updatable by users).
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- platform_settings: admin only (public values are read server-side).
create policy "settings: admin read" on public.platform_settings for select using (public.is_admin());
create policy "settings: admin write" on public.platform_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- courses
create policy "courses: read visible" on public.courses
  for select using (public.can_view_course(id));
create policy "courses: owner update" on public.courses
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "courses: owner delete" on public.courses
  for delete using (user_id = auth.uid() or public.is_admin());
-- Courses are created by the server (service role) after URL validation.
revoke insert, update on public.courses from authenticated, anon;
grant update (title, subtitle, description, is_public, completion_settings, difficulty, target_audience)
  on public.courses to authenticated;

-- modules / lessons / illustrations: readable when the course is; editable by owner.
create policy "modules: read" on public.course_modules
  for select using (public.can_view_course(course_id));
create policy "modules: owner update" on public.course_modules
  for update using (public.owns_course(course_id)) with check (public.owns_course(course_id));
create policy "modules: owner delete" on public.course_modules
  for delete using (public.owns_course(course_id));
revoke insert, update on public.course_modules from authenticated, anon;
grant update (title, description) on public.course_modules to authenticated;

create policy "lessons: read" on public.lessons
  for select using (public.can_view_course(course_id));
create policy "lessons: owner update" on public.lessons
  for update using (public.owns_course(course_id)) with check (public.owns_course(course_id));
create policy "lessons: owner delete" on public.lessons
  for delete using (public.owns_course(course_id));
revoke insert, update on public.lessons from authenticated, anon;
grant update (title, description, content, is_required) on public.lessons to authenticated;

create policy "illustrations: read" on public.lesson_illustrations
  for select using (public.can_view_course(course_id));
create policy "illustrations: owner delete" on public.lesson_illustrations
  for delete using (public.owns_course(course_id));

create policy "transcript: owner read" on public.transcript_segments
  for select using (public.owns_course(course_id) or public.is_admin());

create policy "frames: owner read" on public.video_frames
  for select using (user_id = auth.uid() or public.is_admin());
create policy "frames: owner delete" on public.video_frames
  for delete using (user_id = auth.uid());

-- learner-owned rows
create policy "enrollments: own" on public.course_enrollments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_view_course(course_id));
create policy "enrollments: admin read" on public.course_enrollments for select using (public.is_admin());

create policy "progress: own" on public.lesson_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_view_course(course_id));

create policy "activity: own" on public.learning_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "bookmarks: own" on public.bookmarks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_view_course(course_id));

create policy "notes: own" on public.learning_notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_view_course(course_id));

-- quizzes: readable with the course; answers are hidden from clients via column grants.
create policy "quizzes: read" on public.quizzes for select using (public.can_view_course(course_id));
create policy "quizzes: owner update" on public.quizzes for update
  using (public.owns_course(course_id)) with check (public.owns_course(course_id));
revoke insert, update on public.quizzes from authenticated, anon;
grant update (passing_score) on public.quizzes to authenticated;

create policy "questions: read" on public.quiz_questions for select using (
  exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_view_course(q.course_id))
);
revoke select on public.quiz_questions from authenticated, anon;
grant select (id, quiz_id, lesson_id, question, question_type, options, position)
  on public.quiz_questions to authenticated;

-- attempts are written by the server after grading; learners can read their own.
create policy "attempts: read own" on public.quiz_attempts for select
  using (user_id = auth.uid() or public.is_admin());

-- certificates: issued by the server; learners read their own.
create policy "certificates: read own" on public.certificates for select
  using (user_id = auth.uid() or public.is_admin());

-- jobs: owners can watch their jobs; tasks/logs/usage are admin-only.
create policy "jobs: read own" on public.course_generation_jobs for select
  using (user_id = auth.uid() or public.is_admin());
create policy "tasks: admin read" on public.job_tasks for select using (public.is_admin());
create policy "logs: admin read" on public.job_logs for select using (public.is_admin());
create policy "usage: admin read" on public.ai_usage for select using (public.is_admin());

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public)
values
  ('illustrations', 'illustrations', true),
  ('certificates', 'certificates', false),
  ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Learners upload their own media (key frames, audio, transcripts) under uploads/<uid>/...
create policy "uploads: own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "uploads: own read" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "uploads: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- Learners can read their own certificate PDFs at certificates/<uid>/...
create policy "certificates: own read" on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = auth.uid()::text);

-- Default settings
insert into public.platform_settings (key, value) values
  ('community', '{"whatsapp_url": null, "telegram_url": null}'),
  ('certificates', '{"platform_name": "CourseForge", "signatory_name": "CourseForge Learning Team", "signatory_title": "Platform Representative", "accent_color": "#4f46e5"}'),
  ('completion', '{"require_final_assessment": true, "default_passing_score": 70}'),
  ('ai', '{"model": "claude-opus-5-5", "effort": "medium", "max_lessons_per_course": 60, "image_generation": false}')
on conflict (key) do nothing;
