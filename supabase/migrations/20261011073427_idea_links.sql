-- 아이디어 ↔ 할 일·목표 연결
-- 아이디어에서 보낸 할 일(tasks.idea_id)과 아이디어로 만든 목표(goals.idea_id)가 어느 아이디어에서 왔는지 기억합니다.
-- 아이디어를 지워도 할 일·목표는 그대로 남고 연결만 풀립니다(on delete set null).

alter table public.tasks
  add column idea_id uuid references public.ideas (id) on delete set null;
alter table public.goals
  add column idea_id uuid references public.ideas (id) on delete set null;
create index tasks_idea_idx on public.tasks (idea_id);
create index goals_idea_idx on public.goals (idea_id);

-- 할 일은 내 목표·내 아이디어에만 연결할 수 있게
drop policy "tasks: 본인 추가" on public.tasks;
drop policy "tasks: 본인 수정" on public.tasks;
create policy "tasks: 본인 추가" on public.tasks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (goal_id is null or exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())
    ))
    and (idea_id is null or exists (
      select 1 from public.ideas i where i.id = idea_id and i.user_id = (select auth.uid())
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
    and (idea_id is null or exists (
      select 1 from public.ideas i where i.id = idea_id and i.user_id = (select auth.uid())
    ))
  );

-- 목표는 내 아이디어에만 연결할 수 있게
drop policy "goals: 본인 추가" on public.goals;
drop policy "goals: 본인 수정" on public.goals;
create policy "goals: 본인 추가" on public.goals
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (idea_id is null or exists (
      select 1 from public.ideas i where i.id = idea_id and i.user_id = (select auth.uid())
    ))
  );
create policy "goals: 본인 수정" on public.goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (idea_id is null or exists (
      select 1 from public.ideas i where i.id = idea_id and i.user_id = (select auth.uid())
    ))
  );
