-- 웹툰 IP 레지스트리 — 게임 라이브러리와 동일 패턴
-- 웹툰 기반 영웅수집형 게임 기획에 활용 (조던이 답변 시 자동 참조)

CREATE TABLE IF NOT EXISTS webtoon_registry (
  id TEXT PRIMARY KEY,            -- "solo_leveling", "tower_of_god" 등
  title TEXT NOT NULL,            -- 한글 제목
  title_en TEXT,                  -- 영문 제목
  author TEXT,                    -- 작가
  platform TEXT,                  -- 네이버 웹툰 · 카카오웹툰 · 레진 등
  genre TEXT[],                   -- ['액션', '판타지', '능력자']
  status TEXT,                    -- "완결", "연재중", "휴재"
  start_year INTEGER,
  end_year INTEGER,
  summary TEXT,                   -- 한 줄 요약
  key_characters JSONB,           -- [{ name, role, traits }]
  world_setting TEXT,             -- 세계관 설명
  game_potential TEXT,            -- 영웅수집형으로 게임화 적합성 평가
  reference_notes TEXT[],         -- 게임화 시 참고할 주요 포인트
  trusted_sources TEXT[],         -- ["네이버 웹툰", "디시 갤러리", "나무위키"]
  display_order INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webtoon_active ON webtoon_registry(is_active, display_order);
ALTER TABLE webtoon_registry DISABLE ROW LEVEL SECURITY;

-- 초기 시드 — 영웅수집형 게임화 적합성 높은 대표 웹툰 5종
INSERT INTO webtoon_registry (id, title, title_en, author, platform, genre, status, start_year, summary, world_setting, game_potential, reference_notes, trusted_sources, display_order)
VALUES
  ('solo_leveling', '나 혼자만 레벨업', 'Solo Leveling', '추공·DUBU', '카카오웹툰', ARRAY['액션','판타지','헌터물'], '완결', 2018,
   '약한 헌터 성진우가 시스템을 통해 무한 성장하며 그림자 군주로 진화하는 이야기',
   '게이트로 던전 몬스터가 출현하는 현대. 각성자(헌터)가 등급별로 활동.',
   '★★★★★ — 성장 시스템·소환수(그림자 군대)·랭킹 구조가 영웅수집 메카닉과 완벽 호환',
   ARRAY['그림자 군주 시스템 = 영웅 수집·소환 메카닉','헌터 등급(E~S) = 영웅 등급 체계','던전 클리어 = PvE 스테이지','이중 던전·게이트 = 시즌·레이드 구조'],
   ARRAY['카카오웹툰 공식','나무위키','네이버 카페','디시 솔로레벨링 갤러리'],
   10),

  ('tower_of_god', '신의 탑', 'Tower of God', 'SIU', '네이버 웹툰', ARRAY['판타지','액션','전략'], '연재중', 2010,
   '소년 밤이 친구를 찾아 시험으로 가득한 탑을 오르며 강해지는 대서사시',
   '층마다 시험과 규칙이 다른 신비한 탑. 다양한 종족·등급 존재.',
   '★★★★☆ — 다층 구조·다양한 종족·시험 시스템이 PvE 컨텐츠와 영웅 다양성 풍부',
   ARRAY['층 시험 = 챕터별 PvE 콘텐츠','다양한 종족·세대 = 영웅 풀 다양성','포지션(웨이브 컨트롤러 등) = 영웅 클래스 체계','오리지널 능력 = 스킬 시스템'],
   ARRAY['네이버 웹툰 공식','나무위키','디시 신의탑 갤러리','네이버 카페'],
   20),

  ('noblesse', '노블레스', 'Noblesse', '손제호·이광수', '네이버 웹툰', ARRAY['액션','판타지','뱀파이어'], '완결', 2007,
   '800년 잠에서 깬 진조 라이가 현대에 적응하며 동료들과 적과 싸우는 이야기',
   '현대 + 노블레스(진조)·전위 등 초능력자 세력 공존',
   '★★★★ — 강력한 캐릭터성·계급 구조·진영전이 PvP·길드전과 호환',
   ARRAY['노블레스 계급 = 영웅 등급·각성 단계','진영 구도(노블레스 vs 유니온) = 길드전 모티브','캐릭터별 고유 능력 = 영웅 정체성','시그너스 7나이트 = 7영웅 코어 컨셉'],
   ARRAY['네이버 웹툰','나무위키','디시 노블레스 갤러리'],
   30),

  ('god_of_high_school', '갓 오브 하이스쿨', 'The God of High School', '박용제', '네이버 웹툰', ARRAY['액션','격투','신화'], '완결', 2011,
   '고교생 진모리가 신과 신화의 힘을 사용하는 격투 토너먼트에서 자신의 정체를 깨닫는 이야기',
   '현대 + 동아시아 신화·차원 세계관 융합. 보살·신마·외계인 등장.',
   '★★★★ — 격투 토너먼트·차원 신마 시스템이 PvP·각성 시스템과 호환',
   ARRAY['보살(차원기) = 영웅 각성 시스템','토너먼트 = 아레나 PvP','신마·신화 인물 = 전설급 영웅 풀','일점·이점·삼점 = 등급 진화 단계'],
   ARRAY['네이버 웹툰','나무위키','디시 갓오하 갤러리'],
   40),

  ('the_breaker', '브레이커', 'The Breaker', '전극진·박진환', '네이버 웹툰', ARRAY['액션','무협','학원'], '완결(시즌3 연재중)', 2007,
   '왕따 고교생 이시운이 천재 무술인 한치국을 만나 무림 세계로 빨려 들어가는 이야기',
   '현대 한국 + 비밀 무림 세계. 9개 문파·무공·기 운용 시스템.',
   '★★★★ — 9문파·무공 트리·기 시스템이 영웅 시너지·스킬 트리 설계와 잘 맞음',
   ARRAY['9문파 = 영웅 진영·시너지','무공 단계 = 영웅 성장 트리','내공·기 = MP·SP 시스템','S.U.C 등 비밀 조직 = 길드·동맹 컨셉'],
   ARRAY['네이버 웹툰','나무위키','디시 브레이커 갤러리'],
   50)
ON CONFLICT (id) DO NOTHING;
