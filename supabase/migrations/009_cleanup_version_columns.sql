-- 버전 개념 제거에 따른 스키마 정리
-- design_docs에서 더 이상 사용하지 않는 컬럼 삭제

DROP INDEX IF EXISTS idx_design_docs_family;
ALTER TABLE design_docs DROP COLUMN IF EXISTS doc_family_id;
ALTER TABLE design_docs DROP COLUMN IF EXISTS version_no;
