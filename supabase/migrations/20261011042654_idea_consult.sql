-- 아이디어마다 MOMO와 대화하고, 대화를 바탕으로 사업계획서·기획서·실행 계획서를 받습니다.
-- chat: MOMO와 나눈 대화 [{role, content}], report: MOMO가 쓴 문서(JSON)
-- chatted_at·reported_at: 목록에서 "대화 중", "계획서 있음"을 보여 주는 데 씁니다(대화 전체를 불러오지 않게).

alter table public.ideas
  add column chat jsonb not null default '[]'::jsonb
    check (jsonb_typeof(chat) = 'array' and octet_length(chat::text) <= 200000),
  add column report jsonb check (report is null or octet_length(report::text) <= 60000),
  add column chatted_at timestamptz,
  add column reported_at timestamptz;
