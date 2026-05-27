-- 기획서 family에 카테고리 분류 컬럼 추가 (기획 바이블과 동일 구조)
-- + 기존 기획서를 인게임 > 영웅 영역으로 일괄 분류

-- main_categories.id가 TEXT 타입이므로 동일하게 TEXT로 선언
ALTER TABLE design_docs
  ADD COLUMN IF NOT EXISTS category_main_id TEXT REFERENCES main_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_area_code TEXT;

-- 인게임 main_category id를 찾아서 모든 기존 기획서에 적용
-- area_code는 인게임 main 아래에서 area_name='영웅'인 sub_categories의 area_code를 가져옴
UPDATE design_docs
SET
  category_main_id = (SELECT id FROM main_categories WHERE name_ko = '인게임' LIMIT 1),
  category_area_code = (
    SELECT DISTINCT area_code FROM sub_categories
    WHERE area_name = '영웅'
      AND main_category_id = (SELECT id FROM main_categories WHERE name_ko = '인게임' LIMIT 1)
    LIMIT 1
  )
WHERE category_main_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_design_docs_category
  ON design_docs(category_main_id, category_area_code);
