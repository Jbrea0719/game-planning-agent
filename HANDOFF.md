# 🤝 핸드오프 노트 (인수인계 메모)

> **용도:** PC 터미널 세션에서 작업하던 내용을 웹(claude.ai/code)·모바일 세션으로 이어가기 위한 인수인계 문서.
> **새 세션 시작 시:** "HANDOFF.md 읽고 이어서 작업해줘"라고 한마디만 하면 됨.
> **최종 갱신:** 2026-05-30 (음성 입력 완료 반영)

---

## 📌 이 프로젝트가 뭐야

**조던(Jordan)** — 영웅수집형 모바일 게임 기획 전문가 AI 챗봇.
- 사용자(김정민): 넷마블넥서스 대표 8년, 세븐나이츠 PD 출신. **프로그래밍 초보, 기획·사업 전문가.** 현재 창업 준비 중.
- 목적: 자신의 게임 기획 전문성을 AI에 담아 창업 도구로 활용.
- 배포: Vercel (`game-planning-agent.vercel.app/chat`)

---

## ⚙️ 기술 스택

- **Next.js 16** (App Router) + TypeScript + Tailwind
- **Supabase** (PostgreSQL + Storage)
- **Anthropic Claude SDK** — Opus(최종답변·기획서) / Sonnet(내부분석) / Haiku
- 멀티 에이전트 파이프라인: router → search → final answer → extract
- Excalidraw(와이어프레임), html2canvas(PNG), Jina Reader(네이버 라운지 크롤링)

---

## 🗂️ 핵심 파일 지도

| 파일 | 역할 |
|---|---|
| `app/chat/page.tsx` | 메인 데스크톱 챗 페이지 + 디바이스 분기(모바일/프레임) |
| `components/MobileChatPage.tsx` | 모바일 전용 챗 UI (헤더·입력창·메뉴·설정·가이드) |
| `hooks/useIsMobile.ts` | 디바이스 감지 + `?view=mobile-ios/android` 강제 모드, `DEVICE_FRAMES` |
| `app/api/agent/route.ts` | 메인 답변 생성 (멀티에이전트, max_tokens, 시스템 프롬프트) |
| `app/api/chat/route.ts` | 자세한 답변 스트리밍 |
| `app/api/messages/route.ts` | 대화 CRUD (GET/POST/DELETE/PATCH) |
| `app/api/messages/detail/route.ts` | 자세한 답변 본문·표시상태 DB 저장 |
| `app/api/jordan-interview/next-question/route.ts` | 인터뷰 모드 — 빈 영역 분석 후 질문 생성 |
| `components/DecisionPanel.tsx` | 기획 바이블 (결정사항 누적) |
| `components/DocumentView.tsx` | 기획서 열람·수정·내보내기 + 🎨 화면 설계 진입 |
| `components/WireframeEditor.tsx` / `MockupGenerator.tsx` | 와이어프레임 / AI 시안 생성 |

---

## ✅ 최근 완료한 작업 (이번 세션)

1. **자세한 답변 DB 영구 저장** — 한 번 펼치면 다음부터 펼친 상태 유지 (`detail_content`, `detail_shown` 컬럼, migration 012)
2. **PC에서 모바일 뷰 미리보기** — 설정 → 📱 iPhone 14 / Android / 풀스크린, `?view=mobile-ios` 등
3. **모바일 메시지 액션 버튼** — ⋯ → 🗑️ → 🛠️ 도구 아이콘으로 확정
4. **모바일 키보드 레이아웃 이슈** — `h-[100dvh]` 동적 뷰포트 적용
5. **PC 모바일 프레임 채팅 작동 + 가짜 키보드 시뮬레이션** — 입력창 포커스 시 280px 가짜 키보드 UI
6. **PC 모바일 프레임 자동 축소** — 모니터보다 클 때 비율 유지하며 축소 (입력창 잘림 해결) ← 가장 최근 커밋 `08bfdb9`

**git 상태:** 위 6개 항목은 master에 커밋·푸시 완료.

---

## ✅ 이어작업 세션 완료 (2026-05-29, 웹) — 브라우저별 UI 통일

목표: *"모바일 브라우저마다 UI가 미세하게 달라 보임 → 전 기기 동일하게."*

1. **한글 웹폰트 Pretendard 적용** — 기존엔 한글 글꼴 미지정(`Arial`)이라 기기마다 시스템 글꼴(애플SD고딕/노토/삼성One)로 달랐음. CDN 연결 후 전 기기 동일. (`app/layout.tsx` `<head>` 링크, `app/globals.css` font-family)
2. **PWA 전체화면 설치** — 홈 화면에 설치하면 주소창·툴바 없이 전체화면(standalone). (`app/manifest.ts`, 아이콘 4종 `public/icon-*.png` + `app/apple-icon.png`, `scripts/gen-icons.cjs`로 아바타에서 생성, layout에 themeColor·appleWebApp)
3. **이모지 전 기기 통일** — Twemoji 컬러 웹폰트 자체 호스팅(`public/fonts/twemoji.woff2`, 465KB). `globals.css` `@font-face` + `unicode-range`로 **이모지 코드포인트에만** 적용 → 304곳 코드·DB 데이터 안 건드리고 통일. (SVG 전면교체는 304곳·데이터결합 20곳 위험 커서 폐기, 웹폰트로 선회)

**검증:** `npm run build` 통과 + 로컬 프로덕션 서버에서 폰트(200)·매니페스트·HTML 링크 확인 완료.
**⚠️ 남은 확인:** 실제 폰/배포본에서 ① 이모지가 Twemoji로 통일됐는지 ② `☰ ➤ ✕ ▼` 같은 UI 기호가 안 깨졌는지 눈으로 확인 권장 (코드상 폴백 처리했으나 실기기 확인이 확실).

**git 상태:** 이어작업분(폰트·PWA·이모지)은 **아직 커밋 안 함** — 사용자가 "푸시" 지시할 때만.

---

## ✅ 세션 완료 (2026-05-30) — 카테고리 동기화 + 결정사항 AI 재분류

목표: *"기획서 카테고리를 수정하면 바이블 카테고리도 실시간 동기화 + 변경에 맞춰 결정사항 자동 재배치."*

1. **실시간 카테고리 동기화** — 기획서에서 카테고리 추가/수정/삭제 시 바이블 패널 카테고리가 새로고침 없이 즉시 갱신. (`DecisionPanel` `categoryReloadKey` prop + 재fetch effect, `DocumentView` `onCategoriesChanged` 콜백, `chat/page.tsx`·`MobileChatPage.tsx`에 `categoryReloadKey` 상태 배선)
2. **AI 재분류 엔진** — `lib/decision-reclassifier.ts`(Haiku로 결정사항을 현재 카테고리 트리에 매칭, 25개씩 배치·캐시 없이 최신 조회) + `app/api/decisions/reclassify`(`preview`=제안만/`apply`=확정 적용 분리).
3. **삭제 연동 + 검토 모달** — 소카테고리 삭제 시 미분류된 결정 id를 API가 반환(`api/categories/sub/[id]` DELETE) → `CategoryManager` `onOrphaned` → `DocumentView`가 `ReclassifyReview` 모달 표시 → 사용자 체크·확정 후에만 적용. 적용 후 `onDecisionsChanged`로 바이블 결정사항 새로고침.

**설계 원칙:** 제안/적용 분리로 **AI가 임의로 DB 변경 안 함** — 반드시 사람 확인 후 반영. 체크 해제 시 미분류 유지.
**검증:** `npm run build` 통과. **git:** master 푸시 완료(`1cccf5a`) → Vercel 자동 배포.
**⚠️ 남은 확인:** 실기기/배포본에서 소카테고리 삭제 → 🤖 재분류 검토 모달이 뜨고 적용 후 바이블에 반영되는지 눈으로 확인 권장.

## ✅ 세션 완료 (2026-05-30) — 모바일 음성 입력

목표: *"모바일에서 타이핑 대신 말로 입력."* (HANDOFF 후보 중 추천 1순위였음)

1. **입력창 🎤 버튼** — Web Speech API(`SpeechRecognition`) 사용. 브라우저 내장 음성인식이라 별도 백엔드·DB·키 불필요(가장 가벼운 방식). 마이크 권한 허용 후 말하면 인식된 텍스트가 입력창에 채워짐.

**검증:** `npm run build` 통과. **git:** master 푸시 완료(`8263e96`) → Vercel 자동 배포.
**⚠️ 남은 확인:** 실기기에서 🎤 버튼 → 마이크 권한 → 음성이 텍스트로 잘 들어가는지 눈으로 확인 권장. (Web Speech API는 브라우저별 지원 편차 있음 — iOS Safari/Chrome 동작 확인 필요.)

## 🛑 중요 교훈 — 두 세션이 같은 파일 동시 작업 금지

2026-05-30 세션에서 **터미널 세션 + 다른 세션이 동시에** `app/chat/page.tsx`·`components/MobileChatPage.tsx`를 건드려 충돌 발생. 한 세션이 "파일이 바뀌었다"며 막힘.
→ **한 번에 한 세션에서만 작업.** 다른 세션 시작 전 현재 세션 작업을 커밋하거나 마무리할 것. `git status`로 다른 세션의 미커밋 변경 먼저 확인.
(참고: 대화 불러오기 100개 제한 버그는 터미널 세션이 `43ed5ea`로 최신 250쌍 로드로 수정·배포 완료. 무한 스크롤 고도화는 **사용자가 안 하기로 결정** — 현재 250쌍 로드로 충분.)

---

## ✅ 세션 완료 (2026-06-03) — ⓐ 대본 제거 ⓑ 카테고리 재편 ⓒ 결정 재분류 ⓓ 모바일 UI 수정

**ⓐ 대본(코비) 기능이 조던에 잘못 들어온 것 제거** — 커밋 `d576777`(2026-05-31)에서 코비(youtube-studio) 소속 "영상 대본 편집기"가 조던 repo에 잘못 추가·배포돼 있었음(세션이 코비 작업을 조던 폴더에서 수행). `app/scripts`·`app/api/scripts`·migration 013·헤더 📜대본 버튼 제거. 조던 DB의 `scripts` 테이블은 **비어 있어 데이터 영향 0**. 재발 방지로 **루트 `CLAUDE.md`(repo 경계 가드)** 신설 — "대본/유튜브 기능은 코비 소속, 여기 두지 말 것". 두 repo는 **별개 Supabase**(조던 `cgplll…` / 코비 `gnryzm…`).

**ⓑ 인게임 카테고리 18개 영역 → 8개 묶음 재편** (세븐나이츠2→리버스 스펙표 기준). 컨텐츠/전투/편의기능/길드/성장/장비/상품/기타. 신규 14개 추가, 개명 2건(신성력→`신성력 (계정 성장)`, 마스터리→`마스터리 (영웅 성장)`). **삭제 0(전부 존치)**, id 보존(결정사항·기획서 연결 유지). 인게임 소분류 159→**173개**. 운영 DB는 REST로 선반영 완료, 기록·재현은 `migrations/015_ingame_regroup.sql`. (※ 묶음 내 항목 순서·유사 항목 중복은 사용자가 **추후 점검** 예정.)

**ⓒ 결정사항 AI 재분류 7건 적용** — 재편 후 `/api/decisions/reclassify`(preview) 돌려 이동 제안 7건 사용자 승인 후 반영(돌파→영웅 성장 5, 일괄 돌파→일괄 보상 수령 1, 카테고리 분류 결정→디자인원칙 마일스톤 1). 데이터(결정사항)만 변경, 코드 변경 없음.

**ⓓ 모바일 UI 수정** — ①기획서 리스트·메뉴 **톱니바퀴 정렬**(이모지 ⚙️가 자체 Twemoji woff2 서브셋에 누락→폴백으로 어긋남 → **인라인 SVG `GearIcon`으로 교체**, `DocList.tsx`/`MobileChatPage.tsx`) ②메뉴 `MenuBtn` 아이콘 고정폭(22px)으로 라벨 정렬 ③설정·가이드 모달 스크롤 `90vh→85dvh`+하단 safe-area 여백 ④모바일 설정에 **참고 게임** 섹션+모달 추가 ⑤참고게임 11종을 `lib/reference-games.ts` 공유 상수로 추출(PC·모바일 단일 출처). ※ 톱니바퀴류 박스 아이콘이 더 생기면 `GearIcon`처럼 SVG로.

## 🎯 다음 예정 일감 (2026-06-03 사용자 지정 — 다음 세션 우선)

1. **기획서 분석 → 필요 이미지 판단** — 작성된 기획서를 읽고 어떤 이미지(레퍼런스/와이어프레임/시안)가 필요한지 자동 판단. (연계: 기존 `화면 설계`·`WireframeEditor`·`MockupGenerator` 토대 재활용 검토)
2. **판단된 이미지 자동 채움** — 레퍼런스 이미지 또는 **생성 이미지**로 자동 삽입. **이미지 생성 AI 활용 OK(유료도 가능)**. (검토: 생성 모델 선정·비용·저장(Supabase Storage)·기획서 본문 삽입 흐름)
3. **하루 10개 "바이블용" 질문 자동화** — 게임 핵심 사안을 매일 10개씩 쌓기 위한 조던 질문 자동 생성. **핵심 제약: 대화가 길어지지 않게, "답하면 즉시 바이블이 되는" 단답형 결정 질문으로 한정.** (연계: 기존 `api/jordan-interview/next-question` 확장 — 빈 영역 분석 로직 재활용, 1문1답=1결정 형태로 배치 10개 생성)

## 📅 남은 할일 (2026-06-02 지정 — 1번 완료)

1. ~~**전체 카테고리 재정비·확정**~~ ✅ 완료(2026-06-03, 위 ⓑ).
2. **조던 기획서 양식 개선** — 세븐나이츠 리버스 실제 기획서 3개 학습 → 조던 생성 기획서 양식 재정비. (자료 필요)
3. **빈 기획서 작성 실전 1개** — '작성하기'(빈 소분류 → 조던 인터뷰) 흐름을 실제로 끝까지 한 번.

## 🚧 다음에 할 만한 것 (미정 / 사용자와 상의 필요)

- 모바일 추가 개선 — ~~음성 입력~~(✅ 완료, `8263e96`), **푸시 알림**(서비스워커+VAPID+백엔드+DB 필요, 큼), **오프라인 캐시**(서비스워커·PWA 활용). ※ PWA 토대는 이번에 깔려서 푸시가 이전보다 수월해짐.
- 인터뷰 모드 고도화
- 기획서 카테고리 ↔ 바이블 카테고리 정합성 점검
- 기획서 드래그 순서: **중(area) 카테고리 정렬**은 코드순 고정이라 별도 처리 필요(area 순서 컬럼 추가 시 가능)
- ⚠️ **수동 적용 대기**(Supabase SQL): ① `ALTER TABLE design_docs ADD COLUMN IF NOT EXISTS sort_order INTEGER;`(기획서 드래그 순서 저장) ② '영웅 등급 체계' 소분류 복구 ③ (선택) 빈 `scripts` 테이블 정리: `DROP TABLE IF EXISTS scripts;` (대본 기능 제거 잔재 — 비어 있어 안 지워도 무방)

---

## 🔒 반드시 지킬 규칙 (사용자 요청)

1. **한국어로 답변.** 비전문가 PD이므로 기술 용어는 풀어서 설명.
2. **모든 실행 내용에 괄호로 쉬운 설명** 추가.
3. **$ 금액 표기 시 괄호로 원화 환산** 병기.
4. **모바일 우선 고려** — 새 기능 시 모바일 영향 먼저 체크·선제 제안.
5. **API 키 하드코딩 금지** — `.env.local`에만.
6. **푸시는 묻지 말고 자동으로** — 작업 완료·빌드 통과 시 master에 바로 커밋·푸시(Vercel 자동 배포). 매번 "푸시할까요?" 재확인 금지. ※ force-push·파일 삭제 등 위험·되돌리기 어려운 작업만 사전 확인. (2026-06-01 변경 — 이전엔 "푸시 명시할 때만"이었음)
7. **위험한 작업(삭제·force push 등) 전 확인.**
8. **TypeScript 타입 안정성, 코드 주석은 한국어(학습 목적).**
9. 큰 변경은 단계별로 쪼개서 확인받기. 답변은 짧고 간결하게.

---

## 💡 새 세션에서 이어가는 법

1. PC 브라우저 `claude.ai/code` (또는 모바일 Code 탭)에서 **이 폴더로 새 세션** 시작
2. **"HANDOFF.md 읽고 이어서 작업해줘"** 입력
3. 메모리(`~/.claude/.../memory/MEMORY.md`)도 자동 참조되니 사용자 선호·과거 맥락 그대로 이어짐

> ⚠️ 앞으로는 **PowerShell엔 `claude remote-control`만 켜두고**, 실제 작업은 **브라우저 + 모바일에서만** 하면 PC ↔ 모바일이 하나처럼 동기화됨.
