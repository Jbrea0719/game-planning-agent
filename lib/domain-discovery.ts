// 게임 도메인 자동 발견 시스템
//
// 새 게임 또는 검증 안 된 게임에 대해 Claude 웹 검색으로
// 공식·언론·위키·커뮤니티 URL을 자동 발견하고 캐시
//
// 흐름:
//   1. game_registry 캐시 조회 → 있으면 그대로 반환
//   2. 없으면 Claude로 도메인 검색 → 분류 → 저장 → 반환

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface DiscoveredDomain {
  url: string;                                // 도메인 또는 도메인+경로 (예: "inven.co.kr/board/eversoul")
  tier: "official" | "press" | "wiki" | "community";
  note?: string;                              // 짧은 설명 (예: "공식 라운지", "디시 마이너갤")
}

export interface GameRegistryEntry {
  game_id: string;
  game_names: string[];
  discovered_domains: DiscoveredDomain[];
  discovery_method: "manual" | "auto" | "verified";
}

// ════════════════════════════════════════
// 캐시 조회
// ════════════════════════════════════════
export async function getGameRegistry(gameId: string): Promise<GameRegistryEntry | null> {
  const { data, error } = await supabase
    .from("game_registry")
    .select("game_id, game_names, discovered_domains, discovery_method")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error) {
    console.error("[domain-discovery] 캐시 조회 실패:", error.message);
    return null;
  }
  if (!data) return null;

  // last_used_at 업데이트 (비동기, 결과 안 기다림)
  // use_count 증가는 별도 RPC가 필요해서 일단 last_used_at만 업데이트
  void supabase
    .from("game_registry")
    .update({ last_used_at: new Date().toISOString() })
    .eq("game_id", gameId)
    .then(() => {});

  return data as GameRegistryEntry;
}

// ════════════════════════════════════════
// 캐시 저장
// ════════════════════════════════════════
async function saveGameRegistry(entry: GameRegistryEntry): Promise<void> {
  const { error } = await supabase
    .from("game_registry")
    .upsert({
      game_id: entry.game_id,
      game_names: entry.game_names,
      discovered_domains: entry.discovered_domains,
      discovery_method: entry.discovery_method,
      last_used_at: new Date().toISOString(),
      use_count: 1,
    }, { onConflict: "game_id" });

  if (error) {
    console.error("[domain-discovery] 캐시 저장 실패:", error.message);
  }
}

// ════════════════════════════════════════
// 도메인 자동 발견 — Claude 웹 검색 활용
// ════════════════════════════════════════
async function discoverDomainsViaSearch(gameName: string): Promise<DiscoveredDomain[]> {
  const systemPrompt = `당신은 게임 정보 출처 큐레이터예요. 사용자가 알려준 한국 게임에 대해, 신뢰할 만한 정보 사이트를 web_search로 찾아 정리하세요.

[찾아야 할 카테고리]
1. official: 공식 사이트, 공식 커뮤니티 (네이버 라운지·네이버 카페·공식 홈페이지·공식 포럼)
2. press: 게임 저널리즘 (인벤 게시판·인벤 뉴스·게임메카·디스이즈게임·게임샷)
3. wiki: 위키 (나무위키·Fandom 위키)
4. community: 유저 커뮤니티 (디시인사이드 마이너갤·루리웹 게시판·레딧 등)

[검색 전략]
- web_search 도구로 "{게임명} 공식 카페", "{게임명} 인벤 게시판", "{게임명} 디시 마이너갤", "{게임명} 나무위키" 등 검색
- 검색 결과에서 실제 사이트 URL을 추출
- 게임명을 확실히 다루는 사이트만 선별 (잘못된 게임 사이트는 제외)
- 도메인은 가능하면 경로까지 포함 (예: "inven.co.kr/board/sena", "game.naver.com/lounge/sena_rebirth")

[출력 형식 — JSON만 출력. 다른 텍스트 절대 추가 금지]
{
  "domains": [
    {"url": "도메인 또는 도메인+경로", "tier": "official|press|wiki|community", "note": "짧은 설명"}
  ]
}

총 3~10개 정도. 너무 많이 찾지 말고 정말 권위 있는 곳만.`;

  const userContent = `다음 한국 게임의 신뢰할 만한 정보 사이트를 찾아주세요.

게임: "${gameName}"

검색하고 JSON으로 답변하세요.`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      system: systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 4,
          user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
        } as unknown as Anthropic.Tool,
      ],
      messages: [{ role: "user", content: userContent }],
    });

    const text = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    // JSON 추출 (코드펜스 제거)
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    // JSON이 텍스트 중간에 있을 수도 있어 정규식으로 추출
    const jsonMatch = cleaned.match(/\{[\s\S]*"domains"[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonStr) as { domains: DiscoveredDomain[] };
    return Array.isArray(parsed.domains) ? parsed.domains : [];
  } catch (err) {
    console.error("[domain-discovery] 발견 실패:", err);
    return [];
  }
}

// ════════════════════════════════════════
// 메인 진입점 — 캐시 → 자동 발견 → 저장
// ════════════════════════════════════════
export async function ensureGameDomains(
  gameId: string,
  gameNames: string[]
): Promise<{ domains: DiscoveredDomain[]; fromCache: boolean }> {
  // 1. 캐시 조회
  const cached = await getGameRegistry(gameId);
  if (cached && cached.discovered_domains.length > 0) {
    return { domains: cached.discovered_domains, fromCache: true };
  }

  // 2. 자동 발견 (첫 이름을 대표로 사용)
  const primaryName = gameNames[0] ?? gameId;
  const discovered = await discoverDomainsViaSearch(primaryName);

  if (discovered.length === 0) {
    // 발견 실패 시 빈 결과 저장하지 않음 (다음 시도 가능하게)
    return { domains: [], fromCache: false };
  }

  // 3. 캐시 저장
  await saveGameRegistry({
    game_id: gameId,
    game_names: gameNames,
    discovered_domains: discovered,
    discovery_method: "auto",
  });

  return { domains: discovered, fromCache: false };
}

// ════════════════════════════════════════
// 도메인 리스트만 추출 (allowed_domains에 사용)
// ════════════════════════════════════════
export function extractDomainList(domains: DiscoveredDomain[]): string[] {
  return Array.from(new Set(
    domains.map(d => {
      // URL에서 도메인 부분만 추출 (경로 제거)
      return d.url.split("/")[0];
    })
  ));
}
