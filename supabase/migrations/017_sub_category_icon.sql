-- 소카테고리 아이콘 — 카테고리 관리에서 소카테고리도 아이콘 지정 가능하게
-- (순서 이동은 기존 display_order 컬럼을 그대로 사용하므로 추가 컬럼 불필요)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. (조던 Supabase: cgplll…)

alter table sub_categories add column if not exists icon text;
