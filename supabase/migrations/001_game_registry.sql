-- 게임 레지스트리 — 자동 발견된 신뢰 도메인 캐시
-- 새 게임에 대해 라우터가 인식하면, 도메인 자동 발견 후 여기 저장.
-- 다음 질문 시 캐시 사용 → 추가 발견 검색 비용 절약.

CREATE TABLE IF NOT EXISTS game_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT UNIQUE NOT NULL,           -- 정규화된 ID (예: "sena_rebirth", "eversoul", "genshin")
  game_names TEXT[] NOT NULL,              -- 게임의 이름 변형들 (한국어·영어·줄임말 등)
  discovered_domains JSONB NOT NULL,       -- [{ url, tier: "official"|"press"|"wiki"|"community", note }]
  discovery_method TEXT NOT NULL DEFAULT 'auto',  -- 'manual' | 'auto' | 'verified'
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  use_count INT DEFAULT 0,
  notes TEXT
);

-- 검색용 인덱스
CREATE INDEX IF NOT EXISTS idx_game_registry_game_id ON game_registry (game_id);
CREATE INDEX IF NOT EXISTS idx_game_registry_names ON game_registry USING GIN (game_names);

-- RLS 비활성화 (서비스 내부 사용)
ALTER TABLE game_registry DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE game_registry IS '게임별 자동/수동 발견된 신뢰 도메인 캐시. 라우터가 게임 매칭 후 도메인 확보용으로 조회';
COMMENT ON COLUMN game_registry.discovered_domains IS 'JSON 배열. 예: [{"url":"game.naver.com/lounge/sena_rebirth","tier":"official"}]';
COMMENT ON COLUMN game_registry.discovery_method IS 'manual: 사용자 직접 등록, auto: Claude로 자동 발견, verified: 사용자 검증 완료';
