-- ════════════════════════════════════════════════════════════════════
-- 검토자 특성 디테일 — '특히 신경 쓸 것' / '신경 쓰지 말 것'을 항목 리스트로 저장
-- focus_points: 검토자가 중점적으로 봐야 할 관점·항목 (string[])
-- avoid_points: 지적하지 말 것 / 신경 쓰지 말 것 (string[])
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE review_personas ADD COLUMN IF NOT EXISTS focus_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE review_personas ADD COLUMN IF NOT EXISTS avoid_points JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN review_personas.focus_points IS '특히 신경 쓸 것 (string 배열)';
COMMENT ON COLUMN review_personas.avoid_points IS '신경 쓰지 말 것/지적하지 말 것 (string 배열)';
