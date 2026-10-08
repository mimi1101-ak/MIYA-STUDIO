# TASKS — 24시간 비서 작업 순서

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
- 확인: 로그아웃 상태에서 `/planner`를 열면 `/login`으로 이동하는지

## 4단계. 플래너 + 대시보드 오늘 할 일
- [x] `/planner`: 오늘 / 이번 주 / 이번 달 탭, 항목 추가·수정·삭제·완료 체크
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
- [x] `/news`: 출처별 탭(EO planet / Long Black / 네이버 시장·트렌드), 글 목록, 원문 링크(새 탭)
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


## 현재 상태 · 다음 세션에서 이어서 할 일 (2026-10-08 저장)

**된 것**
- 1~9단계 코드 완료, `npm run build`·`npm run lint` 통과
- 카카오 로그인 성공 (개인 개발자 비즈 앱 전환, 동의 항목: 닉네임·프로필 사진·이메일)
- AI 메시지를 Gemini → **Claude API**(`claude-opus-5-5`, effort low)로 교체, 실제 생성·저장 확인
- 로그인 시작을 서버(`/auth/login`)로 옮김, `.npmrc`로 Avast 백신 HTTPS 검사 문제 해결 (`DECISIONS.md` 2장)

**다음에 할 일 (순서 추천)**
1. 실제로 써 보며 점검: 플래너 할 일 추가·수정·삭제, 마이 프로젝트, 인사이트 작성 → 새로고침해도 남는지
2. `SUPABASE_SERVICE_ROLE_KEY`를 `.env.local`에 넣기 → `/news`에서 글 추가·삭제 확인 (지금은 비어 있음)
3. Supabase 정리: Authentication에서 **Email 로그인 끄기**, 본인 로그인 후 **새 가입 막기**(나만 쓰는 앱으로)
4. (선택) 구글 로그인 키 등록
5. 배포: GitHub에 올리기 → Vercel 가져오기 → 환경 변수 등록(`.env.local`의 값들) → Function Region을 Seoul(icn1)로 → Supabase URL Configuration에 배포 주소와 `/auth/callback` 추가
6. (나중) PRD "있으면 좋음": 할 일 순서 바꾸기, 인사이트 검색

**주의**
- `.npmrc`를 바꾸면 개발 서버를 껐다 켜야 적용됩니다.
- `npm run dev` 때 "Another next dev server is already running"이 나오면, 안내에 나온 `taskkill /PID 번호 /F`로 이전 서버를 끄고 다시 실행합니다.

## 이번 버전에서 하지 않은 것 (PRD "있으면 좋음"·"나중")
- 할 일 순서 바꾸기(끌어서 옮기기), 인사이트 검색, 캘린더 연동
