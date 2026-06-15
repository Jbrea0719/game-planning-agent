-- ════════════════════════════════════════════════════════════════════
-- 절대 규칙(게임 헌법) — 기획 바이블보다 상위 레이어
-- 게임 전체를 관통하는 불변 규칙(예: 가로형, 턴제, 다IP 콜라보)을 보관.
-- 모든 답변·기획서 생성 시 반드시 주입·준수.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS absolute_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  content TEXT NOT NULL,                 -- 절대 규칙 한 줄 (예: "우리 게임은 가로형이다")
  sort_order INT DEFAULT 0,             -- 표시 순서
  created_by_nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_absolute_rules_project ON absolute_rules (project_id);

ALTER TABLE absolute_rules DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE absolute_rules IS '게임 절대 규칙(헌법) — 바이블보다 상위, 모든 답변·기획서가 반드시 준수';
