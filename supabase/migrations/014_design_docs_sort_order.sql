-- 기획서 수동 정렬 순서 (드래그앤드롭)
-- 같은 카테고리 그룹 내에서의 상대 순서. NULL이면 생성일 역순(기본) 정렬.
ALTER TABLE design_docs ADD COLUMN IF NOT EXISTS sort_order INTEGER;

COMMENT ON COLUMN design_docs.sort_order IS '같은 카테고리 그룹 내 수동 정렬 순서(드래그앤드롭). 작을수록 위.';
