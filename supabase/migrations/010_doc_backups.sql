-- 기획서 수정 전 백업 저장소
-- 수정 요청 시 기존 본문을 여기에 보관 → 7일 후 자동 삭제

CREATE TABLE IF NOT EXISTS design_doc_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL,             -- 원본 doc id (FK 없음 — doc 삭제돼도 백업 유지)
  project_id UUID,
  title TEXT,
  content_markdown TEXT,
  reason TEXT,                       -- 백업 사유 (예: "수정 요청 직전")
  instruction TEXT,                  -- 수정 지시 텍스트 (있으면)
  created_by_nickname TEXT,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_doc_backups_doc ON design_doc_backups(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_backups_expires ON design_doc_backups(expires_at);

ALTER TABLE design_doc_backups DISABLE ROW LEVEL SECURITY;
