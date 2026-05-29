-- 메시지에 자세한 답변 본문·표시 상태 저장
-- 같은 pair_id의 assistant row에 detail_content / detail_shown 저장

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS detail_content TEXT,
  ADD COLUMN IF NOT EXISTS detail_shown BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_pair_detail
  ON messages(pair_id) WHERE detail_content IS NOT NULL;
