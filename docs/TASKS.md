# TASKS — MIYA STUDIO 작업 순서

> `docs/PRD.md`를 바탕으로 만든 작업 순서입니다. 한 단계가 끝날 때마다 `npm run build`가 통과하는지 확인합니다.
> 미결 사항을 어떻게 정했는지는 루트의 `DECISIONS.md`를 봅니다.

## 1단계. 프로젝트 뼈대
- [x] Next.js(App Router) + TypeScript + Tailwind CSS 프로젝트 만들기
- [x] shadcn/ui 설치 (button, input, textarea, card, tabs, checkbox, label, badge)
- [x] 공통 레이아웃: 위쪽 메뉴(PC 한 줄, 휴대폰 가로 스크롤), 차분한 무채색 톤, 한국어 글꼴
- [x] `.gitignore`에 `.env.local` 포함 확인
- 확인: `npm run build` 통과

## 2단계. DB 만들기 (Supabase)
- [x] Supabase 프로젝트 `24h-assistant` 생성 (서울 리전, 무료)
- [x] 테이블 6개: profiles, tasks, daily_messages, articles, insights, projects (PRD 6장)
- [x] RLS 켜기: 사용자 데이터 5개는 본인만, articles는 로그인 사용자 읽기만(쓰기는 서버만)
- [x] 로그인 시 profiles 자동 생성 트리거
- [x] 변경 기록: `supabase/migrations/` 2개 파일
- [x] 보안 점검(advisor) 경고 0건
- 확인: Supabase 대시보드 > Table Editor에서 테이블 6개가 보이는지

## 3단계. 로그인 (카카오·구글)
- [x] `/login` 화면: 서비스 이름, 카카오 로그인 버튼, 구글 로그인 버튼
- [x] 로그인 후 돌아오는 주소 `/auth/callback` → 대시보드(`/`)로 이동
- [x] 로그인 안 한 상태로 다른 화면 접근 시 `/login`으로 이동 (`proxy.ts`)
- [x] 카카오 로그인 키 등록·로그인 성공 (2026-10-08)
- [ ] (키 필요) 구글 로그인 키 등록 — `DECISIONS.md` "키 필요" 참고
- 확인: 로그아웃 상태에서 `/calendar`를 열면 `/login`으로 이동하는지

## 4단계. 루틴 + 대시보드 오늘 할 일 (10~17단계 개편으로 대체됨)
- [x] `/planner`: 오늘 / 이번 주 / 이번 달 탭, 항목 추가·수정·삭제·완료 체크 → 지금은 "오늘"·캘린더·목표로 바뀌었고 `/planner`는 `/`로 이동
- [x] 대시보드(`/`): 동기부여 메시지 바로 아래 오늘 할 일(바로 편집)
- [x] 날짜 기준은 한국 시간, 주간은 월요일 시작
- 확인: 할 일을 추가하고 새로고침해도 남아 있는지, 휴대폰에서 열어도 같은 내용인지

## 5단계. AI 동기부여 메시지
- [x] `/api/daily-message`: 오늘 메시지가 있으면 그대로, 없으면 AI로 한 번만 만들고 저장
- [x] 대시보드 맨 위에 표시, 실패 시 "오늘의 메시지를 불러오지 못했어요" + 다시 시도 버튼
- [x] `ANTHROPIC_API_KEY` 등록, 오늘의 메시지 생성·저장 확인 (2026-10-08, Claude API)
- 확인: 대시보드를 두 번 열어도 같은 메시지가 보이는지

## 6단계. 마이 프로젝트
- [x] `/projects`: 이름·주소·설명 추가·수정·삭제, 카드 클릭 시 새 탭으로 열기
- [x] 잘못된 주소는 저장 전에 안내 문구 표시
- 확인: `abc`처럼 잘못된 주소를 넣으면 안내 문구가 보이는지

## 7단계. 뉴스·인사이트
- [x] `/news`: 출처별 탭(EO planet / Long Black / 네이버 시장·트렌드), 글 목록, 원문 링크(새 탭) → 18단계에서 변경
- [x] 글 추가는 "직접 링크 붙여넣기"(제목·링크·분류·날짜만 저장, 서버만 쓰기)
- [x] 글마다 "인사이트 작성" → 어떤 글에 대한 인사이트인지 함께 저장
- [x] `/insights`: 저장한 인사이트 목록(원문 제목·출처·날짜), 수정·삭제, 글 없이 새로 쓰기
- [ ] (키 필요) `SUPABASE_SERVICE_ROLE_KEY` 등록 (글 추가·삭제용)
- 확인: 글을 추가하고 인사이트를 쓴 뒤 `/insights`에 보이는지

## 8단계. 프로필
- [x] `/profile`: 로그인 계정 정보, 표시 이름 수정, 로그아웃
- 확인: 표시 이름을 바꾸고 새로고침해도 유지되는지

## 9단계. 마무리 점검
- [x] 휴대폰(375px)·PC 화면 배치 확인 (로그인 키가 없어 로그인 후 화면은 견본 데이터로 확인)
- [x] `npm run lint`, `npm run build` 통과
- [x] "키 필요" 목록 정리 (`DECISIONS.md`)


## 10~17단계. 오늘 · 캘린더 · 목표 개편 (2026-10-08)
> 목표: "목표만 정하면 AI가 할 일을 쪼개서 일정에 넣어 주고, 나는 확인하고 실행만 한다." 정한 내용은 `DECISIONS.md` 5장.

- [x] 10. DB 개편: goals·events·routines·routine_checks 새로 만들기, tasks에 시간·예상 시간·목표 연결·AI 표시·이월 횟수 추가, profiles에 일할 시간 (`supabase/migrations/20261008063228_goals_schedule.sql`), RLS·권한 점검
- [x] 11. 일할 수 있는 시간 설정(`/profile`) + 자동 배치 규칙(`lib/schedule.ts`, `lib/schedule-db.ts`)
- [x] 12. "오늘" 화면(`/`): 지금 할 일, 오늘 타임라인·현재 시점·완료 개수, 이번 주 목표 진척도, 할 일이 없을 때 AI 비서 버튼. 메뉴: 오늘·캘린더·목표
- [x] 13. AI 목표 비서(`/goals`): 대화 → 질문 → 월·주·일 계획안 → 대화로 수정 → 승인 시 빈 시간에 배치
- [x] 14. 빠른 입력(`lib/quick-parse.ts`): "금요일 3시 치과" → 일정, "보고서 2시간" → 할 일. 저장 전 미리보기
- [x] 15. 캘린더(`/calendar`): 주간·월간, 클릭 추가·수정·삭제, 목표별 보기, 루틴 관리
- [x] 16. 끌어서 시간·날짜 옮기기·길이 바꾸기 (FullCalendar 6.1.21)
- [x] 17. 이월 3번 이상이면 AI로 쪼개기/빼기/그대로 두기, 휴대폰(375px)·PC 점검, `npm run lint`·`npm run build` 통과
- 확인
  - `/goals` → "새 목표" → 목표를 대충 적고 비서 질문에 답한 뒤 "승인하고 일정에 넣기" → `/`과 `/calendar`에 할 일이 보이는지
  - `/` 빠른 입력에 "오늘 5시 미팅"을 넣고, 그 시간에 있던 할 일이 뒤로 밀리는지
  - `/calendar`에서 할 일을 다른 날로 끌어 놓고 새로고침해도 그대로인지

## 18단계. 뉴스 화면 개편 (2026-10-08)
- [x] `/news`: EO planet·Long Black을 한 화면에 나란히(휴대폰은 위아래) 원래 사이트 그대로 띄우기, 각 칸에 '처음으로'·'새 탭' 버튼
- [x] 네이버 출처 제거 (자동 수집 금지·띄우기 차단). 저장한 글·인사이트 기능은 아래에 유지
- [x] 칸 안 로그인 불가 안내 + '로그인해서 보기'(옆 창/새 탭) 버튼
- 확인: `/news`를 열고 EO planet의 '오늘 많이 본 아티클'과 Long Black의 '베스트 노트'가 보이는지

## 19단계. 저장한 글 AI 요약 · 메모 (2026-10-08)
- [x] DB: articles에 summary·summarized_at 추가 (`supabase/migrations/20261008123912_article_summary.sql`)
- [x] 링크만 붙여 넣으면 제목 자동, 저장하면 AI 요약 (`lib/article-reader.ts`, `lib/article-ai.ts`). 본문은 저장하지 않음
- [x] '저장한 글' 화면(`/insights`, 메뉴 이름 변경): 출처별 보기, 글 카드(요약·요약 다시 만들기·메모 추가/수정/삭제·글 삭제), 글 없이 쓴 인사이트
- [x] 뉴스 화면 아래: 글 저장 칸 + 최근 저장한 글 3개
- [x] Long Black: 제목 직접 입력 + 글 내용 붙여 넣어 요약 (봇 차단으로 자동 읽기 불가)
- [x] 요약을 '비서 읽기 보고서' 양식으로 (표지/펼치기, 6개 섹션, 명조체 제목, summary 1만 자)
- [x] 메뉴: '뉴스' → '트렌드' 하위 메뉴(EO planet · Long Black · 저장한 글), 사이트별 화면 `/news/eo`·`/news/longblack`, 보고서 머리글 'MIYA STUDIO'·작성자 MOMO
- 확인: `/news`에 EO planet 글 링크를 붙여 넣고 "저장하고 요약하기" → `/insights`에서 요약 아래에 메모를 남기고, 글을 삭제해 보기

## 20단계. 디자인 개편: Deep Space Mono (2026-10-09)
- [x] 기반: 우주 색 토큰·글꼴 4종(`app/globals.css`, `app/layout.tsx`), 별 배경(`components/space-background.tsx`), MOMO 원본 이미지(`public/momo.png`)·신호 줄(`components/momo-avatar.tsx`), 관측 창·이름표·픽셀 막대(`components/space-ui.tsx`)
- [x] 오늘 화면·위쪽 메뉴: 가운데 MIYA STUDIO·시계·MOMO와 대화, 보낸 사람 칩 + 문장마다 줄바꿈 + 한 글자씩 도착, NOW 카드, 타임라인, 이번 주 목표 큰 숫자·24칸 막대
- [x] 목표·MOMO 대화: MOMO 프로필, 생각 중 표시, 새 답 한 글자씩, 계획안·궤도 빈 화면
- [x] 로그인 화면
- [x] 나머지 화면(캘린더 색, 트렌드, 저장한 글, 프로젝트, 프로필)은 배치 그대로 색·글꼴·버튼만
- 확인: `/`를 PC와 휴대폰(375px)에서 열고 MOMO 메시지가 한 글자씩 도착하는 동안 아래 할 일이 바로 보이는지, `/goals/new`에서 MOMO에게 말을 걸어 새 답이 한 글자씩 오는지, `/login`·`/calendar`가 검은 우주 화면인지

## 21단계. 첫 배포 (2026-10-09)
- [x] GitHub(main) → Vercel 프로젝트 `miya-studio` 연결. 주소: https://miya-studio-chi.vercel.app (main에 올리면 자동 배포)
- [x] Vercel 환경 변수 4개(Supabase URL·공개 키·서비스 키, Anthropic 키). `CLAUDE_MODEL`은 코드 기본값과 같아 넣지 않음
- [x] Function Region: 서울(icn1) — 응답 머리글 `x-vercel-id`가 `icn1::icn1::…`
- [x] Supabase URL Configuration: Site URL을 배포 주소로, Redirect URLs에 배포 주소 `/auth/callback` 추가(localhost 유지)
- 확인함: 배포 주소에서 카카오 로그인 → 오늘 화면, MOMO 메시지 한 글자씩 도착

## 현재 상태 · 다음 세션에서 이어서 할 일 (2026-10-08 저장)

**된 것**
- 1~9단계 코드 완료, `npm run build`·`npm run lint` 통과
- 카카오 로그인 성공 (개인 개발자 비즈 앱 전환, 동의 항목: 닉네임·프로필 사진·이메일)
- AI 메시지를 Gemini → **Claude API**(`claude-opus-5-5`, effort low)로 교체, 실제 생성·저장 확인
- 로그인 시작을 서버(`/auth/login`)로 옮김, `.npmrc`로 Avast 백신 HTTPS 검사 문제 해결 (`DECISIONS.md` 2장)

**다음에 할 일 (순서 추천)**
1. 실제로 써 보며 점검: 첫 목표를 AI 비서와 세우기, 캘린더에 점심시간 같은 루틴 넣기, 프로필에서 일할 시간 맞추기
2. `SUPABASE_SERVICE_ROLE_KEY`를 `.env.local`에 넣기 → `/news`에서 글 추가·삭제 확인 (지금은 비어 있음)
3. Supabase 정리: Authentication에서 **Email 로그인 끄기**, 본인 로그인 후 **새 가입 막기**(나만 쓰는 앱으로)
4. (선택) 구글 로그인 키 등록
5. ~~배포~~ → 2026-10-09 완료 (21단계)
6. (나중) PRD "있으면 좋음": 할 일 순서 바꾸기, 인사이트 검색

**주의**
- `.npmrc`를 바꾸면 개발 서버를 껐다 켜야 적용됩니다.
- `npm run dev` 때 "Another next dev server is already running"이 나오면, 안내에 나온 `taskkill /PID 번호 /F`로 이전 서버를 끄고 다시 실행합니다.

## 이번 버전에서 하지 않은 것 (PRD "있으면 좋음"·"나중")
- 인사이트 검색, 외부 캘린더(구글 캘린더) 연동, 알림, 주간 리뷰 자동화
