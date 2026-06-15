-- ════════════════════════════════════════════════════════════════════
-- 알림 (기획서 댓글/답글)
-- - 기획서에 댓글이 달리면 작성자에게 알림
-- - 댓글에 답글이 달리면 그 댓글 작성자에게 알림
-- recipient_nickname = 받는 사람(세션 닉네임)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_nickname TEXT NOT NULL,     -- 알림 받는 사람
  actor_nickname TEXT,                  -- 알림 유발한 사람(댓글 단 사람)
  type TEXT NOT NULL,                   -- 'comment'(내 기획서에 댓글) | 'reply'(내 댓글에 답글)
  doc_family_id UUID,
  doc_id UUID,                          -- 기획서 열기용 대표 버전 id
  doc_title TEXT,
  comment_id UUID,                      -- 바로가기 대상 댓글
  preview TEXT,                         -- 댓글 미리보기(평문)
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications (recipient_nickname, is_read, created_at DESC);

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE notifications IS '기획서 댓글/답글 알림 — recipient_nickname 기준';
