-- ════════════════════════════════════════════════════════════════════
-- Phase A.1 시드 데이터 — 카테고리 트리 일괄 등록
-- 5개 대카테고리 + 약 200개 하위 항목
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. 대카테고리 5개 ───────────────────────────────────────────────
INSERT INTO main_categories (id, name_ko, icon, display_order, description) VALUES
  ('outgame',          '아웃게임',     '🔧', 1, '게임 외부 인프라·시스템 레이어 (서버·결제·플랫폼 등)'),
  ('ingame',           '인게임',       '🎮', 2, '실제 게임플레이·시스템 (영웅·전투·콘텐츠·BM 등) — 기획서의 70-80%'),
  ('graphic',          '그래픽',       '🎨', 3, '시각 정체성 (아트·UI 디자인·연출)'),
  ('sound',            '사운드',       '🎵', 4, '음악 정체성 (BGM·SFX·보이스)'),
  ('design_principle', '디자인 원칙',  '📐', 5, '프로젝트 전체 관통하는 디자인·운영 원칙 (카테고리와 직교)')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. 아웃게임 (17개) ──────────────────────────────────────────────
INSERT INTO sub_categories (id, main_category_id, name_ko, display_order) VALUES
  ('outgame.server',           'outgame', '서버 구조',                  1),
  ('outgame.build',            'outgame', '빌드·배포 구조 (백그라운드 다운로드 포함)', 2),
  ('outgame.auth',             'outgame', '인증·계정 (구글·애플·페북·게임센터)', 3),
  ('outgame.iap',              'outgame', '결제 시스템 (IAP)',           4),
  ('outgame.platform',         'outgame', '플랫폼·스토어 (PC 런처 포함)', 5),
  ('outgame.operation_tool',   'outgame', '운영툴 (GM툴·푸시 발송·실시간 모니터링)', 6),
  ('outgame.policy',           'outgame', '약관·정책 (이용약관·개인정보·GDPR)', 7),
  ('outgame.cs',               'outgame', 'CS 시스템 (고객센터)',        8),
  ('outgame.multi_server',     'outgame', '다중 서버 구조 정책',         9),
  ('outgame.server_migrate',   'outgame', '서버 이동·통합 기능',         10),
  ('outgame.global_onebuild',  'outgame', '글로벌 원빌드 정책',          11),
  ('outgame.replay_infra',     'outgame', '리플레이·관전 인프라',        12),
  ('outgame.background_play',  'outgame', '백그라운드·로그아웃 플레이 인프라', 13),
  ('outgame.sdk',              'outgame', 'SDK 통합 정책 (전체 SDK 셋)', 14),
  ('outgame.iap_sdk',          'outgame', 'IAP SDK (테스트용 인앱 구매)', 15),
  ('outgame.db_policy',        'outgame', 'DB 적재 정책 (게임 로직 대부분 서버 DB)', 16),
  ('outgame.cdn_onoff',        'outgame', 'CDN 컨텐츠 ON/OFF 정책',      17)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. 인게임 (영역 A~R, 약 190개) ───────────────────────────────────

-- A. 캐릭터·영웅 (14)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.hero.grade',         'ingame', 'A_hero', 'A. 캐릭터·영웅', '영웅 등급 체계',                1),
  ('ingame.hero.role',          'ingame', 'A_hero', 'A. 캐릭터·영웅', '직군·역할 분류 (탱·딜·힐·서포터)', 2),
  ('ingame.hero.synergy',       'ingame', 'A_hero', 'A. 캐릭터·영웅', '시너지·진영 시스템',            3),
  ('ingame.hero.attribute',     'ingame', 'A_hero', 'A. 캐릭터·영웅', '영웅 속성 시스템 (원소 상성)',  4),
  ('ingame.hero.ip_group',      'ingame', 'A_hero', 'A. 캐릭터·영웅', 'IP 그룹·소속 분류 (세계관별 영웅)', 5),
  ('ingame.hero.skill',         'ingame', 'A_hero', 'A. 캐릭터·영웅', '스킬 시스템 (기본·액티브·궁극기·패시브)', 6),
  ('ingame.hero.skill_upgrade', 'ingame', 'A_hero', 'A. 캐릭터·영웅', '스킬 강화 시스템',              7),
  ('ingame.hero.soul',          'ingame', 'A_hero', 'A. 캐릭터·영웅', '영혼석·조각 시스템',            8),
  ('ingame.hero.fusion',        'ingame', 'A_hero', 'A. 캐릭터·영웅', '합성·승급·재합성',              9),
  ('ingame.hero.growth',        'ingame', 'A_hero', 'A. 캐릭터·영웅', '영웅 성장 (레벨업·강화·진화·각성·초월)', 10),
  ('ingame.hero.pet',           'ingame', 'A_hero', 'A. 캐릭터·영웅', '펫 시스템 (합성·진화·강화·획득)', 11),
  ('ingame.hero.codex_link',    'ingame', 'A_hero', 'A. 캐릭터·영웅', '도감·관계도 (캐릭터별 스토리)', 12),
  ('ingame.hero.costume',       'ingame', 'A_hero', 'A. 캐릭터·영웅', '코스튬·외형',                   13),
  ('ingame.hero.lineup',        'ingame', 'A_hero', 'A. 캐릭터·영웅', '캐릭터 라인업·풀 정책',         14)
ON CONFLICT (id) DO NOTHING;

-- B. 전투 (12)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.combat.system',      'ingame', 'B_combat', 'B. 전투', '전투 시스템 (자동·수동·턴제·실시간)', 21),
  ('ingame.combat.formation',   'ingame', 'B_combat', 'B. 전투', '진형·배치 (앞열·뒷열 확률)',         22),
  ('ingame.combat.element',     'ingame', 'B_combat', 'B. 전투', '속성 상성',                          23),
  ('ingame.combat.combo',       'ingame', 'B_combat', 'B. 전투', '스킬 콤보·연계',                     24),
  ('ingame.combat.speed',       'ingame', 'B_combat', 'B. 전투', '속공·턴 순서 시스템',                25),
  ('ingame.combat.cooldown',    'ingame', 'B_combat', 'B. 전투', '글로벌 쿨타임 정책',                 26),
  ('ingame.combat.skill_queue', 'ingame', 'B_combat', 'B. 전투', '스킬 예약 시스템 (최대 N개)',        27),
  ('ingame.combat.round',       'ingame', 'B_combat', 'B. 전투', '라운드 시스템 (유지·초기화 규칙)',   28),
  ('ingame.combat.ai',          'ingame', 'B_combat', 'B. 전투', 'NPC AI + 아군 자동 행동 우선순위',   29),
  ('ingame.combat.boss',        'ingame', 'B_combat', 'B. 전투', '보스 기믹 (제압기·집결 등)',         30),
  ('ingame.combat.target',      'ingame', 'B_combat', 'B. 전투', '타겟 정보·변경',                     31),
  ('ingame.combat.repeat',      'ingame', 'B_combat', 'B. 전투', '반복 전투 설정·백그라운드 플레이',   32)
ON CONFLICT (id) DO NOTHING;

-- C. 아이템 (11)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.item.gear',          'ingame', 'C_item', 'C. 아이템', '장비 종류·등급 (무기·방어구·장신구)', 41),
  ('ingame.item.options',       'ingame', 'C_item', 'C. 아이템', '장비 옵션 시스템 (메인·서브 옵션)',  42),
  ('ingame.item.growth',        'ingame', 'C_item', 'C. 아이템', '아이템 성장 (강화·세트 효과·진화)',  43),
  ('ingame.item.enchant',       'ingame', 'C_item', 'C. 아이템', '마법 부여 (옵션 재롤)',              44),
  ('ingame.item.exclusive',     'ingame', 'C_item', 'C. 아이템', '전용 장비 (영웅 한정)',              45),
  ('ingame.item.artifact',      'ingame', 'C_item', 'C. 아이템', '아티팩트 (특수 효과만)',             46),
  ('ingame.item.gem',           'ingame', 'C_item', 'C. 아이템', '보석 시스템',                        47),
  ('ingame.item.rune',          'ingame', 'C_item', 'C. 아이템', '룬·각인 등 특수 시스템',             48),
  ('ingame.item.consumable',    'ingame', 'C_item', 'C. 아이템', '소비 아이템·재료',                   49),
  ('ingame.item.inventory',     'ingame', 'C_item', 'C. 아이템', '인벤토리 관리',                      50),
  ('ingame.item.box',           'ingame', 'C_item', 'C. 아이템', '박스 시스템 (별도 인벤토리)',        51)
ON CONFLICT (id) DO NOTHING;

-- D. PvE 콘텐츠 (9)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.pve.main_story',     'ingame', 'D_pve', 'D. PvE 콘텐츠', '메인 스토리·캠페인',              61),
  ('ingame.pve.daily_dungeon',  'ingame', 'D_pve', 'D. PvE 콘텐츠', '일일·주간 던전',                  62),
  ('ingame.pve.growth_dungeon', 'ingame', 'D_pve', 'D. PvE 콘텐츠', '성장 던전 (재화별)',              63),
  ('ingame.pve.boss_raid',      'ingame', 'D_pve', 'D. PvE 콘텐츠', '보스 레이드',                     64),
  ('ingame.pve.weekly_dungeon', 'ingame', 'D_pve', 'D. PvE 콘텐츠', '요일 던전 (월~일 보스·보상 다름)', 65),
  ('ingame.pve.infinite_tower', 'ingame', 'D_pve', 'D. PvE 콘텐츠', '무한 탑·끝없는 도전',             66),
  ('ingame.pve.afk',            'ingame', 'D_pve', 'D. PvE 콘텐츠', '자동 사냥·방치 보상',             67),
  ('ingame.pve.secret_dungeon', 'ingame', 'D_pve', 'D. PvE 콘텐츠', '비밀 던전·랜덤 던전',             68),
  ('ingame.pve.season',         'ingame', 'D_pve', 'D. PvE 콘텐츠', '시즌 이벤트 던전',                69)
ON CONFLICT (id) DO NOTHING;

-- E. PvP 콘텐츠 (8)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.pvp.arena',          'ingame', 'E_pvp', 'E. PvP 콘텐츠', '아레나 (1:1, 3:3)',               81),
  ('ingame.pvp.tag',            'ingame', 'E_pvp', 'E. PvP 콘텐츠', '태그매치 (다중 덱)',              82),
  ('ingame.pvp.guild_war',      'ingame', 'E_pvp', 'E. PvP 콘텐츠', '길드전 (5v5, 7v7)',               83),
  ('ingame.pvp.rank',           'ingame', 'E_pvp', 'E. PvP 콘텐츠', '시즌 랭크 시스템',                84),
  ('ingame.pvp.tournament',     'ingame', 'E_pvp', 'E. PvP 콘텐츠', '토너먼트·월드컵',                 85),
  ('ingame.pvp.replay',         'ingame', 'E_pvp', 'E. PvP 콘텐츠', '리플레이·관전 시스템',            86),
  ('ingame.pvp.matching',       'ingame', 'E_pvp', 'E. PvP 콘텐츠', '결투장 매칭·재입장 정책',         87),
  ('ingame.pvp.level_adjust',   'ingame', 'E_pvp', 'E. PvP 콘텐츠', 'PvP 레벨 차이 보정',              88)
ON CONFLICT (id) DO NOTHING;

-- F. 길드·소셜 (11)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.guild.system',       'ingame', 'F_guild', 'F. 길드·소셜', '길드 시스템 (가입·승급·해체)',   101),
  ('ingame.guild.content',      'ingame', 'F_guild', 'F. 길드·소셜', '길드 전용 콘텐츠',                102),
  ('ingame.guild.master',       'ingame', 'F_guild', 'F. 길드·소셜', '길드 업적·기여도·마스터리',      103),
  ('ingame.guild.payment_reward','ingame','F_guild', 'F. 길드·소셜', '길드원 결제 보상 (소셜형 BM)',   104),
  ('ingame.guild.weekly_quest', 'ingame', 'F_guild', 'F. 길드·소셜', '길드원 통합 주간 퀘스트',        105),
  ('ingame.guild.attendance',   'ingame', 'F_guild', 'F. 길드·소셜', '길드 출석·홍보 기능',            106),
  ('ingame.social.friend',      'ingame', 'F_guild', 'F. 길드·소셜', '친구·영웅 빌리기',               107),
  ('ingame.social.chat',        'ingame', 'F_guild', 'F. 길드·소셜', '채팅 (월드·서버·길드·귓속말)',   108),
  ('ingame.social.chat_db',     'ingame', 'F_guild', 'F. 길드·소셜', '채팅 DB 저장 정책 (귓속말·길드·시스템)', 109),
  ('ingame.social.emoji',       'ingame', 'F_guild', 'F. 길드·소셜', '이모티콘',                       110),
  ('ingame.social.notify',      'ingame', 'F_guild', 'F. 길드·소셜', '알림·뱃지',                      111)
ON CONFLICT (id) DO NOTHING;

-- G. 수익화 BM (19)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.bm.hero_gacha',      'ingame', 'G_bm', 'G. 수익화 (BM)', '영웅 가챠 (확률·천장·보장)',      121),
  ('ingame.bm.gear_gacha',      'ingame', 'G_bm', 'G. 수익화 (BM)', '장비·재화 가챠',                  122),
  ('ingame.bm.pet_gacha',       'ingame', 'G_bm', 'G. 수익화 (BM)', '펫 가챠',                         123),
  ('ingame.bm.attr_gacha',      'ingame', 'G_bm', 'G. 수익화 (BM)', '속성 타겟 뽑기',                  124),
  ('ingame.bm.gacha_10',        'ingame', 'G_bm', 'G. 수익화 (BM)', '10연 가챠·단계별 천장 보상',      125),
  ('ingame.bm.season_pass',     'ingame', 'G_bm', 'G. 수익화 (BM)', '배틀패스·시즌패스·월정액',        126),
  ('ingame.bm.costume',         'ingame', 'G_bm', 'G. 수익화 (BM)', '코스튬·외형 상품',                127),
  ('ingame.bm.currency_sale',   'ingame', 'G_bm', 'G. 수익화 (BM)', '재화 직접 판매 (골드·강화석)',    128),
  ('ingame.bm.ticket_sale',     'ingame', 'G_bm', 'G. 수익화 (BM)', '티켓 판매 (입장·소탕)',           129),
  ('ingame.bm.inventory_ext',   'ingame', 'G_bm', 'G. 수익화 (BM)', '인벤 확장 BM',                    130),
  ('ingame.bm.package_policy',  'ingame', 'G_bm', 'G. 수익화 (BM)', '패키지 효율 정책 (돌발·기본·깡루비)', 131),
  ('ingame.bm.mileage',         'ingame', 'G_bm', 'G. 수익화 (BM)', '마일리지·적립 BM (토파즈 등)',    132),
  ('ingame.bm.time_buff',       'ingame', 'G_bm', 'G. 수익화 (BM)', '시간제 버프 상품 (드롭률 증가 등)', 133),
  ('ingame.bm.rotation_shop',   'ingame', 'G_bm', 'G. 수익화 (BM)', '로테이션 샵 정책 (만물상점 류)',  134),
  ('ingame.bm.achievement_pkg', 'ingame', 'G_bm', 'G. 수익화 (BM)', '달성 팝업 패키지 (행동 트리거)',  135),
  ('ingame.bm.ad_reward',       'ingame', 'G_bm', 'G. 수익화 (BM)', '광고 시청 보상',                  136),
  ('ingame.bm.first_buy',       'ingame', 'G_bm', 'G. 수익화 (BM)', '첫 결제·복귀 혜택',               137),
  ('ingame.bm.event_limited',   'ingame', 'G_bm', 'G. 수익화 (BM)', '이벤트 한정 상품',                138),
  ('ingame.bm.tool_onoff',      'ingame', 'G_bm', 'G. 수익화 (BM)', '운영툴 ON/OFF 제어 (CDN 기반)',   139)
ON CONFLICT (id) DO NOTHING;

-- H. 이벤트 (8)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.event.daily',        'ingame', 'H_event', 'H. 이벤트', '정기 이벤트 (출석·도전)',           141),
  ('ingame.event.attendance',   'ingame', 'H_event', 'H. 이벤트', '90일 출석판 (신규·복귀 포함)',      142),
  ('ingame.event.season',       'ingame', 'H_event', 'H. 이벤트', '시즌 이벤트',                       143),
  ('ingame.event.collab',       'ingame', 'H_event', 'H. 이벤트', '콜라보 IP',                         144),
  ('ingame.event.new_hero',     'ingame', 'H_event', 'H. 이벤트', '신규 영웅 출시 이벤트',             145),
  ('ingame.event.boost',        'ingame', 'H_event', 'H. 이벤트', '자원 부스트 이벤트 (드롭률·골드)',  146),
  ('ingame.event.character',    'ingame', 'H_event', 'H. 이벤트', '캐릭터 중심 이벤트 (코제트 류)',    147),
  ('ingame.event.hottime',      'ingame', 'H_event', 'H. 이벤트', '핫타임 + 버프 아이템 (계정 버프)',  148)
ON CONFLICT (id) DO NOTHING;

-- I. 상점 (8)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.shop.general',       'ingame', 'I_shop', 'I. 상점', '일반 상점',                            161),
  ('ingame.shop.limited',       'ingame', 'I_shop', 'I. 상점', '한정 상점 (이벤트별)',                 162),
  ('ingame.shop.trade',         'ingame', 'I_shop', 'I. 상점', '거래소·교환소',                        163),
  ('ingame.shop.bundle',        'ingame', 'I_shop', 'I. 상점', '묶음·번들 상품',                       164),
  ('ingame.shop.soul',          'ingame', 'I_shop', 'I. 상점', '영혼석 상점 (특수 재화)',              165),
  ('ingame.shop.friend',        'ingame', 'I_shop', 'I. 상점', '우정 상점 (소셜 재화)',                166),
  ('ingame.shop.guild',         'ingame', 'I_shop', 'I. 상점', '길드 상점',                            167),
  ('ingame.shop.gacha',         'ingame', 'I_shop', 'I. 상점', '소환·가챠 상점',                       168)
ON CONFLICT (id) DO NOTHING;

-- J. 재화 (6)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.currency.basic',     'ingame', 'J_currency', 'J. 재화', '기본 재화 (다이아·골드)',          181),
  ('ingame.currency.gacha',     'ingame', 'J_currency', 'J. 재화', '가챠 재화 (티켓·결정)',            182),
  ('ingame.currency.growth',    'ingame', 'J_currency', 'J. 재화', '성장 재화 (강화석·진화석)',        183),
  ('ingame.currency.event',     'ingame', 'J_currency', 'J. 재화', '이벤트 재화 (한정 토큰)',          184),
  ('ingame.currency.mileage',   'ingame', 'J_currency', 'J. 재화', '마일리지·적립 재화 (BM)',          185),
  ('ingame.currency.flow',      'ingame', 'J_currency', 'J. 재화', '재화 획득 경로·소모처 정책',       186)
ON CONFLICT (id) DO NOTHING;

-- K. 편의 기능 (9)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.convenience.auto',   'ingame', 'K_convenience', 'K. 편의 기능', '자동 전투·사냥',           201),
  ('ingame.convenience.batch',  'ingame', 'K_convenience', 'K. 편의 기능', '일괄 보상 수령',           202),
  ('ingame.convenience.filter', 'ingame', 'K_convenience', 'K. 편의 기능', '즐겨찾기·필터·정렬',       203),
  ('ingame.convenience.stat',   'ingame', 'K_convenience', 'K. 편의 기능', '도전 기록·통계',           204),
  ('ingame.convenience.preset', 'ingame', 'K_convenience', 'K. 편의 기능', '프리셋 시스템 (장비·영웅 세팅)', 205),
  ('ingame.convenience.equip_view', 'ingame', 'K_convenience', 'K. 편의 기능', '착용 현황',           206),
  ('ingame.convenience.usage',  'ingame', 'K_convenience', 'K. 편의 기능', '사용 통계 (영웅 사용률·승률)', 207),
  ('ingame.convenience.repeat', 'ingame', 'K_convenience', 'K. 편의 기능', '반복 전투 설정·백그라운드 자동 교체', 208),
  ('ingame.convenience.box',    'ingame', 'K_convenience', 'K. 편의 기능', '박스 자동 오픈·자동 분해', 209)
ON CONFLICT (id) DO NOTHING;

-- L. 스토리·세계관 (6)
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.story.worldview',    'ingame', 'L_story', 'L. 스토리·세계관', '게임 세계관·로어',           221),
  ('ingame.story.main',         'ingame', 'L_story', 'L. 스토리·세계관', '메인 스토리 챕터 구조',      222),
  ('ingame.story.side',         'ingame', 'L_story', 'L. 스토리·세계관', '캐릭터별 사이드 스토리',     223),
  ('ingame.story.season',       'ingame', 'L_story', 'L. 스토리·세계관', '시즌·이벤트 스토리',         224),
  ('ingame.story.presentation', 'ingame', 'L_story', 'L. 스토리·세계관', '스토리 표현 방식 (이미지·2D 대사·영상·웹툰)', 225),
  ('ingame.story.expansion',    'ingame', 'L_story', 'L. 스토리·세계관', '대륙·세계 확장 PLC',         226)
ON CONFLICT (id) DO NOTHING;

-- M. 스텟·밸런스 시스템 (6) ★
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.stat.formula',       'ingame', 'M_stat', 'M. 스텟·밸런스 시스템', '스텟 계산 공식',          241),
  ('ingame.stat.contribution',  'ingame', 'M_stat', 'M. 스텟·밸런스 시스템', '시스템별 스텟 기여도 (영웅·장비·진형·도감)', 242),
  ('ingame.stat.power',         'ingame', 'M_stat', 'M. 스텟·밸런스 시스템', '전투력 산출',             243),
  ('ingame.stat.meta_cycle',    'ingame', 'M_stat', 'M. 스텟·밸런스 시스템', '메타 교체 사이클·정책',   244),
  ('ingame.stat.new_hero_policy','ingame','M_stat', 'M. 스텟·밸런스 시스템', '신규 영웅 출시 밸런스 정책', 245),
  ('ingame.stat.ratio',         'ingame', 'M_stat', 'M. 스텟·밸런스 시스템', '등급별·속성별 능력치 비율', 246)
ON CONFLICT (id) DO NOTHING;

-- N. 계정·메타 시스템 (10) ★
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.account.level',      'ingame', 'N_account', 'N. 계정·메타 시스템', '계정 레벨 시스템',       261),
  ('ingame.account.formation',  'ingame', 'N_account', 'N. 계정·메타 시스템', '진형·배치 메타 (강화 등)', 262),
  ('ingame.account.gem',        'ingame', 'N_account', 'N. 계정·메타 시스템', '보석 시스템',            263),
  ('ingame.account.mastery',    'ingame', 'N_account', 'N. 계정·메타 시스템', '마스터리 시스템',        264),
  ('ingame.account.mastery_reset','ingame','N_account','N. 계정·메타 시스템', '마스터리 초기화 정책',   265),
  ('ingame.account.divinity',   'ingame', 'N_account', 'N. 계정·메타 시스템', '신성력·계정 강화 (옵션)', 266),
  ('ingame.account.profile',    'ingame', 'N_account', 'N. 계정·메타 시스템', '프로필 (아이콘·테두리·한마디)', 267),
  ('ingame.account.entry_currency','ingame','N_account','N. 계정·메타 시스템', '컨텐츠 입장 재화 정책 (통일·별도)', 268),
  ('ingame.account.entry_flow', 'ingame', 'N_account', 'N. 계정·메타 시스템', '게임 진입 흐름 (서버 선택→타이틀→오프닝→메인)', 269),
  ('ingame.account.growth_policy','ingame','N_account','N. 계정·메타 시스템', '계정 성장 정책 (최소화·일반화·적극화)', 270)
ON CONFLICT (id) DO NOTHING;

-- O. 도감·컬렉션 (5) ★
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.codex.hero',         'ingame', 'O_codex', 'O. 도감·컬렉션', '영웅 도감',                    281),
  ('ingame.codex.gear',         'ingame', 'O_codex', 'O. 도감·컬렉션', '장비 도감',                    282),
  ('ingame.codex.pet',          'ingame', 'O_codex', 'O. 도감·컬렉션', '펫 도감',                      283),
  ('ingame.codex.reward',       'ingame', 'O_codex', 'O. 도감·컬렉션', '콜렉션 보상 정책',             284),
  ('ingame.codex.tracker',      'ingame', 'O_codex', 'O. 도감·컬렉션', '도감 진행도·달성도 트래커',    285)
ON CONFLICT (id) DO NOTHING;

-- P. UI/UX 흐름 (8) ★ 부활
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.ui.main',            'ingame', 'P_ui', 'P. UI/UX 흐름', '메인 화면 구성',                   301),
  ('ingame.ui.menu',            'ingame', 'P_ui', 'P. UI/UX 흐름', '메뉴 구조',                        302),
  ('ingame.ui.transition',      'ingame', 'P_ui', 'P. UI/UX 흐름', '화면 전환·로딩 연출 정책',         303),
  ('ingame.ui.button',          'ingame', 'P_ui', 'P. UI/UX 흐름', '버튼 인지성·아이들 연출',          304),
  ('ingame.ui.text_loading',    'ingame', 'P_ui', 'P. UI/UX 흐름', '텍스트 순차 로딩 / UI 뎁스',       305),
  ('ingame.ui.tutorial',        'ingame', 'P_ui', 'P. UI/UX 흐름', '튜토리얼·온보딩 흐름',             306),
  ('ingame.ui.title',           'ingame', 'P_ui', 'P. UI/UX 흐름', '타이틀·오프닝 시퀀스',             307),
  ('ingame.ui.rolling',         'ingame', 'P_ui', 'P. UI/UX 흐름', '인게임 롤링 시스템 공지 (운영용)', 308)
ON CONFLICT (id) DO NOTHING;

-- Q. 몬스터·NPC 시스템 (5) ★
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.npc.type',           'ingame', 'Q_npc', 'Q. 몬스터·NPC 시스템', '몬스터 타입 (일반·보스·특수·레이드)', 321),
  ('ingame.npc.grade',          'ingame', 'Q_npc', 'Q. 몬스터·NPC 시스템', '몬스터 등급 시스템',       322),
  ('ingame.npc.variation',      'ingame', 'Q_npc', 'Q. 몬스터·NPC 시스템', '베리에이션 정책 (어태치·속성별)', 323),
  ('ingame.npc.boss_skill',     'ingame', 'Q_npc', 'Q. 몬스터·NPC 시스템', '보스·레이드 특수 스킬 구조', 324),
  ('ingame.npc.lobby',          'ingame', 'Q_npc', 'Q. 몬스터·NPC 시스템', 'NPC 시스템 (로비·마을·컨텐츠별)', 325)
ON CONFLICT (id) DO NOTHING;

-- R. 맵·월드 시스템 (5) ★
INSERT INTO sub_categories (id, main_category_id, area_code, area_name, name_ko, display_order) VALUES
  ('ingame.map.content_map',    'ingame', 'R_map', 'R. 맵·월드 시스템', '컨텐츠별 맵 정의·개수',       341),
  ('ingame.map.worldmap',       'ingame', 'R_map', 'R. 맵·월드 시스템', '월드맵 구조 (구·평면·노드형)', 342),
  ('ingame.map.region',         'ingame', 'R_map', 'R. 맵·월드 시스템', '영지·지역 시스템 (PLC 확장)', 343),
  ('ingame.map.variation',      'ingame', 'R_map', 'R. 맵·월드 시스템', '맵 베리에이션 정책 (속성·테마)', 344),
  ('ingame.map.stage_view',     'ingame', 'R_map', 'R. 맵·월드 시스템', '스테이지 진행 표현 방식',     345)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. 그래픽 (13) ──────────────────────────────────────────────────
INSERT INTO sub_categories (id, main_category_id, name_ko, display_order) VALUES
  ('graphic.art_style',         'graphic', '아트 스타일 방향 (셀쉐이딩·실사·픽셀 등)', 1),
  ('graphic.illust_2d',         'graphic', '2D 일러스트 가이드',         2),
  ('graphic.model_3d',          'graphic', '3D 캐릭터 모델링·렌더링 (등신대·페이셜)', 3),
  ('graphic.character_design',  'graphic', '캐릭터 디자인 가이드',       4),
  ('graphic.background',        'graphic', '배경 디자인 (지역별 톤·분지형 3D)', 5),
  ('graphic.ui_system',         'graphic', 'UI 디자인 시스템 (컬러·폰트·아이콘)', 6),
  ('graphic.live2d',            'graphic', '라이브 2D · Spine 애니메이션', 7),
  ('graphic.vfx',               'graphic', '이펙트·VFX',                 8),
  ('graphic.cutscene',          'graphic', '컷신·인게임 연출 (스토리 전달 방식)', 9),
  ('graphic.camera',            'graphic', '카메라·시점 시스템 (백뷰·쿼터뷰)', 10),
  ('graphic.skill_duration',    'graphic', '스킬·전투 연출 시간 정책 (1/3/4~6초)', 11),
  ('graphic.motion_policy',     'graphic', '캐릭터 모션 제작 정책 (공수 절감 — 이동 생략 등)', 12),
  ('graphic.boss_intro',        'graphic', '보스·레이드 등장 연출 패턴', 13),
  ('graphic.logo_branding',     'graphic', '로고·브랜딩',                14)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. 사운드 (9) ───────────────────────────────────────────────────
INSERT INTO sub_categories (id, main_category_id, name_ko, display_order) VALUES
  ('sound.bgm_direction',       'sound', 'BGM 방향성 (장르·분위기)',     1),
  ('sound.ost_policy',           'sound', 'OST 작곡 정책 (자체·외주·콜라보)', 2),
  ('sound.theme',               'sound', '메인 테마 / 캐릭터 테마',      3),
  ('sound.combat_bgm',          'sound', '전투 BGM (일반·보스·PvP)',     4),
  ('sound.sfx',                 'sound', 'SFX (효과음)',                 5),
  ('sound.voice',               'sound', '보이스 (다국어 더빙)',         6),
  ('sound.ambient',             'sound', '환경 사운드 (지역·날씨별)',    7),
  ('sound.adaptive',            'sound', '적응형 사운드 (동적 BGM)',     8),
  ('sound.ui_sfx',              'sound', 'UI·인터랙션 사운드',           9)
ON CONFLICT (id) DO NOTHING;

-- ─── 6. 디자인 원칙 (10) ─────────────────────────────────────────────
INSERT INTO sub_categories (id, main_category_id, name_ko, display_order) VALUES
  ('principle.simplicity',      'design_principle', '단순화 원칙',                 1),
  ('principle.account_growth',  'design_principle', '계정 성장 정책 방향 (최소화·일반화·적극화)', 2),
  ('principle.content_fresh',   'design_principle', '콘텐츠 신선도 유지 원칙',     3),
  ('principle.user_trust',      'design_principle', '유저 신뢰 우선 원칙',         4),
  ('principle.global_vs_kr',    'design_principle', '글로벌 vs 한국 우선 정책',    5),
  ('principle.dev_cost',        'design_principle', '개발 공수·리소스 최적화 원칙', 6),
  ('principle.outsource',       'design_principle', '외주 파이프라인 정책',        7),
  ('principle.milestone',       'design_principle', '마일스톤 차수 정책',          8),
  ('principle.staffing',        'design_principle', '직군별 인력 산정 기준',       9),
  ('principle.patch_cycle',     'design_principle', '패치 주기 정책 (매주·CDN·Build 교차·캐릭터 3주)', 10)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. 기본 프로젝트 1개 생성 ───────────────────────────────────────
INSERT INTO projects (id, name, description, status, created_by_nickname)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '내 신작 게임',
  '단일 프로젝트 (추후 변경 가능)',
  'active',
  '정민'
)
ON CONFLICT (id) DO NOTHING;
