-- 빈 소(작성하기 슬롯) → 기획서(leaf) 단위 전환
-- 빈 소 = is_active 이면서 그 소를 참조하는 design_docs 가 0개인 소.
-- 각 빈 소마다 placeholder 기획서(status='planned', 내용 비움)를 같은 대/중 위치에 생성하고,
-- 해당 소는 is_active=false 로 비활성화(하드삭제 X — 되돌리기 가능).
-- (status 는 자유 TEXT 라 스키마 변경 불필요. project_id 는 기존 기획서가 가장 많이 쓰는 값 사용.)

-- 1) placeholder 기획서 생성
INSERT INTO design_docs (
  project_id, title, content_markdown, status,
  category_main_id, category_area_code, category_sub_id,
  created_by_nickname, changes_summary
)
SELECT
  (SELECT project_id FROM design_docs WHERE project_id IS NOT NULL
     GROUP BY project_id ORDER BY count(*) DESC LIMIT 1) AS project_id,
  s.name_ko, '', 'planned',
  s.main_category_id, s.area_code, NULL,
  '정민', '작성 예정(빈 소에서 전환)'
FROM sub_categories s
WHERE s.is_active = true
  AND NOT EXISTS (SELECT 1 FROM design_docs d WHERE d.category_sub_id = s.id);

-- 2) 전환된 빈 소 비활성화
UPDATE sub_categories s
SET is_active = false
WHERE s.is_active = true
  AND NOT EXISTS (SELECT 1 FROM design_docs d WHERE d.category_sub_id = s.id);
