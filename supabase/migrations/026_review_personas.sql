-- ════════════════════════════════════════════════════════════════════
-- 기획서 검토자(피드백 페르소나) — '피드백 받기' 기능의 커스텀 검토자 저장
-- 프리셋은 코드(lib/review-personas.ts)에 내장, 사용자가 만든 검토자만 여기 저장.
-- 전 기기(PC·모바일) 동기화를 위해 DB 보관.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS review_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,                       -- 프로젝트 범위 (단일 프로젝트 운영이라 사실상 고정)
  name TEXT NOT NULL,                    -- 검토자 이름
  emoji TEXT DEFAULT '🧐',               -- 대표 이모지
  identity TEXT,                         -- 한 줄 정체성 (예: "10년차 라이브 서비스 기획자")
  perspective TEXT,                      -- 시선/관점 — 무엇을 걸러내고 중시하는가
  tone TEXT,                             -- 말투/성격 (예: 냉정·논리형 / 우호·코칭형)
  strictness INT DEFAULT 3,              -- 엄격도 1~5
  knowledge JSONB DEFAULT '{"bible":true,"rules":true,"refgames":true,"expertise":""}'::jsonb,
                                         -- 지식범주: 바이블/절대규칙/참고게임 사용 여부 + 고유 전문성 메모
  created_by_nickname TEXT,             -- 만든 사람(세션 닉네임)
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_personas_project ON review_personas (project_id, sort_order, created_at);

ALTER TABLE review_personas DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE review_personas IS '기획서 피드백 검토자(페르소나) — 사용자 정의분. 프리셋은 코드 내장.';
