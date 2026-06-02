-- ════════════════════════════════════════════════════════════════════
-- 인게임 중분류(영역) 재편 — 세븐나이츠 리버스 스펙 기준
-- 기존 18개 영역(A_hero~R_map) → 새 8개 묶음으로 재그룹핑.
-- 소분류 id는 모두 보존(결정사항·기획서 연결 유지). 삭제 없음(전부 존치).
-- ※ 2026-06-03 운영 DB에는 REST(PostgREST)로 선반영됨. 이 파일은 기록·재현용.
-- 정렬은 프론트가 area_code 알파벳순으로 하므로 01_~08_ 접두사로 순서 보장.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1) 기존 18개 영역 → 새 8개 묶음 재그룹핑 ───────────────────────────
UPDATE sub_categories SET area_code='01_content',  area_name='1. 컨텐츠'          WHERE main_category_id='ingame' AND area_code IN ('D_pve','E_pvp','L_story','R_map');
UPDATE sub_categories SET area_code='02_combat',   area_name='2. 시스템(전투)'     WHERE main_category_id='ingame' AND area_code IN ('B_combat','Q_npc');
UPDATE sub_categories SET area_code='03_function', area_name='3. 시스템(편의 기능)' WHERE main_category_id='ingame' AND area_code IN ('K_convenience','O_codex','P_ui');
UPDATE sub_categories SET area_code='04_guild',    area_name='4. 시스템(길드)'     WHERE main_category_id='ingame' AND area_code IN ('F_guild');
UPDATE sub_categories SET area_code='05_growth',   area_name='5. 시스템(성장)'     WHERE main_category_id='ingame' AND area_code IN ('A_hero','M_stat','N_account');
UPDATE sub_categories SET area_code='06_equip',    area_name='6. 시스템(장비)'     WHERE main_category_id='ingame' AND area_code IN ('C_item');
UPDATE sub_categories SET area_code='07_product',  area_name='7. 시스템(상품)'     WHERE main_category_id='ingame' AND area_code IN ('G_bm','I_shop','J_currency');
UPDATE sub_categories SET area_code='08_etc',      area_name='8. 기타'             WHERE main_category_id='ingame' AND area_code IN ('H_event');

-- ─── 2) 개명 2건 (id 보존, 표시명만 변경) ──────────────────────────────
UPDATE sub_categories SET name_ko='신성력 (계정 성장)'   WHERE id='ingame.account.divinity';
UPDATE sub_categories SET name_ko='마스터리 (영웅 성장)' WHERE id='ingame.account.mastery';

-- ─── 3) 신규 항목 14개 추가 ──────────────────────────────────────────
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.content.idle_world',   'ingame','01_content','1. 컨텐츠',          '방치형 월드',              501),
  ('ingame.content.trial_maze',   'ingame','01_content','1. 컨텐츠',          '시련의 미궁',              502),
  ('ingame.content.raid5',        'ingame','01_content','1. 컨텐츠',          '5인 레이드 (4종)',         503),
  ('ingame.content.raid8_multi',  'ingame','01_content','1. 컨텐츠',          '8인 레이드 (멀티)',        504),
  ('ingame.content.guild_raid',   'ingame','01_content','1. 컨텐츠',          '길드 레이드 (멀티던전)',   505),
  ('ingame.combat.suppress',      'ingame','02_combat', '2. 시스템(전투)',     '제압기',                   506),
  ('ingame.combat.rally',         'ingame','02_combat', '2. 시스템(전투)',     '집결',                     507),
  ('ingame.func.craft',           'ingame','03_function','3. 시스템(편의 기능)','제작',                    508),
  ('ingame.func.mail',            'ingame','03_function','3. 시스템(편의 기능)','우편',                    509),
  ('ingame.func.mission',         'ingame','03_function','3. 시스템(편의 기능)','미션',                    510),
  ('ingame.func.team',            'ingame','03_function','3. 시스템(편의 기능)','팀편성',                  511),
  ('ingame.product.limited_boost','ingame','07_product','7. 시스템(상품)',     '기간한정 획득증가 이벤트', 512),
  ('ingame.etc.minigame',         'ingame','08_etc',    '8. 기타',             '미니게임',                 513),
  ('ingame.etc.town',             'ingame','08_etc',    '8. 기타',             '마을·로비 (캐선창 통합)',  514)
ON CONFLICT (id) DO NOTHING;

-- ─── 4) 기존 기획서(design_docs) area_code 동기화 ─────────────────────
UPDATE design_docs SET category_area_code='02_combat' WHERE category_main_id='ingame' AND category_area_code='B_combat';
UPDATE design_docs SET category_area_code='05_growth' WHERE category_main_id='ingame' AND category_area_code='A_hero';
