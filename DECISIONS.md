# DECISIONS — 자동 완성 모드에서 정한 내용

> 기준: "가장 단순하고 무료인 선택지". 나중에 바꾸고 싶으면 해당 항목만 알려 주세요.
> 작성일: 2026-10-08

## 1. PRD 9장 미결 사항

| # | 질문 | 결정 | 이유 |
|---|---|---|---|
| 1 | 외부 글(EO planet, Long Black, 네이버)을 어떻게 가져올까? | **직접 링크 붙여넣기.** `/news` 각 탭에서 제목·링크(+분류·날짜 선택)를 입력해 저장 | 무료이고 가장 단순합니다. 자동 수집은 각 사이트 이용약관 확인이 필요하고, 세 사이트 모두 공개 RSS(새 글 목록 주소)를 확인할 수 없었습니다. 탭마다 원래 사이트 바로가기 링크를 두어 찾아서 붙여넣기 쉽게 했습니다 |
| 2 | Long Black은 제목·링크만? 본문까지? | **제목·링크(+날짜)만** | 유료 구독 콘텐츠이고, CLAUDE.md 규칙상 외부 본문은 저장하지 않습니다 |
| 3 | "네이버 시장·트렌드"는 어떤 정보? | **하나의 탭에 "시장"(네이버 증권 등)과 "트렌드"(네이버 데이터랩 등) 두 분류로 링크를 저장** | DB에 이미 `naver_market` / `naver_trend` 두 출처가 정의돼 있어 그대로 활용. 지수·검색량 같은 자동 데이터는 API 키·수집이 필요해 이번 버전에서 제외 |
| 4 | EO planet "각 분야"는? | **고정 목록 없이 글을 추가할 때 분류(예: 창업, 커리어)를 자유롭게 입력**, 목록에 분류 표시 | 분야 목록을 미리 정할 근거가 없어 가장 유연하고 단순한 방식 선택 |
| 5 | 인사이트는 직접 작성? AI 요약 초안? | **직접 작성** | AI 요약은 원문 본문이 필요하고(본문 저장 금지 규칙과 충돌), 비용도 생깁니다 |
| 6 | AI 메시지는 무엇을 바탕으로? 말투·길이? | **오늘 날짜·요일만 바탕으로, 존댓말 2~3문장(120자 안팎), 이모지 없이 차분하게** | 처음엔 무료 AI(보낸 내용이 서비스 개선에 쓰일 수 있음)를 기준으로 정했고, Claude API로 바꾼 뒤에도 그대로 두었습니다. 할 일·목표를 반영하고 싶으면 알려 주세요 |
| 7 | 어떤 AI 서비스? 비용은? | **Claude API (사용자가 2026-10-08 직접 선택), 모델 `claude-opus-5-5`** (`.env.local`의 `CLAUDE_MODEL`로 변경 가능). 생각 정도(effort)는 `low`, 안전 필터 거절 시 다른 모델로 자동 재시도(`fallbacks: "default"`) 켜 둠 | 처음엔 무료인 Gemini로 정했으나 사용자가 Claude API를 쓰기로 해서 바꿨습니다. 하루 1회·짧은 메시지라 비용은 한 달에 약 0.4달러(500원 안팎)로 예상합니다. 더 아끼려면 `CLAUDE_MODEL=claude-haiku-5-5`로 바꾸면 됩니다. 선불 크레딧이 필요합니다 |
| 8 | 외부 글은 하루에 몇 번 새로 가져올까? | **해당 없음** (자동 수집을 하지 않으므로, 필요할 때 직접 추가) | 1번 결정에 따름 |
| 9 | 못 끝낸 오늘 할 일은 다음 날로 넘길까? | **그대로 둔다** (자동으로 넘기지 않음) | 가장 단순합니다. 오늘 탭은 오늘 날짜 할 일만 보여 주므로 어제 못 끝낸 일은 오늘 다시 추가합니다 |

## 2. 만들면서 정한 세부 사항

- **문서 위치**: 루트에 있던 `PRD.md`를 CLAUDE.md 구조에 맞춰 `docs/PRD.md`로 옮겼습니다. `docs/TASKS.md`가 없어서 PRD를 바탕으로 새로 만들었습니다.
- **Supabase 프로젝트**: 새 프로젝트 `24h-assistant`(서울 리전 `ap-northeast-2`, 무료 플랜, 월 $0)를 만들었습니다. 기존 프로젝트(prd-builder 등)는 건드리지 않았습니다.
- **ID 형식**: PRD의 "id(글자)"는 Postgres `uuid`(글자 형태의 고유 번호)로 저장합니다. user_id는 로그인 사용자 표(auth.users)와 연결해, 계정을 지우면 데이터도 함께 지워집니다.
- **기준 날짜**: 오늘 할 일 = 오늘 날짜, 주간 할 일 = 이번 주 **월요일**, 월간 목표 = 이번 달 **1일**을 `target_date`로 저장합니다. 모두 한국 시간 기준입니다.
- **articles 쓰기**: 규칙("쓰기는 서버만")대로 브라우저에서는 쓸 수 없고, 서버 기능이 `SUPABASE_SERVICE_ROLE_KEY`로만 추가·삭제합니다. 그래서 이 키가 없으면 글 추가가 안 됩니다(아래 "키 필요").
- **권한 정리**: 비로그인 사용자는 어떤 표도 읽을 수 없고, daily_messages는 로그인 사용자도 읽기·추가만 가능(수정·삭제 불가)하게 했습니다.
- **글꼴**: 별도 웹폰트를 내려받지 않고 기기 기본 한글 글꼴(맑은 고딕, Apple SD 산돌고딕 Neo 등)을 씁니다. 빠르고 무료입니다.
- **Next.js 16.4의 새 기본값**: Cache Components(화면을 미리 만들어 두고 로그인 정보가 필요한 부분만 나중에 채우는 방식)가 켜져 있어, 각 화면의 데이터 부분을 "불러오는 중" 상자로 감쌌습니다. 로그인 검사 파일은 Next.js 16 규칙에 따라 `middleware.ts`가 아니라 `proxy.ts`입니다.
- **shadcn/ui 버전**: 최신 shadcn/ui 기본값(Base UI 기반 `base-nova` 스타일, 무채색 `neutral`)을 그대로 썼습니다. `shadcn` 패키지는 빌드 때 CSS 파일 하나만 쓰므로 개발용 라이브러리(devDependencies)로 두었습니다. 이렇게 하면 실제 서비스용 라이브러리의 보안 경고가 0건입니다(`npm audit --omit=dev`).
- **로그인 시작은 서버에서** (2026-10-08 수정): 로그인 버튼은 `/auth/login?provider=kakao`로 이동하고, 서버가 로그인 확인용 쿠키(PKCE)를 만든 뒤 카카오 화면으로 보냅니다. Supabase가 서버 렌더링 앱에 권장하는 방식이고, 버튼을 여러 번 눌러도 한 번만 진행됩니다.
- **`.npmrc`의 `node-options=--use-system-ca`** (2026-10-08 추가): 이 PC의 Avast 백신이 HTTPS 연결을 검사하면서 자체 인증서로 바꿔 끼워, 개발 서버가 Supabase에 접속할 때 `fetch failed`(UNABLE_TO_VERIFY_LEAF_SIGNATURE) 오류가 났습니다. 이 옵션으로 Node.js가 윈도우에 등록된 인증서(Avast 인증서 포함)도 믿게 했습니다. 이 프로젝트의 `npm run …` 명령에만 적용되며, 백신·PC 설정은 바꾸지 않았습니다.
- **카카오 동의 항목**: Supabase는 카카오에 이메일·프로필 사진·닉네임을 항상 함께 요청하므로, 세 항목 모두 동의 항목에 설정해야 합니다(이메일은 개인 개발자 비즈 앱 전환 필요). 위 "키 필요" 표의 "이메일은 비즈 앱만 가능" 안내는 이 내용으로 바로잡습니다.
- **Vercel 지역(권장, 직접 설정)**: DB가 서울에 있으므로 Vercel 프로젝트 Settings → Functions → Function Region을 **Seoul (icn1)** 으로 바꾸면 화면이 더 빨라집니다. 설정 파일을 따로 추가하지는 않았습니다.

## 4. 확인한 것 / 확인하지 못한 것

- 확인함: 단계마다 `npm run build`·`npm run lint` 통과, 로그아웃 상태에서 `/`, `/planner`, `/news` → `/login` 이동, `/api/daily-message` 로그인 없이 호출 시 401(거부), 로그인 실패 안내 문구, Supabase에 로그인 없이 접근 시 6개 표 모두 "권한 없음", 보안 점검(advisor) 경고 0건, 휴대폰(375px)에서 가로로 넘치는 화면 없음.
- 확인하지 못함: 실제 로그인 후의 저장·수정·삭제 동작과 AI 메시지 생성. 로그인·AI 키가 없어서입니다. 로그인 후 화면 배치는 견본 데이터로만 확인했습니다(확인용 임시 페이지는 지웠습니다).

## 3. 키 필요 (가짜로 만들지 않고 비워 둔 부분)

| 무엇 | 어디에 필요한가 | 어떻게 얻나 | 넣을 곳 |
|---|---|---|---|
| 카카오 로그인 키 (REST API 키 + Client Secret) | 카카오 로그인 | [Kakao Developers](https://developers.kakao.com) → 앱 만들기 → 카카오 로그인 켜기 → Redirect URI에 `https://qjalflpcirskeldpuomj.supabase.co/auth/v1/callback` 등록 → 동의 항목: 닉네임·프로필 사진 (이메일은 비즈 앱만 가능) | Supabase 대시보드 → Authentication → Sign In / Providers → Kakao 켜고 Client ID·Secret 입력. 이메일 동의 항목을 안 쓰면 **Allow users without an email** 켜기 |
| 구글 로그인 키 (OAuth Client ID + Secret) | 구글 로그인 | [Google Cloud Console](https://console.cloud.google.com) → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹) → 승인된 리디렉션 URI에 `https://qjalflpcirskeldpuomj.supabase.co/auth/v1/callback` 등록 | Supabase 대시보드 → Authentication → Sign In / Providers → Google |
| 로그인 후 돌아올 주소 허용 | 카카오·구글 로그인 공통 | — | Supabase 대시보드 → Authentication → URL Configuration → Site URL에 배포 주소, Redirect URLs에 `http://localhost:3000/auth/callback`과 `https://(배포주소)/auth/callback` 추가 |
| `ANTHROPIC_API_KEY` | AI 동기부여 메시지 | [Claude Console](https://platform.claude.com) → API Keys에서 발급(`sk-ant-`로 시작), Billing에서 크레딧 충전 | `.env.local` (+ Vercel 환경 변수) |
| `SUPABASE_SERVICE_ROLE_KEY` | 뉴스 글 추가·삭제 (서버만 쓰기) | Supabase 대시보드 → Project Settings → API Keys → secret 키(`sb_secret_…`) 또는 service_role 키 | `.env.local` (+ Vercel 환경 변수). **절대 공개하지 마세요** |
| Vercel 배포 | PC·휴대폰 어디서나 접속 | GitHub에 올린 뒤 Vercel에서 가져오기(Import) | Vercel 환경 변수에 `.env.local`의 값 5개 등록 |

키가 없을 때의 동작:
- 카카오·구글 키 없음 → 로그인 버튼을 누르면 Supabase가 "provider is not enabled" 안내를 보여 줍니다.
- `ANTHROPIC_API_KEY` 없음 → 대시보드에 "오늘의 메시지를 불러오지 못했어요"와 다시 시도 버튼, "AI 키가 아직 설정되지 않았어요" 안내가 보입니다.
- `SUPABASE_SERVICE_ROLE_KEY` 없음 → 글 추가 시 "서버 키가 설정되지 않아 글을 추가할 수 없어요" 안내가 보입니다.
