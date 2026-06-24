-- ════════════════════════════════════════════════════════════════════
-- 결정 대기(staging) 테이블 — 자동 추출된 결정사항을 바이블에 바로 넣지 않고
-- 사용자가 추가/삭제/수정/카테고리 지정 후 '최종 등록'할 때까지 대기시킨다.
--
-- 별도 테이블로 둔 이유: 기존 바이블 읽기 경로(decision-context, 기획서 자동생성,
-- 인터뷰 등)는 전부 decisions 테이블만 읽으므로, 대기 항목이 어디에도 새지 않음.
-- '최종 등록' 시 이 테이블의 행을 decisions 로 옮긴다(INSERT decisions + DELETE pending).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pending_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  sub_category_id TEXT REFERENCES sub_categories(id),
  content TEXT NOT NULL,                  -- 결정 내용 한 문장
  context TEXT,                           -- 추출 근거(reasoning) 등 추가 맥락
  confidence TEXT DEFAULT 'decided',      -- 'decided'|'review'|'tentative'
  jordan_agreement TEXT,                  -- 'agreed'|'opposed'|'concerned'|'neutral' (조던 입장 — 검토 참고용 배지)
  source_message_pair_id UUID,            -- 어느 대화 페어에서 나왔는지
  source_session_id TEXT,
  created_by_nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_project ON pending_decisions (project_id);

ALTER TABLE pending_decisions DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pending_decisions IS '결정 대기 — 자동 추출 결정사항의 등록 전 검토 단계. 최종 등록 시 decisions로 이동.';
