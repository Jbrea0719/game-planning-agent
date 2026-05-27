-- 기획서 카테고리 분류에 소카테고리(sub_category) 추가
-- 대(main) > 중(area) > 소(sub) 3단계 분류 완성

ALTER TABLE design_docs
  ADD COLUMN IF NOT EXISTS category_sub_id TEXT REFERENCES sub_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_design_docs_category_sub
  ON design_docs(category_sub_id);
