-- ════════════════════════════════════════════════════════════════════
-- Phase B.1 — 기획서 (design_docs) 테이블
-- 각 row = 기획서 1개 버전 (v1, v2, v3 누적)
-- 마크다운 단일 저장, 외부 출력은 변환으로 처리
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS design_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  version_no INT NOT NULL,                  -- 1, 2, 3...
  title TEXT NOT NULL,                      -- 'v1.0 초안', 'v2.0 BM 보강' 등
  content_markdown TEXT NOT NULL,           -- 전체 본문 마크다운
  sections JSONB,                           -- {"개요": "...", "코어루프": "..."} (검색·편집용)
  status TEXT DEFAULT 'draft',              -- 'draft' | 'final' | 'archived'
  changes_summary TEXT,                     -- 이전 버전 대비 변경점 요약
  decision_snapshot JSONB,                  -- 이 기획서 생성 시점의 결정사항 스냅샷 (변경 추적)
  source_decision_ids UUID[],               -- 이 기획서가 활용한 decisions의 ID 배열
  created_by_nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_docs_project ON design_docs (project_id);
CREATE INDEX IF NOT EXISTS idx_docs_version ON design_docs (project_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_docs_status ON design_docs (status);

ALTER TABLE design_docs DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE design_docs IS '기획서 버전 누적 — 마크다운 단일 저장, 외부 출력은 변환';
COMMENT ON COLUMN design_docs.sections IS '섹션별 분할 (예: {"1_overview": "...", "2_core_loop": "...", ...}). 검색·부분 편집·재생성에 활용.';
COMMENT ON COLUMN design_docs.decision_snapshot IS '생성 시점의 결정사항 전체 스냅샷. 이후 결정 변경돼도 이 버전은 변하지 않음.';
COMMENT ON COLUMN design_docs.source_decision_ids IS '이 기획서가 인용한 decisions ID 배열. UI에서 출처 추적 가능.';
