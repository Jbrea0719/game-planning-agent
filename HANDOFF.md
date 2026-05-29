# 🤝 핸드오프 노트 (인수인계 메모)

> **용도:** PC 터미널 세션에서 작업하던 내용을 웹(claude.ai/code)·모바일 세션으로 이어가기 위한 인수인계 문서.
> **새 세션 시작 시:** "HANDOFF.md 읽고 이어서 작업해줘"라고 한마디만 하면 됨.
> **최종 갱신:** 2026-05-29 (PC 터미널 → 웹 세션 이어작업)

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

## 🚧 다음에 할 만한 것 (미정 / 사용자와 상의 필요)

- 모바일 추가 개선 — **음성 입력**(가장 가벼움·추천), **푸시 알림**(서비스워커+VAPID+백엔드+DB 필요, 큼), **오프라인 캐시**(서비스워커·PWA 활용). ※ PWA 토대는 이번에 깔려서 푸시가 이전보다 수월해짐.
- 인터뷰 모드 고도화
- 기획서 카테고리 ↔ 바이블 카테고리 정합성 점검

---

## 🔒 반드시 지킬 규칙 (사용자 요청)

1. **한국어로 답변.** 비전문가 PD이므로 기술 용어는 풀어서 설명.
2. **모든 실행 내용에 괄호로 쉬운 설명** 추가.
3. **$ 금액 표기 시 괄호로 원화 환산** 병기.
4. **모바일 우선 고려** — 새 기능 시 모바일 영향 먼저 체크·선제 제안.
5. **API 키 하드코딩 금지** — `.env.local`에만.
6. **master 직접 push 금지** — 사용자가 "푸시"/"push" 명시할 때만.
7. **위험한 작업(삭제·force push 등) 전 확인.**
8. **TypeScript 타입 안정성, 코드 주석은 한국어(학습 목적).**
9. 큰 변경은 단계별로 쪼개서 확인받기. 답변은 짧고 간결하게.

---

## 💡 새 세션에서 이어가는 법

1. PC 브라우저 `claude.ai/code` (또는 모바일 Code 탭)에서 **이 폴더로 새 세션** 시작
2. **"HANDOFF.md 읽고 이어서 작업해줘"** 입력
3. 메모리(`~/.claude/.../memory/MEMORY.md`)도 자동 참조되니 사용자 선호·과거 맥락 그대로 이어짐

> ⚠️ 앞으로는 **PowerShell엔 `claude remote-control`만 켜두고**, 실제 작업은 **브라우저 + 모바일에서만** 하면 PC ↔ 모바일이 하나처럼 동기화됨.
