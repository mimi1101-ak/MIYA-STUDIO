-- 월별 목표 (2026-11-08, 사용자 요청 "월별 목표를 홈 화면에서 보고, 등록·삭제·수정")
-- 달마다 적어 두는 한 줄 목표. 예: "11월: 책 2권 읽기". MOMO 계획·할 일과는 연결하지 않습니다.
-- month는 그 달 1일(한국 날짜)로 저장합니다.

create table public.monthly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  title text not null check (char_length(title) between 1 and 200),
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 한 달의 목표를 순서대로 불러올 때 쓰는 색인
create index monthly_goals_user_month_idx on public.monthly_goals (user_id, month, sort_order);
create trigger monthly_goals_set_updated_at before update on public.monthly_goals
  for each row execute function public.set_updated_at();

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 RLS 규칙 안에서만
revoke all on public.monthly_goals from anon, authenticated;
grant select, insert, update, delete on public.monthly_goals to authenticated;
grant all on public.monthly_goals to service_role;

-- RLS 켜기: 자기 행만
alter table public.monthly_goals enable row level security;

create policy "monthly_goals: 본인 읽기" on public.monthly_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "monthly_goals: 본인 추가" on public.monthly_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "monthly_goals: 본인 수정" on public.monthly_goals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "monthly_goals: 본인 삭제" on public.monthly_goals
  for delete to authenticated using ((select auth.uid()) = user_id);
