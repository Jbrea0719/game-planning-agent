-- ════════════════════════════════════════════════════════════════════
-- Phase A.1 — 결정사항 트래커 DB 스키마
-- 4개 테이블: projects, main_categories, sub_categories, decisions
-- ════════════════════════════════════════════════════════════════════

-- 1. 프로젝트 (게임 단위, 현재는 1개)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                   -- "영웅 RPG 신작"
  description TEXT,
  status TEXT DEFAULT 'active',         -- 'active'|'paused'|'completed'|'archived'
  metadata JSONB,                       -- {genre, platform, target, ...}
  created_by_nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 대카테고리 (5개: 아웃게임/인게임/그래픽/사운드/디자인 원칙)
CREATE TABLE IF NOT EXISTS main_categories (
  id TEXT PRIMARY KEY,                  -- 'outgame', 'ingame', 'graphic', 'sound', 'design_principle'
  name_ko TEXT NOT NULL,
  description TEXT,
  icon TEXT,                            -- 이모지
  display_order INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 소카테고리 (실제 항목, 인게임은 area_code로 영역 그룹핑)
CREATE TABLE IF NOT EXISTS sub_categories (
  id TEXT PRIMARY KEY,                  -- 'ingame.hero.grade', 'graphic.art_style' (dotted)
  main_category_id TEXT REFERENCES main_categories(id),
  area_code TEXT,                       -- 인게임 영역: 'A_hero','B_combat','C_item'...
  area_name TEXT,                       -- 'A. 캐릭터·영웅' (UI 표시용)
  name_ko TEXT NOT NULL,                -- '영웅 등급 체계'
  description TEXT,
  display_order INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcat_main ON sub_categories (main_category_id);
CREATE INDEX IF NOT EXISTS idx_subcat_area ON sub_categories (area_code);

-- 4. 결정사항 (대화에서 누적되는 핵심 데이터)
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  sub_category_id TEXT REFERENCES sub_categories(id),
  content TEXT NOT NULL,                -- 결정 내용 한 문장
  context TEXT,                         -- 추가 맥락 (선택)
  confidence TEXT DEFAULT 'decided',    -- 'decided'|'review'|'tentative'
  source_message_pair_id UUID,          -- 어느 대화 페어에서 나왔는지
  source_session_id TEXT,
  is_auto_extracted BOOLEAN DEFAULT FALSE,  -- AI 자동 추출 vs 수동 추가
  created_by_nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_nickname TEXT
);

CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions (project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_subcat ON decisions (sub_category_id);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions (source_session_id);

-- 5. RLS 비활성화 (단일 사용자 모드)
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE main_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE sub_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE decisions DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE projects IS '게임 프로젝트 (현재는 단일 프로젝트만 사용)';
COMMENT ON TABLE main_categories IS '5개 대카테고리: 아웃게임/인게임/그래픽/사운드/디자인 원칙';
COMMENT ON TABLE sub_categories IS '카테고리 하위 항목. 인게임은 area_code로 18개 영역 그룹핑';
COMMENT ON TABLE decisions IS '대화에서 추출·누적되는 기획 결정사항';
