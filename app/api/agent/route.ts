import Anthropic from "@anthropic-ai/sdk";
import { tavily } from "@tavily/core";
import { supabase } from "@/lib/supabase";
import { classifyQuestion, REGISTERED_GAMES, type RouteDecision } from "../router/route";
import { ensureGameDomains, type DiscoveredDomain } from "@/lib/domain-discovery";
import { extractAndSaveDecisions } from "@/lib/decision-extractor";
import { checkBibleConsistency } from "@/lib/decision-consistency-checker";
import { buildDecisionContext } from "@/lib/decision-context";
import { buildFeedbackContext } from "@/lib/feedback-context";
import { fetchLoungeAll, buildLoungeContext } from "@/lib/naver-lounge";
import { buildWebtoonContext } from "@/lib/webtoon-context";
import { MODEL } from "@/lib/models";

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
      "namu.wiki/w/세븐나이츠",
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
      "namu.wiki/w/세븐나이츠",
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
      "namu.wiki/w/세븐나이츠",
    ],
    dcGalleryId: "sevennightsrebirth",
  },
  // 세븐나이츠 원작·세븐나이츠2: 서비스 종료 + 자료 부족·혼란으로 등록 제외 (2026-05)
  // 에버소울: 검증된 큐레이션 없음, 등록 제외 (2026-05)
  "afk arena":     {
    officialDomains: ["lilith.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "cafe.naver.com/afkarenakr",
      "afk-kr.lilith.com",
      "namu.wiki/w/AFK 아레나",
      "gall.dcinside.com/mgallery/board/lists/?id=afk",
    ],
    dcGalleryId: "afk",
  },
  "afk 아레나":    {
    officialDomains: ["lilith.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "cafe.naver.com/afkarenakr",
      "afk-kr.lilith.com",
      "namu.wiki/w/AFK 아레나",
      "gall.dcinside.com/mgallery/board/lists/?id=afk",
    ],
    dcGalleryId: "afk",
  },
  "afk 저니":      {
    officialDomains: ["farlightgames.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com", "facebook.com"],
    officialUrlFilters: [
      "cafe.naver.com/afkjourneykr",
      "afkjourney-kr.farlightgames.com",
      "facebook.com/AFKJourney.KR",
      "gall.dcinside.com/mgallery/board/lists/?id=newafk",
      "namu.wiki/w/AFK: 새로운 여정",
    ],
    dcGalleryId: "newafk",
  },
  "afk journey":   {
    officialDomains: ["farlightgames.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com", "facebook.com"],
    officialUrlFilters: [
      "cafe.naver.com/afkjourneykr",
      "afkjourney-kr.farlightgames.com",
      "facebook.com/AFKJourney.KR",
      "gall.dcinside.com/mgallery/board/lists/?id=newafk",
      "namu.wiki/w/AFK: 새로운 여정",
    ],
    dcGalleryId: "newafk",
  },
  "afk2":          {
    officialDomains: ["farlightgames.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com", "facebook.com"],
    officialUrlFilters: [
      "cafe.naver.com/afkjourneykr",
      "afkjourney-kr.farlightgames.com",
      "facebook.com/AFKJourney.KR",
      "gall.dcinside.com/mgallery/board/lists/?id=newafk",
      "namu.wiki/w/AFK: 새로운 여정",
    ],
    dcGalleryId: "newafk",
  },
  "서머너즈워":    {
    officialDomains: ["summonerswar.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "summonerswar.com/ko",
      "gall.dcinside.com/mgallery/board/lists/?id=smonwar",
      "namu.wiki/w/서머너즈 워: 천공의 아레나",
    ],
    dcGalleryId: "smonwar",
  },
  "니케":          {
    officialDomains: ["game.naver.com", "nikke-kr.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "game.naver.com/lounge/nikke",
      "nikke-kr.com",
      "twitter.com/NIKKE_kr",
      "nikke.inven.co.kr",
      "namu.wiki/w/승리의 여신: 니케",
      "arca.live/b/nikketgv",
    ],
    dcGalleryId: "gov",
  },
  "에픽세븐":      {
    officialDomains: ["onstove.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "page.onstove.com/epicseven/kr",
      "epic7.onstove.com",
      "youtube.com/@EpicSevenKR",
      "arca.live/b/epic7",
      "namu.wiki/w/에픽세븐",
    ],
    dcGalleryId: "epicseven",
  },
  "원신":          {
    officialDomains: ["cafe.naver.com", "genshin.hoyoverse.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "cafe.naver.com/genshin",
      "genshin.hoyoverse.com/ko",
      "genshin.inven.co.kr",
      "namu.wiki/w/원신",
      "genshin-impact.fandom.com",
    ],
    dcGalleryId: "onshinproject",
  },
  "붕괴 스타레일": {
    officialDomains: ["hsr.hoyoverse.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "hsr.hoyoverse.com/ko-kr",
      "cafe.naver.com/honkaistarrail",
      "m.inven.co.kr/board/starrail",
      "gall.dcinside.com/mgallery/board/lists/?id=staraiload",
      "namu.wiki/w/붕괴: 스타레일",
    ],
    dcGalleryId: "staraiload",
  },
  "스타레일":      {
    officialDomains: ["hsr.hoyoverse.com", "cafe.naver.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "hsr.hoyoverse.com/ko-kr",
      "cafe.naver.com/honkaistarrail",
      "m.inven.co.kr/board/starrail",
      "gall.dcinside.com/mgallery/board/lists/?id=staraiload",
      "namu.wiki/w/붕괴: 스타레일",
    ],
    dcGalleryId: "staraiload",
  },
  "아크나이츠":    {
    officialDomains: ["arknights.kr", "cafe.naver.com", "namu.wiki", "gall.dcinside.com", "arca.live"],
    officialUrlFilters: [
      "cafe.naver.com/arknightskor",
      "arknights.kr",
      "arca.live/b/arknights",
      "gall.dcinside.com/mgallery/board/lists/?id=mibj",
      "bbs.ruliweb.com/mobile/board/185062",
      "namu.wiki/w/명일방주",
    ],
    dcGalleryId: "mibj",
  },
  "명일방주":      {
    officialDomains: ["arknights.kr", "cafe.naver.com", "namu.wiki", "gall.dcinside.com", "arca.live"],
    officialUrlFilters: [
      "cafe.naver.com/arknightskor",
      "arknights.kr",
      "arca.live/b/arknights",
      "gall.dcinside.com/mgallery/board/lists/?id=mibj",
      "bbs.ruliweb.com/mobile/board/185062",
      "namu.wiki/w/명일방주",
    ],
    dcGalleryId: "mibj",
  },
  "fgo":           {
    officialDomains: ["cafe.naver.com", "netmarble.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "cafe.naver.com/fategokr",
      "fgo.netmarble.com",
      "x.com/fatego_kr",
      "namu.wiki/w/Fate/Grand Order",
      "gall.dcinside.com/mgallery/board/lists/?id=mfgo",
    ],
    dcGalleryId: "mfgo",
  },
  "페그오":        {
    officialDomains: ["cafe.naver.com", "netmarble.com", "namu.wiki", "gall.dcinside.com"],
    officialUrlFilters: [
      "cafe.naver.com/fategokr",
      "fgo.netmarble.com",
      "x.com/fatego_kr",
      "namu.wiki/w/Fate/Grand Order",
      "gall.dcinside.com/mgallery/board/lists/?id=mfgo",
    ],
    dcGalleryId: "mfgo",
  },
  "블루아카이브":  {
    officialDomains: ["bluearchive.nexon.com", "forum.nexon.com", "inven.co.kr", "namu.wiki", "gall.dcinside.com", "arca.live"],
    officialUrlFilters: [
      "forum.nexon.com/bluearchive",
      "bluearchive.nexon.com",
      "inven.co.kr/board/bluearchive/5808",
      "inven.co.kr/webzine/game/?game=9682",
      "namu.wiki/w/블루 아카이브",
      "namu.wiki/w/블루아카이브",
      "gall.dcinside.com/mgallery/board/lists/?id=projectmx",
      "arca.live/b/bluearchive",
      "bbs.ruliweb.com/game/85438",
    ],
    dcGalleryId: "projectmx",
  },
  "블아":          {
    officialDomains: ["bluearchive.nexon.com", "forum.nexon.com", "inven.co.kr", "namu.wiki", "gall.dcinside.com", "arca.live"],
    officialUrlFilters: [
      "forum.nexon.com/bluearchive",
      "bluearchive.nexon.com",
      "inven.co.kr/board/bluearchive/5808",
      "namu.wiki/w/블루 아카이브",
      "gall.dcinside.com/mgallery/board/lists/?id=projectmx",
      "arca.live/b/bluearchive",
    ],
    dcGalleryId: "projectmx",
  },
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

// 질문 + 맥락 카드에서 매칭되는 게임 찾기 (정적 매칭 — 라우터 보조용)
function findMatchingGame(userQuery: string, contextCard: string): { game: typeof GAME_COMMUNITIES[string]; gameKey: string } | null {
  const haystack = `${contextCard} ${userQuery}`.toLowerCase();
  const matched = Object.entries(GAME_COMMUNITIES)
    .filter(([key]) => haystack.includes(key.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length);
  if (matched.length === 0) return null;
  return { game: matched[0][1], gameKey: matched[0][0] };
}

// 사용자에게 보여줄 질문 유형 한국어 변환
function questionTypeToKorean(type: RouteDecision["question_type"]): string {
  switch (type) {
    case "factual": return "정보 조회";
    case "opinion": return "유저 반응·평가";
    case "comparison": return "비교 분석";
    case "design_consultation": return "기획 자문";
    case "mixed": return "사실 조회 + 유저 반응";
    default: return "일반 분석";
  }
}

// 도메인 출처 한국어 변환
function domainSourceToKorean(source: "manual" | "cache" | "auto" | "empty"): string {
  switch (source) {
    case "manual": return "검증된 출처";
    case "cache": return "기존 발견 결과";
    case "auto": return "신규 발견";
    case "empty": return "발견 실패";
  }
}

// 라우터가 반환한 game_id → GAME_COMMUNITIES의 수동 큐레이션 찾기
// REGISTERED_GAMES.names를 매개로 두 데이터 구조 연결
function getManualCurationByGameId(gameId: string): typeof GAME_COMMUNITIES[string] | null {
  const registered = REGISTERED_GAMES.find(g => g.id === gameId);
  if (!registered) return null;
  for (const name of registered.names) {
    const found = GAME_COMMUNITIES[name];
    if (found) return found;
  }
  return null;
}

// 게임 ID들 → 도메인 리스트 + Discovered 객체 리스트 확보
// 수동 큐레이션 > 캐시 > 자동 발견 순으로 처리
async function resolveDomainsForGames(
  gameIds: string[],
  onProgress?: (text: string) => void
): Promise<{ domains: string[]; discovered: DiscoveredDomain[]; sources: Record<string, string> }> {
  const allDomains = new Set<string>();
  const allDiscovered: DiscoveredDomain[] = [];
  const sources: Record<string, string> = {};

  for (const gameId of gameIds) {
    const registered = REGISTERED_GAMES.find(g => g.id === gameId);
    const gameNames = registered?.names ?? [gameId];
    const manualCuration = getManualCurationByGameId(gameId);

    const result = await ensureGameDomains(gameId, gameNames, {
      manualCuration: manualCuration ? {
        officialDomains: manualCuration.officialDomains,
        officialUrlFilters: manualCuration.officialUrlFilters,
        dcGalleryId: manualCuration.dcGalleryId,
      } : null,
    });

    sources[gameId] = result.source;
    const sourceLabel = domainSourceToKorean(result.source);
    onProgress?.(`   ✓ ${gameNames[0]}: ${sourceLabel} ${result.domains.length}개 사이트\n`);

    for (const d of result.domains) {
      allDiscovered.push(d);
      // URL의 도메인 부분만 추출
      const domainOnly = d.url.split("/")[0];
      if (domainOnly) allDomains.add(domainOnly);
    }
  }

  return {
    domains: Array.from(allDomains),
    discovered: allDiscovered,
    sources,
  };
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
): Promise<{ analysis: string; route: RouteDecision }> {

  // ── Step 1: 라우터로 질문 분류 (백그라운드, 사용자에게 노출 안 함) ──
  const typedRecent = recentMessages.map(m => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));
  const route = await classifyQuestion(userQuery, contextCard, typedRecent);

  // 사용자 친화적 표시 — 게임명, 작업 유형만
  const gameDisplayName = route.target_games.length > 0
    ? route.target_games
        .map(gid => REGISTERED_GAMES.find(g => g.id === gid)?.names[0] ?? gid)
        .join(", ")
    : "일반 질문";
  const typeKorean = questionTypeToKorean(route.question_type);

  onProgress?.(`\n**📌 분석 대상**: ${gameDisplayName}\n`);
  onProgress?.(`**📋 작업 유형**: ${typeKorean}\n`);

  // 조던 자문만 + 웹 검색 불필요 → 검색 skip
  if (!route.needs_web_search) {
    onProgress?.(`\n💭 조던의 경험과 기획 철학으로 직접 답변할게요.\n\n`);
    return { analysis: "[검색 데이터 없음 — 조던 자문 영역]", route };
  }

  // ── Step 2: 도메인 확보 (target_games 있으면 수동/캐시/자동 발견) ──
  let gameDomains: string[] = [];
  if (route.target_games.length > 0) {
    onProgress?.(`\n📚 **신뢰 출처 확인 중**...\n`);
    const resolved = await resolveDomainsForGames(route.target_games, onProgress);
    gameDomains = resolved.domains;
  }

  // 한국 게임 일반 신뢰 도메인 + 게임별 발견 도메인 통합
  const allowedDomains = Array.from(new Set([
    ...gameDomains,
    ...KOREAN_GAME_TRUSTED_DOMAINS,
  ].filter(d => d && d.length > 0)));

  if (gameDomains.length > 0) {
    onProgress?.(`\n🌐 **웹 검색 시작** — 게임 전용 ${gameDomains.length}개 + 한국 게임 신뢰 ${KOREAN_GAME_TRUSTED_DOMAINS.length}개 사이트 대상\n\n`);
  } else {
    onProgress?.(`\n🌐 **웹 검색 시작** — 한국 게임 신뢰 ${KOREAN_GAME_TRUSTED_DOMAINS.length}개 사이트 대상\n\n`);
  }

  // 맥락 섹션 구성
  const contextSection = contextCard ? `\n\n[대화 맥락 카드]\n${contextCard}` : "";
  const recentSection = recentMessages.length > 0
    ? `\n\n[직전 교환 — 최근 6개 메시지]\n${recentMessages.slice(-6).map(m =>
        `${m.role === "user" ? "질문" : "조던"}: ${m.content.slice(0, 300)}`
      ).join("\n\n")}`
    : "";

  const systemPrompt = `당신은 영웅수집형 게임 정보 수집·분석 전문 에이전트예요.
사용자의 질문에 대해 web_search 도구로 실시간 한국 웹 검색을 수행하고, 수집된 정보를 정리하세요.

[검색 원칙]
- 게임명이 명시되면 그 게임만 검색 (다른 게임으로 절대 바꾸지 말 것)
- "세븐나이츠 리버스" → "세븐나이츠"로 축약 금지
- 비교 분석이 명시적으로 필요한 경우만 여러 검색

[검색 전략 — 질문 유형별 필수 검색 횟수]
- 단순 사실 질문 (패치·날짜·영웅): 2~3회 검색 (공식·언론 중심)
- 사실 + 유저 반응 복합 질문: **반드시 6~7회 검색**
  - 사실 정보 3~4회 (공식·언론·뉴스)
  - 유저 반응 2~3회 — **반드시 site:gall.dcinside.com 키워드로 디시인사이드 별도 검색 수행**
  - 디시 + 카페 + 인벤 댓글 등 다양한 커뮤니티 소스 확보
- 트렌드·메타 분석: 5~6회 (다양한 출처 종합)

[유저 반응 검색 — 매우 중요]
사용자 질문에 "유저 반응", "평가", "체감", "반응", "후기", "여론", "비평" 등이 포함되면:
1. 공식 정보 검색 후
2. **반드시 디시인사이드 마이너갤을 별도 검색 쿼리로 검색** (예: "세나리 칼헤론 디시", "세나리 1주년 마이너갤 반응")
3. 디시 검색이 실패해도 인벤 게시판·네이버 카페 글에서 유저 의견 수집
4. 절대 "디시 반응 데이터 없음"으로 결론짓지 말고, 최소 2회 이상 다른 쿼리로 재시도

[소스 신뢰도]
1순위 (사실): 공식 사이트·게임 저널리즘 (인벤·게임메카·디스이즈게임)
2순위 (사실): 네이버 카페·뉴스
3순위 (유저 반응 전용): 디시인사이드 마이너갤 — 유저 반응 묻는 질문에서는 사실상 1순위
4순위: 나무위키 (최후 수단)

[충돌 시]
- 공식과 커뮤니티 정보 다르면 → 공식 신뢰
- 사실(날짜·이름·수치)은 공식에서, 유저 반응은 커뮤니티에서
- 확인 안 되는 정보는 반드시 "확인 안 됨" 섹션에 명시

[정확성 절대 원칙 — 매우 중요]
- 검색 결과의 게시 날짜를 반드시 확인
- 여러 게시글의 날짜·캐릭터명을 절대 혼재하지 말 것
- 출처별로 정보 분리해서 정리할 것
- **검색 결과에 없는 정보는 절대 추측하지 말 것** — 알 수 없으면 "[검색 결과 없음]"으로 명시
- 부분적으로만 아는 사실은 아는 부분만 기술하고 나머지는 "확인 안 됨"

[출력 형식 — 다음 단계(Jordan 답변)에서 사용되는 정확한 형식이므로 반드시 따를 것]

## [수집된 사실 정보]
각 사실을 다음 형식으로 정리:

- **{사실 내용 한 줄}**
  • 출처 등급: 공식 / 언론 / 위키 / 커뮤니티 중 최고 등급
  • 일치 출처: N개 (구체적 출처명 — 예: 인벤 5/14, 카페배돈 5/15, 게임메카 5/14)
  • 신뢰도: 높음(3개 이상 일치) / 보통(2개 일치) / 낮음(1개 출처만)

예시:
- **5월 14일 1주년 업데이트로 칼 헤론(전설 등급, 나이트크로우 소속) 추가**
  • 출처 등급: 언론
  • 일치 출처: 4개 (인벤 5/14, 카페배돈 5/15, 게임메카 5/14, 디시 5/14)
  • 신뢰도: 높음

## [유저 반응·평가]
각 반응을 다음 형식으로 정리:

- **{반응 내용}**
  • 출처: 디시 N건 / 카페 N건 / 인벤 댓글 N건
  • 의견 비중: 다수(과반) / 절반 / 일부(소수)

예시:
- **칼 헤론 성능 평가: 긍정적**
  • 출처: 디시 8건 / 카페배돈 3건
  • 의견 비중: 다수

## [검색 결과 없음 — 미확인 부분]
질문에서 다뤄졌지만 검색 결과에 명확한 답이 없는 부분 (있을 경우만):

- {확인되지 않은 정보 내용}
  • 사유: 검색 결과에 해당 정보 없음 / 출처들 사이 의견 충돌 / 등

추측은 절대 하지 말고, 모르면 모른다고 솔직히 표시할 것.

다음 단계(조던 답변 생성)에서 이 구조화된 정리본을 그대로 활용하므로 깔끔하게 정리할 것.`;

  const userContent = `${contextSection}${recentSection}

[현재 질문]
${userQuery}`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 6000,  // 검색 7회 + 정리 텍스트 여유분 확보
      // Prompt Caching 적용 — 시스템 프롬프트가 ~2,500토큰으로 큰 편이라 캐시 효과 큼
      // 첫 호출은 25% 비싸지만, 5분 내 후속 호출은 90% 할인
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          // 단순 질문은 2~3회, 사실+반응 복합 질문은 6~7회 사용
          // 한도 부족 시 디시 검색이 잘리는 문제를 해결하기 위해 7로 상향
          max_uses: 7,
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

    // 진행상황 출력 — 사용자 친화적 형식
    if (searchCount > 0) {
      onProgress?.(`✅ **검색 완료** — ${searchCount}회 검색, 출처 ${citations.length}개 수집\n\n`);

      if (citations.length > 0) {
        onProgress?.(`**📑 참고한 출처** (상위 ${Math.min(5, citations.length)}개)\n\n`);
        const topCitations = citations.slice(0, 5);
        for (const c of topCitations) {
          onProgress?.(`• ${c.title.slice(0, 70)}\n`);
        }
        onProgress?.(`\n`);
      }
    }

    // 텍스트 응답 추출
    const textContent = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("");

    return { analysis: textContent || "검색 완료 (분석 텍스트 없음)", route };
  } catch (err) {
    console.error("[analyzeWithWebSearch] 오류:", err);
    onProgress?.(`  ❌ 웹 검색 실패: ${String(err).slice(0, 100)}\n`);
    return { analysis: `웹 검색 중 오류 발생: ${String(err)}`, route };
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

  // ② 직전 메시지 6개 (대화 흐름 유지)
  const recentSection = recentMessages.length > 0
    ? `\n[직전 교환 — 최근 6개]\n${recentMessages.slice(-6).map(m =>
        `${m.role === "user" ? "질문" : "조던"}: ${m.content.slice(0, 300)}`
      ).join("\n\n")}\n`
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
  priorMessages: { role: string; content: string }[],  // 현재 질문 제외 이전 대화 전체
  onChunk: (text: string) => void,
  detailed = false,
  showCitations = false,  // 인라인 신뢰도 라벨 노출 여부 (기본 OFF)
  contextAnchorTime: string | null = null,  // 결정사항 cutoff (이후 created_at만 컨텍스트로)
  sessionId: string | null = null,  // 피드백 컨텍스트 조회용 (👍/👎 누적 반영)
  imageId: string | null = null,  // 첨부 이미지 id (doc_images) — 조던이 보고 답변
  referenceDocIds: string[] = []  // 참고 기획서 id 목록 — 답변 시 교차 참고·충돌 점검
): Promise<string> {

  // ── 검색 + 분석 (라우터 → 도메인 발견 → Claude 웹 검색 통합 흐름)
  onChunk(`\n🔍 **분석 시작**\n`);
  // onChunk를 onProgress로 전달 → 진행상황이 스트림에 실시간 노출됨
  const { analysis: analysisResult, route } = await analyzeWithWebSearch(userQuery, contextCard, priorMessages, onChunk);
  onChunk(`\n---\n\n`);

  // ── 누적 결정사항 컨텍스트 조회 (대화 일관성 유지)
  // anchor 설정돼 있으면 그 시점 이후 결정만 컨텍스트로 포함
  const decisionContext = await buildDecisionContext(undefined, 200, contextAnchorTime);

  // ── 사용자 피드백 누적 컨텍스트 (👍/👎 학습)
  const feedbackContext = await buildFeedbackContext(sessionId, 20);

  // ── 웹툰 IP 컨텍스트 (사용자 질문에 언급된 웹툰 있으면 정보 자동 주입)
  const webtoonContext = await buildWebtoonContext(userQuery);

  // ── 네이버 라운지 공식 데이터 (SPA라 웹 검색이 못 잡는 1순위 신뢰 출처)
  // 등록된 게임이 타겟이면 Jina Reader로 라운지 공지·홈 가져옴
  let loungeContext = "";
  if (route.target_games.length > 0) {
    try {
      onChunk(`\n📢 **공식 네이버 라운지 확인 중**... (${route.target_games.join(", ")})\n`);
      const all = await Promise.all(route.target_games.map(gid => fetchLoungeAll(gid)));
      const flat = all.flat();
      if (flat.length > 0) {
        loungeContext = buildLoungeContext(flat);
        onChunk(`✅ 라운지 ${flat.length}개 페이지 확보 (공지·홈)\n`);
      } else {
        onChunk(`⚠️ 라운지 데이터 없음 (해당 게임 라운지 미등록 또는 일시적 접근 실패)\n`);
      }
    } catch (err) {
      console.error("[agent] 네이버 라운지 fetch 실패:", err);
    }
  }

  // ── 조던 말투로 최종 답변 생성
  onChunk(`__JORDAN_ANSWER_START__`);

  // 라우터 결정 정보를 Jordan 답변에 활용 가능하게 포함
  const routeContext = `[라우터 분석]
- 대상 게임: ${route.target_games.length > 0 ? route.target_games.join(", ") : "없음 (일반 질문)"}
- 질문 유형: ${route.question_type}
- 웹 검색 사용: ${route.needs_web_search}
- 조던 자문 영역: ${route.needs_jordan_consulting}
- 신뢰도: ${route.confidence}`;

  // ── 참고 기획서 — 사용자가 선택한 기존 기획서 본문을 컨텍스트로 주입 (교차 참고·충돌 감지) ──
  let referenceSection = "";
  if (referenceDocIds.length > 0) {
    try {
      const { data: refDocs } = await supabase
        .from("design_docs")
        .select("title, content_markdown")
        .in("id", referenceDocIds);
      if (refDocs && refDocs.length > 0) {
        const PER = 6000;  // 기획서당 길이 상한 (토큰 폭주 방지)
        const blocks = refDocs.map((d, i) => {
          const full = d.content_markdown || "";
          const body = full.slice(0, PER) + (full.length > PER ? "\n…(이하 생략)" : "");
          return `[참고 기획서 ${i + 1}: ${d.title}]\n${body}`;
        });
        referenceSection = `\n\n[참고 기획서 — 사용자가 선택한 기존 기획서. 교차 참고·충돌 점검 대상]\n${blocks.join("\n\n---\n\n")}`;
        onChunk(`📑 참고 기획서 ${refDocs.length}개를 함께 검토합니다.\n`);
      }
    } catch (err) {
      console.error("[agent] 참고 기획서 로드 실패:", err);
    }
  }

  // 누적 결정사항 + 피드백 + 참고 기획서 + 라우터 분석 + 라운지 + 검색 데이터를 함께 전달
  // 라운지는 1순위 신뢰 출처이므로 검색 데이터보다 앞에 배치
  const decisionSection = decisionContext ? `\n\n${decisionContext}` : "";
  const feedbackSection = feedbackContext ? `\n\n${feedbackContext}` : "";
  const loungeSection = loungeContext ? `\n\n${loungeContext}` : "";
  const webtoonSection = webtoonContext ? `\n\n${webtoonContext}` : "";
  const combinedContext = `${routeContext}${decisionSection}${feedbackSection}${referenceSection}${webtoonSection}${loungeSection}\n\n[실시간 검색 데이터]\n${analysisResult}`;

  // 현재 날짜 — 학습 데이터 시점과 혼동 방지 위해 명시 주입
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayWeekday = ["일","월","화","수","목","금","토"][today.getDay()];

  // 공통 시스템 프롬프트 앞부분 (검색 결과 활용 지시 포함)
  const baseSystemPrompt = `당신의 이름은 조던(Jordan)이에요. 영웅수집형 모바일 게임 기획 전문가 AI예요.
10년 이상 현장에서 게임을 만들어온 베테랑 디렉터의 시선으로 답변해요.
직설적이고 실무 중심으로, "이 구조는 이래서 망합니다"처럼 솔직하게 말해줘요.

[★ 참고 기획서 — 교차 참고·충돌 점검 ★]
사용자 메시지에 "[참고 기획서]" 섹션이 포함될 수 있어요. 이는 사용자가 답변 시 참고하라고 직접 선택한 기존 기획서예요.
- 답변할 때 이 기획서들의 내용을 적극 참고하세요 (다른 기획과의 연계·일관성).
- **현재 대화/결정이 참고 기획서와 충돌하면 반드시 짚어주세요.** (예: "○○ 기획서에선 5등급인데 지금은 7등급이라 충돌해요 — 어느 쪽으로 통일할까요?")
- 충돌·중복·빈틈을 발견하면 개선 방향을 제안하세요.
- 참고 기획서에 없는 내용을 그 기획서 것으로 단정하지 마세요.

[★ 대화 맥락 — 매우 중요 ★]
앞에 오는 메시지들은 사용자와 지금까지 나눈 실제 대화예요.
- 이전 메시지에서 이미 묻고 답한 내용을 다시 묻거나 똑같이 반복 설명하지 마세요.
- 사용자가 앞서 말한 정보(게임명·결정·선호·맥락)를 반드시 기억하고 이어서 답하세요.
- "아까 말씀하신 ~를 고려하면…"처럼 이전 대화를 자연스럽게 연결하세요.
- 후속 질문을 받으면 처음부터 다시 설명하지 말고, 직전 답변에 이어서 보충하세요.

[★ 오늘 날짜 — 절대 다른 시점으로 착각 금지 ★]
오늘은 **${todayStr} (${todayWeekday}요일)** 이에요.
"오늘", "내일", "어제", "이번 주" 같은 시간 표현은 반드시 이 날짜를 기준으로 해석하세요.
학습 데이터에 있는 과거 사건을 "내일 일정"으로 둔갑시키지 마세요.

[★ 매우 중요 — 누적 결정사항 일관성]
사용자 메시지에 "[지금까지 누적된 기획 결정사항]" 섹션이 포함될 수 있어요.
이는 사용자가 본 프로젝트에서 이미 결정·검토한 사항들이에요.
- 이전 결정과 모순되는 답변을 하지 말 것 (예: "5등급 체계"로 결정됐는데 3등급 추천 X)
- 이전 결정을 참조해 일관된 답변할 것 (예: "앞서 결정한 가챠 천장 90회를 고려하면...")
- 이전 결정에 변경 의향이 있다면 사용자가 명시적으로 표명한 경우만 — 그 외에는 기존 결정 존중
- 결정사항에 없는 영역은 자유롭게 자문 가능

[★ 웹툰 IP 게임화 — 본 프로젝트 핵심 분야 ★]
사용자 메시지에 "[등록된 웹툰 IP 라이브러리]" 또는 "[사용자 질문에서 언급된 웹툰 IP]" 섹션이 포함될 수 있어요.
본 프로젝트는 웹툰 IP를 기반으로 영웅수집형 게임을 만드는 게 목적입니다. 다음 원칙으로 활용:
- 사용자가 등록된 웹툰을 언급하면 → 해당 IP의 세계관·캐릭터·시스템을 게임 메카닉과 매핑해서 자문
- "게임화 적합성" 평가와 "참고 포인트"를 적극 활용해 구체적 제안
- 등록 안 된 웹툰을 물어보면 → 등록 라이브러리 목록 안내 + 등록 권장
- 웹툰 캐릭터·설정을 추측하지 말 것 (등록 정보에 없으면 "이 부분은 추가 확인 필요" 명시)

[★ 매우 중요 — 사용자 피드백 반영]
사용자 메시지에 "[사용자 피드백 누적]" 섹션이 포함될 수 있어요. 이건 이전 답변들에 대한 👍/👎 평가예요.
- ❌ 부정확 표시 + 사유가 있는 항목: 그 사유로 지적된 패턴(틀린 사실·잘못된 인용·부적절한 톤 등)을 절대 반복하지 마세요. 같은 유형 질문은 더 신중하게.
- ✅ 정확 평가가 누적된 답변 스타일·접근은 그대로 유지하세요.
- 피드백이 현재 질문과 직접 관련 없어도, 사용자의 선호 패턴을 학습한 신호로 활용하세요.

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

[정확성 절대 원칙 — 가장 중요한 규칙]
1. **검색 데이터의 "[수집된 사실 정보]" 섹션에 없는 사실은 절대 추측하지 말 것**
2. **"[검색 결과 없음]" 섹션에 해당 정보가 있으면** → 답변에서도 "확인되지 않았어요"로 솔직히 표시
3. 부분만 아는 사실은 → 아는 부분만 답하고 나머지는 "이 부분은 확인 안 됨" 명시
4. 추측·일반론으로 메우지 말 것. 모르면 모른다고 할 것.

[★★★ 존재·시스템 단정 금지 — 가장 흔한 거짓 유형 ★★★]
날짜·수치만큼(혹은 그 이상) 자주 새는 거짓이 "특정 게임에 어떤 시스템·기능·재화·용어가 존재한다"는 단정이에요.
검색은 '없음'을 증명하지 못해요 — **못 찾은 것 ≠ 없는 것 ≠ 지어내도 되는 것.** 다음을 반드시 지키세요.
1. 특정 게임에 어떤 시스템·기능·재화·용어가 "있다"고 단정하기 전에, 그게 [실시간 검색 데이터]에 실제로 등장하는지 확인하세요.
2. 검색 데이터에 없고 당신의 학습 기억에만 의존한다면 → "제 기억으로는 ~인데, ○○에 실제로 그 시스템이 있는지는 확실치 않아요"처럼 불확실성을 반드시 명시하세요.
3. **없는 시스템·용어를 그럴듯하게 지어내지 마세요. 다른 게임의 시스템과 헷갈리지 마세요.** (예: 세븐나이츠에 '초월강화'가 있다고 단정 X — 확실치 않으면 솔직히 "확인 필요".)
4. 사용자가 특정 시스템을 전제로 물어도, 그 시스템의 존재가 불확실하면 먼저 "그 시스템이 실제로 있는지부터 확인이 필요해요"라고 짚으세요. **잘못된 전제 위에 답을 쌓지 마세요.**

[★ 당신의 진짜 가치 — 사실 암기가 아니라 기획 판단 ★]
- 당신의 핵심 역량은 게임 사실을 외우는 게 아니라 기획을 꿰뚫어 보는 판단이에요.
- 사실이 불확실하면 솔직히 "모른다/확인 필요"라고 말하고, 대신 "만약 그런 시스템이 있다면 …, 없다면 …"처럼 조건부로 자문하세요.
- **틀린 사실을 자신 있게 말하는 것이 가장 큰 신뢰 손상이에요. 모른다고 말하는 건 약점이 아니라 신뢰의 근거예요.**

[★★★ 거짓 인용 절대 금지 — 신뢰의 핵심 ★★★]
1. **검색 결과에 없는 정보에 출처를 붙이지 마라.** "참고 출처: 인벤, 나무위키" 같은 표기는 **실제로 그 출처에서 가져온 정보일 때만** 사용한다.
2. **학습 데이터 속 옛 정보를 검색 결과인 것처럼 답변하지 마라.**
   - 예: 작년 패치 정보를 "내일 업데이트 예정"이라고 둔갑 → 절대 금지
   - 학습 데이터를 사용해야 한다면 "제가 알기로는…(검색으로 재확인 권장)"이라고 명시
3. **시점이 모호한 정보는 반드시 날짜를 확인.** 검색 데이터에 명시된 시점만 사실로 인정. 추측 X.
4. **검색 결과 0건일 때 첫 답변부터 솔직히:**
   - "오늘 정보는 아직 검색에 잡히지 않았어요" / "확인된 건 N월 N일 X 정도예요"
   - 사용자가 재질문 후에야 사과하는 패턴 금지 — 처음부터 정직하게.

[★ 시간 관련 절대 규칙 — 매우 중요 ★]
1. **"오늘/내일/어제" 같은 시간어는 시스템에서 주어진 현재 날짜를 기준으로만 해석.**
2. 학습 데이터의 시점을 기준으로 "내일은~" 같은 말 절대 금지.
3. 모든 패치·이벤트·업데이트 정보는 검색 데이터에 명시된 날짜와 함께 답할 것.
4. 검색 데이터에 날짜가 없으면 "시점이 확인되지 않은 정보"라고 표시.

[★ 답변 출력 직전 자가 검증 체크리스트 — 반드시 점검 후 출력 ★]
답변을 출력하기 전에 마음속으로 다음 5가지를 점검하세요. 위반하면 해당 부분 수정 후 출력:

1. **출처 검증**: 답변에 언급한 모든 사이트·매체("인벤", "라운지", "디시" 등)가 실제로 위의 검색 데이터·라운지 데이터에 등장하는가?
   - 등장 안 하면 → 그 인용 삭제 또는 "검색에서 확인 안 됨" 표시
2. **날짜 검증**: 답변의 모든 날짜(2026년 5월 28일 등)가 검색 데이터·라운지 데이터와 일치하는가?
   - 학습 데이터에서 가져온 추측은 → "확인 필요"로 명시
3. **시간어 검증**: "오늘/내일/이번 주" 같은 표현이 위에 명시된 오늘 날짜 기준으로 해석됐는가?
4. **수치 검증**: 확률·수치·등급(SSR 1.5%, 한계돌파 12단계 등)이 검색 데이터에 실제로 있는가, 추측인가?
   - 추측이면 → "정확한 값은 추가 확인 필요" 표시
5. **검색 0건 처리**: 검색 데이터·라운지 데이터가 비어 있거나 관련 정보 0건이면 → "이번 질문에 대한 정보는 검색에 잡히지 않았어요"를 답변 첫 문장에 명시. 추측으로 메우지 말 것.
6. **존재 검증**: 특정 게임의 시스템·기능·재화·용어를 "있다"고 단정했는가? 그게 검색 데이터에 실제로 등장하는가, 아니면 내 기억인가?
   - 검색에 없으면 → "확실치 않음/확인 필요"로 표시하거나, 존재 자체가 의심되면 솔직히 "그 시스템이 실제 있는지 확인이 필요해요"라고 말할 것. 지어내지 말 것.

위반이 발견되면 그 부분만 수정해서 출력. 6가지 모두 통과해야 정상 출력.

[★ 후속 질문 — 바이블 채우기 자동 유도 ★]
답변 본문 끝에, 자연스럽게 다음 결정을 유도하는 후속 질문을 1~2개 추가하세요.

원칙:
- 본문 주제와 직접 연결된 질문일 것 (뜬금없는 영역 X)
- 기획 바이블에 아직 결정 안 된 영역 중에서 우선 선택
- 누적 결정사항과 모순되지 않게
- 선택지를 같이 제공해서 답변 부담 ↓ (예: "A안 / B안 / 직접 의견")
- 너무 많지 않게 (1~2개만)
- 마지막 줄 별도 헤더로 분리: "**💡 다음에 결정해볼 만한 것:**"

예시 형식:
"
... (본문 답변)

**💡 다음에 결정해볼 만한 것:**
- 영웅 등급은 몇 단계로 가실 건가요? (5단계 표준 / 7단계 세분화 / 무한 진화)
- 한계돌파는 어떤 재화로 진행할 계획인가요? (전용 재료 / 동일 영웅 흡수)
"

단, 다음 경우엔 후속 질문 생략:
- 사용자가 단순 정보 조회만 한 경우 (예: "최근 업데이트 요약")
- 검색 결과 0건이라 답변 자체가 짧은 경우
- 본문이 200자 이내로 너무 짧을 때

${showCitations ? `[인라인 신뢰도 라벨링 — 매 사실마다 출처 표시]
검색 데이터에서 각 사실의 "출처 등급"과 "일치 출처 수"를 보고, 답변에 다음 형식으로 인용 라벨을 붙여요:

- **공식 출처 사실**: \`[공식 인용]\` (게임 라운지·공식 홈페이지)
- **언론 출처 사실**: \`[언론 인용 — N개 일치]\` (인벤·게임메카·디스이즈게임 등, 일치 출처 수 명시)
- **위키 출처 사실**: \`[위키 인용]\` (나무위키)
- **유저 반응 다수**: \`[유저 의견 다수 — 디시 N건]\`
- **유저 반응 일부**: \`[유저 의견 일부 — 디시 N건]\`
- **단일 출처 미확정**: \`[1개 출처만 — 추가 확인 권장]\`
- **검색 결과에 없음**: \`[확인 안 됨]\` (또는 ⚠️ 이모지 함께)

예시:
"5월 14일 1주년 업데이트로 칼 헤론이 추가됐어요 [언론 인용 — 4개 일치].
전설 등급의 공격형 영웅이고요 [언론 인용 — 3개 일치].
유저들 평가는 긍정적이에요 [유저 의견 다수 — 디시 8건·카페 3건].
다만 메타 의존적이라는 우려도 있어요 [유저 의견 일부 — 디시 2건]."

[답변 마무리 — 종합 신뢰도 푸터]
500자 이상 답변(자세한 답변)의 경우, 답변 끝에 다음 형식으로 푸터 추가:

━━━━━━━━━━━━━━━━━━━━━━
📊 **종합 신뢰도**: 사실 N건 (다중 출처 일치 N건 / 단일 출처 N건 / 미확인 N건)
📚 **참고 출처**: {주요 출처명 나열}

500자 이내 일반 답변은 푸터 생략 (대신 인라인 라벨은 유지).` : `[가독성 우선 모드 — 인라인 라벨 사용 안 함]
검색 데이터의 사실은 정확히 활용하되, 답변 본문에 [공식 인용] 같은 인라인 라벨은 절대 붙이지 마세요.
자연스러운 한국어 문장으로 작성해요. 출처가 궁금하면 사용자가 토글로 라벨 모드를 켤 수 있어요.

다만 정확성 원칙은 그대로 적용:
- 단일 출처만 있는 정보는 본문에 "한 곳에서만 확인된 정보인데요" 같이 자연스럽게 언급
- 미확인 정보는 "이 부분은 확인되지 않았어요" 식으로 솔직히 표시
- 답변 끝에 "참고 출처: 인벤, 게임메카, 디시 마이너갤 등" 한 줄만 간결하게 명시 (자세한 답변일 때만)

예시:
"5월 14일 1주년 업데이트로 칼 헤론이 추가됐어요. 전설 등급의 공격형 영웅이고요.
유저들 평가는 긍정적인 편이에요. 다만 메타 의존적이라는 우려도 일부 있어요.

(자세한 답변 끝부분) 참고 출처: 인벤, 게임메카, 디시 마이너갤"`}

말투:
- "~이에요", "~거든요", "~죠" 같은 친근한 말투를 사용해요
- 핵심 단어는 **굵게** 강조해요
- 의견 영역(조던 자문)에서는 "제 견해로는" 이라고 명시해요`;

  // ── 이전 대화를 "실제 대화 턴"으로 최종 답변 모델에 전달 ──
  // (기존 버그: 최종 답변 Opus에 history가 0개 들어가 → "위에서 한 얘기를 또 묻는" 맥락 누락 현상)
  // 최근 16개 메시지(=8교환)를 넘기되, 최근 4개는 원문 유지·나머지는 길이 상한(2000자)으로 토큰 폭주 방지
  const HISTORY_WINDOW = 16;
  const RECENT_FULL = 4;
  const OLDER_CAP = 2000;
  const slicedHistory = priorMessages.slice(-HISTORY_WINDOW);
  const historyTurns: Anthropic.MessageParam[] = slicedHistory.map((m, i) => {
    const keepFull = i >= slicedHistory.length - RECENT_FULL;
    const text = (!keepFull && m.content.length > OLDER_CAP)
      ? m.content.slice(0, OLDER_CAP) + " …(이전 답변 일부 생략)"
      : m.content;
    return {
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: text,
    };
  });
  // Anthropic API 규칙: 첫 메시지는 user여야 함 — 잘린 경계가 assistant로 시작하면 제거
  if (historyTurns.length > 0 && historyTurns[0].role === "assistant") historyTurns.shift();

  // ── 첨부 이미지 로드 (있으면) — 조던(Opus)이 그림을 직접 보고 답변 ──
  // Opus 4.7은 vision 지원. doc_images에서 base64를 읽어 image 블록으로 전달.
  let imageBlock: Anthropic.ImageBlockParam | null = null;
  if (imageId) {
    try {
      const { data: imgRow } = await supabase
        .from("doc_images")
        .select("mime, data")
        .eq("id", imageId)
        .maybeSingle();
      if (imgRow?.data) {
        const mt = (imgRow.mime || "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
        imageBlock = {
          type: "image",
          source: { type: "base64", media_type: mt, data: imgRow.data },
        };
        onChunk(`🖼️ 첨부 이미지를 분석에 포함합니다.\n`);
      }
    } catch (err) {
      console.error("[agent] 첨부 이미지 로드 실패:", err);
    }
  }

  // 최종 user 메시지 content — 이미지가 있으면 [이미지, 텍스트] 블록 배열로 구성
  const finalUserText = `사용자 질문: ${userQuery}\n\n다음 실시간 검색 데이터를 바탕으로 위 질문에 조던의 말투로 답변해줘:\n\n${combinedContext}`;
  const finalUserContent: Anthropic.ContentBlockParam[] = imageBlock
    ? [imageBlock, { type: "text", text: `사용자가 이미지를 첨부했어요. 이미지를 보고 분석·평가해서 답변하세요.\n\n${finalUserText}` }]
    : [{ type: "text", text: finalUserText }];

  const finalStream = client.messages.stream({
    model: MODEL.FINAL_ANSWER,  // Opus 4.7 — 사용자 직접 노출, 최고 품질
    max_tokens: detailed ? 16000 : 1500,  // 일반 500→1500, 자세한 8192→16000 (긴 답변 지원)
    // Prompt Caching 적용 — baseSystemPrompt(~3,500토큰)가 매 호출 동일하므로 캐시 효과 가장 큼
    // detailed/일반 답변 분기 + showCitations 조합으로 최대 4가지 캐시 버전 생성 (각각 5분 TTL)
    system: [
      {
        type: "text",
        text: detailed
          ? `${baseSystemPrompt}

[절대 규칙 — 자세한 답변]
- 답변은 반드시 **완결된 문장**으로 끝나야 해요. 절대로 단어·문장 중간에서 잘리면 안 돼요.
- 헤더(#), 목록(-, •), 표 등 구조가 도움되면 자유롭게 사용해요.
- 분량 가이드:
  • 가볍게 답할 수 있는 질문: 1500자 내외
  • 보통 복잡도: 3000자 내외
  • 깊이 있는 분석·기획 자문: 5000~8000자 — 자유롭게 길게 써도 됨
- **본문이 4000자 초과로 갈 것 같으면** 다음 구조로 작성:
  1) 먼저 **3000자 이내 핵심 요약** (사용자가 한눈에 보는 부분 — 반드시 완결)
  2) 다음 줄에 \`__NEEDS_FULL__\` 단독 작성
  3) 그 아래 **전체 상세 답변** (15000자 이내, 마크다운 구조·표·코드블록 자유 — 완결 보장)
- 4000자 이내면 \`__NEEDS_FULL__\` 없이 그냥 작성.
- 사용자가 "더 자세히", "전체 설명", "심층 분석" 같은 요청을 했다면 **무조건 __NEEDS_FULL__ 트리거**.`
          : `${baseSystemPrompt}

[절대 규칙 — 일반 답변]
- 답변은 반드시 **완결된 문장**으로 끝나야 해요. 절대 중간에서 잘리지 말 것.
- 분량: 보통 800자 내외, 복잡한 질문이면 1200자까지 OK. 1500자는 절대 넘지 말 것.
- 가벼운 질문엔 짧게 (3~4문장), 깊이 있는 질문엔 충분히 (1000자 내외).
- 마크다운 구조(헤더·목록·표)는 **꼭 필요할 때만** 사용. 대화 흐름에는 문장체 우선.
- 만약 1500자로 충분히 답변할 수 없다고 판단되면, 답변 마지막에 자연스럽게 "더 자세한 내용은 [▼ 자세한 답변 보기]에서 보여드릴게요" 같이 안내.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      ...historyTurns,  // 이전 대화 맥락 — 위에서 한 얘기를 기억하고 이어서 답함
      {
        role: "user",
        content: finalUserContent,  // 텍스트 (+ 첨부 이미지 있으면 image 블록 포함)
      },
    ],
  });

  // 토큰 단위 스트리밍 — 생성되는 대로 즉시 클라이언트로 흘려보냄 (체감 대기 대폭 감소, 모델·품질 동일)
  // 클라이언트는 __JORDAN_ANSWER_START__ 이후 텍스트를 실시간 표시하도록 이미 구현돼 있음
  let finalText = "";
  for await (const chunk of finalStream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      finalText += chunk.delta.text;
      onChunk(chunk.delta.text);
    } else if (chunk.type === "message_delta") {
      const d = chunk.delta as { stop_reason?: string };
      if (d.stop_reason === "max_tokens") onChunk("__TRUNCATED__");
    }
  }

  return finalText;
}

// ── POST 핸들러 ──
type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages, session_id, pair_id, detailed, agentContext, show_citations, context_anchor_time, conversation_id, image_id, reference_doc_ids } = (await request.json()) as {
      messages: Message[];
      session_id?: string;
      pair_id?: string;
      detailed?: boolean;
      agentContext?: string;  // 롤링 맥락 카드 (클라이언트에서 관리)
      show_citations?: boolean;  // 인라인 신뢰도 라벨 노출 여부 (UI 토글)
      context_anchor_time?: string | null;  // 결정사항 cutoff timestamp (맥락 시작점)
      conversation_id?: string | null;  // 대화방 id (병렬 작업)
      image_id?: string | null;  // 첨부 이미지 id (doc_images) — 조던이 보고 답변
      reference_doc_ids?: string[];  // 참고 기획서 id 목록 — 답변 시 교차 참고·충돌 점검
    };

    const userMessage = messages[messages.length - 1];
    // 현재 질문을 제외한 이전 대화 전체를 파이프라인에 전달.
    // (윈도·길이 제한은 runMultiAgentPipeline 내부에서 처리 — 최종 답변엔 최근 16개를 실제 대화 턴으로 주입)
    const priorMessages = messages.slice(0, -1);

    const readable = new ReadableStream({
      async start(controller) {
        const encode = (text: string) =>
          controller.enqueue(new TextEncoder().encode(text));
        try {
          const assistantText = await runMultiAgentPipeline(
            userMessage.content,
            agentContext ?? "",
            priorMessages,
            encode,
            detailed,
            show_citations ?? false,  // 기본값 OFF (가독성 우선)
            context_anchor_time ?? null,  // 결정사항 cutoff
            session_id ?? null,  // 피드백 컨텍스트 조회용
            image_id ?? null,  // 첨부 이미지 — 조던이 보고 답변
            reference_doc_ids ?? []  // 참고 기획서 — 교차 참고·충돌 점검
          );
          // Supabase에 대화 저장
          if (session_id && pair_id) {
            const { error: dbError } = await supabase.from("messages").insert([
              { session_id, pair_id, role: "user", content: userMessage.content, universes: "게임기획", is_deleted: false, conversation_id: conversation_id ?? null, image_id: image_id ?? null },
              { session_id, pair_id, role: "assistant", content: assistantText, universes: "게임기획", is_deleted: false, conversation_id: conversation_id ?? null },
            ]);
            if (dbError) {
              console.error("[agent] Supabase 저장 실패:", dbError.message, dbError.code);
            } else {
              console.log("[agent] Supabase 저장 성공:", session_id, pair_id);
              // 대화방 최근 활동 시간 갱신 (목록 정렬용)
              if (conversation_id) {
                await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation_id);
              }
            }
          } else {
            console.warn("[agent] session_id 또는 pair_id 없음 — 저장 건너뜀");
          }

          // ─── 자동 결정사항 추출 (Phase A.5) ──────────────────────
          // 답변 완료 후 Haiku로 결정사항 추출·자동 저장
          // 조던이 반대·우려한 결정은 등록 보류 (사용자 강제 요청 시만 등록)
          try {
            const nickname = session_id?.replace(/^agent:/, "") ?? undefined;
            const result = await extractAndSaveDecisions({
              userQuery: userMessage.content,
              jordanAnswer: assistantText,
              sessionId: session_id,
              pairId: pair_id,
              nickname,
            });
            if (result.saved > 0) {
              // 클라이언트에 결정사항 추가됨 신호 — 트래커 자동 reload
              encode(`__DECISIONS_EXTRACTED__${result.saved}`);
              // 추출 데이터도 함께 전달 → 사용자 즉시 검토 모달
              encode(`__DECISIONS_DATA__${JSON.stringify(result.savedItems)}__END__`);
            }
            if (result.held > 0) {
              // 보류된 결정 알림 — "조던 우려로 등록 안 됨" 같은 안내
              encode(`__DECISIONS_HELD__${result.held}`);
            }
          } catch (err) {
            console.error("[agent] 결정사항 자동 추출 실패:", err);
          }

          // ─── 바이블 일관성 검사 (Feature C) ──────────────────────
          // 새 답변이 누적된 결정사항과 모순되는지 Haiku로 검사 → 충돌 시 클라이언트 경고
          try {
            const conflicts = await checkBibleConsistency({
              userQuery: userMessage.content,
              jordanAnswer: assistantText,
              anchorTime: context_anchor_time ?? null,
            });
            if (conflicts.length > 0) {
              encode(`__BIBLE_CONFLICTS__${JSON.stringify(conflicts)}__END__`);
            }
          } catch (err) {
            console.error("[agent] 일관성 검사 실패:", err);
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
