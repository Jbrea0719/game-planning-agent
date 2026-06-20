# CLAUDE.md — 이 repo 작업 가드

## 이 repo의 정체
- **조던(Jordan)** — 영웅수집형 모바일 게임 기획 전문 AI 챗봇.
- repo: `game-planning-agent` · 배포: `game-planning-agent.vercel.app/chat`
- 전용 Supabase 프로젝트: **`cgplll…`** (NEXT_PUBLIC_SUPABASE_URL).

## ⛔ 경계 규칙 — 다른 프로젝트 기능을 여기 만들지 말 것
이 repo는 **게임 기획 전용**입니다. 아래는 **여기에 두면 안 됩니다.**

| 만들면 안 되는 것 | 올바른 위치 |
|---|---|
| 유튜브·영상·**대본(scripts)** 편집/보관 기능 | **코비(`youtube-studio`)** repo — 별도 repo + 별도 Supabase(`gnryzm…`) |

> 📌 **사고 이력(2026-05-31, 커밋 d576777):** 코비 소속 "대본 편집기"가 조던 repo에 잘못 추가·배포된 적이 있음. 한 세션이 **코비 작업을 조던 폴더에서 수행**해 발생. 2026-06-03에 제거함.
> 기존 병렬 안전장치(한 세션씩·같은 파일 동시편집 금지)는 "같은 파일 충돌"만 막을 뿐, **엉뚱한 repo에 기능 생성**은 못 막으므로 이 문서로 보강.

## ✅ 세션 시작 시 확인
1. **작업 의도 ↔ 현재 폴더 일치** 확인. 대본/유튜브/영상 작업이면 **여기서 멈추고 `youtube-studio`로 이동.**
2. Supabase URL이 `cgplll…`(조던)인지 확인. `gnryzm…`(코비)면 잘못된 위치.
3. `HANDOFF.md` 읽고 이어가기.

## UI 디자인 원칙
UI 화면·컴포넌트를 새로 만들거나 수정할 때는 아래 가이드라인을 기본으로 적용한다.
별도 디자인 지시가 있으면 그쪽을 우선한다.

@C:/Users/Admin/.claude/skills/frontend-design/SKILL.md

## 작업 규칙 (요약 — 상세는 HANDOFF.md)
- **한국어로 답변**, 상급자께 보고하듯 격식 존댓말. 비전문가 PD 대상이라 기술 용어는 괄호로 풀이.
- **빌드 통과 시 master에 바로 커밋·푸시**(Vercel 자동 배포). 단, 삭제·force-push 등 되돌리기 어려운 작업만 사전 확인.
- 브랜치 만들지 말 것 — master 직접 푸시.
- API 키 하드코딩 금지(`.env.local`만). 코드 주석은 한국어(학습 목적).
