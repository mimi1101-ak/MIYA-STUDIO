-- 일지 (docs/PRD.md 6장)
-- 하루를 마무리하며 생각을 정리해 두는 글. 날짜(한국 시간)마다 한 편이고, 같은 날 다시 열면 이어서 씁니다.
-- 글을 모두 지우면 그날 일지도 지웁니다(빈 일지는 남기지 않음).

create table public.journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date date not null,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 하루 한 편. 지난 일지를 날짜순으로 불러올 때 이 색인을 씁니다.
  unique (user_id, entry_date)
);
create trigger journals_set_updated_at before update on public.journals
  for each row execute function public.set_updated_at();

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 RLS 규칙 안에서만
revoke all on public.journals from anon, authenticated;
grant select, insert, update, delete on public.journals to authenticated;
grant all on public.journals to service_role;

-- RLS 켜기: 자기 행만
alter table public.journals enable row level security;

create policy "journals: 본인 읽기" on public.journals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "journals: 본인 추가" on public.journals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "journals: 본인 수정" on public.journals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "journals: 본인 삭제" on public.journals
  for delete to authenticated using ((select auth.uid()) = user_id);
