-- 답변 피드백 — 사용자가 답변별로 정확/부정확 평가
-- 라우터·답변 시스템이 추후 학습에 활용 가능

CREATE TABLE IF NOT EXISTS message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,           -- 어느 세션에서
  pair_id UUID NOT NULL,              -- 어느 답변에 대해 (messages 테이블 pair_id 참조)
  feedback_type TEXT NOT NULL,        -- 'accurate' | 'inaccurate'
  reason TEXT,                        -- 부정확 시 사용자 입력 사유 (선택)
  target_games TEXT[],                -- 답변이 다룬 게임 ID 배열 (라우터 결정 보존)
  question_snapshot TEXT,             -- 원 질문 (학습용 보관)
  answer_snapshot TEXT,               -- 답변 일부 (학습용 보관, 1000자 제한)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_pair_id ON message_feedback (pair_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session ON message_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON message_feedback (feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_games ON message_feedback USING GIN (target_games);

ALTER TABLE message_feedback DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE message_feedback IS '사용자 답변 피드백 — 정확/부정확 평가 + 추후 학습용 데이터';
