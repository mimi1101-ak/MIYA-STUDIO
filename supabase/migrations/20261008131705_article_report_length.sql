-- 저장한 글 요약을 "비서 읽기 보고서" 형식(결론·배경·핵심·숫자·비서 의견)으로 바꾸면서 길이 제한을 늘립니다.
-- 보고서는 JSON 글자로 summary 칸에 저장합니다. 원문 본문은 여전히 저장하지 않습니다.
alter table public.articles
  drop constraint articles_summary_check,
  add constraint articles_summary_check check (summary is null or char_length(summary) <= 10000);
