-- 아이디어 (docs/PRD.md 6장)
-- 해야 할 일·만들고 싶은 사업·떠오른 생각을 한 줄로 적어 두는 메모.
-- revisited_at(마지막으로 다시 본 때)이 오래된 아이디어부터 화면 위로 다시 꺼내, 옛날 아이디어가 묻히지 않게 합니다.

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  note text not null default '' check (char_length(note) <= 5000),
  -- todo: 할 일, business: 사업, make: 만들기, thought: 생각
  kind text not null default 'thought' check (kind in ('todo', 'business', 'make', 'thought')),
  -- open: 모아 둠, doing: 진행 중, done: 끝냄
  status text not null default 'open' check (status in ('open', 'doing', 'done')),
  pinned boolean not null default false,
  revisited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ideas_user_revisited_idx on public.ideas (user_id, revisited_at);
create trigger ideas_set_updated_at before update on public.ideas
  for each row execute function public.set_updated_at();

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 RLS 규칙 안에서만
revoke all on public.ideas from anon, authenticated;
grant select, insert, update, delete on public.ideas to authenticated;
grant all on public.ideas to service_role;

-- RLS 켜기: 자기 행만
alter table public.ideas enable row level security;

create policy "ideas: 본인 읽기" on public.ideas
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ideas: 본인 추가" on public.ideas
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ideas: 본인 수정" on public.ideas
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ideas: 본인 삭제" on public.ideas
  for delete to authenticated using ((select auth.uid()) = user_id);
