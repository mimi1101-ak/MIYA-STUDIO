-- 사업 아이디어 대시보드: 레퍼런스·브랜드 이미지를 모으는 사진 보드
-- 사진 파일은 Storage의 비공개 버킷 idea-boards에 "사용자ID/아이디어ID/파일" 경로로 두고,
-- 보드 위 순서·크기·맞춤·설명은 idea_board_items 표에 둡니다.

create table public.idea_board_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  path text not null check (char_length(path) between 1 and 300),
  -- 원본(줄인 뒤) 사진의 가로·세로 픽셀
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  -- 보드에서 차지하는 칸: 가로 1~6칸, 세로 1~4칸
  col_span smallint not null default 2 check (col_span between 1 and 6),
  row_span smallint not null default 2 check (row_span between 1 and 4),
  -- cover: 칸에 꽉 채우기(잘림), contain: 사진 전체 보이기
  fit text not null default 'cover' check (fit in ('cover', 'contain')),
  caption text not null default '' check (char_length(caption) <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idea_board_items_idea_idx on public.idea_board_items (idea_id, sort_order);
create index idea_board_items_user_idx on public.idea_board_items (user_id);
create trigger idea_board_items_set_updated_at before update on public.idea_board_items
  for each row execute function public.set_updated_at();

-- 권한: 비로그인(anon)은 아무것도 못 함, 로그인 사용자는 RLS 규칙 안에서만
revoke all on public.idea_board_items from anon, authenticated;
grant select, insert, update, delete on public.idea_board_items to authenticated;
grant all on public.idea_board_items to service_role;

alter table public.idea_board_items enable row level security;

create policy "idea_board_items: 본인 읽기" on public.idea_board_items
  for select to authenticated using ((select auth.uid()) = user_id);
-- 내 아이디어에만, 내 폴더의 파일로만 추가
create policy "idea_board_items: 본인 추가" on public.idea_board_items
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and path like (select auth.uid())::text || '/' || idea_id::text || '/%'
    and exists (select 1 from public.ideas i where i.id = idea_id and i.user_id = (select auth.uid()))
  );
create policy "idea_board_items: 본인 수정" on public.idea_board_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "idea_board_items: 본인 삭제" on public.idea_board_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 사진 파일: 비공개 버킷, 한 장 5MB 이하, webp·jpeg·png만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-boards', 'idea-boards', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

-- 로그인 사용자는 자기 폴더(첫 폴더 이름 = 사용자 ID) 안의 파일만 읽고·올리고·지울 수 있습니다.
create policy "idea-boards: 본인 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'idea-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "idea-boards: 본인 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'idea-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "idea-boards: 본인 수정" on storage.objects
  for update to authenticated
  using (bucket_id = 'idea-boards' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'idea-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "idea-boards: 본인 삭제" on storage.objects
  for delete to authenticated
  using (bucket_id = 'idea-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
