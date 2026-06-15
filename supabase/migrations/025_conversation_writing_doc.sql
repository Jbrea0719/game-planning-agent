-- '작성하기' → 인터뷰 → 그 칸 채우기: 대화방이 어떤 planned 기획서를 채우는지 기억
-- 작성하기로 만든 ✍️ 방에 writing_doc_id 를 저장 → 그 방에서 기획서 생성 시 해당 행을 채움.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS writing_doc_id TEXT;
