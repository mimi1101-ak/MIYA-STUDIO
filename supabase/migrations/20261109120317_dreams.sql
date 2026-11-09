-- Dream (2026-11-09, 사용자 요청 "목표 페이지를 월별 목표·차월 목표·Dream으로 나누기. Dream은 내 총체적인 목표")
-- 기한 없이 오래 두는 큰 목표를 한 줄씩 적는 목록. 예: "내 브랜드로 생활하기". 이루면 체크합니다.
-- 목표 화면 맨 위에 보이고, MOMO 호출이 우선순위를 정할 때 참고하며 추가·수정·삭제할 수 있습니다.

create table public.dreams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 내 Dream을 순서대로 불러올 때 쓰는 색인
create index dreams_user_sort_idx on public.dreams (user_id, sort_order);
create trigger dreams_set_updated_at before update on public.dreams
  for each row execute function public.set_updated_at();

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 RLS 규칙 안에서만
revoke all on public.dreams from anon, authenticated;
grant select, insert, update, delete on public.dreams to authenticated;
grant all on public.dreams to service_role;

-- RLS 켜기: 자기 행만
alter table public.dreams enable row level security;

create policy "dreams: 본인 읽기" on public.dreams
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dreams: 본인 추가" on public.dreams
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dreams: 본인 수정" on public.dreams
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dreams: 본인 삭제" on public.dreams
  for delete to authenticated using ((select auth.uid()) = user_id);
