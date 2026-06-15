-- 중(area)을 1급 객체로 — 전용 areas 테이블 신설.
-- 지금까지 중은 sub_categories.area_code/area_name 으로만 존재(가상)해서 '소 없는 빈 중'을 만들 수 없었음.
-- areas 테이블로 영속화하면 소 없이 중만, 또는 중에 기획서만 바로 둘 수 있음.

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,                 -- main_category_id || ':' || code
  main_category_id TEXT REFERENCES main_categories(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                  -- sub_categories.area_code / design_docs.category_area_code 와 매칭되는 키
  name TEXT NOT NULL,                  -- 표시 이름
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE (main_category_id, code)
);
ALTER TABLE areas DISABLE ROW LEVEL SECURITY;

-- 시드 1) 기존 소(활성/비활성 무관)가 쓰던 중 — 이름은 area_name 사용
INSERT INTO areas (id, main_category_id, code, name, display_order)
SELECT main_category_id || ':' || area_code,
       main_category_id, area_code,
       COALESCE(MAX(area_name), area_code),
       COALESCE(MIN(display_order), 0)
FROM sub_categories
WHERE area_code IS NOT NULL
GROUP BY main_category_id, area_code
ON CONFLICT (main_category_id, code) DO NOTHING;

-- 시드 2) 소 없이 기획서(design_docs)만 가진 중 — 이름 미상이라 code 로(이후 이름변경 가능)
INSERT INTO areas (id, main_category_id, code, name, display_order)
SELECT category_main_id || ':' || category_area_code,
       category_main_id, category_area_code, category_area_code, 999
FROM design_docs
WHERE category_area_code IS NOT NULL AND category_main_id IS NOT NULL
GROUP BY category_main_id, category_area_code
ON CONFLICT (main_category_id, code) DO NOTHING;
