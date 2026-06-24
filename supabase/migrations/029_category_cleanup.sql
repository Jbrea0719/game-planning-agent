-- ════════════════════════════════════════════════════════════════════
-- 기획 바이블 카테고리 구조 정리 (2단계)
-- 기획서의 8개 대카테고리를 기준으로 이름·정렬을 통일하고,
-- 비활성으로 숨어있던 '데이터 있는' 소카테고리를 살리고,
-- 잘못 묶인 소카테고리(로비·재화)를 알맞은 대분류로 이동한다.
-- (빈 소카테고리는 트래커가 0개일 때 자동으로 안 보이므로 별도 숨김 불필요)
-- ════════════════════════════════════════════════════════════════════

-- 1) 대카테고리 8개 — 이름·아이콘·정렬 정리 + 활성화
UPDATE main_categories SET name_ko='아웃게임',    icon='🎮', display_order=1, is_active=true WHERE id='g_outgame';
UPDATE main_categories SET name_ko='코어',        icon='🧩', display_order=2, is_active=true WHERE id='g_base';
UPDATE main_categories SET name_ko='성장·육성',   icon='📈', display_order=3, is_active=true WHERE id='g_growth';
UPDATE main_categories SET name_ko='콘텐츠',      icon='📦', display_order=4, is_active=true WHERE id='g_content';
UPDATE main_categories SET name_ko='BM·상품',     icon='💰', display_order=5, is_active=true WHERE id='main_1781268209386_vjzcn';
UPDATE main_categories SET name_ko='시스템·운영', icon='⚙️', display_order=6, is_active=true WHERE id='g_system';
UPDATE main_categories SET name_ko='편의·기타',   icon='🧰', display_order=7, is_active=true WHERE id='main_1781267940947_hm36i';
UPDATE main_categories SET name_ko='아트·사운드', icon='🎨', display_order=8, is_active=true WHERE id='g_art';

-- 2) 데이터(결정사항)가 있는 소카테고리 → 모두 활성화 (비활성으로 숨어있던 설정41·시즌패스32 등 살리기)
UPDATE sub_categories SET is_active=true
WHERE id IN (SELECT DISTINCT sub_category_id FROM decisions WHERE sub_category_id IS NOT NULL);

-- 2b) 기획서가 참조하는 소카테고리도 활성화 (구조 유지)
UPDATE sub_categories SET is_active=true
WHERE id IN (SELECT DISTINCT category_sub_id FROM design_docs WHERE category_sub_id IS NOT NULL);

-- 3) 잘못 묶인 소카테고리를 알맞은 대분류로 이동 (플랫로). 결정사항은 sub_category_id 참조라 자동으로 따라감.
--    로비(58) → 아웃게임,  재화(50) → BM·상품
UPDATE sub_categories SET main_category_id='g_outgame',               area_code=NULL, area_name=NULL WHERE id='g_base.a03.1';
UPDATE sub_categories SET main_category_id='main_1781268209386_vjzcn', area_code=NULL, area_name=NULL WHERE id='g_base.a02.1';
