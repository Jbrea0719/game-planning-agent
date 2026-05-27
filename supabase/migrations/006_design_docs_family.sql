-- 기획서 family 기반 버전 관리 도입
-- 같은 family에 속하는 기획서들끼리만 version_no가 상승

ALTER TABLE design_docs
  ADD COLUMN IF NOT EXISTS doc_family_id UUID;

-- 기존 기획서는 각자가 자기 family의 v1 (과거 데이터 그랜드파더링)
UPDATE design_docs SET doc_family_id = id WHERE doc_family_id IS NULL;

-- family 단위 조회 빠르게
CREATE INDEX IF NOT EXISTS idx_design_docs_family ON design_docs(doc_family_id);
