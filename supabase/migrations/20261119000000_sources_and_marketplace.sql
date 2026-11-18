-- =============================================================================
-- 1. Course sources beyond YouTube (uploaded video/audio, documents, articles)
-- 2. Sharing, free/paid pricing, enrollment access and Paystack payments
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sources
-- -----------------------------------------------------------------------------
alter table public.courses
  add column source_type text not null default 'youtube'
    check (source_type in ('youtube', 'video_upload', 'document', 'article')),
  add column source_url text,    -- article URL (youtube courses keep youtube_url)
  add column source_name text;   -- uploaded file name / article site name

alter table public.courses alter column youtube_url drop not null;
alter table public.courses alter column youtube_video_id drop not null;
alter table public.courses add constraint courses_youtube_source_check
  check (source_type <> 'youtube' or (youtube_url is not null and youtube_video_id is not null));

-- -----------------------------------------------------------------------------
-- Pricing (amounts in the currency's minor unit, e.g. kobo)
-- -----------------------------------------------------------------------------
alter table public.courses
  add column price_amount integer not null default 0 check (price_amount >= 0),
  add column currency text not null default 'NGN' check (currency in ('NGN', 'GHS', 'KES', 'ZAR', 'USD'));

grant update (price_amount, currency) on public.courses to authenticated;

-- -----------------------------------------------------------------------------
-- course_access: who may study a course they do not own. Written only by the
-- server (free enrollment, verified payment, or grandfathering).
-- -----------------------------------------------------------------------------
create table public.course_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  source text not null check (source in ('free', 'purchase', 'grant')),
  payment_id uuid,
  granted_at timestamptz not null default now(),
  unique (user_id, course_id)
);
create index course_access_course_idx on public.course_access (course_id);

alter table public.course_access enable row level security;
create policy "access: read own or owner" on public.course_access for select
  using (user_id = auth.uid() or public.owns_course(course_id) or public.is_admin());
revoke insert, update, delete on public.course_access from authenticated, anon;

-- Learners who already studied someone else's public course keep access.
insert into public.course_access (user_id, course_id, source)
select e.user_id, e.course_id, 'grant'
  from public.course_enrollments e
  join public.courses c on c.id = e.course_id
 where c.user_id <> e.user_id
on conflict (user_id, course_id) do nothing;

-- Catalog visibility: landing page, title, modules. Purchasers keep seeing a
-- course even if the creator later unpublishes it.
create or replace function public.can_view_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and (c.user_id = auth.uid()
           or (c.is_public and c.status in ('ready', 'needs_review'))
           or exists (select 1 from public.course_access a where a.course_id = c.id and a.user_id = auth.uid())
           or public.is_admin())
  );
$$;

-- Content access: lessons, quizzes, illustrations and learner progress.
create or replace function public.can_access_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and (c.user_id = auth.uid()
           or exists (select 1 from public.course_access a where a.course_id = c.id and a.user_id = auth.uid())
           or public.is_admin())
  );
$$;

-- Re-point content policies from "can view" to "can access".
drop policy "lessons: read" on public.lessons;
create policy "lessons: read" on public.lessons for select using (public.can_access_course(course_id));

drop policy "illustrations: read" on public.lesson_illustrations;
create policy "illustrations: read" on public.lesson_illustrations for select using (public.can_access_course(course_id));

drop policy "quizzes: read" on public.quizzes;
create policy "quizzes: read" on public.quizzes for select using (public.can_access_course(course_id));

drop policy "questions: read" on public.quiz_questions;
create policy "questions: read" on public.quiz_questions for select using (
  exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_access_course(q.course_id))
);

drop policy "enrollments: own" on public.course_enrollments;
create policy "enrollments: own" on public.course_enrollments for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_course(course_id));
create policy "enrollments: owner read" on public.course_enrollments for select
  using (public.owns_course(course_id));

drop policy "progress: own" on public.lesson_progress;
create policy "progress: own" on public.lesson_progress for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_course(course_id));

drop policy "bookmarks: own" on public.bookmarks;
create policy "bookmarks: own" on public.bookmarks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_course(course_id));

drop policy "notes: own" on public.learning_notes;
create policy "notes: own" on public.learning_notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_course(course_id));

-- -----------------------------------------------------------------------------
-- payments (Paystack). The platform collects; creator earnings are recorded
-- per sale and settled by an admin (payout_status).
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  provider text not null default 'paystack' check (provider in ('paystack')),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  creator_id uuid references auth.users (id) on delete set null,
  course_title text not null,
  amount integer not null check (amount > 0),
  currency text not null,
  platform_fee integer not null default 0,
  creator_earnings integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  payout_status text not null default 'unpaid' check (payout_status in ('unpaid', 'paid_out')),
  paid_out_at timestamptz,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_creator_idx on public.payments (creator_id, status, created_at desc);
create index payments_course_idx on public.payments (course_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.course_access
  add constraint course_access_payment_fk foreign key (payment_id) references public.payments (id) on delete set null;

alter table public.payments enable row level security;
create policy "payments: buyer, creator or admin read" on public.payments for select
  using (user_id = auth.uid() or creator_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.payments from authenticated, anon;

insert into public.platform_settings (key, value) values
  ('payments', '{"platform_fee_percent": 10}')
on conflict (key) do nothing;
