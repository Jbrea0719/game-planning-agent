-- 대화방별 상태를 서버에 저장 — 기기·탭 무관하게 맥락선·참고기획서·맥락카드 일관 유지
-- (지금은 브라우저 localStorage라 다른 기기/탭에서 다름. 병렬·멀티기기 작업 대비)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. (조던 Supabase: cgplll…)

alter table conversations add column if not exists context_anchor_pair_id text;
alter table conversations add column if not exists context_anchor_time timestamptz;
alter table conversations add column if not exists reference_doc_ids jsonb;
alter table conversations add column if not exists agent_context text;
