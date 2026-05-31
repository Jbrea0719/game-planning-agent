-- ════════════════════════════════════════════════════════════════════
-- 대본(scripts) 테이블 — 유튜브 등 영상 대본 보관·편집
-- 각 row = 대본 1개 (제목 + 본문 마크다운). 웹에서 직접 작성·수정.
-- 기획서(design_docs)와 분리된 독립 공간.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '제목 없는 대본',
  content TEXT NOT NULL DEFAULT '',        -- 본문 (마크다운/평문)
  status TEXT DEFAULT 'draft',             -- 'draft' | 'final' | 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scripts_updated ON scripts (updated_at DESC);

ALTER TABLE scripts DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE scripts IS '영상 대본 보관·편집 — 제목+본문 마크다운, 웹에서 직접 작성/수정';
