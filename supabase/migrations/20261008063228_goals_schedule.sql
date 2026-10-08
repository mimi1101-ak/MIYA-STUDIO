-- 루틴·캘린더·목표 개편 (docs/PRD.md 6장)
-- 목표(goals)·일정(events)·루틴(routines·routine_checks)을 새로 만들고,
-- 할 일(tasks)에 시간·예상 소요시간·목표 연결을 더합니다. 일할 수 있는 시간은 profiles에 둡니다.
-- 요일 숫자: 0=일, 1=월 … 6=토. 시각은 timestamptz(시간대 포함 날짜시간)로 저장하고 화면에서 한국 시간으로 보여 줍니다.

-- 1) 일할 수 있는 시간 (기본: 평일 9:00~18:00)
alter table public.profiles
  add column work_days smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(work_days) between 1 and 7 and work_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  add column work_start time not null default '09:00',
  add column work_end time not null default '18:00',
  add constraint profiles_work_hours_check check (work_end > work_start);

-- 2) goals: 목표. AI 비서와 대화하는 동안은 draft, 계획을 승인하면 active
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  deadline date,
  weekly_minutes integer check (weekly_minutes between 0 and 10080),
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  -- AI 비서와 나눈 대화 [{role, content}]와 승인 전 계획안
  chat jsonb not null default '[]'::jsonb
    check (jsonb_typeof(chat) = 'array' and octet_length(chat::text) <= 200000),
  plan jsonb check (plan is null or octet_length(plan::text) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_status_idx on public.goals (user_id, status);
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- 3) tasks: 기존 '이번 달 목표'는 목표로 옮기고, 할 일에 시간 정보를 더합니다
insert into public.goals (user_id, title, status, created_at)
  select user_id, title, case when is_done then 'done' else 'active' end, created_at
  from public.tasks
  where period = 'month';
delete from public.tasks where period = 'month';

alter table public.tasks
  add column goal_id uuid references public.goals (id) on delete set null,
  add column estimated_minutes integer not null default 30 check (estimated_minutes between 5 and 720),
  add column scheduled_at timestamptz,
  add column done_at timestamptz,
  add column source text not null default 'manual' check (source in ('manual', 'ai')),
  add column carry_count integer not null default 0 check (carry_count >= 0);
update public.tasks set done_at = updated_at where is_done;

-- 오늘/주간 구분 대신 배치된 시각(scheduled_at)으로 찾습니다. 시각이 비어 있으면 '시간 미정'
drop index public.tasks_user_period_date_idx;
alter table public.tasks drop column period, drop column target_date;
create index tasks_user_scheduled_idx on public.tasks (user_id, scheduled_at);
create index tasks_goal_idx on public.tasks (goal_id);

-- 할 일은 내 목표에만 연결할 수 있게
drop policy "tasks: 본인 추가" on public.tasks;
drop policy "tasks: 본인 수정" on public.tasks;
create policy "tasks: 본인 추가" on public.tasks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (goal_id is null or exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())
    ))
  );
create policy "tasks: 본인 수정" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (goal_id is null or exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())
    ))
  );

-- 4) events: 시간이 고정된 일정
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_user_starts_idx on public.events (user_id, starts_at);
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- 5) routines: 반복되는 습관 (정해진 요일·시각에 반복, 자정을 넘기지 않음)
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  weekdays smallint[] not null
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(epoch from start_time) / 60 + duration_minutes <= 1440)
);
create index routines_user_idx on public.routines (user_id);
create trigger routines_set_updated_at before update on public.routines
  for each row execute function public.set_updated_at();

-- 6) routine_checks: 루틴을 어느 날 했는지 (하루 한 번)
create table public.routine_checks (
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  primary key (routine_id, check_date)
);
create index routine_checks_user_date_idx on public.routine_checks (user_id, check_date);

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 필요한 것만
revoke all on public.goals, public.events, public.routines, public.routine_checks from anon, authenticated;
grant select, insert, update, delete on public.goals, public.events, public.routines to authenticated;
grant select, insert, delete on public.routine_checks to authenticated;
grant all on public.goals, public.events, public.routines, public.routine_checks to service_role;

-- RLS 켜기: 모두 자기 행만
alter table public.goals enable row level security;
alter table public.events enable row level security;
alter table public.routines enable row level security;
alter table public.routine_checks enable row level security;

create policy "goals: 본인 읽기" on public.goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals: 본인 추가" on public.goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals: 본인 수정" on public.goals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals: 본인 삭제" on public.goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "events: 본인 읽기" on public.events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "events: 본인 추가" on public.events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "events: 본인 수정" on public.events
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "events: 본인 삭제" on public.events
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "routines: 본인 읽기" on public.routines
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "routines: 본인 추가" on public.routines
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "routines: 본인 수정" on public.routines
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "routines: 본인 삭제" on public.routines
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 루틴 체크는 내 루틴에만
create policy "routine_checks: 본인 읽기" on public.routine_checks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "routine_checks: 본인 추가" on public.routine_checks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );
create policy "routine_checks: 본인 삭제" on public.routine_checks
  for delete to authenticated using ((select auth.uid()) = user_id);
