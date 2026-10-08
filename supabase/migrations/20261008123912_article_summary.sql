-- 저장한 글의 AI 요약 (docs/PRD.md 6장)
-- 원문 본문은 저장하지 않고, AI가 쓴 요약만 저장합니다. 첫 줄은 한 줄 요지, 다음 줄부터 핵심 내용입니다.
-- articles 쓰기는 지금처럼 서버(서비스 키)만 합니다.
alter table public.articles
  add column summary text check (summary is null or char_length(summary) <= 4000),
  add column summarized_at timestamptz;
