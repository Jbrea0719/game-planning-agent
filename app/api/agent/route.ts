import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 게임별 커뮤니티 설정 ──
// officialDomains: Tavily includeDomains에 넘길 공식 커뮤니티 도메인
// officialPathHint: 도메인 내 특정 경로 식별자 — 쿼리에 포함해 정확도 향상
//   (Tavily includeDomains은 도메인 레벨만 필터링, 경로 레벨 필터링 불가)
// dcQueryHint: DC 마이너갤 검색 시 쿼리에 추가할 갤러리 식별 키워드
// 긴 이름(정확한 게임명)이 앞에 위치해야 매칭 우선순위가 올바르게 동작함
type GameCommunity = {
  officialDomains: string[];           // Tavily 폴백용 도메인 리스트
  officialPathHint?: string;           // 경로 식별자 (검색 쿼리 강화용)
  officialUrlFilters?: string[];       // 네이버 결과에서 공식·신뢰 출처로 인정할 URL 키워드 (OR 매칭)
                                       // 게임마다 공식 정보가 라운지·인벤·카페·미디어로 분산되므로 다중 매칭
  dcGalleryId?: string;                // DC 갤러리 ID — URL 필터링 + 쿼리 강화에 사용
};
const GAME_COMMUNITIES: Record<string, GameCommunity> = {
  "세븐나이츠 리버스": {
    officialDomains: ["game.naver.com", "inven.co.kr", "cafe.naver.com"],
    officialPathHint: "sena_rebirth",
    officialUrlFilters: [
      "game.naver.com/lounge/sena_rebirth",  // 네이버 라운지 (인덱싱 빈약하지만 최고 신뢰)
      "inven.co.kr/board/sena",              // 인벤 세나리 게시판 (패치노트 정기 게시)
      "inven.co.kr/webzine/news/?news",      // 인벤 뉴스
      "cafe.naver.com/baedon",               // 배돈 카페
      "trees.gamemeca.com",                  // 게임메카
      "sports.naver.com/esports",            // 네이버 e스포츠 기사
      "newsworks.co.kr/news",                // 뉴스웍스 (넷마블 보도)
    ],
    dcGalleryId: "sevennightsrebirth",
  },
  "세나리":  {
    officialDomains: ["game.naver.com", "inven.co.kr", "cafe.naver.com"],
    officialPathHint: "sena_rebirth",
    officialUrlFilters: [
      "game.naver.com/lounge/sena_rebirth",
      "inven.co.kr/board/sena",
      "inven.co.kr/webzine/news/?news",
      "cafe.naver.com/baedon",
      "trees.gamemeca.com",
      "sports.naver.com/esports",
      "newsworks.co.kr/news",
    ],
    dcGalleryId: "sevennightsrebirth",
  },
  "세반리":  {
    officialDomains: ["game.naver.com", "inven.co.kr", "cafe.naver.com"],
    officialPathHint: "sena_rebirth",
    officialUrlFilters: [
      "game.naver.com/lounge/sena_rebirth",
      "inven.co.kr/board/sena",
      "inven.co.kr/webzine/news/?news",
      "cafe.naver.com/baedon",
      "trees.gamemeca.com",
      "sports.naver.com/esports",
      "newsworks.co.kr/news",
    ],
    dcGalleryId: "sevennightsrebirth",
  },
  "seven knights reverse": {
    officialDomains: ["game.naver.com", "inven.co.kr", "cafe.naver.com"],
    officialPathHint: "sena_rebirth",
    officialUrlFilters: [
      "game.naver.com/lounge/sena_rebirth",
      "inven.co.kr/board/sena",
      "inven.co.kr/webzine/news/?news",
      "cafe.naver.com/baedon",
      "trees.gamemeca.com",
      "sports.naver.com/esports",
      "newsworks.co.kr/news",
    ],
    dcGalleryId: "sevennightsrebirth",
  },
  "세븐나이츠2":   { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/7knights2", "inven.co.kr"] },
  "세븐나이츠":    { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/7knights", "inven.co.kr"] },
  "afk arena":     { officialDomains: ["afkarena.fandom.com"], officialUrlFilters: ["afkarena.fandom.com", "lilith.com"] },
  "afk2":          { officialDomains: ["afkarena.fandom.com"], officialUrlFilters: ["afkarena.fandom.com", "lilith.com"] },
  "서머너즈워":    { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/summonerswar", "inven.co.kr/board/sw"] },
  "니케":          { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/nikkegg", "inven.co.kr/board/nikke"] },
  "에픽세븐":      { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/epicseven", "inven.co.kr/board/epic7"] },
  "원신":          { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/genshinkr", "inven.co.kr/board/genshin"] },
  "붕괴 스타레일": { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/starrailkr", "inven.co.kr/board/hsr"] },
  "스타레일":      { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/starrailkr", "inven.co.kr/board/hsr"] },
  "아크나이츠":    { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/arknightskr", "inven.co.kr/board/arknights"] },
  "fgo":           { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/fategrandorder", "inven.co.kr/board/fgo"] },
  "블루아카이브":  { officialDomains: ["cafe.naver.com"], officialUrlFilters: ["cafe.naver.com/bluearchivekorea", "inven.co.kr/board/ba"] },
};

// Tavily 인스턴스 생성 (API key 없으면 null) — 영어권 / 글로벌 보조 검색용
function getTavily() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  return tavily({ apiKey });
}

type TavilyResult = { answer?: string; results: Array<{ title: string; url: string; content?: string }> };

// ── 네이버 검색 API ──
// 한국 웹 인덱싱은 네이버가 압도적이라 DC·나무위키·카페·라운지 모두 잘 잡힘
// webkr: 통합 웹검색, cafearticle: 카페글, blog: 블로그, news: 뉴스
type NaverSearchType = "webkr" | "cafearticle" | "blog" | "news";
type NaverRawItem = { title: string; link: string; description: string; postdate?: string };

// HTML 태그 및 엔티티 제거 — 네이버는 검색어를 <b> 등으로 감싸서 반환함
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function naverFetch(
  query: string,
  type: NaverSearchType = "webkr",
  display: number = 10
): Promise<NaverRawItem[] | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`,
      {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      }
    );
    if (!res.ok) {
      console.error(`[naver] ${type} 검색 실패: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.items ?? [];
  } catch (err) {
    console.error(`[naver] ${type} 검색 예외:`, err);
    return null;
  }
}

// 네이버 검색 + 다중 도메인 필터 (OR 매칭) → TavilyResult 형태로 통일
// filterKeywords 중 어느 하나라도 URL에 포함되면 결과로 채택
// 모든 필터 매칭 0건이면 도메인 부분만 매칭으로 폴백, 그래도 0이면 빈 결과
async function searchNaverFiltered(
  query: string,
  filterKeywords: string[],
  type: NaverSearchType = "webkr",
  maxResults: number = 5
): Promise<TavilyResult> {
  const items = await naverFetch(query, type, 30); // 필터링 여유분 확보 (최대 30개)
  if (!items || items.length === 0) return { results: [] };

  const lowerKeywords = filterKeywords.map(k => k.toLowerCase());

  // 1차: 다중 키워드 OR 매칭 (어떤 키워드라도 포함되면 통과)
  let filtered = items.filter(item =>
    lowerKeywords.some(k => item.link.toLowerCase().includes(k))
  );

  // 2차: 1차 결과 없으면 각 키워드의 도메인 부분만 매칭 폴백
  if (filtered.length === 0) {
    const domainKeywords = lowerKeywords.map(k => k.split("/")[0]);
    filtered = items.filter(item =>
      domainKeywords.some(d => item.link.toLowerCase().includes(d))
    );
  }

  const top = filtered.slice(0, maxResults);
  return {
    results: top.map(item => ({
      title: stripHtml(item.title),
      url: item.link,
      content: stripHtml(item.description) + (item.postdate ? ` [작성일: ${item.postdate}]` : ""),
    })),
  };
}

// 네이버 다중 타입 검색 (webkr + cafearticle + news) — 한 도메인을 여러 각도에서 찾기
async function searchNaverMultiType(
  query: string,
  filterKeywords: string[],
  maxResults: number = 5
): Promise<TavilyResult> {
  // 3개 타입 병렬 검색
  const [webRes, cafeRes, newsRes] = await Promise.allSettled([
    searchNaverFiltered(query, filterKeywords, "webkr", maxResults),
    searchNaverFiltered(query, filterKeywords, "cafearticle", maxResults),
    searchNaverFiltered(query, filterKeywords, "news", maxResults),
  ]);

  // 모든 결과 통합 (URL 중복 제거)
  const seen = new Set<string>();
  const merged: TavilyResult["results"] = [];
  for (const r of [webRes, cafeRes, newsRes]) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value.results) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
      if (merged.length >= maxResults) break;
    }
    if (merged.length >= maxResults) break;
  }

  return { results: merged };
}

// 본문 추출 전략 변경 (2026-05):
// 한국 주요 사이트(라운지 SPA, DC, 나무위키, 인벤, 카페)는 모두 본문 추출이 막힘.
// - 라운지: SPA, JS 렌더 필요
// - DC/나무위키/인벤: 봇 차단/CAPTCHA
// Tavily Extract / Jina Reader 모두 한국 사이트에서는 실패함.
//
// 대신: 네이버 검색 description(~200자)이 의외로 정보 밀도 높음.
//   예) "5월 14일(목) 업데이트 상세 안내 ■ 신규 영웅 추가 ◉ [전설] 칼 헤론..."
// → description만으로도 사실 정보(날짜·이름·수치) 추출 충분.
//
// searchNaverWithExtract는 이름은 유지(시그니처 호환)하지만
// 실제로는 본문 추출 없이 네이버 description을 그대로 활용
async function searchNaverWithExtract(
  query: string,
  filterKeywords: string[],
  _tv: ReturnType<typeof getTavily>,
  maxResults: number = 7
): Promise<TavilyResult> {
  // 네이버 다중 타입(webkr + cafearticle + news) 검색 결과를 그대로 반환
  // 본문 추출 단계 제거 (어차피 한국 사이트는 다 막힘)
  return await searchNaverMultiType(query, filterKeywords, maxResults);
}

// 검색 결과 포맷팅 (AI에게 넘길 상세 텍스트)
// content는 자르지 않고 전체 그대로 전달 (네이버 description은 보통 200~300자라 잘릴 일 없음)
function formatResults(source: string, res: TavilyResult): string {
  if (!res.results || res.results.length === 0) return `[${source}] 검색 결과 없음`;
  const items = res.results
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   본문 미리보기: ${r.content ?? ""}`)
    .join("\n\n");
  return `[${source}]\n${items}`;
}

// 소스별 결과 유무를 아이콘으로 요약 (스트림 노출용)
function sourceStatus(res: TavilyResult | null, error: boolean): string {
  if (error) return "❌";
  if (!res || !res.results || res.results.length === 0) return "⚠️";
  return "✓";
}

// ── 게임별 3채널 병렬 검색 (네이버 검색 API 우선, Tavily 폴백) ──
// 한국 웹(DC·나무위키·카페·라운지) 인덱싱은 네이버가 압도적이라 1순위로 사용
async function searchGameInfo(
  gameName: string,
  topic: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const hasNaver = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  const tv = getTavily();

  if (!hasNaver && !tv) {
    return `[검색 불가] NAVER 또는 TAVILY API 키 미설정`;
  }

  const query = `${gameName} ${topic}`;

  // 게임 커뮤니티 설정 찾기 — 긴 키(정확한 게임명) 우선 매칭
  const lowerGame = gameName.toLowerCase().trim();
  const community = Object.entries(GAME_COMMUNITIES)
    .filter(([key]) => lowerGame.includes(key) || key.includes(lowerGame))
    .sort((a, b) => b[0].length - a[0].length)
    [0]?.[1] ?? null;

  // DC 쿼리: 갤러리 ID 포함해 정확도 향상 (네이버에서도 효과적)
  const dcQuery = community?.dcGalleryId
    ? `${gameName} ${community.dcGalleryId} ${topic}`
    : `${gameName} 디시 ${topic}`;

  // 공식 쿼리: 경로 힌트 포함
  const officialQuery = community?.officialPathHint
    ? `${gameName} ${community.officialPathHint} ${topic}`
    : `${gameName} 공식 ${topic}`;

  // 3개 소스 병렬 검색 (네이버 우선, 결과 없으면 Tavily 폴백)
  const officialFilters = community?.officialUrlFilters ?? community?.officialDomains ?? [];

  const [namuRes, dcRes, officialRes] = await Promise.allSettled([
    // 1. 나무위키
    searchWithFallback({
      naverQuery: `${query} 나무위키`,
      naverFilters: ["namu.wiki"],
      tavily: tv,
      tavilyQuery: query,
      tavilyDomains: ["namu.wiki"],
      hasNaver,
    }),

    // 2. 디시인사이드 마이너갤
    searchWithFallback({
      naverQuery: dcQuery,
      naverFilters: ["gall.dcinside.com"],
      tavily: tv,
      tavilyQuery: dcQuery,
      tavilyDomains: ["gall.dcinside.com"],
      hasNaver,
    }),

    // 3. 공식 + 신뢰 출처 (다중 필터 OR 매칭: 라운지·인벤·카페·게임미디어 등)
    searchWithFallback({
      naverQuery: officialQuery,
      naverFilters: officialFilters,
      tavily: tv,
      tavilyQuery: officialQuery,
      tavilyDomains: community?.officialDomains ?? [],
      hasNaver,
    }),
  ]);

  // 한 줄 요약: "  세나리 · 최신 업데이트   나무위키 ✓  디시 ✓  공식 ✓"
  const namu = sourceStatus(namuRes.status === "fulfilled" ? namuRes.value : null, namuRes.status === "rejected");
  const dc   = sourceStatus(dcRes.status === "fulfilled" ? dcRes.value : null, dcRes.status === "rejected");
  const off  = sourceStatus(officialRes.status === "fulfilled" ? officialRes.value : null, officialRes.status === "rejected");
  onProgress?.(`  **${gameName}** · ${topic}   나무위키 ${namu}  디시 ${dc}  공식 ${off}\n`);

  // URL 진단 출력 — 실제로 어떤 페이지의 본문을 읽었는지 확인용 (한 줄당 1 URL, 최대 2개)
  const collectUrls = (r: PromiseSettledResult<TavilyResult>, label: string): string => {
    if (r.status !== "fulfilled" || r.value.results.length === 0) return "";
    return r.value.results
      .slice(0, 2)
      .map(item => `    └ [${label}] ${item.url}`)
      .join("\n");
  };
  const urlLines = [
    collectUrls(namuRes, "나무위키"),
    collectUrls(dcRes, "디시"),
    collectUrls(officialRes, "공식"),
  ].filter(Boolean).join("\n");
  if (urlLines) onProgress?.(`${urlLines}\n`);

  const officialResult = officialRes.status === "fulfilled" ? formatResults("공식 커뮤니티/홈페이지 [1순위 — 최우선 신뢰]", officialRes.value) : `[공식 커뮤니티] 검색 오류`;
  const dcResult = dcRes.status === "fulfilled" ? formatResults("디시인사이드 마이너갤 [2순위 — 보완 및 교차검증]", dcRes.value) : `[디시인사이드] 검색 오류`;
  const namuResult = namuRes.status === "fulfilled" ? formatResults("나무위키 [3순위 — 최후 수단]", namuRes.value) : `[나무위키] 검색 오류`;

  // 우선순위 순으로 정렬: 공식 → 디시 → 나무위키
  return `=== ${gameName} — ${topic} ===\n\n${[officialResult, dcResult, namuResult].join("\n\n")}`;
}

// 하이브리드 검색: 네이버로 URL 발견 → Tavily Extract로 본문 추출
// 둘 다 없으면 Tavily 일반 검색으로 폴백
async function searchWithFallback(opts: {
  naverQuery: string;
  naverFilters: string[];
  tavily: ReturnType<typeof getTavily>;
  tavilyQuery: string;
  tavilyDomains: string[];
  hasNaver: boolean;
}): Promise<TavilyResult> {
  // 1순위: 네이버 검색 (description 그대로 활용 — 본문 추출은 한국 사이트가 모두 차단해서 제거됨)
  // 결과를 7개까지 확보해 정보 밀도 보강
  if (opts.hasNaver && opts.naverFilters.length > 0) {
    const result = await searchNaverWithExtract(opts.naverQuery, opts.naverFilters, opts.tavily, 7);
    if (result.results.length > 0) return result;
  }

  // 2순위: Tavily 일반 검색 폴백 (네이버 결과 없거나 키 미설정 시)
  if (opts.tavily && opts.tavilyDomains.length > 0) {
    return await opts.tavily.search(opts.tavilyQuery, {
      maxResults: 5,
      searchDepth: "advanced",
      includeDomains: opts.tavilyDomains,
    });
  }

  return { results: [] };
}

// ── 일반 키워드 검색 (게임명 특정 없을 때 보조용) ──
async function searchGeneral(query: string): Promise<string> {
  const tv = getTavily();
  if (!tv) return `[검색 불가] TAVILY_API_KEY 미설정`;
  try {
    const res = await tv.search(query, {
      maxResults: 5,
      searchDepth: "advanced",
      includeAnswer: true,
    });
    return formatResults("일반 검색", res);
  } catch (err) {
    return `검색 오류: ${String(err)}`;
  }
}

// ════════════════════════════════════════
// 한국 게임 정보 기본 신뢰 도메인 (게임별 도메인과 합쳐서 사용)
// ════════════════════════════════════════
const KOREAN_GAME_TRUSTED_DOMAINS = [
  // 게임 저널리즘 (가장 신뢰도 높음)
  "inven.co.kr",
  "gamemeca.com",
  "thisisgame.com",
  "gameshot.net",
  "hungryapp.co.kr",
  // 위키
  "namu.wiki",
  // 네이버 자체 서비스
  "game.naver.com",
  "cafe.naver.com",
  "sports.naver.com",
  "news.naver.com",
  "blog.naver.com",
  "m.sports.naver.com",
  // 커뮤니티
  "gall.dcinside.com",
  "ruliweb.com",
  "bbs.ruliweb.com",
];

// 질문 + 맥락 카드에서 매칭되는 게임 찾기
function findMatchingGame(userQuery: string, contextCard: string): { game: typeof GAME_COMMUNITIES[string]; gameKey: string } | null {
  const haystack = `${contextCard} ${userQuery}`.toLowerCase();
  const matched = Object.entries(GAME_COMMUNITIES)
    .filter(([key]) => haystack.includes(key.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length); // 더 긴(정확한) 매칭 우선
  if (matched.length === 0) return null;
  return { game: matched[0][1], gameKey: matched[0][0] };
}

// ════════════════════════════════════════
// 에이전트 1 (신규): Claude 네이티브 웹 검색
// 역할: Anthropic 웹 검색 도구로 게임별 신뢰 도메인에서 정보 수집 + 자동 인용
// ════════════════════════════════════════
async function analyzeWithWebSearch(
  userQuery: string,
  contextCard: string = "",
  recentMessages: { role: string; content: string }[] = [],
  onProgress?: (text: string) => void
): Promise<string> {

  // 게임 매칭 → allowed_domains 구성
  const matched = findMatchingGame(userQuery, contextCard);
  const gameAllowed = matched
    ? Array.from(new Set([
        ...(matched.game.officialUrlFilters ?? []).map(f => f.split("/")[0]),  // 경로 제거하고 도메인만
        ...matched.game.officialDomains,
        ...KOREAN_GAME_TRUSTED_DOMAINS,
      ]))
    : KOREAN_GAME_TRUSTED_DOMAINS;

  // 도메인 중복 제거 후 최종 리스트 (Anthropic 가이드: 너무 좁히지 말 것)
  const allowedDomains = Array.from(new Set(gameAllowed.filter(d => d && d.length > 0)));

  if (matched) {
    onProgress?.(`  🎯 **${matched.gameKey}** 매칭 — 신뢰 도메인 ${allowedDomains.length}개로 제한\n`);
  } else {
    onProgress?.(`  🌐 일반 검색 — 한국 게임 신뢰 도메인 ${allowedDomains.length}개\n`);
  }

  // 맥락 섹션 구성
  const contextSection = contextCard ? `\n\n[대화 맥락 카드]\n${contextCard}` : "";
  const recentSection = recentMessages.length > 0
    ? `\n\n[직전 교환]\n${recentMessages.slice(-2).map(m =>
        `${m.role === "user" ? "질문" : "조던"}: ${m.content.slice(0, 200)}`
      ).join("\n")}`
    : "";

  const systemPrompt = `당신은 영웅수집형 게임 정보 수집·분석 전문 에이전트예요.
사용자의 질문에 대해 web_search 도구로 실시간 한국 웹 검색을 수행하고, 수집된 정보를 정리하세요.

[검색 원칙]
- 게임명이 명시되면 그 게임만 검색 (다른 게임으로 절대 바꾸지 말 것)
- "세븐나이츠 리버스" → "세븐나이츠"로 축약 금지
- 비교 분석이 명시적으로 필요한 경우만 여러 검색
- 최대 5회 검색 (정보 충분하면 더 적게)

[소스 신뢰도]
1순위: 공식 사이트·게임 저널리즘 (인벤·게임메카·디스이즈게임)
2순위: 네이버 카페·커뮤니티 (정보성 카페)
3순위: 디시인사이드 (유저 반응 파악용)
4순위: 나무위키 (최후 수단)

[충돌 시]
- 공식과 커뮤니티 정보 다르면 → 공식 신뢰
- 사실(날짜·이름·수치)은 공식에서, 유저 반응은 커뮤니티에서
- 확인 안 되는 정보는 "확인 안 됨"으로 명시

[정확성 원칙]
- 검색 결과의 게시 날짜를 반드시 확인
- 여러 게시글의 날짜·캐릭터명을 절대 혼재하지 말 것
- 출처별로 정보 분리해서 정리할 것

[출력 형식]
검색 후 다음 형식으로 정리:
1. 핵심 사실 (날짜·이름·수치) — 출처 명시
2. 추가 맥락 (유저 반응·평가) — 출처 명시
3. 미확인 부분 (있을 경우)

다음 단계(조던 답변 생성)에서 이 정리본을 활용하므로 깔끔하게 정리할 것.`;

  const userContent = `${contextSection}${recentSection}

[현재 질문]
${userQuery}`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
          allowed_domains: allowedDomains,
          user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
        } as unknown as Anthropic.Tool,
      ],
      messages: [{ role: "user", content: userContent }],
    });

    // 검색 진행상황 스트림 출력
    let searchCount = 0;
    const citations: { url: string; title: string }[] = [];

    for (const block of res.content) {
      // 서버 측 검색 도구 사용 추적
      const b = block as { type: string; tool_use_id?: string; content?: unknown };
      if (b.type === "server_tool_use") {
        searchCount++;
      }
      // 검색 결과에서 URL 수집 (인용 표시용)
      if (b.type === "web_search_tool_result") {
        const arr = Array.isArray(b.content) ? b.content : [];
        for (const item of arr) {
          const it = item as { url?: string; title?: string };
          if (it.url && it.title) {
            citations.push({ url: it.url, title: it.title });
          }
        }
      }
    }

    // 진행상황 출력
    if (searchCount > 0) {
      onProgress?.(`  🔎 웹 검색 ${searchCount}회 수행, 출처 ${citations.length}개 확보\n`);
      // 상위 출처 URL 표시 (최대 5개)
      const topCitations = citations.slice(0, 5);
      for (const c of topCitations) {
        onProgress?.(`    └ ${c.title.slice(0, 60)} — ${c.url}\n`);
      }
    }

    // 텍스트 응답 추출
    const textContent = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("");

    return textContent || "검색 완료 (분석 텍스트 없음)";
  } catch (err) {
    console.error("[analyzeWithWebSearch] 오류:", err);
    onProgress?.(`  ❌ 웹 검색 실패: ${String(err).slice(0, 100)}\n`);
    return `웹 검색 중 오류 발생: ${String(err)}`;
  }
}

// ════════════════════════════════════════
// (구) 에이전트 1: 분석 에이전트 — Naver/Tavily 기반
// 새 analyzeWithWebSearch로 대체됨. 보존(rollback 안전망용)
// ════════════════════════════════════════
async function analyzeAgent(
  userQuery: string,
  contextCard: string = "",        // 롤링 맥락 카드 (항상 3줄, 크기 고정)
  recentMessages: { role: string; content: string }[] = [],  // 직전 2개 메시지 (즉각 follow-up용)
  onProgress?: (text: string) => void  // 검색 진행상황을 스트림에 실시간 출력
): Promise<string> {

  // 도구 정의: 게임별 3채널 검색 + 일반 검색
  const tools: Anthropic.Tool[] = [
    {
      name: "search_game",
      description: "특정 게임의 정보를 나무위키, 디시인사이드 마이너갤러리, 공식 커뮤니티/홈페이지 3곳에서 동시에 검색합니다",
      input_schema: {
        type: "object" as const,
        properties: {
          game_name: {
            type: "string",
            description: "검색할 게임 이름 (예: 원신, 서머너즈워, 세븐나이츠, 니케 등)",
          },
          topic: {
            type: "string",
            description: "검색할 주제 (예: 가챠 시스템, 수익화 구조, 유저 반응, 밸런스 패치 등)",
          },
        },
        required: ["game_name", "topic"],
      },
    },
    {
      name: "search_general",
      description: "게임 기획 트렌드, 업계 동향 등 특정 게임에 국한되지 않는 일반 정보를 검색합니다",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "검색어",
          },
        },
        required: ["query"],
      },
    },
  ];

  // ① 롤링 맥락 카드 (크기 고정 ~150자 — 어떤 게임/주제인지 항상 파악 가능)
  const contextSection = contextCard
    ? `\n\n[대화 맥락 카드 — 현재 무엇을 논의 중인지]\n${contextCard}\n`
    : "";

  // ② 직전 메시지 2개 (즉각 follow-up 대응용 — "그게 뭐야?", "좀더 설명해줘" 등)
  const recentSection = recentMessages.length > 0
    ? `\n[직전 교환]\n${recentMessages.slice(-2).map(m =>
        `${m.role === "user" ? "질문" : "조던"}: ${m.content.slice(0, 200)}`
      ).join("\n")}\n`
    : "";

  let messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `다음 게임 기획 질문을 분석해줘. search_game 도구로 실제 데이터를 검색해서 수집해줘.${contextSection}${recentSection}
[현재 질문]
${userQuery}

검색 원칙:
- 맥락 카드에 게임명이 있으면 → 그 게임 풀네임으로 search_game 검색
- 현재 질문에 게임명이 명시된 경우 → 해당 풀네임으로 검색 (카드보다 현재 질문 우선)
- 여러 게임 비교가 필요한 경우만 여러 번 검색, 그 외엔 해당 게임 1개 집중 검색
- 게임명 절대 축약하거나 다른 게임으로 바꾸지 말 것`
  }];

  let allSearchResults = "";

  const analyzeSystemPrompt = `당신은 영웅수집형 게임 분석 전문 에이전트예요.
사용자의 게임 기획 질문에 대해 반드시 search_game 도구를 먼저 호출해서 실제 데이터를 수집하세요.
도구를 호출하기 전에 텍스트를 출력하지 마세요. 검색 먼저, 설명은 나중에.

참고 게임: AFK Arena/AFK2, 세븐나이츠 리버스, 세븐나이츠2, 세븐나이츠, 서머너즈워, 니케, 에픽세븐, 원신, 붕괴:스타레일, 아크나이츠, FGO, 블루아카이브

[소스 신뢰도 우선순위 — 반드시 준수]
1순위: 공식 커뮤니티/홈페이지 — 사실 정보(패치 내용·날짜·신규 영웅 이름·이벤트)의 최우선 출처. 가장 먼저 확인.
2순위: 디시인사이드 마이너갤 — 공식 정보가 부족하거나 모호할 때 보완용. 공식과 동일 사안에 대한 교차검증용.
3순위: 나무위키 — 공식과 디시 둘 다 정보가 부족한 경우에만 사용하는 최후 수단.

[충돌 시 판단]
- 공식과 디시 정보가 다르면 → 공식을 신뢰 (디시는 유저 작성이라 부정확 가능)
- 공식에 명확한 답이 있으면 → 디시·나무위키 정보로 답을 절대 바꾸지 말 것
- 사실(날짜·이름·수치)은 반드시 공식에서 인용, 유저 반응·체감 평가는 디시에서 인용

분석 원칙:
- 특정 게임이 명시된 경우 → 그 게임 풀네임으로만 search_game 검색 (다른 게임으로 바꾸지 않음)
- 게임명은 반드시 원래 이름 그대로 사용 (예: "세븐나이츠 리버스" → "세븐나이츠 리버스"로 검색, "세븐나이츠"로 축약 금지)
- 비교 분석이 명시적으로 필요한 경우만 여러 게임 검색
- 검색 결과가 없거나 부족하면 search_general로 보완

날짜·수치 정확성 원칙:
- 각 검색 결과의 제목(title)과 URL을 먼저 확인해 게시 날짜를 파악할 것
- 여러 게시글의 날짜·캐릭터명을 절대 혼재하지 말 것 (A 날짜의 정보 → A 날짜로만 기술)
- 확인되지 않은 날짜나 이름은 "검색 결과에서 확인되지 않음"으로 명시할 것`;

  // 도구 호출 루프 (최대 4턴 — 게임당 1번씩 여러 게임 검색 가능)
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: analyzeSystemPrompt,
      tools,
      // 첫 턴: tool_choice "any" → 반드시 도구 호출 강제 (텍스트만 생성하는 오동작 방지)
      // 이후 턴: 자유롭게 end_turn 허용 (추가 검색 또는 종료 선택)
      ...(turn === 0 ? { tool_choice: { type: "any" as const } } : {}),
      messages,
    });

    if (res.stop_reason === "end_turn") {
      const textContent = res.content
        .filter(b => b.type === "text")
        .map(b => (b as Anthropic.TextBlock).text)
        .join("");
      return allSearchResults
        ? `[수집된 실시간 데이터]\n${allSearchResults}\n\n[분석 메모]\n${textContent}`
        : textContent;
    }

    if (res.stop_reason === "tool_use") {
      const toolBlocks = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tb of toolBlocks) {
        let result = "";
        if (tb.name === "search_game") {
          const { game_name, topic } = tb.input as { game_name: string; topic: string };
          // 검색 대상을 스트림에 실시간 출력 — 어떤 게임/주제를 검색했는지 육안 확인 가능
          result = await searchGameInfo(game_name, topic, onProgress);
        } else if (tb.name === "search_general") {
          const { query } = tb.input as { query: string };
          result = await searchGeneral(query);
        }
        allSearchResults += `\n${result}\n`;
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      break;
    }
  }

  // 루프 종료 시 마지막 텍스트 추출
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  if (lastAssistant && Array.isArray(lastAssistant.content)) {
    const text = lastAssistant.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");
    return text || allSearchResults || "분석 완료";
  }
  return allSearchResults || "분석 완료";
}

// ════════════════════════════════════════
// 에이전트 2: 설계 에이전트
// 역할: 조던의 10가지 철학에 기반해 구체적 설계안 도출
// ════════════════════════════════════════
async function designAgent(userQuery: string, analysisResult: string): Promise<string> {
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: `당신은 10년 경력의 게임 설계 전문 에이전트예요. 다음 철학을 기준으로 구체적인 설계안을 만들어요:

[조던의 10가지 게임 설계 철학]
1. 단순함이 먼저다 — 코어 루프는 3단계 이내, 튜토리얼 없이도 이해 가능
2. Easy to Play Hard to Master — 진입 장벽 낮게, 숙련도 보상 확실하게
3. 성장 체감이 핵심 — 매 세션마다 눈에 보이는 성장, 수치 상승 만족감
4. 하드코어 유저를 위한 출구 — PvP, 레이드, 길드전 등 경쟁 채널 반드시 확보
5. 커뮤니티가 수명이다 — 길드, 채팅, 공동 목표가 이탈 방지의 핵심
6. 편의성 타협 불가 — 자동 전투, 빠른 진행, 반복 최소화
7. UI/UX 트렌드 준수 — 현재 Top100 게임 UI 벤치마킹 필수
8. 글로벌 설계 기본 — 현지화, 문화 다양성, 글로벌 서버 구조
9. 전략성은 단순한 틀 안에 — 속성 상성, 진형, 역할(탱/딜/힐) 삼각형 기본
10. 장기 PLC 처음부터 설계 — 1년치 콘텐츠 로드맵, 시즌제, 메타 교체 계획

참고 분석 데이터 (실시간 수집):
${analysisResult}

설계 원칙:
- 추상적 방향이 아닌 구체적 수치와 구조로 제안해요
- "이렇게 하면 좋겠다" 가 아니라 "이렇게 만들어라" 형식
- 구현 가능성과 개발 리소스 현실성 반영
- 출력은 구체적 설계안, 2000토큰 이내`,
    messages: [{
      role: "user",
      content: `원래 질문: ${userQuery}\n\n위 실시간 분석 데이터를 바탕으로 조던의 10가지 철학에 기반한 구체적인 설계안을 도출해줘.`
    }],
  });

  return res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
}

// ════════════════════════════════════════
// 에이전트 3: 검토 에이전트
// 역할: 베테랑 디렉터 시각으로 설계안 검토
// ════════════════════════════════════════
async function criticAgent(
  userQuery: string,
  designResult: string
): Promise<{ approved: boolean; feedback: string }> {
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: `당신은 모바일 영웅수집형 게임을 20년간 직접 만들어온 현직 디렉터예요.
AFK Arena/AFK2, 세븐나이츠 시리즈, 서머너즈워, 니케, 에픽세븐, 원신, 붕괴:스타레일, 아크나이츠, FGO, 블루아카이브 —
이 게임들의 출시 전후, 성공과 실패, 유저 반응, 운영 사고까지 몸으로 겪었어요.

지금 당신은 팀 기획자가 가져온 설계안을 검토하고 있어요.
형식이나 항목에 얽매이지 말고, **이 설계안에서 실제로 문제가 될 것들**만 골라 말해줘요.

[피드백 원칙]
- 고정된 검토 항목 없음. 질문의 맥락에서 진짜 위험한 것, 빠진 것, 오해하기 쉬운 것만 짚어요.
- 참고 게임 중 유사 사례가 있으면 반드시 인용해요. "원신이 2.x 버전에 이걸 했다가...", "서머너즈워가 초기에 이 실수를 했는데..." 식으로요.
- 영웅수집형 장르 특유의 함정 — 가챠 피로도, 메타 고착, 고과금 의존, 신규 유저 진입 장벽, 초월 인플레이션 등 — 설계에 숨어있으면 반드시 짚어요.
- "이건 괜찮네요"처럼 무의미한 칭찬 생략. 진짜 보완이 필요한 것만.
- 기획자에게 말하듯 써요. 딱딱한 보고서 아니고, 직접 대화하는 것처럼.
- 굵게(**) 강조는 핵심 포인트에만.

[출력 형식]
첫 줄에 "APPROVED" 또는 "NEEDS_IMPROVEMENT" 한 단어만 쓰고 빈 줄 하나 후,
피드백 본문을 자유롭게 써요.

- 지적 항목은 2~4개 사이로. 많다고 좋은 게 아니에요 — 진짜 중요한 것만.
- 각 항목은 제목 없이, 문단 형태로 써요. 자연스럽게 이어지는 디렉터 말투로.
- 마지막에 한 줄: "→ 지금 당장 수정해야 할 건 [핵심 1가지]예요." 로 끝내요.
- 전체 600자 이내.`,
    messages: [{
      role: "user",
      content: `기획자가 가져온 질문과 설계안이에요. 검토해주세요.\n\n[질문]\n${userQuery}\n\n[설계안]\n${designResult}`,
    }],
  });

  const feedback = res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  const approved = feedback.trim().startsWith("APPROVED");
  return { approved, feedback };
}

// ════════════════════════════════════════
// 파이프라인: 검색 + 분석 → 조던 최종 답변
// ════════════════════════════════════════
async function runMultiAgentPipeline(
  userQuery: string,
  contextCard: string,
  recentMessages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  detailed = false
): Promise<string> {

  // ── 검색 + 분석 (Claude 네이티브 웹 검색)
  onChunk(`\n🔍 **웹 검색 중** — Claude가 한국 게임 신뢰 사이트들을 검색하고 있어요...\n`);
  // onChunk를 onProgress로 전달 → 검색 진행상황 + 출처 URL이 스트림에 실시간 노출됨
  const analysisResult = await analyzeWithWebSearch(userQuery, contextCard, recentMessages, onChunk);
  onChunk(`✅ 검색 완료\n\n---\n\n`);

  // ── 조던 말투로 최종 답변 생성
  onChunk(`__JORDAN_ANSWER_START__`);

  const combinedContext = `[실시간 검색 데이터]\n${analysisResult}`;

  // 공통 시스템 프롬프트 앞부분 (검색 결과 활용 지시 포함)
  const baseSystemPrompt = `당신의 이름은 조던(Jordan)이에요. 영웅수집형 모바일 게임 기획 전문가 AI예요.
10년 이상 현장에서 게임을 만들어온 베테랑 디렉터의 시선으로 답변해요.
직설적이고 실무 중심으로, "이 구조는 이래서 망합니다"처럼 솔직하게 말해줘요.

[중요 — 검색 데이터 활용]
당신은 방금 Claude 네이티브 웹 검색을 통해 한국 게임 신뢰 사이트(인벤·게임메카·디스이즈게임·나무위키·디시·네이버 카페/뉴스 등)에서 실시간 정보를 수집했어요.
사용자 메시지의 [실시간 검색 데이터]는 이미 출처별로 정리돼 있어요. 이를 반드시 활용해서 답변하세요.
절대로 "실시간 검색 기능이 없어요", "최신 정보를 알 수 없어요" 같은 말을 하지 마세요.

[소스 신뢰도 우선순위 — 반드시 준수]
1순위: 공식 사이트·게임 저널리즘 (인벤·게임메카·디스이즈게임·공식 라운지·뉴스) — 사실 정보(패치·날짜·신규 영웅·이벤트)의 최우선 출처
2순위: 네이버 카페·정보성 커뮤니티 — 공식 보완용
3순위: 디시인사이드 — 유저 반응·체감 평가용
4순위: 나무위키 — 위 셋 부족할 때 최후 수단

[충돌 시 판단 — 매우 중요]
- 공식·언론과 커뮤니티 정보가 다르면 → 반드시 공식 신뢰
- 공식·언론에 명확한 답이 있으면 → 커뮤니티 정보로 답을 절대 바꾸지 말 것
- 사실(날짜·이름·수치)은 공식·언론에서 인용, 유저 반응·체감 평가는 디시에서 인용
- 답변 시 인용 출처를 명시: "인벤 5/14 기사에 따르면...", "디시 유저 반응을 보면..." 형태로

[정확성 절대 원칙]
- 검색 데이터에 없는 정보는 추측하지 말 것
- 날짜·캐릭터명·수치는 검색 데이터에 명시된 그대로 인용
- 데이터 부족 시 "확인된 정보 없음"으로 솔직히 명시

말투:
- "~이에요", "~거든요", "~죠" 같은 친근한 말투를 사용해요
- 핵심 단어는 **굵게** 강조해요
- 불확실한 내용은 "제 견해로는" 이라고 명시해요`;

  const finalRes = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: detailed ? 8192 : 500,
    system: detailed
      ? `${baseSystemPrompt}

[절대 규칙 — 자세한 답변]
- 반드시 3000자 이내의 완결된 답변을 작성해요. 3000자를 절대 초과하지 마세요.
- 답변은 반드시 완결된 문장으로 끝나야 해요. 절대로 단어나 문장 중간에서 잘리면 안 돼요.
- 헤더(#), 목록(-, •), 표 등 구조가 도움된다면 자유롭게 사용해요.
- 만약 3000자로는 전달해야 할 내용의 50% 미만밖에 커버하지 못한다고 판단되면:
  1) 3000자 이내의 핵심 요약을 먼저 완결성 있게 작성하고 (반드시 완결된 문장으로 끝낼 것)
  2) 바로 다음 줄에 __NEEDS_FULL__ 을 단독으로 작성하고
  3) 그 아래에 전체 답변을 이어서 작성해요 (10000자 이내, 반드시 완결된 문장으로 끝낼 것)
- 50% 이상 커버 가능하면 __NEEDS_FULL__ 없이 3000자 이내로만 작성해요.`
      : `${baseSystemPrompt}

[절대 규칙 — 일반 답변]
- 반드시 500자 이내로 작성해요. 500자를 절대 초과하지 마세요. 어떤 질문에도 예외 없어요.
- 답변은 반드시 완결된 문장으로 끝나야 해요.
- 헤더(#), 목록(-, •, 번호), 표 등 마크다운 구조를 절대 사용하지 마세요. 순수 대화체 문장으로만 작성해요.
- 항목별 세부 나열 금지. 질문 전체를 3~5문장으로 압축 요약해요.
- 자세한 답변의 전체 내용을 조감하는 한 문단이어야 해요.`,
    messages: [{
      role: "user",
      content: `사용자 질문: ${userQuery}\n\n다음 실시간 검색 데이터를 바탕으로 위 질문에 조던의 말투로 답변해줘:\n\n${combinedContext}`
    }],
  });

  const finalText = finalRes.content
    .filter(b => b.type === "text")
    .map(b => (b as Anthropic.TextBlock).text)
    .join("");

  onChunk(finalText);

  // 토큰 한도로 잘린 경우 클라이언트에 알림
  if (finalRes.stop_reason === "max_tokens") {
    onChunk("__TRUNCATED__");
  }

  return finalText;
}

// ── POST 핸들러 ──
type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages, session_id, pair_id, detailed, agentContext } = (await request.json()) as {
      messages: Message[];
      session_id?: string;
      pair_id?: string;
      detailed?: boolean;
      agentContext?: string;  // 롤링 맥락 카드 (클라이언트에서 관리)
    };

    const userMessage = messages[messages.length - 1];
    // 직전 2개 메시지 (즉각 follow-up용 — 롤링 카드와 역할 구분)
    const recentMessages = messages.slice(-3, -1);

    const readable = new ReadableStream({
      async start(controller) {
        const encode = (text: string) =>
          controller.enqueue(new TextEncoder().encode(text));
        try {
          const assistantText = await runMultiAgentPipeline(
            userMessage.content,
            agentContext ?? "",
            recentMessages,
            encode,
            detailed
          );
          // Supabase에 대화 저장
          if (session_id && pair_id) {
            const { error: dbError } = await supabase.from("messages").insert([
              { session_id, pair_id, role: "user", content: userMessage.content, universes: "게임기획", is_deleted: false },
              { session_id, pair_id, role: "assistant", content: assistantText, universes: "게임기획", is_deleted: false },
            ]);
            if (dbError) {
              console.error("[agent] Supabase 저장 실패:", dbError.message, dbError.code);
            } else {
              console.log("[agent] Supabase 저장 성공:", session_id, pair_id);
            }
          } else {
            console.warn("[agent] session_id 또는 pair_id 없음 — 저장 건너뜀");
          }
        } catch (err) {
          encode(`오류가 발생했어요: ${String(err)}`);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return new Response(`오류: ${String(error)}`, { status: 500 });
  }
}
