-- ════════════════════════════════════════════════════════════════════
-- 기획서 댓글 (유튜브식: 의견 + 답글)
-- doc_family_id에 붙임 → 기획서 버전이 올라가도 댓글 유지.
-- parent_id NULL = 최상위 의견, 값 있으면 그 의견의 답글(1단계).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_family_id UUID NOT NULL,
  parent_id UUID,                       -- NULL=최상위, 값=답글 대상 댓글 id
  content TEXT NOT NULL,
  nickname TEXT,                        -- 작성자(세션 닉네임)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_family ON doc_comments (doc_family_id, created_at);
CREATE INDEX IF NOT EXISTS idx_doc_comments_parent ON doc_comments (parent_id);

ALTER TABLE doc_comments DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE doc_comments IS '기획서 댓글 — doc_family_id 기준, parent_id로 1단계 답글';
