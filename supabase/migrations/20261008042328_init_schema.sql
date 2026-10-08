-- 24시간 비서: 기본 테이블 6개 + RLS (docs/PRD.md 6장)

-- 공통: updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) profiles: 프로필 정보 (id = 로그인 사용자 ID)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  created_at timestamptz not null default now()
);

-- 2) tasks: 플래너 할 일·목표 (period로 오늘/주간/월간 구분)
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period text not null check (period in ('today', 'week', 'month')),
  title text not null check (char_length(title) between 1 and 200),
  is_done boolean not null default false,
  target_date date not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_period_date_idx on public.tasks (user_id, period, target_date);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- 3) daily_messages: 하루 한 개의 AI 동기부여 메시지
create table public.daily_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, message_date)
);

-- 4) articles: 외부 글 목록 (제목·링크·날짜만 저장, 본문 저장 안 함)
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('eo_planet', 'long_black', 'naver_market', 'naver_trend')),
  category text not null default '' check (char_length(category) <= 50),
  title text not null check (char_length(title) between 1 and 300),
  url text not null unique check (url ~* '^https?://'),
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index articles_source_fetched_idx on public.articles (source, fetched_at desc);

-- 5) insights: 사용자가 정리한 인사이트
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  article_id uuid references public.articles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index insights_user_created_idx on public.insights (user_id, created_at desc);
create index insights_article_idx on public.insights (article_id);
create trigger insights_set_updated_at before update on public.insights
  for each row execute function public.set_updated_at();

-- 6) projects: 마이 프로젝트 링크
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  url text not null check (url ~* '^https?://'),
  description text not null default '' check (char_length(description) <= 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index projects_user_sort_idx on public.projects (user_id, sort_order);

-- 로그인하면 profiles 행 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'nickname',
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ), 50)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 RLS 규칙 안에서만
revoke all on public.profiles, public.tasks, public.daily_messages, public.articles, public.insights, public.projects from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.daily_messages to authenticated;
grant select on public.articles to authenticated;
revoke insert, update, delete on public.articles from authenticated;
grant select, insert, update, delete on public.insights to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.profiles, public.tasks, public.daily_messages, public.articles, public.insights, public.projects to service_role;

-- RLS 켜기
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_messages enable row level security;
alter table public.articles enable row level security;
alter table public.insights enable row level security;
alter table public.projects enable row level security;

-- profiles: 자기 행만
create policy "profiles: 본인 읽기" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: 본인 추가" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: 본인 수정" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- tasks: 자기 행만
create policy "tasks: 본인 읽기" on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks: 본인 추가" on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks: 본인 수정" on public.tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks: 본인 삭제" on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- daily_messages: 자기 행 읽기·추가만
create policy "daily_messages: 본인 읽기" on public.daily_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_messages: 본인 추가" on public.daily_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- articles: 로그인 사용자 읽기만 (쓰기 정책 없음 → 서버의 service_role만 쓰기 가능)
create policy "articles: 로그인 사용자 읽기" on public.articles
  for select to authenticated using (true);

-- insights: 자기 행만
create policy "insights: 본인 읽기" on public.insights
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insights: 본인 추가" on public.insights
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "insights: 본인 수정" on public.insights
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "insights: 본인 삭제" on public.insights
  for delete to authenticated using ((select auth.uid()) = user_id);

-- projects: 자기 행만
create policy "projects: 본인 읽기" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects: 본인 추가" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects: 본인 수정" on public.projects
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects: 본인 삭제" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);
