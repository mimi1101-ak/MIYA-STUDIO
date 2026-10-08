# MIYA STUDIO

## 프로젝트 개요
- 출근 첫 순간 AI 동기부여 메시지로 하루를 시작하게 해 주는 개인 대시보드입니다.
- 오늘(실행)·캘린더(계획)·목표(AI 비서가 할 일을 쪼개 일정에 넣음), 뉴스·인사이트 정리, 마이 프로젝트(만든 사이트 링크 모음)를 한 곳에 모읍니다.
- 사용자는 만든 사람 본인 한 명뿐입니다. PC와 휴대폰에서 모두 씁니다.
- 자세한 요구사항은 `docs/PRD.md`, 작업 순서는 `docs/TASKS.md`를 봅니다.

## 기술 스택
- 프레임워크: Next.js (App Router) + TypeScript
- 스타일: Tailwind CSS + shadcn/ui
- DB·로그인: Supabase (Postgres, Auth: 카카오·구글 로그인)
- AI 메시지: Claude API (`@anthropic-ai/sdk`, 키는 `.env.local`의 `ANTHROPIC_API_KEY`)
- 결제: 사용 안 함
- 배포: Vercel
- 앱 형태: 반응형 웹(PC·휴대폰 화면 크기에 맞춰 배치가 바뀌는 웹)

## 폴더 구조
- `app/` — 화면(페이지)과 서버 API(route handler: 서버에서 실행되는 기능 주소)
  - `app/page.tsx`(오늘), `app/login/`, `app/calendar/`, `app/goals/`, `app/news/`, `app/insights/`, `app/projects/`, `app/profile/` — PRD 5장 화면과 1:1 대응
  - `app/api/` — AI 메시지 생성, 글 수집 같은 서버 전용 기능
- `components/` — 여러 화면에서 쓰는 화면 조각
- `components/ui/` — shadcn/ui 기본 부품 (직접 고치지 않음)
- `lib/` — 공통 코드 (Supabase 연결, 날짜 계산, 입력값 검사 등)
- `supabase/migrations/` — DB 변경 기록(SQL 파일). 테이블 변경은 여기에만 추가
- `docs/` — `PRD.md`, `TASKS.md`

## 작업 규칙
**진행 방식**
- 한 번에 한 단계만 작업합니다. `docs/TASKS.md` 순서를 따르고, 다음 단계로 넘어가기 전에 사용자의 확인을 받습니다.
- 코드를 고치기 전에 무엇을 왜 바꿀지 계획부터 설명하고 확인을 받습니다.
- 요청하지 않은 기능·파일·라이브러리를 만들거나 추가하지 않습니다. `docs/PRD.md` 8장 "만들지 않을 것"(결제, 공유·팀 기능, 캘린더 연동, 이메일 가입, 알림, 모바일 앱)은 만들지 않습니다.
- 단계가 끝나면 사용자가 직접 확인할 방법을 알려 줍니다. 예: "브라우저에서 `/calendar`를 열고 할 일을 추가한 뒤 새로고침해도 남아 있는지 보세요."

**설명 방식**
- 사용자는 비전공자입니다. 개발 용어가 나오면 괄호 안에 한 줄 풀이를 붙입니다.
- 에러가 나면 원인과 해결 방법을 쉬운 말로 설명합니다.

**보안·데이터**
- 비밀 값(Supabase 서비스 키, AI API 키 등)은 `.env.local`에만 두고 커밋(변경 기록 저장)하지 않습니다. `.gitignore`에 `.env.local`이 들어 있는지 확인합니다.
- 비밀 값은 서버 코드(`app/api/`, 서버 컴포넌트)에서만 씁니다. 브라우저에서 보이는 값은 `NEXT_PUBLIC_`으로 시작하는 공개 값만 허용합니다.
- 사용자 데이터 테이블(profiles, tasks, goals, events, routines, routine_checks, daily_messages, insights, projects)은 모두 RLS(행 단위 보안: 자기 데이터만 읽고 쓰게 막는 규칙)를 켭니다. articles는 로그인 사용자 읽기만 허용하고, 쓰기는 서버만 합니다.
- DB 구조는 `docs/PRD.md` 6장을 따릅니다. 바꿔야 하면 먼저 사용자에게 묻고, 변경은 `supabase/migrations/`에 새 파일로 남깁니다.

**이 프로젝트 전용 규칙**
- 미결 사항(`docs/PRD.md` 9장)은 임의로 정하지 않습니다. 글 수집 방식, 메시지 내용 등은 해당 단계에서 사용자에게 먼저 묻습니다. 이미 정한 내용은 `DECISIONS.md`에 있습니다.
- AI 동기부여 메시지는 하루에 한 번만 생성합니다. 같은 날에는 `daily_messages`에 저장된 메시지를 다시 보여 주고, AI를 또 호출하지 않습니다(비용 절약).
- 외부 사이트(EO planet, Long Black)의 본문을 복사해 저장하지 않습니다. 사이트는 `/news`에 그대로 띄워 보여 주기만 합니다(네이버는 2026-10-08에 제외). 제목·링크·날짜만 저장합니다. 범위를 바꿔야 하면 사용자 확인이 필요합니다.
- 모든 화면은 휴대폰(가로 375px)과 PC 화면 모두에서 확인합니다. 디자인은 차분한 사무실 톤(밝은 배경, 무채색 위주, 과한 장식 없음)으로 맞춥니다.
- 날짜 계산(오늘·이번 주·이번 달, 하루 한 번 메시지)은 한국 시간(Asia/Seoul) 기준으로 합니다. 시각 계산은 `lib/date.ts`의 `kstToMs`/`msToKst`를 씁니다.
- 할 일의 시각 배치는 AI가 아니라 규칙 코드(`lib/schedule.ts`)가 합니다. AI는 할 일·날짜·예상 시간만 정합니다.

## 자주 쓰는 명령
- `npm install` — 필요한 라이브러리 설치 (처음 한 번, 또는 라이브러리 추가 후)
- `npm run dev` — 개발 서버 실행 → 브라우저에서 `http://localhost:3000` 접속
- `npm run build` — 배포 전 오류가 없는지 실제 빌드(배포용 묶음 만들기)
- `npm run lint` — 코드 규칙 검사(실수 찾기)
- `npx supabase migration new <이름>` — DB 변경 기록 파일 새로 만들기
- `npx supabase db push` — 변경 기록을 Supabase DB에 반영 (실행 전 사용자 확인)