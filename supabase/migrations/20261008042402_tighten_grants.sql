-- 로그인 사용자(authenticated) 권한을 필요한 것만 남기도록 정리
revoke all on public.profiles, public.tasks, public.daily_messages, public.articles, public.insights, public.projects from authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.daily_messages to authenticated;
grant select on public.articles to authenticated;
grant select, insert, update, delete on public.insights to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
